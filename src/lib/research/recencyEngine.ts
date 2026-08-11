/**
 * Recency Engine
 *
 * Tracks publication dates and prioritizes fresh sources.
 * Prevents old information from being presented as current.
 */

import type { NormalizedResult } from './types';

const RECENCY_KEYWORDS = /\b(today|now|currently|current|latest|recent|this week|this month|this year|2025|2026|2027)\b/i;

/**
 * Determine if a message is time-sensitive.
 */
export function isTimeSensitive(message: string): boolean {
  return RECENCY_KEYWORDS.test(message);
}

/**
 * Get the age of a result in days.
 */
export function getResultAge(result: NormalizedResult): number | null {
  if (!result.publishedAt) return null;
  const published = new Date(result.publishedAt).getTime();
  if (isNaN(published)) return null;
  return Math.floor((Date.now() - published) / (1000 * 60 * 60 * 24));
}

/**
 * Filter out outdated results for time-sensitive queries.
 */
export function filterStaleResults(
  results: NormalizedResult[],
  timeSensitive: boolean,
  maxAgeDays: number = 90
): NormalizedResult[] {
  if (!timeSensitive) return results;

  return results.filter(r => {
    const age = getResultAge(r);
    if (age === null) return true; // keep unknown-age results (ranker will penalize)
    return age <= maxAgeDays;
  });
}

/**
 * Sort results by freshness (newest first).
 */
export function sortByFreshness(results: NormalizedResult[]): NormalizedResult[] {
  return Array.from(results).sort((a, b) => {
    const aDate = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const bDate = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return bDate - aDate;
  });
}
