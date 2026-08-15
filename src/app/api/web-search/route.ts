/**
 * Web Search API Route — Upgraded
 * Supports: regular search, site-specific search, URL extraction, quick answer
 */

import { NextRequest } from 'next/server';
import { tavilySearch, tavilyExtract, tavilySiteSearch, tavilyQuickAnswer } from '@/lib/tavily';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { query, maxResults, action, urls, domain } = body;

  try {
    // Action: extract — get content from URLs
    if (action === 'extract' && urls) {
      const results = await tavilyExtract(urls);
      return new Response(JSON.stringify(results), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Action: site search — search within a specific domain
    if (action === 'site' && domain) {
      const results = await tavilySiteSearch(domain, query || '', { maxResults: maxResults || 5 });
      return new Response(JSON.stringify(results), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Action: quick answer — get just the AI answer
    if (action === 'answer') {
      const answer = await tavilyQuickAnswer(query);
      return new Response(JSON.stringify({ query, answer }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Default: regular search
    if (!query) {
      return new Response(JSON.stringify({ error: 'query required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

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

export async function GET() {
  return new Response(JSON.stringify({
    status: 'ok',
    service: 'cozanet-web-search',
    capabilities: ['search', 'extract', 'site', 'answer'],
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
