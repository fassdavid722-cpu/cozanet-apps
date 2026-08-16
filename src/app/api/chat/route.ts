/**
 * Chat API Route — Upgraded with rich activity indicators
 *
 * Flow:
 *   1. Receive user message
 *   2. Send "thinking" status to client
 *   3. Send to Groq with tool definitions
 *   4. If Groq calls a tool → send specific status (searching/browsing/weather/etc)
 *   5. Execute tool → send result status
 *   6. Send "generating" status → stream final response
 *   7. Save to Supabase
 */

import { NextRequest } from 'next/server';
import { TOOLS } from '@/lib/tools/registry';
import { executeTool } from '@/lib/tools/executor';
import { saveMessage, getHistory } from '@/lib/memory';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `You are Cozanet OS — a next-generation AI assistant and personal AI operating system.
You are intelligent, helpful, proactive, and concise. You have access to powerful tools and use them when appropriate.

You have these tools available:
- web_search: Search the internet for current information (Tavily-powered)
- browser_navigate: Browse a specific URL and extract its content
- browser_search: Search via DuckDuckGo (no API credits used)
- jina_reader: Get clean readable content from any URL (great for JS-rendered pages)
- memory_save: Save facts, preferences, or instructions to long-term memory
- memory_recall: Search through saved long-term memories
- get_weather: Get current weather for any location
- calculate: Evaluate mathematical expressions
- get_time: Get current time/date for any timezone
- url_metadata: Get OpenGraph metadata from a URL
- code_run: Execute JavaScript code in a sandbox
- translate: Translate text between languages

RULES:
1. Use tools when they help answer better. Don't search the web for things you already know.
2. When using search results, cite sources with [1], [2] notation.
3. When browsing a page, summarize the key content accurately.
4. Save important user preferences and facts to memory using memory_save.
5. When the user asks about something they may have told you before, use memory_recall.
6. Be proactive — if you notice something worth remembering, save it.
7. Keep responses concise unless the user asks for detail.
8. When browsing, always try to provide a good summary of what you found.
9. If a direct fetch fails, the system automatically falls back to Jina Reader.
10. Format responses with markdown for readability — use code blocks for code, lists for steps, bold for emphasis.

Current date: ${new Date().toISOString().split('T')[0]}`;

interface SSEData {
  status?: string;
  chunk?: string;
  done?: boolean;
  error?: string;
  query?: string;
  results?: { title: string; url: string }[];
  url?: string;
  title?: string;
  toolName?: string;
  toolDetail?: string;
  location?: string;
  expression?: string;
  detail?: string;
  memoryType?: string;
  description?: string;
  excerpt?: string;
  ogImage?: string;
  siteName?: string;
  wordCount?: number;
  via?: string;
}

function callGroq(messages: any[], tools?: any[], toolChoice?: string) {
  const body: any = {
    model: GROQ_MODEL,
    messages,
    max_tokens: 2048,
    temperature: 0.7,
    stream: true,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = toolChoice || 'auto';
  }
  return fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function readStream(resp: Response): Promise<{ content: string; toolCalls: any[] }> {
  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let content = '';
  const toolCalls: any[] = [];
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const raw = trimmed.slice(6);
      if (raw === '[DONE]') continue;

      try {
        const parsed = JSON.parse(raw);
        const delta = parsed.choices?.[0]?.delta;

        if (delta?.content) {
          content += delta.content;
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCalls[idx]) {
              toolCalls[idx] = {
                id: tc.id,
                type: 'function',
                function: { name: '', arguments: '' },
              };
            }
            if (tc.function?.name) {
              toolCalls[idx].function.name += tc.function.name;
            }
            if (tc.function?.arguments) {
              toolCalls[idx].function.arguments += tc.function.arguments;
            }
          }
        }
      } catch { /* skip */ }
    }
  }

  return { content, toolCalls };
}

// Tool-specific status mapping
function getToolStatus(toolName: string, args: any): SSEData {
  switch (toolName) {
    case 'web_search':
    case 'browser_search':
      return { status: 'searching', query: args.query || '' };
    case 'browser_navigate':
    case 'jina_reader':
      return { status: 'browsing', url: args.url || '' };
    case 'get_weather':
      return { status: 'weather', location: args.location || '' };
    case 'memory_save':
      return { status: 'memory', memoryType: 'save', detail: args.content?.slice(0, 60) || '' };
    case 'memory_recall':
      return { status: 'memory', memoryType: 'recall', detail: args.query || '' };
    case 'calculate':
      return { status: 'calculating', expression: args.expression || '' };
    case 'code_run':
      return { status: 'code_running' };
    case 'translate':
      return { status: 'translating', detail: `${args.source_lang || 'auto'} → ${args.target_lang || ''}` };
    case 'get_time':
      return { status: 'tool_running', toolName: 'Getting time', toolDetail: args.timezone || 'UTC' };
    case 'url_metadata':
      return { status: 'tool_running', toolName: 'Checking URL', toolDetail: args.url || '' };
    default:
      return { status: 'tool_running', toolName: toolName, toolDetail: '' };
  }
}

export async function POST(req: NextRequest) {
  const { message, sessionId } = await req.json();

  if (!message || !sessionId) {
    return new Response(JSON.stringify({ error: 'message and sessionId required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: SSEData) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Load conversation history
        const history = await getHistory(sessionId, 20);

        // Build messages for Groq
        const messages: any[] = [
          { role: 'system', content: SYSTEM_PROMPT },
          ...history.map((m: any) => ({ role: m.role, content: m.content })),
          { role: 'user', content: message },
        ];

        // Save user message
        saveMessage(sessionId, 'user', message);

        // Step 1: Send thinking status, then call Groq with tools
        send({ status: 'thinking' });

        let resp = await callGroq(messages, TOOLS);
        if (!resp.ok || !resp.body) {
          const errText = await resp.text().catch(() => 'Unknown');
          throw new Error(`Groq API error ${resp.status}: ${errText}`);
        }

        let { content, toolCalls } = await readStream(resp);

        // Step 2: If tools were called, execute them with rich status updates
        if (toolCalls.length > 0) {
          // Add assistant message with tool calls to messages
          messages.push({
            role: 'assistant',
            content: content || null,
            tool_calls: toolCalls.map(tc => ({
              id: tc.id,
              type: 'function',
              function: { name: tc.function.name, arguments: tc.function.arguments },
            })),
          });

          // Execute each tool call with specific status updates
          for (const tc of toolCalls) {
            const toolName = tc.function.name;
            let toolArgs: any;
            try {
              toolArgs = JSON.parse(tc.function.arguments || '{}');
            } catch {
              toolArgs = {};
            }

            // Send tool-specific "running" status
            const statusData = getToolStatus(toolName, toolArgs);
            send(statusData);

            const result = await executeTool(toolName, toolArgs);

            // Send tool result status for UI display
            if (result.display) {
              if (result.display.type === 'search_results' && result.display.items) {
                send({
                  status: 'searched',
                  results: result.display.items,
                  query: toolArgs.query || '',
                });
              } else if (result.display.type === 'browser' && result.display.items) {
                send({
                  status: 'browsed',
                  url: result.display.items[0]?.url || toolArgs.url || '',
                  title: result.display.title || '',
                  description: result.display.description || '',
                  excerpt: result.display.excerpt || '',
                  ogImage: result.display.ogImage || '',
                  siteName: result.display.siteName || '',
                  wordCount: result.display.wordCount || 0,
                  via: result.display.via || 'direct',
                });
              } else if (result.display.type === 'weather') {
                // Weather result — no special UI card, just generating
                send({ status: 'generating' });
              } else if (result.display.type === 'memory_saved') {
                send({ status: 'generating' });
              } else if (result.display.type === 'memory_recalled') {
                send({ status: 'generating' });
              } else {
                send({ status: 'generating' });
              }
            } else {
              send({ status: 'generating' });
            }

            // Add tool result to messages for the next Groq call
            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify(result.data),
            });
          }

          // Step 3: Call Groq again with tool results — stream the final response
          send({ status: 'generating' });

          // Second call: no tools, just generate the final response
          resp = await callGroq(messages);
          if (!resp.ok || !resp.body) {
            const errText = await resp.text().catch(() => 'Unknown');
            throw new Error(`Groq API error on second call: ${resp.status} ${errText}`);
          }

          // Stream the final response
          const reader = resp.body.getReader();
          const decoder = new TextDecoder();
          let fullReply = '';
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data: ')) continue;
              const raw = trimmed.slice(6);
              if (raw === '[DONE]') continue;

              try {
                const parsed = JSON.parse(raw);
                const chunk = parsed.choices?.[0]?.delta?.content;
                if (chunk) {
                  fullReply += chunk;
                  send({ chunk });
                }
              } catch { /* skip */ }
            }
          }

          content = fullReply || content;
        } else {
          // No tool calls — stream content directly
          send({ status: 'generating' });

          if (content) {
            send({ chunk: content });
          } else {
            // Fallback: non-streaming call
            const fallbackResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: GROQ_MODEL,
                messages,
                max_tokens: 2048,
                temperature: 0.7,
              }),
            });

            if (fallbackResp.ok) {
              const data = await fallbackResp.json();
              content = data.choices[0].message.content;
              send({ chunk: content });
            } else {
              content = 'Sorry, I had trouble generating a response. Please try again.';
              send({ chunk: content });
            }
          }
        }

        // Save assistant response
        saveMessage(sessionId, 'assistant', content);

        send({ done: true });
        controller.close();

      } catch (err: any) {
        send({ error: err.message || 'Unknown error' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

export async function GET() {
  return new Response(JSON.stringify({
    status: 'ok',
    service: 'cozanet-chat',
    tools: TOOLS.map(t => t.function.name),
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function DELETE(req: NextRequest) {
  const { sessionId } = await req.json();
  if (sessionId) {
    // Clear from Supabase
    const SUPABASE_URL = process.env.SUPABASE_URL || '';
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (SUPABASE_KEY) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/ai_memory?source=eq.${encodeURIComponent(sessionId)}&memory_type=in.(CHAT_USER,CHAT_ASSISTANT)`,
        { method: 'DELETE', headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
      );
    }
  }
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
