/**
 * Browser API Route — Headless browser for the AI.
 * Uses fetch-based extraction (serverless-compatible).
 * Supports: navigate, scrape, search, extractText, getLinks
 */

import { NextRequest } from 'next/server';

export const runtime = 'edge';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? match[1].trim() : 'Untitled';
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLinks(html: string): { text: string; url: string }[] {
  const links: { text: string; url: string }[] = [];
  const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    if (match[1].startsWith('http') && match[2].trim()) {
      links.push({ text: match[2].trim(), url: match[1] });
    }
  }
  return links;
}

export async function POST(req: NextRequest) {
  const { action, url, query, engine } = await req.json();

  try {
    switch (action) {
      case 'navigate':
      case 'extractText': {
        const resp = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const html = await resp.text();
        const text = htmlToText(html);
        const title = extractTitle(html);
        
        if (action === 'navigate') {
          const links = extractLinks(html);
          return new Response(JSON.stringify({ url, title, text, contentLength: html.length, links }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ url, title, text, length: text.length }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'scrape': {
        const resp = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const html = await resp.text();
        const text = htmlToText(html);
        return new Response(JSON.stringify({
          url,
          title: extractTitle(html),
          textContent: text,
          markdown: text.slice(0, 5000),
          excerpt: text.slice(0, 300),
        }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'getLinks': {
        const resp = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const html = await resp.text();
        const links = extractLinks(html);
        return new Response(JSON.stringify({ url, links, count: links.length }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'search': {
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const resp = await fetch(searchUrl, { headers: { 'User-Agent': UA } });
        if (!resp.ok) throw new Error(`Search failed: ${resp.status}`);
        const html = await resp.text();
        
        const results: { title: string; url: string; snippet: string }[] = [];
        const resultRegex = /<a[^>]*class="result__a"[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>[\s\S]*?class="result__snippet"[^>]*>([^<]*)/gi;
        let match;
        while ((match = resultRegex.exec(html)) !== null) {
          results.push({ title: match[2].trim(), url: match[1].trim(), snippet: match[3].trim() });
        }
        return new Response(JSON.stringify({ query, results }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
    }
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
    service: 'cozanet-browser',
    actions: ['navigate', 'scrape', 'extractText', 'getLinks', 'search'],
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
