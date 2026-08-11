/**
 * Tavily Search Client
 * Provides web search, extract, and crawl capabilities.
 */

const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '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';
const TAVILY_BASE = 'https://api.tavily.com';

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface TavilySearchResponse {
  query: string;
  results: TavilySearchResult[];
  answer?: string;
}

/**
 * Search the web using Tavily API.
 */
export async function tavilySearch(
  query: string,
  options: { maxResults?: number; includeAnswer?: boolean } = {}
): Promise<TavilySearchResponse> {
  const { maxResults = 5, includeAnswer = true } = options;

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
      search_depth: 'basic',
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Tavily search failed: ${response.status} ${errText}`);
  }

  const data = await response.json();

  return {
    query,
    results: (data.results || []).map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      content: r.content || '',
      score: r.score,
    })),
    answer: data.answer,
  };
}

/**
 * Determine if a user message needs internet search.
 * Only searches when the query is about current events, news, prices,
 * weather, recent data, or explicitly asks to search.
 */
export function needsWebSearch(message: string): { shouldSearch: boolean; searchQuery?: string } {
  const lower = message.toLowerCase().trim();

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

  // Time-sensitive keywords that suggest needing current info
  const timeKeywords = [
    'latest', 'today', 'right now', 'currently', 'this week', 'this month',
    'this year', 'recent', 'new', 'breaking', 'trending', 'current',
    'update', 'happening', 'score', 'price of', 'stock', 'weather',
    'news', 'election', 'result', 'live', 'now', 'yesterday', 'tomorrow',
    'in 2026', 'in 2025', 'this morning', 'this evening',
  ];

  // Questions about real-world facts that change over time
  const factKeywords = [
    'price', 'stock', 'market', 'crypto', 'bitcoin', 'ethereum', 'bnb',
    'weather', 'temperature', 'forecast', 'score', 'match', 'game',
    'election', 'president', 'prime minister', 'ceo of', 'value of',
    'exchange rate', 'conversion', 'how much is', 'worth of',
  ];

  const hasTimeKeyword = timeKeywords.some(kw => lower.includes(kw));
  const hasFactKeyword = factKeywords.some(kw => lower.includes(kw));

  if (hasTimeKeyword || (hasFactKeyword && lower.includes('?'))) {
    return { shouldSearch: true, searchQuery: message };
  }

  // Default: don't search — use LLM knowledge
  return { shouldSearch: false };
}
