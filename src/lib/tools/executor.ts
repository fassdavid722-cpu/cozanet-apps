/**
 * Tool Executor — Handles tool calls from the AI.
 * Each function receives its parameters and returns a result.
 */

import { tavilySearch, tavilyExtract, tavilySiteSearch } from '@/lib/tavily';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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
  return links.slice(0, 30); // cap at 30 links
}

export interface ToolResult {
  success: boolean;
  data: any;
  display?: {
    type: 'search_results' | 'browser' | 'weather' | 'memory_saved' | 'memory_recalled' | 'calculation' | 'code_output' | 'metadata' | 'translation' | 'time';
    title?: string;
    items?: any[];
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

    // ── Browser Navigate ────────────────────────
    case 'browser_navigate': {
      try {
        let url = args.url;
        if (!url.startsWith('http')) url = `https://${url}`;

        const resp = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const html = await resp.text();
        const text = htmlToText(html);
        const title = extractTitle(html);
        const links = args.extract_links ? extractLinks(html) : [];

        return {
          success: true,
          data: {
            url,
            title,
            content: text.slice(0, 8000),
            contentLength: text.length,
            ...(links.length > 0 && { links }),
          },
          display: {
            type: 'browser',
            title,
            items: [{ url, title }],
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
            return {
              success: true,
              data: { url, title: url, content: content.slice(0, 8000), contentLength: content.length, via: 'jina' },
              display: { type: 'browser', title: url, items: [{ url }] },
            };
          }
        } catch {}
        return { success: false, data: { error: err.message } };
      }
    }

    // ── Browser Search (DuckDuckGo) ─────────────
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
          results.push({ title: match[2].trim(), url: match[1].trim(), snippet: match[3].trim() });
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

    // ── Jina Reader ─────────────────────────────
    case 'jina_reader': {
      try {
        let url = args.url;
        if (!url.startsWith('http')) url = `https://${url}`;
        const resp = await fetch(`https://r.jina.ai/${url}`, {
          headers: { 'Accept': 'text/plain' },
        });
        if (!resp.ok) throw new Error(`Jina Reader failed: ${resp.status}`);
        const content = await resp.text();
        return {
          success: true,
          data: { url, content: content.slice(0, 8000), contentLength: content.length },
          display: { type: 'browser', title: url, items: [{ url }] },
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
        // Safe eval: only allow math characters and functions
        if (!/^[\d\s+\-*/().%^a-zA-Z,]+$/.test(expr)) {
          throw new Error('Invalid expression');
        }

        // Replace common math functions
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
        const title = extractTitle(html);
        const description = extractMeta(html, 'description') || extractMeta(html, 'og:description') || '';
        const ogTitle = extractMeta(html, 'og:title') || title;
        const ogImage = extractMeta(html, 'og:image') || '';
        const ogSiteName = extractMeta(html, 'og:site_name') || '';
        const twitterCard = extractMeta(html, 'twitter:card') || '';

        return {
          success: true,
          data: {
            url,
            title: ogTitle || title,
            description,
            image: ogImage,
            siteName: ogSiteName,
            twitterCard,
          },
          display: { type: 'metadata', title: ogTitle || title, items: [{ url, description: description.slice(0, 200) }] },
        };
      } catch (err: any) {
        return { success: false, data: { error: err.message } };
      }
    }

    // ── Code Runner ─────────────────────────────
    case 'code_run': {
      try {
        const code = args.code;
        // Capture console.log output
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
          // If it throws, return the error as part of output
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
