/**
 * Query Planner
 *
 * Never blindly sends the user's entire message to the search provider.
 * Decomposes complex requests into multiple research questions and
 * generates precise search queries for each.
 *
 * Uses heuristics + optional LLM enhancement for complex queries.
 */

import type { QueryPlan, ResearchQuestion, ResearchCategory, ResearchMode } from './types';

// ── Domain restrictions by category ──────────────────────────────

const DOMAIN_MAP: Record<ResearchCategory, string[]> = {
  TECHNICAL_DOCUMENTATION: ['github.com', 'developer.mozilla.org', 'stackoverflow.com', 'dev.to'],
  LEGAL_REGULATORY: ['gov', '.gov', 'regulator', 'cftc.gov', 'sec.gov'],
  COMPANY_RESEARCH: [], // no restriction — let the ranker handle it
  PRICE_MARKET: ['coingecko.com', 'coinmarketcap.com', 'binance.com', 'yahoo.com'],
  NEWS: ['reuters.com', 'bloomberg.com', 'bbc.com', 'guardian.com', 'aljazeera.com'],
  FINANCIAL: [], // broad search, ranker handles authority
  GENERAL_KNOWLEDGE: [],
  CURRENT_INFORMATION: [],
  PRODUCT_RESEARCH: [],
  LOCATION: [],
  FACT_VERIFICATION: [],
  DEEP_RESEARCH: [],
};

function generateId(): string {
  return `q-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Extract entities (company names, product names, tickers, etc.) from a message.
 */
function extractEntities(message: string): string[] {
  const entities: string[] = [];

  // Company/product names (capitalized words)
  const caps = message.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g);
  if (caps) {
    // Filter common words
    const common = new Set(['The', 'What', 'How', 'Does', 'Can', 'Is', 'Are', 'Do', 'Why', 'When', 'Will', 'I', 'You']);
    for (const c of caps) {
      if (!common.has(c) && c.length > 2) {
        entities.push(c);
      }
    }
  }

  // Crypto tickers
  const tickers = message.match(/\b(BTC|ETH|BNB|USDT|USDC|SOL|ADA|DOT|XRP)\b/g);
  if (tickers) entities.push(...tickers);

  // Country/currency mentions
  const countries = message.match(/\b(Nigeria|Nigerian|USA|US|UK|Europe|Asia|China|Japan|India)\b/g);
  if (countries) entities.push(...countries);

  const currencies = message.match(/\b(NGN|Naira|USD|EUR|GBP|USDT|USDC)\b/g);
  if (currencies) entities.push(...currencies);

  return Array.from(new Set(entities)); // deduplicate
}

/**
 * Detect time sensitivity.
 */
function isTimeSensitive(message: string): boolean {
  return /\b(today|now|current|currently|latest|recent|this week|this month|this year|2025|2026|2027|new|updated|price|cost|fee)\b/i.test(message);
}

/**
 * Plan queries for QUICK_SEARCH mode.
 * Simple: 1-2 queries, direct from the message.
 */
function planQuick(message: string, category: ResearchCategory): QueryPlan {
  const entities = extractEntities(message);

  // Clean the message into a search query
  const baseQuery = message
    .replace(/^(can you |could you |please )?(search|google|look up|find|check|browse)\s+(for\s+|me\s+|the\s+)*/i, '')
    .replace(/\?+$/g, '')
    .trim();

  const questions: ResearchQuestion[] = [{
    id: generateId(),
    question: baseQuery,
    queries: [baseQuery],
    domainRestrictions: DOMAIN_MAP[category] || undefined,
    timeSensitive: isTimeSensitive(message),
    priority: 1,
  }];

  return {
    questions,
    totalQueries: 1,
    primarySubject: entities[0] || baseQuery.slice(0, 50),
    intent: category,
    entities,
    timePeriod: undefined,
    geographicScope: entities.find(e => /Nigeria|USA|UK|Europe|Asia/.test(e)),
    preferredSourceTypes: DOMAIN_MAP[category] || [],
    requiresMultipleSearches: false,
  };
}

/**
 * Plan queries for NORMAL_RESEARCH mode.
 * 2-4 queries covering different aspects of the question.
 */
function planNormal(message: string, category: ResearchCategory): QueryPlan {
  const entities = extractEntities(message);
  const cleanMsg = message.replace(/\?+$/g, '').trim();
  const time = isTimeSensitive(message);

  // Detect specific aspects to research
  const aspects: { question: string; query: string; domains?: string[] }[] = [];

  // Primary question
  aspects.push({
    question: cleanMsg,
    query: cleanMsg,
    domains: DOMAIN_MAP[category],
  });

  // Price/fee aspect
  if (/\b(price|cost|fee|charge|rate|how much)\b/i.test(message)) {
    const entity = entities[0] || '';
    aspects.push({
      question: `What are the current fees for ${entity}?`,
      query: `${entity} fees charges cost 2026`,
    });
  }

  // Availability/support aspect
  if (/\b(support|available|offer|provide)\b/i.test(message)) {
    const entity = entities[0] || '';
    const location = entities.find(e => /Nigeria|USA|UK|country/.test(e)) || '';
    aspects.push({
      question: `Is ${entity} available ${location ? 'in ' + location : ''}?`,
      query: `${entity} available supported ${location || 'countries'}`,
    });
  }

  // Current status aspect
  if (time) {
    aspects.push({
      question: `Latest updates on ${entities[0] || cleanMsg.slice(0, 40)}`,
      query: `${entities[0] || cleanMsg.slice(0, 40)} latest news update ${new Date().getFullYear()}`,
    });
  }

  const questions: ResearchQuestion[] = aspects.slice(0, 4).map((a, i) => ({
    id: generateId(),
    question: a.question,
    queries: [a.query],
    domainRestrictions: a.domains,
    timeSensitive: time,
    priority: i + 1,
  }));

  return {
    questions,
    totalQueries: questions.length,
    primarySubject: entities[0] || cleanMsg.slice(0, 50),
    intent: category,
    entities,
    timePeriod: time ? 'recent' : undefined,
    geographicScope: entities.find(e => /Nigeria|USA|UK|Europe|Asia/.test(e)),
    preferredSourceTypes: DOMAIN_MAP[category] || [],
    requiresMultipleSearches: questions.length > 1,
  };
}

/**
 * Plan queries for DEEP_RESEARCH mode.
 * Decomposes into many research questions.
 */
function planDeep(message: string, category: ResearchCategory): QueryPlan {
  const entities = extractEntities(message);
  const cleanMsg = message.replace(/\?+$/g, '').trim();
  const time = isTimeSensitive(message);
  const mainEntity = entities[0] || cleanMsg.slice(0, 50);

  const aspects: { question: string; query: string; domains?: string[] }[] = [];

  // Always include the primary question
  aspects.push({
    question: cleanMsg,
    query: cleanMsg,
    domains: DOMAIN_MAP[category],
  });

  // Price/fees
  aspects.push({
    question: `What are the current prices or fees for ${mainEntity}?`,
    query: `${mainEntity} price fees cost charges ${new Date().getFullYear()}`,
  });

  // Features/capabilities
  aspects.push({
    question: `What features or capabilities does ${mainEntity} offer?`,
    query: `${mainEntity} features capabilities supported`,
  });

  // Limitations/restrictions
  aspects.push({
    question: `What are the limitations or restrictions of ${mainEntity}?`,
    query: `${mainEntity} limitations restrictions requirements KYC`,
  });

  // Geographic availability
  const geo = entities.find(e => /Nigeria|USA|UK|Europe|Asia|country/.test(e));
  if (geo) {
    aspects.push({
      question: `Is ${mainEntity} available in ${geo}?`,
      query: `${mainEntity} available ${geo} country support`,
    });
  }

  // Recent news/updates
  if (time) {
    aspects.push({
      question: `Latest news about ${mainEntity}`,
      query: `${mainEntity} latest news update ${new Date().getFullYear()}`,
    });
  }

  // Competitors/alternatives (for product/company research)
  if (category === 'PRODUCT_RESEARCH' || category === 'COMPANY_RESEARCH') {
    aspects.push({
      question: `Alternatives to ${mainEntity}`,
      query: `${mainEntity} alternatives competitors comparison`,
    });
  }

  // Official documentation
  if (category === 'TECHNICAL_DOCUMENTATION') {
    aspects.push({
      question: `Official documentation for ${mainEntity}`,
      query: `${mainEntity} official documentation API guide`,
      domains: DOMAIN_MAP[category],
    });
  }

  const questions: ResearchQuestion[] = aspects.slice(0, 7).map((a, i) => ({
    id: generateId(),
    question: a.question,
    queries: [a.query],
    domainRestrictions: a.domains,
    timeSensitive: time,
    priority: i + 1,
  }));

  return {
    questions,
    totalQueries: questions.length,
    primarySubject: mainEntity,
    intent: category,
    entities,
    timePeriod: time ? 'recent' : undefined,
    geographicScope: geo,
    preferredSourceTypes: DOMAIN_MAP[category] || [],
    requiresMultipleSearches: true,
  };
}

/**
 * Main query planning function.
 */
export function planQueries(message: string, category: ResearchCategory, mode: ResearchMode): QueryPlan {
  switch (mode) {
    case 'QUICK_SEARCH':
      return planQuick(message, category);
    case 'NORMAL_RESEARCH':
      return planNormal(message, category);
    case 'DEEP_RESEARCH':
      return planDeep(message, category);
    default:
      return planQuick(message, category);
  }
}
