/**
 * Tool Executor — Upgraded Browser Engine + Rich Display Data
 *
 * Browser upgrades:
 * - Smart content extraction: headings, paragraphs, metadata
 * - Auto-fallback to Jina Reader for JS-rendered pages (when content is thin)
 * - Structured page data: title, description, og:image, word count
 * - DuckDuckGo URL cleanup (strips redirect wrappers)
 * - Content summarization: first meaningful paragraph extracted
 */

import { tavilySearch, tavilyExtract, tavilySiteSearch } from '@/lib/tavily';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function htmlToText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<footer>/gi, '')
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

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? match[1].trim() : 'Untitled';
}

function extractMeta(html: string, name: string): string | null {
  const match = html.match(new RegExp(`<meta[^>]*(?:name|property)=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i'));
  return match ? match[1].trim() : null;
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
  return links.slice(0, 30);
}

// Extract structured content from HTML — headings, paragraphs, lists
function extractStructuredContent(html: string): { headings: string[]; firstParagraph: string; content: string } {
  // Remove scripts/styles/nav
  const cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');

  // Extract headings
  const headings: string[] = [];
  const hRegex = /<h[1-3][^>]*>([^<]+)<\/h[1-3]>/gi;
  let hMatch;
  while ((hMatch = hRegex.exec(cleaned)) !== null && headings.length < 10) {
    const text = hMatch[1].trim();
    if (text.length > 2 && text.length < 200) headings.push(text);
  }

  // Extract paragraphs
  const paragraphs: string[] = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch;
  while ((pMatch = pRegex.exec(cleaned)) !== null && paragraphs.length < 50) {
    const text = pMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length > 30) paragraphs.push(text);
  }

  // First meaningful paragraph (first one > 50 chars)
  const firstParagraph = paragraphs.find(p => p.length > 50) || paragraphs[0] || '';

  // Full text content
  const content = cleaned.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();

  return { headings, firstParagraph, content };
}

// Extract page metadata for rich display
function extractPageMetadata(html: string, url: string): {
  title: string;
  description: string;
  ogImage: string;
  siteName: string;
} {
  const title = extractMeta(html, 'og:title') || extractTitle(html) || url;
  const description = extractMeta(html, 'description') || extractMeta(html, 'og:description') || '';
  const ogImage = extractMeta(html, 'og:image') || extractMeta(html, 'twitter:image') || '';
  const siteName = extractMeta(html, 'og:site_name') || '';
  return { title, description, ogImage, siteName };
}


// ── Screenshot Capture ─────────────────────────
// Uses free screenshot APIs (no API key needed)
// thum.io for primary, WordPress mshots as fallback
async function captureScreenshot(url: string): Promise<string> {
  // Primary: thum.io — fast, free, returns PNG directly
  const thumUrl = `https://image.thum.io/get/wide/${url}`;
  
  // Verify the screenshot loads (HEAD check)
  try {
    const resp = await fetch(thumUrl, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
    if (resp.ok && resp.headers.get('content-type')?.includes('image')) {
      return thumUrl;
    }
  } catch {}
  
  // Fallback: WordPress mshots (free, slightly slower but reliable)
  const encodedUrl = encodeURIComponent(url);
  const mshotsUrl = `https://s.wordpress.com/mshots/v1/${encodedUrl}?w=800&h=600`;
  return mshotsUrl;
}

// Clean DuckDuckGo redirect URLs
function cleanDdgUrl(url: string): string {
  // DDG uses /l/?uddg= redirect links
  const uddgMatch = url.match(/uddg=([^&]+)/);
  if (uddgMatch) {
    try { return decodeURIComponent(uddgMatch[1]); } catch {}
  }
  return url;
}


// Build search URL for known sites or generic /search?q=
function buildSearchUrl(siteUrl: string, query: string): string {
  const encoded = encodeURIComponent(query);
  const lower = siteUrl.toLowerCase();
  if (lower.includes('google')) return `https://www.google.com/search?q=${encoded}`;
  if (lower.includes('amazon')) return `https://www.amazon.com/s?k=${encoded}`;
  if (lower.includes('youtube')) return `https://www.youtube.com/results?search_query=${encoded}`;
  if (lower.includes('twitter') || lower.includes('x.com')) return `https://twitter.com/search?q=${encoded}`;
  if (lower.includes('reddit')) return `https://www.reddit.com/search/?q=${encoded}`;
  if (lower.includes('wikipedia')) return `https://en.wikipedia.org/w/index.php?search=${encoded}`;
  if (lower.includes('github')) return `https://github.com/search?q=${encoded}`;
  if (lower.includes('linkedin')) return `https://www.linkedin.com/search/results/all/?keywords=${encoded}`;
  if (lower.includes('ebay')) return `https://www.ebay.com/sch/i.html?_nkw=${encoded}`;
  if (lower.includes('duckduckgo')) return `https://duckduckgo.com/?q=${encoded}`;
  if (lower.includes('bing')) return `https://www.bing.com/search?q=${encoded}`;
  const base = siteUrl.replace(/\/$/, '');
  return `${base}/search?q=${encoded}`;
}


export interface ToolResult {
  success: boolean;
  data: any;
  display?: {
    type: 'search_results' | 'browser' | 'weather' | 'memory_saved' | 'memory_recalled' | 'calculation' | 'code_output' | 'metadata' | 'translation' | 'time';
    title?: string;
    items?: any[];
    // New: rich browser display data
    description?: string;
    excerpt?: string;
    ogImage?: string;
    siteName?: string;
    wordCount?: number;
    via?: string;
    screenshotUrl?: string;
  };
}

export async function executeTool(name: string, args: any): Promise<ToolResult> {
  switch (name) {
    // ── Web Search ──────────────────────────────
    case 'web_search': {
      try {
        let result;
        if (args.domain) {
          result = await tavilySiteSearch(args.domain, args.query, {
            maxResults: args.max_results || 5,
            includeAnswer: true,
          });
        } else {
          result = await tavilySearch(args.query, {
            maxResults: args.max_results || 5,
            includeAnswer: true,
            ...(args.time_range && { timeRange: args.time_range }),
          });
        }
        return {
          success: true,
          data: {
            answer: result.answer,
            results: result.results.map((r: any) => ({
              title: r.title,
              url: r.url,
              content: r.content?.slice(0, 500),
            })),
          },
          display: {
            type: 'search_results',
            title: `Search: "${args.query}"`,
            items: result.results.map((r: any) => ({ title: r.title, url: r.url })),
          },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    // ── Browser Navigate (Upgraded) ─────────────
    case 'browser_navigate': {
      try {
        let url = args.url;
        if (!url.startsWith('http')) url = `https://${url}`;

        const resp = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const html = await resp.text();
        const { headings, firstParagraph, content: fullText } = extractStructuredContent(html);
        const meta = extractPageMetadata(html, url);
        const text = fullText;
        const links = args.extract_links ? extractLinks(html) : [];

        // If content is too thin (likely JS-rendered), try Jina Reader
        if (text.length < 200 && !headings.length) {
          try {
            const jinaResp = await fetch(`https://r.jina.ai/${url}`, {
              headers: { 'Accept': 'text/plain' },
            });
            if (jinaResp.ok) {
              const jinaContent = await jinaResp.text();
              if (jinaContent.length > text.length) {
                const wordCount = jinaContent.split(/\s+/).length;
                return {
                  success: true,
                  data: {
                    url,
                    title: meta.title,
                    description: meta.description,
                    content: jinaContent.slice(0, 12000),
                    contentLength: jinaContent.length,
                    wordCount,
                    headings: headings.slice(0, 8),
                    firstParagraph: jinaContent.split('\n').find((l: string) => l.trim().length > 50) || '',
                    ogImage: meta.ogImage,
                    via: 'jina-fallback',
                    ...(links.length > 0 && { links }),
                  },
                  display: {
                    type: 'browser',
                    title: meta.title,
                    items: [{ url, title: meta.title }],
                    description: meta.description,
                    excerpt: (jinaContent.slice(0, 200)).trim(),
                    ogImage: meta.ogImage,
                    siteName: meta.siteName,
                    wordCount,
                    via: 'jina-fallback',
                    screenshotUrl: await captureScreenshot(url),
                  },
                };
              }
            }
          } catch {}
        }

        const wordCount = text.split(/\s+/).length;

        return {
          success: true,
          data: {
            url,
            title: meta.title,
            description: meta.description,
            content: text.slice(0, 12000),
            contentLength: text.length,
            wordCount,
            headings: headings.slice(0, 8),
            firstParagraph,
            ogImage: meta.ogImage,
            via: 'direct',
            screenshotUrl: 'captured',
            ...(links.length > 0 && { links }),
          },
          display: {
            type: 'browser',
            title: meta.title,
            items: [{ url, title: meta.title }],
            description: meta.description,
            excerpt: firstParagraph.slice(0, 200) || text.slice(0, 200),
            ogImage: meta.ogImage,
            siteName: meta.siteName,
            wordCount,
            via: 'direct',
            screenshotUrl: await captureScreenshot(url),
          },
        };
      } catch (err: any) {
        // Fallback to Jina Reader
        try {
          let url = args.url;
          if (!url.startsWith('http')) url = `https://${url}`;
          const jinaResp = await fetch(`https://r.jina.ai/${url}`, {
            headers: { 'Accept': 'text/plain' },
          });
          if (jinaResp.ok) {
            const content = await jinaResp.text();
            const titleLine = content.split('\n').find((l: string) => l.trim().length > 0) || url;
            const wordCount = content.split(/\s+/).length;
            return {
              success: true,
              data: { url, title: titleLine, content: content.slice(0, 12000), contentLength: content.length, wordCount, via: 'jina' },
              display: {
                type: 'browser',
                title: titleLine,
                items: [{ url, title: titleLine }],
                excerpt: content.slice(0, 200).trim(),
                wordCount,
                via: 'jina',
                screenshotUrl: await captureScreenshot(url),
              },
            };
          }
        } catch {}
        return { success: false, data: { error: err.message } };
      }
    }


    // ── Browser Interact (search/click/scroll on pages) ──
    case 'browser_interact': {
      try {
        const action = args.action || 'search';
        let url = args.url;
        if (!url.startsWith('http')) url = `https://${url}`;

        if (action === 'search') {
          const query = args.query || args.value || '';
          const searchUrl = buildSearchUrl(url, query);

          const resp = await fetch(searchUrl, { headers: { 'User-Agent': UA } });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

          const html = await resp.text();
          const { headings, firstParagraph, content: fullText } = extractStructuredContent(html);
          const meta = extractPageMetadata(html, searchUrl);
          const wordCount = fullText.split(/\s+/).length;
          const links = extractLinks(html).slice(0, 12);

          return {
            success: true,
            data: {
              url: searchUrl, action: 'search', query,
              title: meta.title, description: meta.description,
              content: fullText.slice(0, 12000), wordCount,
              headings: headings.slice(0, 8), firstParagraph, links, via: 'direct',
            },
            display: {
              type: 'browser',
              title: meta.title || `Search: ${query}`,
              items: [{ url: searchUrl, title: meta.title || `Search: ${query}` }],
              description: meta.description,
              excerpt: firstParagraph.slice(0, 200) || fullText.slice(0, 200),
              ogImage: meta.ogImage, siteName: meta.siteName,
              wordCount, via: 'direct',
              screenshotUrl: await captureScreenshot(searchUrl),
            },
          };
        } else if (action === 'click') {
          const linkText = args.value || args.text || '';
          const resp = await fetch(url, { headers: { 'User-Agent': UA } });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

          const html = await resp.text();
          const links = extractLinks(html);
          const matched = links.find(l =>
            l.text.toLowerCase().includes(linkText.toLowerCase()) ||
            linkText.toLowerCase().includes(l.text.toLowerCase())
          );

          if (!matched) {
            return { success: false, data: { error: `No link found matching "${linkText}" on ${url}`, availableLinks: links.slice(0, 10) } };
          }

          const linkResp = await fetch(matched.url, { headers: { 'User-Agent': UA } });
          if (!linkResp.ok) throw new Error(`HTTP ${linkResp.status}`);
          const linkHtml = await linkResp.text();
          const { headings, firstParagraph, content: fullText } = extractStructuredContent(linkHtml);
          const meta = extractPageMetadata(linkHtml, matched.url);
          const wordCount = fullText.split(/\s+/).length;

          return {
            success: true,
            data: { url: matched.url, action: 'click', clickedText: matched.text, title: meta.title, content: fullText.slice(0, 12000), wordCount, headings: headings.slice(0, 8), firstParagraph, via: 'direct' },
            display: {
              type: 'browser', title: meta.title, items: [{ url: matched.url, title: meta.title }],
              description: meta.description, excerpt: firstParagraph.slice(0, 200) || fullText.slice(0, 200),
              ogImage: meta.ogImage, siteName: meta.siteName, wordCount, via: 'direct',
              screenshotUrl: await captureScreenshot(matched.url),
            },
          };
        } else if (action === 'scroll') {
          const fullPageShot = `https://image.thum.io/get/fullpage/${url}`;
          return {
            success: true,
            data: { url, action: 'scroll', screenshotUrl: fullPageShot },
            display: { type: 'browser', title: `Full page: ${url}`, items: [{ url, title: 'Full page screenshot' }], screenshotUrl: fullPageShot, via: 'screenshot' },
          };
        }

        return { success: false, data: { error: `Unknown action: ${action}` } };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    // ── Browser Search (DuckDuckGo — Upgraded) ──
    case 'browser_search': {
      try {
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(args.query)}`;
        const resp = await fetch(searchUrl, { headers: { 'User-Agent': UA } });
        if (!resp.ok) throw new Error(`Search failed: ${resp.status}`);
        const html = await resp.text();

        const results: { title: string; url: string; snippet: string }[] = [];
        const resultRegex = /<a[^>]*class="result__a"[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>[\s\S]*?class="result__snippet"[^>]*>([^<]*)/gi;
        let match;
        while ((match = resultRegex.exec(html)) !== null) {
          const cleanUrl = cleanDdgUrl(match[1].trim());
          results.push({
            title: match[2].trim(),
            url: cleanUrl,
            snippet: match[3].trim().replace(/<[^>]+>/g, ''),
          });
        }

        return {
          success: true,
          data: { query: args.query, results: results.slice(0, 8) },
          display: {
            type: 'search_results',
            title: `Search: "${args.query}"`,
            items: results.slice(0, 8).map(r => ({ title: r.title, url: r.url })),
          },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    // ── Jina Reader (Upgraded) ───────────────────
    case 'jina_reader': {
      try {
        let url = args.url;
        if (!url.startsWith('http')) url = `https://${url}`;
        const resp = await fetch(`https://r.jina.ai/${url}`, {
          headers: { 'Accept': 'text/plain' },
        });
        if (!resp.ok) throw new Error(`Jina Reader failed: ${resp.status}`);
        const content = await resp.text();
        const titleLine = content.split('\n').find((l: string) => l.trim().length > 0) || url;
        const wordCount = content.split(/\s+/).length;
        return {
          success: true,
          data: { url, title: titleLine, content: content.slice(0, 12000), contentLength: content.length, wordCount },
          display: {
            type: 'browser',
            title: titleLine,
            items: [{ url, title: titleLine }],
            excerpt: content.slice(0, 200).trim(),
            wordCount,
            via: 'jina',
            screenshotUrl: await captureScreenshot(url),
          },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    // ── Memory Save ─────────────────────────────
    case 'memory_save': {
      try {
        const SUPABASE_URL = process.env.SUPABASE_URL || '';
        const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
        const HEADERS = {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        };

        await fetch(`${SUPABASE_URL}/rest/v1/ai_memory`, {
          method: 'POST',
          headers: { ...HEADERS, 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            memory_type: 'LONG_TERM',
            content: args.content,
            importance: args.importance || 5,
            source: args.category || 'context',
            is_active: true,
          }),
        });

        return {
          success: true,
          data: { saved: true, content: args.content, category: args.category || 'context' },
          display: { type: 'memory_saved', title: 'Memory saved', items: [{ content: args.content }] },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    // ── Memory Recall ───────────────────────────
    case 'memory_recall': {
      try {
        const SUPABASE_URL = process.env.SUPABASE_URL || '';
        const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
        const HEADERS = {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        };

        let url = `${SUPABASE_URL}/rest/v1/ai_memory?memory_type=eq.LONG_TERM&is_active=eq.true&order=importance.desc&limit=10`;

        const resp = await fetch(url, { headers: HEADERS });
        if (!resp.ok) throw new Error('Memory recall failed');

        const data = await resp.json() as any[];
        const memories = data.filter((m: any) =>
          m.content?.toLowerCase().includes(args.query?.toLowerCase() || '')
        );

        return {
          success: true,
          data: { memories: memories.map((m: any) => ({ content: m.content, importance: m.importance, category: m.source })) },
          display: {
            type: 'memory_recalled',
            title: `Memory: "${args.query}"`,
            items: memories.map((m: any) => ({ content: m.content })),
          },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    // ── Weather ─────────────────────────────────
    case 'get_weather': {
      try {
        const resp = await fetch(
          `https://wttr.in/${encodeURIComponent(args.location)}?format=j1`,
          { headers: { 'User-Agent': UA } }
        );
        if (!resp.ok) throw new Error(`Weather fetch failed: ${resp.status}`);
        const data = await resp.json();

        const current = data.current_condition?.[0];
        return {
          success: true,
          data: {
            location: args.location,
            temperature: current?.temp_C ? `${current.temp_C}°C` : 'N/A',
            feels_like: current?.FeelsLikeC ? `${current.FeelsLikeC}°C` : 'N/A',
            condition: current?.weatherDesc?.[0]?.value || 'Unknown',
            humidity: current?.humidity ? `${current.humidity}%` : 'N/A',
            wind: current?.windspeedKmph ? `${current.windspeedKmph} km/h` : 'N/A',
            forecast: (data.weather || []).slice(0, 3).map((w: any) => ({
              date: w.date,
              max: `${w.maxtempC}°C`,
              min: `${w.mintempC}°C`,
              desc: w.hourly?.[4]?.weatherDesc?.[0]?.value || 'N/A',
            })),
          },
          display: {
            type: 'weather',
            title: `Weather: ${args.location}`,
            items: [{
              location: args.location,
              temp: current?.temp_C ? `${current.temp_C}°C` : 'N/A',
              condition: current?.weatherDesc?.[0]?.value || 'Unknown',
            }],
          },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    // ── Calculator ─────────────────────────────
    case 'calculate': {
      try {
        const expr = args.expression;
        if (!/^[\d\s+\-*/().%^a-zA-Z,]+$/.test(expr)) {
          throw new Error('Invalid expression');
        }

        const safeExpr = expr
          .replace(/\^/g, '**')
          .replace(/pi/gi, 'Math.PI')
          .replace(/sqrt/gi, 'Math.sqrt')
          .replace(/sin/gi, 'Math.sin')
          .replace(/cos/gi, 'Math.cos')
          .replace(/tan/gi, 'Math.tan')
          .replace(/log/gi, 'Math.log')
          .replace(/abs/gi, 'Math.abs')
          .replace(/floor/gi, 'Math.floor')
          .replace(/ceil/gi, 'Math.ceil')
          .replace(/round/gi, 'Math.round')
          .replace(/max/gi, 'Math.max')
          .replace(/min/gi, 'Math.min');

        // eslint-disable-next-line no-new-func
        const result = Function(`"use strict"; return (${safeExpr})`)();

        return {
          success: true,
          data: { expression: expr, result: String(result) },
          display: { type: 'calculation', title: `${expr} = ${result}`, items: [{ expression: expr, result }] },
        };
      } catch (err: any) {
        return { success: false, data: { error: `Calculation error: ${err.message}` } };
      }
    }

    // ── Get Time ────────────────────────────────
    case 'get_time': {
      try {
        const tz = args.timezone || 'UTC';
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZoneName: 'short',
        });

        return {
          success: true,
          data: { timezone: tz, datetime: formatter.format(now), iso: now.toISOString() },
          display: { type: 'time', title: formatter.format(now), items: [{ timezone: tz, time: formatter.format(now) }] },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    // ── URL Metadata ────────────────────────────
    case 'url_metadata': {
      try {
        let url = args.url;
        if (!url.startsWith('http')) url = `https://${url}`;

        const resp = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const html = await resp.text();
        const meta = extractPageMetadata(html, url);
        const twitterCard = extractMeta(html, 'twitter:card') || '';

        return {
          success: true,
          data: {
            url,
            title: meta.title,
            description: meta.description,
            image: meta.ogImage,
            siteName: meta.siteName,
            twitterCard,
          },
          display: { type: 'metadata', title: meta.title, items: [{ url, description: meta.description.slice(0, 200) }] },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    // ── Code Runner ─────────────────────────────
    case 'code_run': {
      try {
        const code = args.code;
        const logs: string[] = [];
        const mockConsole = {
          log: (...a: any[]) => logs.push(a.map(String).join(' ')),
          error: (...a: any[]) => logs.push(`[ERROR] ${a.map(String).join(' ')}`),
          warn: (...a: any[]) => logs.push(`[WARN] ${a.map(String).join(' ')}`),
          info: (...a: any[]) => logs.push(a.map(String).join(' ')),
        };

        // eslint-disable-next-line no-new-func
        const fn = new Function('console', `"use strict"; ${code}`);
        let result: any;
        try {
          result = await fn(mockConsole);
        } catch (e: any) {
          return {
            success: true,
            data: { logs, error: e.message },
            display: { type: 'code_output', title: 'Code execution', items: [{ logs, error: e.message }] },
          };
        }

        return {
          success: true,
          data: { logs, result: result !== undefined ? String(result) : undefined },
          display: { type: 'code_output', title: 'Code execution', items: [{ logs: logs.join('\n'), result: result !== undefined ? String(result) : 'undefined' }] },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    // ── Translate ───────────────────────────────
    case 'translate': {
      try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${args.source_lang || 'auto'}&tl=${args.target_lang}&dt=t&q=${encodeURIComponent(args.text)}`;
        const resp = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!resp.ok) throw new Error(`Translation failed: ${resp.status}`);
        const data = await resp.json();

        const translated = (data[0] || []).map((s: any[]) => s[0]).join('');
        const detectedLang = data[2] || args.source_lang || 'auto';

        return {
          success: true,
          data: { translated, sourceLang: detectedLang, targetLang: args.target_lang },
          display: { type: 'translation', title: `→ ${args.target_lang}`, items: [{ original: args.text.slice(0, 100), translated: translated.slice(0, 100) }] },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    default:
      return { success: false, data: { error: `Unknown tool: ${name}` } };
  }
}
