/**
 * Chat API Route — Streaming chat with Tavily web search integration.
 *
 * Flow:
 *   1. Receive user message
 *   2. Check if message needs web search (intent detection)
 *   3. If yes: stream "searching" status → search Tavily → include results in context
 *   4. Stream LLM response (Groq)
 *   5. Save to session memory
 */

import { NextRequest } from 'next/server';
import { tavilySearch, needsWebSearch } from '@/lib/tavily';
import { getSession, saveMessage, getHistory, clearSession } from '@/lib/memory';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

const SYSTEM_PROMPT = `You are Cozanet OS — a next-generation AI-native operating system assistant.
You are intelligent, helpful, and concise. You have access to the conversation history and use it to provide contextual, personalized responses.
Keep responses clear and direct.
When you have web search results, use them to provide accurate, up-to-date information. Cite sources naturally.
Current date: ${new Date().toISOString().split('T')[0]}`;

async function callGroqStream(messages: any[]): Promise<ReadableStream<Uint8Array>> {
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      max_tokens: 1024,
      temperature: 0.7,
      stream: true,
    }),
  });

  if (!resp.ok || !resp.body) {
    const errText = await resp.text().catch(() => 'Unknown error');
    throw new Error(`Groq API error ${resp.status}: ${errText}`);
  }

  return resp.body;
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
      const send = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // 1. Check if we need to search the web
        const { shouldSearch, searchQuery } = needsWebSearch(message);

        let searchContext = '';
        let searchResults: any[] = [];

        if (shouldSearch && searchQuery) {
          // 2. Send "searching" status to the UI
          send({ status: 'searching', query: searchQuery });

          try {
            const tavilyResponse = await tavilySearch(searchQuery, { maxResults: 5 });

            if (tavilyResponse.results.length > 0) {
              searchResults = tavilyResponse.results;

              // Build context from search results
              searchContext = '\n\n--- Web Search Results ---\n';
              if (tavilyResponse.answer) {
                searchContext += `Summary: ${tavilyResponse.answer}\n\n`;
              }
              searchContext += tavilyResponse.results
                .slice(0, 5)
                .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content.slice(0, 500)}`)
                .join('\n\n');
              searchContext += '\n--- End Search Results ---';

              // Send search results to UI for display
              send({
                status: 'searched',
                results: searchResults.map(r => ({ title: r.title, url: r.url })),
              });
            }
          } catch (searchErr: any) {
            // Search failed — continue without web context
            send({ status: 'search_failed', error: searchErr.message });
          }
        }

        // 3. Load conversation history
        const history = getHistory(sessionId, 20);

        // 4. Build LLM messages
        const messages = [
          { role: 'system', content: SYSTEM_PROMPT + (searchContext || '') },
          ...history.map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: message },
        ];

        // 5. Save user message to history
        saveMessage(sessionId, 'user', message);

        // 6. Send "generating" status
        send({ status: 'generating' });

        // 7. Stream Groq response
        let fullReply = '';

        try {
          const groqStream = await callGroqStream(messages);
          const reader = groqStream.getReader();
          const decoder = new TextDecoder();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value);
            const lines = text.split('\n').filter(l => l.startsWith('data: '));

            for (const line of lines) {
              const raw = line.slice(6).trim();
              if (raw === '[DONE]') continue;
              try {
                const parsed = JSON.parse(raw);
                const chunk = parsed.choices?.[0]?.delta?.content;
                if (chunk) {
                  fullReply += chunk;
                  send({ chunk });
                }
              } catch { /* skip malformed */ }
            }
          }
        } catch (groqErr: any) {
          // Fallback: try non-streaming
          try {
            const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: GROQ_MODEL,
                messages,
                max_tokens: 1024,
                temperature: 0.7,
              }),
            });

            if (resp.ok) {
              const data = await resp.json();
              fullReply = data.choices[0].message.content;
              send({ chunk: fullReply });
            } else {
              throw new Error('Groq unavailable');
            }
          } catch {
            send({ error: `LLM error: ${groqErr.message}` });
            fullReply = 'Sorry, I had trouble generating a response. Please try again.';
            send({ chunk: fullReply });
          }
        }

        // 8. Save assistant response to history
        saveMessage(sessionId, 'assistant', fullReply);

        // 9. Done
        send({ done: true, searched: shouldSearch });
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
  return new Response(JSON.stringify({ status: 'ok', service: 'cozanet-chat' }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function DELETE(req: NextRequest) {
  const { sessionId } = await req.json();
  if (sessionId) clearSession(sessionId);
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
