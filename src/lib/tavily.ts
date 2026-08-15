/**
 * Tavily Search Client — Upgraded
 * Provides web search, extract (URL→content), site-specific search,
 * caching, and answer-only mode.
 *
 * SECURITY: API key must come from environment variable TAVILY_API_KEY.
 * No hardcoded fallback — if missing, search returns an error.
 */

const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';
const TAVILY_BASE = 'https://api.tavily.com';

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
  raw_content?: string;
}

export interface TavilySearchResponse {
  query: string;
  results: TavilySearchResult[];
  answer?: string;
  responseTime?: number;
}

export interface TavilyExtractResult {
  url: string;
  raw_content: string;
  images?: string[];
}

export interface TavilyExtractResponse {
  results: TavilyExtractResult[];
  failed?: { url: string; error: string }[];
}

// ── In-memory cache (per serverless invocation) ───────────
const searchCache = new Map<string, { data: TavilySearchResponse; expiresAt: number }>();
const extractCache = new Map<string, { data: TavilyExtractResponse; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Search the web using Tavily API.
 */
export async function tavilySearch(
  query: string,
  options: {
    maxResults?: number;
    includeAnswer?: boolean;
    searchDepth?: 'basic' | 'advanced';
    includeRawContent?: boolean;
    domains?: string[];        // restrict to specific domains
    excludeDomains?: string[]; // exclude specific domains
    timeRange?: string;         // 'day', 'week', 'month', 'year'
  } = {}
): Promise<TavilySearchResponse> {
  if (!TAVILY_API_KEY) {
    throw new Error('TAVILY_API_KEY environment variable is not set. Web search is unavailable.');
  }

  const {
    maxResults = 5,
    includeAnswer = true,
    searchDepth = 'basic',
    includeRawContent = false,
    domains,
    excludeDomains,
    timeRange,
  } = options;

  // Cache key
  const cacheKey = JSON.stringify({ query, maxResults, searchDepth, domains, excludeDomains, timeRange });
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  const response = await fetch(`${TAVILY_BASE}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      max_results: maxResults,
      include_answer: includeAnswer,
      search_depth: searchDepth,
      include_raw_content: includeRawContent,
      ...(domains?.length && { include_domains: domains }),
      ...(excludeDomains?.length && { exclude_domains: excludeDomains }),
      ...(timeRange && { time_range: timeRange }),
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Tavily search failed: ${response.status} ${errText}`);
  }

  const data = await response.json();

  const result: TavilySearchResponse = {
    query,
    results: (data.results || []).map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      content: r.content || '',
      score: r.score,
      raw_content: r.raw_content,
    })),
    answer: data.answer,
    responseTime: data.response_time,
  };

  // Cache it
  searchCache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL });

  return result;
}

/**
 * Extract content from specific URLs using Tavily Extract API.
 * This gets the full page content — much better than search snippets.
 */
export async function tavilyExtract(urls: string[]): Promise<TavilyExtractResponse> {
  if (!TAVILY_API_KEY) {
    throw new Error('TAVILY_API_KEY environment variable is not set.');
  }

  const cacheKey = urls.join(',');
  const cached = extractCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  const response = await fetch(`${TAVILY_BASE}/extract`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TAVILY_API_KEY}`,
    },
    body: JSON.stringify({ urls }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Tavily extract failed: ${response.status} ${errText}`);
  }

  const data = await response.json();

  const result: TavilyExtractResponse = {
    results: (data.results || []).map((r: any) => ({
      url: r.url || '',
      raw_content: r.raw_content || '',
      images: r.images,
    })),
    failed: data.failed,
  };

  extractCache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL });

  return result;
}

/**
 * Site-specific search — search within a specific domain.
 * Perfect for "search cozanet.net for X" queries.
 */
export async function tavilySiteSearch(
  site: string,
  query: string,
  options: { maxResults?: number; includeAnswer?: boolean } = {}
): Promise<TavilySearchResponse> {
  const domain = site.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return tavilySearch(`${query} site:${domain}`, {
    maxResults: options.maxResults ?? 5,
    includeAnswer: options.includeAnswer ?? true,
    domains: [domain],
  });
}

/**
 * Quick answer — get just the AI answer, no results list.
 * For simple questions like "what is X" or "who is Y".
 */
export async function tavilyQuickAnswer(query: string): Promise<string | null> {
  const result = await tavilySearch(query, {
    maxResults: 1,
    includeAnswer: true,
    searchDepth: 'basic',
  });
  return result.answer || null;
}

/**
 * Determine if a user message needs internet search.
 * Upgraded with more patterns and domain detection.
 */
export function needsWebSearch(message: string): { shouldSearch: boolean; searchQuery?: string; domainRestriction?: string } {
  const lower = message.toLowerCase().trim();

  // Domain-restricted search: "search cozanet.net for X" or "on cozanet.net, find X"
  const domainMatch = message.match(/(?:search|find|look up|browse)\s+(.+?)\s+(?:on|at|from)\s+([\w.-]+\.\w{2,})/i);
  if (domainMatch) {
    return {
      shouldSearch: true,
      searchQuery: domainMatch[1],
      domainRestriction: domainMatch[2],
    };
  }

  // "search cozanet.net" — search the site itself
  const siteSearch = message.match(/(?:search|browse|visit|check)\s+([\w.-]+\.\w{2,})/i);
  if (siteSearch) {
    return {
      shouldSearch: true,
      searchQuery: siteSearch[1],
      domainRestriction: siteSearch[1],
    };
  }

  // Explicit "search" commands — always search
  const searchCommands = [
    /^(search|google|look up|find|browse)\s+(for\s+|the\s+|me\s+)*/i,
    /^can you (search|look up|find|check)\b/i,
    /^what.*(happening|going on|trending|latest|new)\b/i,
    /^what.*(today|right now|currently|this week|this month)\b/i,
  ];

  for (const cmd of searchCommands) {
    if (cmd.test(lower)) {
      return { shouldSearch: true, searchQuery: message };
    }
  }

  // Time-sensitive keywords
  const timeKeywords = [
    'latest', 'today', 'right now', 'currently', 'this week', 'this month',
    'this year', 'recent', 'new', 'breaking', 'trending', 'current',
    'update', 'happening', 'score', 'price of', 'stock', 'weather',
    'news', 'election', 'result', 'live', 'now', 'yesterday', 'tomorrow',
    'in 2026', 'in 2025', 'this morning', 'this evening',
  ];

  // Real-world fact keywords
  const factKeywords = [
    'price', 'stock', 'market', 'crypto', 'bitcoin', 'ethereum', 'bnb',
    'weather', 'temperature', 'forecast', 'score', 'match', 'game',
    'election', 'president', 'prime minister', 'ceo of', 'value of',
    'exchange rate', 'conversion', 'how much is', 'worth of',
    'cozanet', 'aegis', 'czn token', 'defi', 'tvl',
  ];

  const hasTimeKeyword = timeKeywords.some(kw => lower.includes(kw));
  const hasFactKeyword = factKeywords.some(kw => lower.includes(kw));

  if (hasTimeKeyword || (hasFactKeyword && lower.includes('?'))) {
    return { shouldSearch: true, searchQuery: message };
  }

  return { shouldSearch: false };
}
