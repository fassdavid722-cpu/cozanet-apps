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
import {
  executeCode, fileCreate, fileRead, fileList, fileUpdate, fileDelete,
  githubPush, githubListRepos, githubListFiles, githubReadFile,
  secretStore, secretGet, secretList, secretDelete, getAllSecretsForSandbox,
} from '@/lib/sandbox';
import {
  knowledgeStore, knowledgeRecall, knowledgeList, knowledgeDelete, knowledgeFreshness,
} from '@/lib/knowledge';
import {
  deepResearch, quickResearch, exhaustiveResearch,
} from '@/lib/deep-research';
import {
  auditCode, fixAllIssues, generateFix,
} from '@/lib/code-intelligence';
import {
  waitForVercelDeployment, waitForPageContent, waitForGitHubAction, waitDuration,
} from '@/lib/wait-engine';

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
// Uses free screenshot APIs with cache-busting for fresh renders
// thum.io for primary, WordPress mshots as fallback
async function captureScreenshot(url: string): Promise<string> {
  // Cache-bust to force fresh render (not cached version)
  const cb = Date.now();
  // Primary: thum.io — fast, free, returns PNG directly
  const thumUrl = `https://image.thum.io/get/wide/width/1200/${url}?cb=${cb}`;
  
  // Verify the screenshot loads (HEAD check)
  try {
    const resp = await fetch(thumUrl, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
    if (resp.ok && resp.headers.get('content-type')?.includes('image')) {
      return thumUrl;
    }
  } catch {}
  
  // Fallback: WordPress mshots (free, slightly slower but reliable)
  const encodedUrl = encodeURIComponent(url);
  const mshotsUrl = `https://s.wordpress.com/mshots/v1/${encodedUrl}?w=800&h=600&cb=${cb}`;
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
    type: 'search_results' | 'browser' | 'weather' | 'memory_saved' | 'memory_recalled' | 'calculation' | 'code_output' | 'metadata' | 'translation' | 'time' | 'research' | 'knowledge' | 'knowledge_list' | 'info' | 'code_audit' | 'code_fix';
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

export async function executeTool(name: string, args: any, onProgress?: (p: any) => void): Promise<ToolResult> {
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
    // ── Browser Navigate (Real Chromium) ───────
    case 'browser_navigate': {
      try {
        let url = args.url;
        if (!url.startsWith('http')) url = `https://${url}`;

        // Try real browser API first
        try {
          const browserResp = await fetch(
            (process.env.NEXT_PUBLIC_URL || 'https://cozanet-chat.vercel.app') + '/api/browser',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'navigate', url }),
            }
          );
          if (browserResp.ok) {
            const browserData = await browserResp.json();
            if (browserData.success && browserData.content) {
              return {
                success: true,
                data: {
                  url: browserData.url,
                  title: browserData.title,
                  content: browserData.content,
                  contentLength: browserData.content?.length || 0,
                  links: browserData.links || [],
                  via: 'chromium',
                },
                display: {
                  type: 'browser',
                  title: browserData.title,
                  description: browserData.content?.slice(0, 200) || '',
                  wordCount: browserData.content?.split(/\s+/).length || 0,
                  via: 'chromium',
                  screenshotUrl: browserData.screenshot,
                },
              };
            }
          }
        } catch {}

        // Fallback: fetch + Jina Reader
        const resp = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const html = await resp.text();
        const { headings, firstParagraph, content: fullText } = extractStructuredContent(html);
        const meta = extractPageMetadata(html, url);
        const text = fullText;

        if (text.length < 200 && !headings.length) {
          try {
            const jinaResp = await fetch(`https://r.jina.ai/${url}`, { headers: { 'Accept': 'text/plain' } });
            if (jinaResp.ok) {
              const jinaContent = await jinaResp.text();
              if (jinaContent.length > text.length) {
                return {
                  success: true,
                  data: { url, title: meta.title, description: meta.description, content: jinaContent.slice(0, 12000), links: [], via: 'jina' } as any,
                  display: { type: 'browser', title: meta.title, description: meta.description, via: 'jina', screenshotUrl: await captureScreenshot(url) },
                };
              }
            }
          } catch {}
        }

        return {
          success: true,
          data: { url, title: meta.title, description: meta.description, content: text.slice(0, 12000), headings: headings.slice(0, 8), links: args.extract_links ? extractLinks(html) : [], via: 'fetch' },
          display: { type: 'browser', title: meta.title, description: meta.description, via: 'fetch', screenshotUrl: await captureScreenshot(url) },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

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

    // ── Browser Interact (Real Chromium) ───────
    case 'browser_interact': {
      try {
        let url = args.url;
        if (!url.startsWith('http')) url = `https://${url}`;

        // Use real browser API for interactions
        const browserAction = args.action || 'search';
        const browserBody: any = { action: browserAction, url };

        if (browserAction === 'search') {
          browserBody.query = args.query || args.value || '';
        } else if (browserAction === 'click') {
          browserBody.value = args.value || args.text || '';
        }

        const browserResp = await fetch(
          (process.env.NEXT_PUBLIC_URL || 'https://cozanet-chat.vercel.app') + '/api/browser',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(browserBody),
          }
        );

        if (browserResp.ok) {
          const browserData = await browserResp.json();
          if (browserData.success) {
            return {
              success: true,
              data: {
                url: browserData.url,
                title: browserData.title,
                content: browserData.content,
                action: browserAction,
                via: 'chromium',
              },
              display: {
                type: 'browser',
                title: browserData.title,
                description: browserData.content?.slice(0, 200) || '',
                wordCount: browserData.content?.split(/\s+/).length || 0,
                via: 'chromium',
                screenshotUrl: browserData.screenshot,
              },
            };
          }
        }

        // Fallback: basic search URL navigation
        const searchUrl = buildSearchUrl(url, args.query || args.value || '');
        const resp = await fetch(searchUrl, { headers: { 'User-Agent': UA } });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const html = await resp.text();
        const meta = extractPageMetadata(html, searchUrl);
        const { content: fullText } = extractStructuredContent(html);

        return {
          success: true,
          data: { url: searchUrl, title: meta.title, content: fullText.slice(0, 12000), action: browserAction, via: 'fetch' },
          display: { type: 'browser', title: meta.title, via: 'fetch', screenshotUrl: await captureScreenshot(searchUrl) },
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

        // Try real browser API first for better screenshots
        try {
          const browserResp = await fetch(
            (process.env.NEXT_PUBLIC_URL || 'https://cozanet-chat.vercel.app') + '/api/browser',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'navigate', url }),
            }
          );
          if (browserResp.ok) {
            const browserData = await browserResp.json();
            if (browserData.success && browserData.content) {
              return {
                success: true,
                data: { url, title: browserData.title, content: browserData.content.slice(0, 12000), contentLength: browserData.content?.length || 0, wordCount: browserData.content?.split(/\s+/).length || 0, via: 'chromium' },
                display: { type: 'browser', title: browserData.title, via: 'chromium', screenshotUrl: browserData.screenshot },
              };
            }
          }
        } catch {}

        // Fallback: Jina Reader API
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
            memory_type: 'MEMORY',
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

        let url = `${SUPABASE_URL}/rest/v1/ai_memory?memory_type=eq.MEMORY&is_active=eq.true&order=importance.desc&limit=10`;

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

    // ── Code Execute (Real execution via Piston API) ──
    case 'code_execute': {
      try {
        // Inject stored secrets as environment variables
        const secrets = await getAllSecretsForSandbox();
        const language = args.language || 'python';
        const result = await executeCode(args.code, language, secrets);
        return {
          success: !result.error,
          data: {
            stdout: result.stdout,
            stderr: result.stderr,
            error: result.error,
          },
          display: {
            type: 'code_output',
            title: `${args.language || 'Python'} execution`,
            items: [{
              output: result.stdout,
              error: result.error || result.stderr,
            }],
          },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    // ── File Operations (Supabase-backed) ────────
    case 'file_create': {
      try {
        const language = args.language || (args.filename || '').split('.').pop() || 'text';
        const sessionId = args._sessionId || 'global';
        const result = await fileCreate(args.filename, args.content, language, sessionId);
        return {
          success: result.success,
          data: { filename: args.filename, created: result.success, error: result.error },
          display: { type: 'metadata', title: result.success ? 'File created' : 'Error', items: [{ filename: args.filename, error: result.error }] },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    case 'file_read': {
      try {
        const sessionId = args._sessionId || 'global';
        const result = await fileRead(args.filename, sessionId);
        return {
          success: result.success,
          data: { filename: args.filename, content: result.content, error: result.error },
          display: { type: 'metadata', title: result.success ? args.filename : 'Error', items: [{ filename: args.filename, content: result.content?.slice(0, 500), error: result.error }] },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    case 'file_list': {
      try {
        const sessionId = args._sessionId || 'global';
        const result = await fileList(sessionId);
        return {
          success: result.success,
          data: { files: result.files, error: result.error },
          display: { type: 'metadata', title: 'Files', items: result.files || [{ error: result.error }] },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    case 'file_update': {
      try {
        const sessionId = args._sessionId || 'global';
        const result = await fileUpdate(args.filename, args.content, sessionId);
        return {
          success: result.success,
          data: { filename: args.filename, updated: result.success, error: result.error },
          display: { type: 'metadata', title: result.success ? 'File updated' : 'Error', items: [{ filename: args.filename, error: result.error }] },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    case 'file_delete': {
      try {
        const sessionId = args._sessionId || 'global';
        const result = await fileDelete(args.filename, sessionId);
        return {
          success: result.success,
          data: { filename: args.filename, deleted: result.success, error: result.error },
          display: { type: 'metadata', title: result.success ? 'File deleted' : 'Error', items: [{ filename: args.filename, error: result.error }] },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    // ── GitHub Tools ─────────────────────────────
    case 'github_list_repos': {
      try {
        const result = await githubListRepos();
        return {
          success: result.success,
          data: { repos: result.repos, error: result.error },
          display: { type: 'metadata', title: result.success ? 'Your GitHub Repos' : 'GitHub Error', items: result.repos || [{ error: result.error }] },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    case 'github_list_files': {
      try {
        const branch = args.branch || 'main';
        const result = await githubListFiles(args.owner, args.repo, args.path || '', branch);
        return {
          success: result.success,
          data: { files: result.files, error: result.error },
          display: { type: 'metadata', title: result.success ? `${args.owner}/${args.repo}/${args.path || ''}` : 'GitHub Error', items: result.files || [{ error: result.error }] },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    case 'github_read_file': {
      try {
        const branch = args.branch || 'main';
        const result = await githubReadFile(args.owner, args.repo, args.path, branch);
        return {
          success: result.success,
          data: { path: args.path, content: result.content, error: result.error },
          display: { type: 'metadata', title: result.success ? args.path : 'GitHub Error', items: [{ path: args.path, content: result.content?.slice(0, 500), error: result.error }] },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    case 'github_push': {
      try {
        const branch = args.branch || 'main';
        const result = await githubPush(args.owner, args.repo, args.path, args.content, args.commit_message, branch);
        return {
          success: result.success,
          data: { commitUrl: result.commitUrl, error: result.error },
          display: { type: 'metadata', title: result.success ? 'Pushed to GitHub' : 'GitHub Error', items: [{ url: result.commitUrl, repo: `${args.owner}/${args.repo}`, path: args.path, error: result.error }] },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    // ── Secret Management ────────────────────────
    case 'secret_store': {
      try {
        const result = await secretStore(args.key_name, args.key_value, args.service || 'general', args.description || '');
        return {
          success: result.success,
          data: { key_name: args.key_name, stored: result.success, error: result.error },
          display: { type: 'metadata', title: result.success ? 'Secret stored' : 'Error', items: [{ key: args.key_name, service: args.service, error: result.error }] },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    case 'secret_get': {
      try {
        const result = await secretGet(args.key_name);
        return {
          success: result.success,
          data: { key_name: args.key_name, value: result.value, error: result.error },
          display: { type: 'metadata', title: result.success ? 'Secret retrieved' : 'Error', items: [{ key: args.key_name, error: result.error }] },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    case 'secret_list': {
      try {
        const result = await secretList();
        return {
          success: result.success,
          data: { secrets: result.secrets, error: result.error },
          display: { type: 'metadata', title: result.success ? 'Stored Secrets' : 'Error', items: result.secrets || [{ error: result.error }] },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    case 'secret_delete': {
      try {
        const result = await secretDelete(args.key_name);
        return {
          success: result.success,
          data: { key_name: args.key_name, deleted: result.success, error: result.error },
          display: { type: 'metadata', title: result.success ? 'Secret deleted' : 'Error', items: [{ key: args.key_name, error: result.error }] },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    // ── Deep Research (Learning) ────────────────
    case 'deep_research': {
      try {
        const topic = args.topic;
        const depth = args.depth || 'standard';
        
        let result;
        if (depth === 'quick') {
          result = await quickResearch(topic);
        } else if (depth === 'deep' || depth === 'exhaustive') {
          result = await exhaustiveResearch(topic);
        } else {
          result = await deepResearch(topic);
        }

        return {
          success: true,
          data: {
            topic: result.topic,
            summary: result.summary,
            facts: result.facts,
            sources: result.sources,
            confidence: result.confidence,
            duration_ms: result.duration,
            stored: result.stored,
            steps: result.steps.map(s => ({ step: s.step, status: s.status, detail: s.detail })),
          },
          display: {
            type: 'research',
            title: `Research: ${topic}`,
            items: [{
              summary: result.summary,
              facts: result.facts,
              sources: result.sources,
              steps: result.steps,
              duration: result.duration,
            }],
          },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    // ── Knowledge Recall ─────────────────────────
    case 'knowledge_recall': {
      try {
        const topic = args.topic;
        const exact = args.exact || false;
        const result = await knowledgeRecall(topic, exact);
        return {
          success: result.success,
          data: { entries: result.entries, error: result.error },
          display: {
            type: 'knowledge',
            title: `Knowledge: ${topic}`,
            items: (result.entries || []).map((e: any) => ({
              topic: e.topic,
              summary: e.summary,
              confidence: e.confidence,
              freshness: e.freshness,
              sources: e.sources,
            })),
          },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    // ── Knowledge List ──────────────────────────
    case 'knowledge_list': {
      try {
        const category = args.category;
        const result = await knowledgeList(category);
        return {
          success: result.success,
          data: { entries: result.entries, error: result.error },
          display: {
            type: 'knowledge_list',
            title: 'Knowledge Base',
            items: result.entries || [],
          },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    // ── Knowledge Store ─────────────────────────
    case 'knowledge_store': {
      try {
        const result = await knowledgeStore(
          args.topic,
          args.content,
          {
            category: args.category,
            summary: args.summary,
            sources: args.sources,
            confidence: args.confidence,
            tags: args.tags,
          },
        );
        return {
          success: result.success,
          data: { stored: result.success, id: result.id, error: result.error },
          display: {
            type: 'info',
            title: 'Knowledge Stored',
            items: [{ topic: args.topic, stored: result.success }],
          },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    // ── Knowledge Delete ────────────────────────
    case 'knowledge_delete': {
      try {
        const result = await knowledgeDelete(args.topic);
        return {
          success: result.success,
          data: { deleted: result.success, error: result.error },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    // ── Code Audit ──────────────────────────────
    case 'code_audit': {
      try {
        const code = args.code;
        const language = args.language || 'javascript';
        const runTests = args.run_tests !== false;
        
        const result = await auditCode(code, language, runTests);
        
        return {
          success: true,
          data: {
            issues: result.issues,
            score: result.score,
            summary: result.summary,
            tests_passed: result.testsPassed,
            test_output: result.testOutput,
          },
          display: {
            type: 'code_audit',
            title: 'Code Audit Results',
            items: [{
              score: result.score,
              issueCount: result.issues.length,
              issues: result.issues,
              testsPassed: result.testsPassed,
              testOutput: result.testOutput,
            }],
          },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    // ── Code Fix (auto-fix issues) ──────────────
    case 'code_fix': {
      try {
        const code = args.code;
        const language = args.language || 'javascript';
        const result = await fixAllIssues(code, language);
        
        return {
          success: true,
          data: {
            fixed_code: result.fixedCode,
            changes: result.changes,
            new_score: result.auditResult.score,
            remaining_issues: result.auditResult.issues.length,
          },
          display: {
            type: 'code_fix',
            title: 'Auto-Fix Results',
            items: [{
              changes: result.changes,
              newScore: result.auditResult.score,
              remainingIssues: result.auditResult.issues.length,
              fixedCode: result.fixedCode,
            }],
          },
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

    // ── Wait & Poll Tools ───────────────────────────
    case 'wait_for_deployment': {
      try {
        const vercelKey = process.env.VERCEL_API_KEY || process.env.VERCEL_API_TOKEN || '';
        if (!vercelKey) {
          return { success: false, data: { error: 'No Vercel API key configured. Set VERCEL_API_KEY environment variable.' } };
        }
        const result = await waitForVercelDeployment(
          args.deployment_id,
          args.team_id,
          vercelKey,
          {
            maxWaitMs: (args.max_wait_seconds || 120) * 1000,
            pollIntervalMs: 5000,
            onProgress: (p) => onProgress?.({ status: 'waiting', waitDetail: p.detail, waitAttempt: p.attempt, waitMaxAttempts: p.maxAttempts, waitElapsedMs: p.elapsedTime }),
          }
        );
        return {
          success: result.ready,
          data: {
            ready: result.ready,
            state: result.state,
            url: result.url,
            error: result.error,
          },
          display: {
            type: 'info' as any,
            title: result.ready ? `Deployment Ready!` : `Deployment ${result.state}`,
          },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    case 'wait_for_page': {
      try {
        const result = await waitForPageContent(args.url, {
          searchText: args.search_text,
          minContentLength: args.min_content_length,
          maxWaitMs: (args.max_wait_seconds || 60) * 1000,
          pollIntervalMs: 3000,
          onProgress: (p) => onProgress?.({ status: 'waiting', waitDetail: p.detail, waitAttempt: p.attempt, waitMaxAttempts: p.maxAttempts, waitElapsedMs: p.elapsedTime }),
        });
        return {
          success: result.ready,
          data: {
            ready: result.ready,
            title: result.title,
            content: result.content,
            error: result.error,
          },
          display: {
            type: 'info' as any,
            title: result.ready ? `Page loaded: ${result.title || args.url}` : `Page not ready: ${result.error || 'timeout'}`,
          },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    case 'wait_for_github_action': {
      try {
        const ghToken = process.env.GITHUB_TOKEN || process.env.GITHUB_ACCESS_TOKEN || '';
        if (!ghToken) {
          return { success: false, data: { error: 'No GitHub token configured.' } };
        }
        const result = await waitForGitHubAction(
          args.owner,
          args.repo,
          args.run_id,
          ghToken,
          {
            maxWaitMs: (args.max_wait_seconds || 180) * 1000,
            pollIntervalMs: 10000,
            onProgress: (p) => onProgress?.({ status: 'waiting', waitDetail: p.detail, waitAttempt: p.attempt, waitMaxAttempts: p.maxAttempts, waitElapsedMs: p.elapsedTime }),
          }
        );
        return {
          success: result.ready,
          data: {
            ready: result.ready,
            conclusion: result.conclusion,
            state: result.state,
            error: result.error,
          },
          display: {
            type: 'info' as any,
            title: result.ready ? `GitHub Action: ${result.conclusion}` : `Action ${result.state}`,
          },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    case 'wait_duration': {
      try {
        const seconds = Math.min(args.seconds || 5, 120);
        await waitDuration(seconds * 1000, (p) => onProgress?.({ status: 'waiting', waitDetail: p.detail, waitAttempt: p.attempt, waitMaxAttempts: p.maxAttempts, waitElapsedMs: p.elapsedTime }));
        return {
          success: true,
          data: { waited: seconds, reason: args.reason || 'cooldown' },
          display: {
            type: 'info' as any,
            title: `Waited ${seconds}s`,
          },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    default:
      return { success: false, data: { error: `Unknown tool: ${name}` } };
  }
}
