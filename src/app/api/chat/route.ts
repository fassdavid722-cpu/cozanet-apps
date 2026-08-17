/**
 * Chat API Route — Compatible with new CozanetOS UI
 *
 * Accepts TWO request formats:
 *   NEW:  { messages: [{role, text, image}], image: dataUri }
 *   OLD:  { message: string, sessionId: string, images: string[] }
 *
 * SSE events sent:
 *   { status: "thinking" }
 *   { status: "browsing", url }
 *   { status: "browsed", url, title, screenshot }
 *   { status: "searching", query }
 *   { status: "calculating", expression }
 *   { status: "memory", detail }
 *   { chunk: "text" }
 *   { error: "msg" }
 *   { done: true, memory: "saved fact" }  ← memory included when AI saves something
 */

import { NextRequest } from 'next/server';
import { TOOLS } from '@/lib/tools/registry';
import { executeTool } from '@/lib/tools/executor';
import { saveMessage, getHistory, saveMemory, getMemories } from '@/lib/memory';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = 'openai/gpt-oss-120b';
const GROQ_TOOL_MODEL = 'openai/gpt-oss-20b';

// Vision via Google Gemini (Groq's GPT-OSS doesn't support images)
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const GEMINI_MODEL = 'gemini-3.6-flash';

const SYSTEM_PROMPT = `You are CozanetOS, an intelligent personal AI assistant with memory and web browsing capabilities.
You have tools for web search, browsing, weather, calculations, translations, memory, and code execution.

CRITICAL RULES:
1. NEVER narrate your process. Don't say "Let me search" or "I need the calculator" or "I have successfully browsed" — just give the answer directly.
2. NEVER announce which tool you're about to use. Just use it silently and respond with the results.
3. Use tools only when they genuinely help. BUT: when the user EXPLICITLY asks to "go to", "browse", "visit", or "check" a website, ALWAYS use browser_navigate or browser_interact.
4. When using search results, cite sources with [1], [2] notation.
5. When browsing, summarize the key content accurately and concisely.
6. Save important user preferences and facts to memory automatically — don't ask permission. Use memory_save tool when the user tells you something worth remembering (their name, preferences, goals, important dates).
7. When the user asks about something they may have told you before, recall from memory first using memory_recall.
8. Keep responses concise unless the user asks for detail.
9. Format with markdown — code blocks for code, lists for steps, bold for emphasis.
10. You have VISION capabilities. When the user sends an image, analyze it carefully and describe what you see. Respond as if you can see the image directly.
11. Respond as if you already know everything the tools told you. Don't describe what the tools returned.

Current date: ${new Date().toISOString().split('T')[0]}`;

interface SSEData {
  status?: string;
  chunk?: string;
  done?: boolean;
  error?: string;
  memory?: string;
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
  screenshot?: string;
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

// ── Gemini Vision: call Google Gemini for image analysis + streaming response ──
function callGeminiVision(
  systemPrompt: string,
  history: { role: string; content: string }[],
  userMessage: string,
  images: string[],
) {
  // Convert data URIs to inline data for Gemini
  const parts: any[] = [{ text: userMessage || 'What do you see in this image?' }];
  for (const img of images) {
    // Parse data URI: data:image/png;base64,xxxx
    const match = img.match(/^data:(image\/\w+);base64,(.+)$/);
    if (match) {
      parts.push({
        inline_data: { mime_type: match[1], data: match[2] },
      });
    }
  }

  // Convert history to Gemini format
  const contents: any[] = [];
  for (const m of history) {
    contents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    });
  }
  // Add the current message with images
  contents.push({ role: 'user', parts });

  const requestBody = {
    contents,
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      maxOutputTokens: 2048,
      temperature: 0.7,
    },
  };

  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    },
  );
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

// ── Read Gemini SSE stream and extract text chunks ──
async function readGeminiStream(resp: Response): Promise<string> {
  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
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
      try {
        const parsed = JSON.parse(trimmed.slice(6));
        const parts = parsed?.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.text) {
            fullText += part.text;
          }
        }
      } catch { /* skip */ }
    }
  }

  return fullText;
}

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
      return { status: 'tool_running', toolName, toolDetail: '' };
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  // ── Support BOTH request formats ──
  let userMessage: string;
  let sessionId: string;
  let images: string[] = [];

  if (body.messages) {
    // NEW format: { messages: [{role, text, image}], image }
    const messages = body.messages as any[];
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    userMessage = lastUser?.text || '';
    if (body.image) images = [body.image];
    else if (lastUser?.image) images = [lastUser.image];
    sessionId = req.headers.get('x-session-id') || `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  } else {
    // OLD format: { message, sessionId, images }
    userMessage = body.message || '';
    sessionId = body.sessionId || `s-${Date.now()}`;
    images = body.images || [];
  }

  if (!userMessage && images.length === 0) {
    return new Response(JSON.stringify({ error: 'message required' }), {
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
      let savedMemoryText: string | null = null;

      try {
        const history = await getHistory(sessionId, 20);
        saveMessage(sessionId, 'user', userMessage || '[image]');

        send({ status: 'thinking' });

        const hasImages = images.length > 0;

        // ── VISION PATH: Use Gemini when images are present ──
        if (hasImages && GOOGLE_API_KEY) {
          const geminiResp = await callGeminiVision(
            SYSTEM_PROMPT,
            history.map((m: any) => ({ role: m.role, content: m.content })),
            userMessage || 'What do you see in this image?',
            images,
          );

          if (!geminiResp.ok || !geminiResp.body) {
            const errText = await geminiResp.text().catch(() => 'Unknown');
            throw new Error(`Gemini vision error: ${geminiResp.status} ${errText}`);
          }

          // Read Gemini stream and forward as chunks
          const reader = geminiResp.body.getReader();
          const decoder = new TextDecoder();
          let streamBuffer = '';
          let fullResponse = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            streamBuffer += decoder.decode(value, { stream: true });
            const lines = streamBuffer.split('\n');
            streamBuffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data: ')) continue;
              try {
                const parsed = JSON.parse(trimmed.slice(6));
                const parts = parsed?.candidates?.[0]?.content?.parts || [];
                for (const part of parts) {
                  if (part.text) {
                    fullResponse += part.text;
                    send({ chunk: part.text });
                  }
                }
              } catch { /* skip */ }
            }
          }

          // Auto-save memories from vision responses too
          if (fullResponse) {
            saveMessage(sessionId, 'assistant', fullResponse);
          }

          send({ done: true });
          return;
        }

        // ── TEXT PATH: Use Groq with tool detection ──
        const messages: any[] = [
          { role: 'system', content: SYSTEM_PROMPT },
          ...history.map((m: any) => ({ role: m.role, content: m.content })),
          { role: 'user', content: userMessage || 'What do you see in this image?' },
        ];

        // Step 1: Call Groq with tools (20b model for tool detection)
        const toolResp = await callGroq(
          messages,
          TOOLS,
          'auto',
          GROQ_TOOL_MODEL,
        );
        if (!toolResp.ok || !toolResp.body) {
          const errText = await toolResp.text().catch(() => 'Unknown');
          throw new Error(`Groq API error: ${toolResp.status} ${errText}`);
        }

        const { content: initialContent, toolCalls } = await readStream(toolResp);
        let content = initialContent;

        // Fallback: parse text-based tool calls
        let parsedToolCalls = toolCalls;
        if (parsedToolCalls.length === 0 && content) {
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
          content = '';
          const toolMessages: any[] = [];

          for (const tc of parsedToolCalls) {
            const toolName = tc.function.name;
            let args: any = {};
            try { args = JSON.parse(tc.function.arguments); } catch {}

            // Send status update
            const status = getToolStatus(toolName, args);
            send(status);

            // Progressive browsing delays
            if (isBrowserTool(toolName)) {
              await sleep(400);
              send({ status: 'browsing', url: args.url, detail: 'Reading page content…' });
              await sleep(600);
            }

            // Execute the tool
            const result = await executeTool(toolName, args);

            // Rich display for browser tools — send screenshot field
            if (result.display?.screenshotUrl) {
              send({
                status: 'browsed',
                url: result.display?.title ? args.url : args.url,
                title: result.display?.title || args.url,
                screenshot: result.display.screenshotUrl,
                screenshotUrl: result.display.screenshotUrl,
                description: result.display?.description,
                excerpt: result.display?.excerpt,
                ogImage: result.display?.ogImage,
                wordCount: result.display?.wordCount,
                via: result.display?.via,
              });
              await sleep(300);
            }

            // Track memory saves for the done event
            if (toolName === 'memory_save' && result.success) {
              savedMemoryText = args.content || '';
            }

            // Add tool result to context
            toolMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: toolName,
              content: JSON.stringify(result.data).slice(0, 8000),
            });
          }

          // Step 2: Call Groq again with tool results to generate final response
          const followUpMessages = [
            ...messages,
            {
              role: 'assistant',
              content: null,
              tool_calls: parsedToolCalls.map(tc => ({
                id: tc.id,
                type: 'function',
                function: { name: tc.function.name, arguments: tc.function.arguments },
              })),
            },
            ...toolMessages,
          ];

          const finalResp = await callGroq(followUpMessages, undefined, undefined, GROQ_MODEL);
          if (!finalResp.ok || !finalResp.body) {
            throw new Error('Groq follow-up failed');
          }

          // Stream the final response
          const reader = finalResp.body.getReader();
          const decoder = new TextDecoder();
          let streamBuffer = '';
          let fullResponse = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            streamBuffer += decoder.decode(value, { stream: true });
            const lines = streamBuffer.split('\n');
            streamBuffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data: ')) continue;
              const raw = trimmed.slice(6);
              if (raw === '[DONE]') continue;
              try {
                const parsed = JSON.parse(raw);
                const delta = parsed.choices?.[0]?.delta;
                if (delta?.content) {
                  fullResponse += delta.content;
                  send({ chunk: delta.content });
                }
              } catch {}
            }
          }

          content = fullResponse;
        } else if (content) {
          // No tools, just send the content as chunks
          const words = content.split(' ');
          for (let i = 0; i < words.length; i++) {
            send({ chunk: (i > 0 ? ' ' : '') + words[i] });
          }
        }

        // Save assistant response
        if (content) {
          saveMessage(sessionId, 'assistant', content);
        }

        // Send done event with memory if something was saved
        send({ done: true, memory: savedMemoryText || undefined });
      } catch (err: any) {
        console.error('[chat] Error:', err.message);
        send({ error: err.message || 'Something went wrong' });
        send({ done: true });
      } finally {
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
