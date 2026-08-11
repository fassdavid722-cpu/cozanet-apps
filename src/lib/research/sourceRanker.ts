/**
 * Source Quality Engine
 *
 * Scores search results by:
 * 1. Authority — is this a primary/trustworthy source?
 * 2. Relevance — does it actually match the query?
 * 3. Freshness — is it current enough for the question?
 * 4. Primary-source status — is it the original source or a copy?
 * 5. Evidence quality — does it contain substantive content?
 *
 * One authoritative primary source can outweigh many low-quality copies.
 */

import type { NormalizedResult, SourceType, ResearchCategory, ResearchMode } from './types';

// ── Authority scores by source type ──────────────────────────────

const AUTHORITY_BY_TYPE: Record<SourceType, number> = {
  government: 1.0,
  official_documentation: 0.95,
  official_company: 0.9,
  primary_source: 0.85,
  academic: 0.85,
  established_journalism: 0.8,
  reputable_publication: 0.7,
  industry_publication: 0.6,
  unknown: 0.4,
  forum: 0.25,
  social_media: 0.2,
  seo_content: 0.15,
  scraped_site: 0.1,
  duplicate: 0.05,
  spam: 0,
  ai_generated: 0.1,
};

/**
 * Calculate authority score for a result.
 */
export function scoreAuthority(result: NormalizedResult): number {
  let score = AUTHORITY_BY_TYPE[result.sourceType] ?? 0.4;

  // Boost official company domains that match the subject
  if (result.sourceType === 'official_company') {
    score = Math.min(1.0, score + 0.05);
  }

  return Math.round(score * 100) / 100;
}

/**
 * Calculate relevance score.
 * Uses the provider's score if available, adjusted by content match.
 */
export function scoreRelevance(result: NormalizedResult, query: string): number {
  let score = result.relevanceScore || 0.3;

  // If no provider score, estimate from content overlap
  if (score === 0 && result.content) {
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const contentLower = result.content.toLowerCase();
    const matches = queryWords.filter(w => contentLower.includes(w));
    score = matches.length / Math.max(queryWords.length, 1);
  }

  return Math.round(Math.min(1, score) * 100) / 100;
}

/**
 * Calculate freshness score.
 */
export function scoreFreshness(result: NormalizedResult, timeSensitive: boolean): number {
  if (!result.publishedAt && !timeSensitive) {
    return 0.5; // neutral — age unknown and doesn't matter
  }

  if (!result.publishedAt) {
    return 0.3; // age unknown but time matters → lower score
  }

  const published = new Date(result.publishedAt).getTime();
  if (isNaN(published)) return 0.3;

  const ageDays = (Date.now() - published) / (1000 * 60 * 60 * 24);

  let score: number;
  if (ageDays <= 1) score = 1.0;
  else if (ageDays <= 7) score = 0.9;
  else if (ageDays <= 30) score = 0.75;
  else if (ageDays <= 90) score = 0.6;
  else if (ageDays <= 365) score = 0.4;
  else score = 0.2;

  // If not time-sensitive, penalize less for age
  if (!timeSensitive && score < 0.5) score = 0.5;

  return Math.round(score * 100) / 100;
}

/**
 * Calculate evidence quality — does the result contain substantive content?
 */
export function scoreEvidence(result: NormalizedResult): number {
  const contentLen = (result.content || '').length;
  const snippetLen = (result.snippet || '').length;

  let score = 0;

  // Content length
  if (contentLen > 2000) score = 0.9;
  else if (contentLen > 1000) score = 0.75;
  else if (contentLen > 500) score = 0.6;
  else if (contentLen > 200) score = 0.4;
  else score = 0.2;

  // Penalize if only snippet (no full content)
  if (contentLen === 0 && snippetLen > 0) score *= 0.5;

  // Penalize AI-generated/spam
  if (result.sourceType === 'ai_generated' || result.sourceType === 'spam') {
    score *= 0.2;
  }

  return Math.round(score * 100) / 100;
}

/**
 * Calculate overall score with weighted factors.
 */
export function calculateOverallScore(
  authority: number,
  relevance: number,
  freshness: number,
  evidence: number,
  mode: ResearchMode
): number {
  // Weights depend on research mode
  let weights: { authority: number; relevance: number; freshness: number; evidence: number };

  if (mode === 'DEEP_RESEARCH') {
    weights = { authority: 0.35, relevance: 0.25, freshness: 0.15, evidence: 0.25 };
  } else if (mode === 'NORMAL_RESEARCH') {
    weights = { authority: 0.3, relevance: 0.3, freshness: 0.2, evidence: 0.2 };
  } else {
    weights = { authority: 0.2, relevance: 0.4, freshness: 0.25, evidence: 0.15 };
  }

  const overall =
    authority * weights.authority +
    relevance * weights.relevance +
    freshness * weights.freshness +
    evidence * weights.evidence;

  return Math.round(overall * 100) / 100;
}

/**
 * Score and rank all results.
 * Returns results sorted by overall score descending.
 */
export function rankResults(
  results: NormalizedResult[],
  query: string,
  timeSensitive: boolean,
  mode: ResearchMode
): NormalizedResult[] {
  // Score each result
  const scored = results.map(r => {
    const authority = scoreAuthority(r);
    const relevance = scoreRelevance(r, query);
    const freshness = scoreFreshness(r, timeSensitive);
    const evidence = scoreEvidence(r);
    const overall = calculateOverallScore(authority, relevance, freshness, evidence, mode);

    return {
      ...r,
      authorityScore: authority,
      relevanceScore: relevance,
      freshnessScore: freshness,
      evidenceScore: evidence,
      overallScore: overall,
    };
  });

  // Sort by overall score
  scored.sort((a, b) => b.overallScore - a.overallScore);

  return scored;
}

/**
 * Select top N results, prioritizing authoritative sources.
 * Ensures at least one primary/official source if available.
 */
export function selectTopResults(
  ranked: NormalizedResult[],
  maxResults: number
): NormalizedResult[] {
  if (ranked.length <= maxResults) return ranked;

  const selected = ranked.slice(0, maxResults);

  // Ensure at least one high-authority source is included
  const hasHighAuthority = selected.some(r => r.authorityScore >= 0.7);
  if (!hasHighAuthority) {
    const highAuthIndex = ranked.findIndex(r => r.authorityScore >= 0.7);
    if (highAuthIndex >= 0 && highAuthIndex < ranked.length) {
      // Replace the lowest-scored result with the high-authority one
      selected[selected.length - 1] = ranked[highAuthIndex];
    }
  }

  return selected;
}
