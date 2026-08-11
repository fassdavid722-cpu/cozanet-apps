/**
 * Search Provider abstraction layer.
 *
 * Makes search providers (Tavily, SearXNG, Brave, etc.) swappable
 * without touching the orchestrator or research logic.
 *
 * The existing src/lib/tavily.ts remains as the low-level client.
 * This adapter wraps it behind a provider interface.
 */

import type {
  SearchProvider,
  SearchProviderResponse,
  SearchOptions,
  SearchProviderResult,
  ExtractedContent,
} from './types';

const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';
const TAVILY_BASE = 'https://api.tavily.com';

/**
 * Tavily search provider adapter.
 * Wraps the existing Tavily integration behind the SearchProvider interface.
 */
export class TavilyProvider implements SearchProvider {
  name = 'tavily';

  async search(query: string, options: SearchOptions = {}): Promise<SearchProviderResponse> {
    if (!TAVILY_API_KEY) {
      return {
        query,
        results: [],
        error: 'TAVILY_API_KEY not set',
      };
    }

    const {
      maxResults = 5,
      searchDepth = 'basic',
      includeAnswer = true,
      includeRawContent = false,
      domainRestrictions,
      excludeDomains,
      timeRange,
    } = options;

    try {
      const body: Record<string, any> = {
        query,
        max_results: maxResults,
        include_answer: includeAnswer,
        search_depth: searchDepth,
        include_raw_content: includeRawContent,
      };

      if (domainRestrictions && domainRestrictions.length > 0) {
        body.include_domains = domainRestrictions;
      }
      if (excludeDomains && excludeDomains.length > 0) {
        body.exclude_domains = excludeDomains;
      }

      // Tavily time range mapping
      if (timeRange) {
        const days = timeRange === 'day' ? 1 : timeRange === 'week' ? 7 : timeRange === 'month' ? 30 : 365;
        body.days = days;
      }

      const response = await fetch(`${TAVILY_BASE}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TAVILY_API_KEY}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        if (response.status === 429) {
          return { query, results: [], error: 'Rate limited by Tavily' };
        }
        return { query, results: [], error: `Tavily ${response.status}: ${errText.slice(0, 200)}` };
      }

      const data = await response.json();

      const results: SearchProviderResult[] = (data.results || []).map((r: any) => ({
        title: r.title || '',
        url: r.url || '',
        content: r.content || '',
        score: r.score,
        publishedDate: r.published_date || null,
      }));

      return {
        query,
        results,
        answer: data.answer,
      };
    } catch (err: any) {
      return { query, results: [], error: `Tavily fetch error: ${err.message}` };
    }
  }

  async extract(urls: string[]): Promise<ExtractedContent[]> {
    if (!TAVILY_API_KEY || urls.length === 0) {
      return urls.map(url => ({ url, content: '', success: false, error: 'No API key or no URLs' }));
    }

    try {
      // Tavily extract endpoint
      const response = await fetch(`${TAVILY_BASE}/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TAVILY_API_KEY}`,
        },
        body: JSON.stringify({ urls: urls.slice(0, 10) }), // max 10 URLs per request
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        return urls.map(url => ({
          url,
          content: '',
          success: false,
          error: `Extract ${response.status}: ${errText.slice(0, 100)}`,
        }));
      }

      const data = await response.json();
      const extracted: any[] = data.results || [];

      return urls.map(url => {
        const match = extracted.find((e: any) => e.url === url);
        if (match && match.raw_content) {
          return {
            url,
            content: match.raw_content.slice(0, 5000), // cap at 5k chars per page
            success: true,
          };
        }
        return { url, content: '', success: false, error: 'No content extracted' };
      });
    } catch (err: any) {
      return urls.map(url => ({ url, content: '', success: false, error: err.message }));
    }
  }
}

/**
 * Direct fetch content retriever — fallback when Tavily extract is unavailable.
 * Fetches the page and extracts text content using regex (Edge-compatible).
 */
export async function directFetchContent(url: string): Promise<ExtractedContent> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CozanetResearchBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return { url, content: '', success: false, error: `HTTP ${response.status}` };
    }

    const html = await response.text();
    // Strip scripts, styles, and HTML tags
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    return {
      url,
      content: text.slice(0, 5000),
      success: text.length > 50,
    };
  } catch (err: any) {
    return { url, content: '', success: false, error: err.message };
  }
}

/**
 * Registry for search providers.
 * Default provider is Tavily. Future providers (SearXNG, Brave) can be registered here.
 */
const providers: Map<string, SearchProvider> = new Map();

export function registerProvider(provider: SearchProvider): void {
  providers.set(provider.name, provider);
}

export function getProvider(name: string = 'tavily'): SearchProvider | null {
  if (providers.size === 0) {
    registerProvider(new TavilyProvider());
  }
  return providers.get(name) || null;
}

// Auto-register Tavily on module load
registerProvider(new TavilyProvider());
