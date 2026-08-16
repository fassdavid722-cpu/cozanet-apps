/**
 * Chat API Route — Clean, efficient, no wasted calls
 *
 * Flow:
 *   1. Receive user message
 *   2. Call Groq with tools (streaming for reliable tool detection)
 *   3. If tools called → execute them with progressive status updates
 *      For browsing: navigate → read content → capture screenshot (with delays)
 *   4. Call Groq again with tool results → stream final response
 *   5. Save to Supabase
 */

import { NextRequest } from 'next/server';
import { TOOLS } from '@/lib/tools/registry';
import { executeTool } from '@/lib/tools/executor';
import { saveMessage, getHistory } from '@/lib/memory';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_TOOL_MODEL = 'llama-3.1-8b-instant';
const GROQ_VISION_MODEL = 'meta-llama/llama-3.2-90b-vision-preview';

const SYSTEM_PROMPT = `You are Cozanet, an intelligent personal AI assistant.
You have tools for web search, browsing, weather, calculations, translations, memory, and code execution.

CRITICAL RULES:
1. NEVER narrate your process. Don't say "Let me search" or "I need the calculator" or "I have successfully browsed" or "The user wants to know..." — just give the answer directly. Your internal reasoning is not for the user.
2. NEVER announce which tool you're about to use. Just use it silently and respond with the results.
3. Use tools only when they genuinely help. Don't search for things you already know. Don't browse when a search would do.
4. When using search results, cite sources with [1], [2] notation.
5. When browsing, summarize the key content accurately and concisely.
6. Save important user preferences and facts to memory automatically — don't ask permission.
7. When the user asks about something they may have told you before, recall from memory first.
8. Keep responses concise unless the user asks for detail. Get to the point.
9. Format with markdown — code blocks for code, lists for steps, bold for emphasis.
10. You have VISION capabilities. When the user sends an image, analyze it carefully.
11. If the user asks you to go to a page and search or interact, use browser_interact.
12. If a direct fetch fails, the system automatically falls back to Jina Reader — don't mention it.
13. Respond as if you already know everything the tools told you. Don't describe what the tools returned — just use the information to answer.

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
  screenshotUrl?: string;
  image?: string;
}

function callGroq(messages: any[], tools?: any[], toolChoice?: string, model?: string) {
  const body: any = {
    model: model || GROQ_MODEL,
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

function buildVisionContent(text: string, images: string[]): any[] {
  const content: any[] = [{ type: 'text', text }];
  for (const img of images) {
    content.push({ type: 'image_url', image_url: { url: img } });
  }
  return content;
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
                id: tc.id || `call_${idx}`,
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

// Check if a tool is a browsing-type tool (needs progressive status)
function isBrowserTool(name: string): boolean {
  return ['browser_navigate', 'jina_reader', 'browser_interact'].includes(name);
}

function getToolStatus(toolName: string, args: any): SSEData {
  switch (toolName) {
    case 'web_search':
    case 'browser_search':
      return { status: 'searching', query: args.query || '' };
    case 'browser_navigate':
    case 'jina_reader':
      return { status: 'browsing', url: args.url || '' };
    case 'browser_interact':
      return { status: 'browsing', url: args.url || '', detail: args.action || '' };
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
  const { message, sessionId, images } = await req.json();

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

      const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

      try {
        const history = await getHistory(sessionId, 20);

        const messages: any[] = [
          { role: 'system', content: SYSTEM_PROMPT },
          ...history.map((m: any) => ({ role: m.role, content: m.content })),
          { role: 'user', content: message },
        ];

        const hasImages = images && images.length > 0;
        let useVision = hasImages;

        if (hasImages) {
          messages[messages.length - 1] = {
            role: 'user',
            content: buildVisionContent(message, images),
          };
        }

        saveMessage(sessionId, 'user', message);

        send({ status: 'thinking' });

        // Step 1: Call Groq with tools (streaming, 8b model for efficiency)
        const toolResp = await callGroq(
          messages,
          useVision ? undefined : TOOLS,
          'auto',
          useVision ? GROQ_VISION_MODEL : GROQ_TOOL_MODEL,
        );
        if (!toolResp.ok || !toolResp.body) {
          const errText = await toolResp.text().catch(() => 'Unknown');
          throw new Error(`Groq API error: ${toolResp.status} ${errText}`);
        }

        const { content: initialContent, toolCalls } = await readStream(toolResp);
        let content = initialContent;

        let resp: Response;

        // Fallback: parse text-based tool calls if API function calling failed
        let parsedToolCalls = toolCalls;
        if (parsedToolCalls.length === 0 && content) {
          // Match <tool_name>{args}</tool_name> or <function=name>{args}</function>
          const textToolMatch = content.match(/<(\w+)>(\{[\s\S]*?\})<\/\1>/);
          if (textToolMatch) {
            try {
              parsedToolCalls = [{
                id: 'text-tool-0',
                type: 'function',
                function: { name: textToolMatch[1], arguments: textToolMatch[2] },
              }];
              content = '';
            } catch {}
          }
          // Also try the <function=name>{args} format (Groq's failed_generation format)
          if (parsedToolCalls.length === 0) {
            const funcMatch = content.match(/<function=(\w+)>(\{[\s\S]*?\})(?:<\/?function>?|$)/);
            if (funcMatch) {
              try {
                parsedToolCalls = [{
                  id: 'text-tool-0',
                  type: 'function',
                  function: { name: funcMatch[1], arguments: funcMatch[2] },
                }];
                content = '';
              } catch {}
            }
          }
        }

        if (parsedToolCalls.length > 0) {
          // Add assistant message with tool calls
          messages.push({
            role: 'assistant',
            content: content || null,
            tool_calls: parsedToolCalls.map(tc => ({
              id: tc.id,
              type: 'function',
              function: { name: tc.function.name, arguments: tc.function.arguments },
            })),
          });

          // Execute each tool with progressive status updates
          for (const tc of parsedToolCalls) {
            const toolName = tc.function.name;
            let toolArgs: any;
            try {
              toolArgs = JSON.parse(tc.function.arguments || '{}');
            } catch {
              toolArgs = {};
            }

            // For browser tools: send progressive status updates with delays
            if (isBrowserTool(toolName)) {
              const browseUrl = toolArgs.url || '';

              // Phase 1: Navigating
              send({ status: 'browsing', url: browseUrl, detail: 'Navigating…' });
              await sleep(800);

              // Phase 2: Execute the tool (fetch page + extract content)
              send({ status: 'browsing', url: browseUrl, detail: 'Reading page content…' });
              const result = await executeTool(toolName, toolArgs);

              // Phase 3: Capturing screenshot
              if (result.display?.type === 'browser') {
                send({ status: 'browsing', url: browseUrl, detail: 'Capturing screenshot…' });
                await sleep(600);

                // Send browsed result with screenshot
                const screenshotUrl = result.display.screenshotUrl || '';
                send({
                  status: 'browsed',
                  url: result.display.items?.[0]?.url || browseUrl,
                  title: result.display.title || '',
                  description: result.display.description || '',
                  excerpt: result.display.excerpt || '',
                  ogImage: result.display.ogImage || '',
                  siteName: result.display.siteName || '',
                  wordCount: result.display.wordCount || 0,
                  via: result.display.via || 'direct',
                  screenshotUrl,
                });
                if (screenshotUrl) {
                  send({ status: 'screenshot', screenshotUrl, url: browseUrl });
                }
              } else {
                send({ status: 'generating' });
              }

              // Add tool result to messages
              messages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: JSON.stringify(result.data),
              });
            } else {
              // Non-browser tools: single status update, no delays
              send(getToolStatus(toolName, toolArgs));
              const result = await executeTool(toolName, toolArgs);

              if (result.display) {
                if (result.display.type === 'search_results' && result.display.items) {
                  send({
                    status: 'searched',
                    results: result.display.items,
                    query: toolArgs.query || '',
                  });
                } else {
                  send({ status: 'generating' });
                }
              } else {
                send({ status: 'generating' });
              }

              messages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: JSON.stringify(result.data),
              });
            }
          }

          // Step 2: Stream final response with tool results
          send({ status: 'generating' });

          resp = await callGroq(messages, undefined, 'auto', useVision ? GROQ_VISION_MODEL : GROQ_MODEL);
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
          // No tool calls — stream the response directly
          send({ status: 'generating' });

          if (content) {
            send({ chunk: content });
          } else {
            resp = await callGroq(messages, undefined, 'auto', useVision ? GROQ_VISION_MODEL : GROQ_MODEL);
            if (resp.ok && resp.body) {
              const result2 = await readStream(resp);
              content = result2.content;
              if (content) send({ chunk: content });
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
    const SUPABASE_URL = process.env.SUPABASE_URL || '';
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    await fetch(
      `${SUPABASE_URL}/rest/v1/ai_messages?session_id=eq.${sessionId}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      }
    );
  }
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
