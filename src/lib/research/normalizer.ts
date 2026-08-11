/**
 * Result Normalizer
 *
 * Normalizes search provider results into a consistent internal structure.
 * Never fabricates missing metadata — uses null when unavailable.
 */

import type { SearchProviderResult, NormalizedResult, SourceType } from './types';

/**
 * Extract domain from URL.
 */
export function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

/**
 * Classify source type by domain.
 */
export function classifySourceType(domain: string): SourceType {
  const d = domain.toLowerCase();

  // Government
  if (/\.(gov|mil)$/i.test(d) || d.includes('.gov.')) return 'government';

  // Official documentation
  if (/github\.com$/.test(d) || /docs?\./.test(d) || /developer\./.test(d) || /documentation\./.test(d)) {
    return 'official_documentation';
  }

  // Academic
  if (/\.edu$/i.test(d) || /scholar\.google/i.test(d) || /arxiv\.org/i.test(d) || /researchgate/i.test(d)) {
    return 'academic';
  }

  // Established journalism
  const journalism = ['reuters.com', 'bloomberg.com', 'bbc.com', 'bbc.co.uk', 'theguardian.com', 'nytimes.com', 'washingtonpost.com', 'ft.com', 'wsj.com', 'economist.com', 'apnews.com', 'aljazeera.com', 'cnbc.com', 'techcrunch.com', 'theverge.com', 'wired.com'];
  if (journalism.includes(d)) return 'established_journalism';

  // Reputable technical publications
  const techPubs = ['stackoverflow.com', 'dev.to', 'hashnode.com', 'medium.com', 'hackernews.com', 'lobste.rs'];
  if (techPubs.includes(d)) return 'reputable_publication';

  // Official company
  const officialDomains = ['coingecko.com', 'coinmarketcap.com', 'binance.com', 'vercel.com', 'nextjs.org', 'supabase.com', 'tavily.com', 'openai.com', 'anthropic.com', 'groq.com'];
  if (officialDomains.includes(d)) return 'official_company';

  // Social media
  const social = ['twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'linkedin.com', 'tiktok.com', 'youtube.com'];
  if (social.includes(d)) return 'social_media';

  // Forums
  const forums = ['reddit.com', 'discord.com', 'discord.gg'];
  if (forums.includes(d)) return 'forum';

  // Unknown
  return 'unknown';
}

/**
 * Normalize a single search result.
 */
export function normalizeResult(
  result: SearchProviderResult,
  query: string
): NormalizedResult {
  const domain = extractDomain(result.url);
  const sourceType = classifySourceType(domain);

  return {
    id: `r-${Math.random().toString(36).slice(2, 10)}`,
    title: result.title || 'Untitled',
    url: result.url,
    domain,
    snippet: (result.content || '').slice(0, 300),
    content: result.content || '',
    rawContent: undefined,
    publishedAt: result.publishedDate || null,
    retrievedAt: new Date().toISOString(),
    sourceType,
    relevanceScore: result.score || 0,
    authorityScore: 0,
    freshnessScore: 0,
    evidenceScore: 0,
    overallScore: 0,
  };
}

/**
 * Normalize multiple results and deduplicate by URL.
 */
export function normalizeResults(
  results: SearchProviderResult[],
  query: string
): NormalizedResult[] {
  const seen = new Set<string>();
  const normalized: NormalizedResult[] = [];

  for (const r of results) {
    if (!r.url || seen.has(r.url)) continue;
    seen.add(r.url);
    normalized.push(normalizeResult(r, query));
  }

  return normalized;
}
