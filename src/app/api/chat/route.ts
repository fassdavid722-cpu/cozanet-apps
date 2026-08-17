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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = 'openai/gpt-oss-120b';
const GROQ_TOOL_MODEL = 'openai/gpt-oss-20b';

// Vision via Google Gemini (Groq's GPT-OSS doesn't support images)
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const GEMINI_MODEL = 'gemini-3.6-flash';

const SYSTEM_PROMPT = `You are CozanetOS, a powerful AI assistant with deep software engineering expertise, memory, web browsing, vision, a real code execution sandbox, and persistent learning capabilities.

## CODING EXPERTISE
You are a senior software engineer fluent in Python, JavaScript, TypeScript, Go, Rust, C/C++, Java, Ruby, SQL, Bash, HTML/CSS, React, Next.js, Node.js, and more.
- When asked to write code, produce production-quality, well-structured, well-commented code.
- When asked to debug, analyze the code carefully, identify the root cause, and provide a fix.
- When asked to explain code, break it down step by step with clear explanations.
- When asked to architect, provide system design with trade-offs, alternatives, and best practices.
- When asked to AUDIT code, use the code_audit tool to get a systematic analysis with security checks, bug detection, performance analysis, and a health score.
- When asked to FIX code, use the code_fix tool to automatically fix common issues, then show the improved code and explain what changed.
- Always follow language-specific conventions and best practices.
- Include error handling, edge cases, and input validation in production code.
- When showing code, use proper markdown code blocks with language tags.

## CODE SANDBOX
You have a REAL code execution sandbox via the code_execute tool.
- Supports 50+ languages: Python, JavaScript, TypeScript, Bash, C, C++, Java, Go, Rust, Ruby, PHP, and more.
- Use code_execute for: calculations, data processing, algorithms, string manipulation, simulations, testing code, verifying solutions, generating data.
- When you run code, show the code in a markdown block THEN show the output.
- If code fails, fix it and re-run — don't just describe what went wrong, actually fix it.

## CODE INTELLIGENCE
You have tools for automated code quality:
- code_audit: Analyze code for bugs, security vulnerabilities, performance issues, and style problems. Returns a health score (0-100), categorized issues with severity levels, and optionally runs the code to verify.
- code_fix: Automatically fix common issues found in code. Returns the fixed code, number of changes, and new health score.
- Use these proactively when the user shares code or asks for review.

## DEEP RESEARCH & LEARNING
You have the ability to deeply research topics and STORE what you learn:
- deep_research: Conducts multi-step research — searches multiple angles, reads top sources, extracts key facts, cross-references, and stores the knowledge. Takes 30-90 seconds depending on depth. Depth options: "quick" (~10s), "standard" (~30s), "deep" (~60-90s).
- knowledge_recall: Check what you already know about a topic before answering. Use this BEFORE researching to avoid redundant work.
- knowledge_store: Manually store learned information for future conversations.
- knowledge_list: See everything you've learned so far.
- knowledge_delete: Remove outdated knowledge.

**LEARNING PROTOCOL:**
When the user says "learn about X" or "research X" or "study X":
1. First, use knowledge_recall to check if you already have knowledge about X
2. If the knowledge is stale or missing, use deep_research with appropriate depth
3. After research, provide a clear summary of what you learned
4. The knowledge is automatically stored — you'll recall it in future conversations

**ANTI-ASSUMPTION RULE:**
The world evolves. Your training data has a cutoff date. When answering questions about:
- Recent events, news, or updates
- Technology versions, APIs, or frameworks
- Market data, prices, or statistics
- Anything that changes over time
...ALWAYS check your knowledge base first, then research if needed. Never assume based on what you "already know" — verify with real-time data.

## FILE SYSTEM
You have a virtual file system for managing code projects:
- file_create: Create files — persisted in database
- file_read: Read file contents back
- file_list: List all files in the workspace
- file_update: Update existing files
- file_delete: Remove files
- github_list_repos: List your GitHub repositories
- github_list_files: Browse files in a GitHub repo
- github_read_file: Read file contents from GitHub
- github_push: Push/commit code to a GitHub repo
- secret_store: Store API keys securely (available in sandbox via environment variables)
- secret_get: Retrieve a stored secret
- secret_list: List stored secrets (names only)
- secret_delete: Delete a stored secret
- Use these to build multi-file projects, save code for later, or organize work.

## OTHER CAPABILITIES
- Web search and browsing for current information
- Image/screenshot analysis via vision
- Long-term memory (save and recall user preferences and facts)
- Weather, time, calculations, translations

CRITICAL RULES:
1. NEVER narrate your process. Don't say "Let me search" or "I need to calculate" — just do it and give the answer.
2. NEVER announce which tool you're about to use. Just use it silently and respond with results.
3. When using search results, cite sources with [1], [2] notation.
4. Save important user preferences and facts to memory automatically — don't ask permission.
5. When the user asks about something they may have told you before, recall from memory first.
6. For topics that evolve over time, ALWAYS check knowledge_recall first, then deep_research if stale.
7. Keep responses concise unless the user asks for detail or is writing code.
8. Format with markdown — code blocks for code, lists for steps, bold for emphasis.
9. When the user sends an image, analyze it carefully and describe what you see.
10. When writing code that should be tested, USE code_execute to actually run it — don't just claim it works.
11. When reviewing code, USE code_audit to provide systematic analysis.
12. Respond as if you already know everything the tools told you.

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
    case 'code_execute':
    case 'code_run':
      return { status: 'code_running', detail: args.description || '' };
    case 'file_create':
      return { status: 'tool_running', toolName: 'Creating file', toolDetail: args.filename || '' };
    case 'file_read':
      return { status: 'tool_running', toolName: 'Reading file', toolDetail: args.filename || '' };
    case 'file_list':
      return { status: 'tool_running', toolName: 'Listing files', toolDetail: '' };
    case 'file_update':
      return { status: 'tool_running', toolName: 'Updating file', toolDetail: args.filename || '' };
    case 'file_delete':
      return { status: 'tool_running', toolName: 'Deleting file', toolDetail: args.filename || '' };
    case 'translate':
      return { status: 'translating', detail: `${args.source_lang || 'auto'} → ${args.target_lang || ''}` };
    case 'get_time':
      return { status: 'tool_running', toolName: 'Getting time', toolDetail: args.timezone || 'UTC' };
    case 'url_metadata':
      return { status: 'tool_running', toolName: 'Checking URL', toolDetail: args.url || '' };
    case 'github_list_repos':
      return { status: 'tool_running', toolName: 'GitHub', toolDetail: 'Listing repos' };
    case 'github_list_files':
      return { status: 'tool_running', toolName: 'GitHub', toolDetail: `${args.owner}/${args.repo}` };
    case 'github_read_file':
      return { status: 'tool_running', toolName: 'GitHub', toolDetail: args.path || '' };
    case 'github_push':
      return { status: 'tool_running', toolName: 'GitHub Push', toolDetail: `${args.owner}/${args.repo}/${args.path || ''}` };
    case 'secret_store':
      return { status: 'tool_running', toolName: 'Storing secret', toolDetail: args.key_name || '' };
    case 'secret_get':
      return { status: 'tool_running', toolName: 'Retrieving secret', toolDetail: args.key_name || '' };
    case 'secret_list':
      return { status: 'tool_running', toolName: 'Listing secrets', toolDetail: '' };
    case 'secret_delete':
      return { status: 'tool_running', toolName: 'Deleting secret', toolDetail: args.key_name || '' };
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
            const result = await executeTool(toolName, { ...args, _sessionId: sessionId });

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

          // Build follow-up as plain conversation (avoids GPT-OSS re-calling tools)
          const toolResults = toolMessages.map(tm => 
            `[Tool: ${tm.name}] Result:\n${tm.content}`
          ).join('\n\n');
          
          const followUpMessages = [
            ...messages,
            { role: 'assistant', content: 'I executed the requested tools. Let me analyze the results.' },
            { role: 'user', content: `The tools have already been executed. Here are the results:\n\n${toolResults}\n\nBased on these results, provide a clear and concise response to the user. Do NOT write or execute any code — the code has already been run and the results are shown above.` },
          ];

          // Step 2: Call Groq with results as plain conversation (non-streaming)
          const followUpBody: any = {
            model: 'qwen/qwen3.6-27b',
            messages: followUpMessages,
            max_tokens: 2048,
            temperature: 0.7,
            stream: false,
          };
          const finalResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${GROQ_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(followUpBody),
          });
          if (!finalResp.ok) {
            const errText = await finalResp.text().catch(() => 'Unknown');
            throw new Error(`Groq follow-up failed: ${finalResp.status} ${errText}`);
          }
          const finalData = await finalResp.json() as any;
          let rawContent = finalData?.choices?.[0]?.message?.content || '';
          // Strip Qwen thinking tokens
          rawContent = rawContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
          // Strip leading markdown that might be empty
          rawContent = rawContent.replace(/^\n+/, '');
          content = rawContent;

          // Send content as chunks for streaming effect
          if (content) {
            const words = content.split(' ');
            for (let i = 0; i < words.length; i++) {
              send({ chunk: (i > 0 ? ' ' : '') + words[i] });
            }
          }
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
