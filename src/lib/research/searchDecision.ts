/**
 * Search Decision Engine
 *
 * Determines WHEN to search and classifies the user's request.
 * Uses keyword heuristics + LLM analysis for accuracy.
 *
 * This replaces the old needsWebSearch() function in tavily.ts.
 * The old function remains for backward compatibility but the
 * orchestrator uses this engine instead.
 */

import type { SearchDecision, ResearchCategory, ResearchMode } from './types';

// ── Explicit search triggers ────────────────────────────────────

const EXPLICIT_SEARCH_TRIGGERS = [
  /\b(search|google|look up|lookup|find|browse|check online|research|verify online)\b/i,
  /\bcan you (search|look up|find|check)\b/i,
  /\bsearch the web\b/i,
  /\bdo a (quick )?search\b/i,
  /\bdeep research\b/i,
];

// ── Category detection patterns ─────────────────────────────────

const CATEGORY_PATTERNS: { category: ResearchCategory; patterns: RegExp[] }[] = [
  {
    category: 'PRICE_MARKET',
    patterns: [
      /\b(price|prices|cost|how much|worth|value of|market cap)\b/i,
      /\b(stock|crypto|bitcoin|btc|ethereum|eth|bnb|usdt|token)\b/i,
      /\b(exchange rate|conversion rate|trading)\b/i,
    ],
  },
  {
    category: 'NEWS',
    patterns: [
      /\b(news|breaking|headline|latest news|today's news|current events)\b/i,
      /\b(happening|going on|trending|developing story)\b/i,
    ],
  },
  {
    category: 'CURRENT_INFORMATION',
    patterns: [
      /\b(today|right now|currently|this week|this month|this year|latest|recent|new|current|update|updated)\b/i,
      /\b(yesterday|tomorrow|in 2026|in 2025|in 2027)\b/i,
    ],
  },
  {
    category: 'TECHNICAL_DOCUMENTATION',
    patterns: [
      /\b(api|sdk|documentation|docs|how to|tutorial|setup|install|configure)\b/i,
      /\b(github|stack overflow|developer|programming|code|function)\b/i,
      /\b(next\.?js|react|typescript|python|node|docker)\b/i,
    ],
  },
  {
    category: 'LEGAL_REGULATORY',
    patterns: [
      /\b(legal|regulation|regulatory|law|compliance|kyc|aml|gdpr|license|requirement)\b/i,
      /\b(government|regulator|policy|policies|mandate)\b/i,
    ],
  },
  {
    category: 'FINANCIAL',
    patterns: [
      /\b(fee|fees|charge|charges|rate|rates|interest|apy|apr)\b/i,
      /\b(bank account|wire|transfer|settlement|deposit|withdrawal)\b/i,
      /\b(usdt|usdc|fiat|ngn|naira|bank)\b/i,
    ],
  },
  {
    category: 'COMPANY_RESEARCH',
    patterns: [
      /\b(company|companies|corporation|startup|does .+ support|does .+ offer)\b/i,
      /\b(acquisition|funding|valuation|revenue|ipo)\b/i,
    ],
  },
  {
    category: 'PRODUCT_RESEARCH',
    patterns: [
      /\b(product|service|feature|features|available|availability|supported)\b/i,
      /\b(compare|comparison|best|alternative|review)\b/i,
    ],
  },
  {
    category: 'LOCATION',
    patterns: [
      /\b(where|location|near me|address|directions|map)\b/i,
      /\b(restaurant|hotel|place|store|shop)\b/i,
    ],
  },
  {
    category: 'FACT_VERIFICATION',
    patterns: [
      /\b(true|false|fact|myth|rumor|claim|verify|confirmed|debunk)\b/i,
      /\b(did .+ really|is it true|actually)\b/i,
    ],
  },
  {
    category: 'DEEP_RESEARCH',
    patterns: [
      /\b(deep research|comprehensive|detailed analysis|in-?depth|thorough)\b/i,
      /\b(compare and contrast|pros and cons|advantages|disadvantages)\b/i,
    ],
  },
];

// ── Stable knowledge that usually doesn't need search ────────────

const STABLE_KNOWLEDGE_PATTERNS = [
  /\b(what is|explain|define|definition of|meaning of)\b/i,
  /\b(how does .+ work|how do .+ work)\b/i,
  /\b(history of|origin of|who invented|when was .+ invented)\b/i,
  /\b(math|calculate|formula|equation)\b/i,
];

/**
 * Determine the research category from the user's message.
 */
export function classifyCategory(message: string): ResearchCategory {
  const lower = message.toLowerCase();

  // Check each category's patterns
  let bestMatch: ResearchCategory = 'GENERAL_KNOWLEDGE';
  let bestScore = 0;

  for (const { category, patterns } of CATEGORY_PATTERNS) {
    let score = 0;
    for (const pattern of patterns) {
      if (pattern.test(lower)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = category;
    }
  }

  return bestMatch;
}

/**
 * Determine the research mode based on message complexity.
 */
export function determineMode(message: string, category: ResearchCategory, explicitSearch: boolean): ResearchMode {
  const lower = message.toLowerCase();

  // Explicit deep research
  if (/\bdeep research\b/i.test(lower) || /\bcomprehensive\b/i.test(lower) || /\bin-?depth\b/i.test(lower)) {
    return 'DEEP_RESEARCH';
  }

  // Explicit quick search
  if (/\bquick search\b/i.test(lower) || /\bjust search\b/i.test(lower)) {
    return 'QUICK_SEARCH';
  }

  // Deep research for complex categories
  if (category === 'DEEP_RESEARCH' || category === 'LEGAL_REGULATORY' || category === 'FACT_VERIFICATION') {
    return 'DEEP_RESEARCH';
  }

  // Multi-question complexity → normal research
  const questionMarks = (lower.match(/\?/g) || []).length;
  const wordCount = lower.split(/\s+/).length;
  const hasMultipleAspects = /\b(and|also|plus|additionally|what about|how about)\b/i.test(lower);

  if (questionMarks >= 2 || (wordCount > 40 && hasMultipleAspects)) {
    return 'NORMAL_RESEARCH';
  }

  if (explicitSearch) {
    return 'NORMAL_RESEARCH';
  }

  return 'QUICK_SEARCH';
}

/**
 * Main search decision function.
 * Determines whether to search and how.
 */
export function makeSearchDecision(message: string): SearchDecision {
  const lower = message.toLowerCase().trim();

  // 1. Check for explicit search triggers
  let explicitSearch = false;
  for (const trigger of EXPLICIT_SEARCH_TRIGGERS) {
    if (trigger.test(lower)) {
      explicitSearch = true;
      break;
    }
  }

  // 2. Classify category
  const category = classifyCategory(message);

  // 3. Determine mode
  const mode = determineMode(message, category, explicitSearch);

  // 4. Check if search is needed
  let shouldSearch = false;
  let reason = '';

  if (explicitSearch) {
    shouldSearch = true;
    reason = 'User explicitly requested search';
  } else if (category === 'PRICE_MARKET' || category === 'NEWS' || category === 'CURRENT_INFORMATION') {
    shouldSearch = true;
    reason = `Time-sensitive category: ${category}`;
  } else if (category === 'FACT_VERIFICATION' || category === 'LEGAL_REGULATORY' || category === 'COMPANY_RESEARCH') {
    shouldSearch = true;
    reason = `Verification required for category: ${category}`;
  } else if (category === 'DEEP_RESEARCH' || category === 'FINANCIAL') {
    shouldSearch = true;
    reason = `Research category requires current sources: ${category}`;
  } else if (category === 'TECHNICAL_DOCUMENTATION') {
    // Only search if the question seems to be about specific, current API/docs
    if (/\b(current|latest|version|v\d+|2025|2026|new|updated)\b/i.test(lower)) {
      shouldSearch = true;
      reason = 'Current technical documentation query';
    }
  } else if (category === 'PRODUCT_RESEARCH' || category === 'LOCATION') {
    shouldSearch = true;
    reason = `Product/location info changes over time: ${category}`;
  } else if (category === 'GENERAL_KNOWLEDGE') {
    // Only search if time-sensitive keywords are present
    const hasTimeKeyword = /\b(today|current|now|latest|recent|this year|2025|2026|2027)\b/i.test(lower);
    const isStableKnowledge = STABLE_KNOWLEDGE_PATTERNS.some(p => p.test(lower));

    if (hasTimeKeyword && !isStableKnowledge) {
      shouldSearch = true;
      reason = 'Time-sensitive general knowledge query';
    } else {
      shouldSearch = false;
      reason = 'Stable knowledge — LLM can answer without search';
    }
  }

  return {
    shouldSearch,
    category,
    mode,
    reason,
    explicitSearch,
  };
}
