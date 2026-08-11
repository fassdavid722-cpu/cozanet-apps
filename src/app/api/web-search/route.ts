/**
 * Web Search API Route — Direct Tavily search endpoint.
 * Useful for standalone searches or testing.
 */

import { NextRequest } from 'next/server';
import { tavilySearch } from '@/lib/tavily';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const { query, maxResults } = await req.json();

  if (!query) {
    return new Response(JSON.stringify({ error: 'query required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const results = await tavilySearch(query, { maxResults: maxResults || 5 });
    return new Response(JSON.stringify(results), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
