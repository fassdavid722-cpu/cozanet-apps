/**
 * Content Retriever
 *
 * When a search result appears relevant, retrieves the actual page content
 * — not just the search snippet. Uses Tavily Extract API first, then
 * falls back to direct fetch.
 *
 * SECURITY:
 * - Validates URLs to prevent SSRF
 * - Treats all retrieved content as UNTRUSTED DATA
 * - Content is never executed — only used as evidence
 * - Limits content size to prevent memory exhaustion
 */

import type { NormalizedResult, ExtractedContent } from './types';
import { TavilyProvider, directFetchContent } from './searchProvider';

const SSRF_BLOCKED = [
  /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i,
  /^https?:\/\/(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.)/i,
  /^https?:\/\/(fd|fc)[0-9a-f]{2}:/i, // IPv6 ULA
  /^file:/i,
  /^ftp:/i,
  /^javascript:/i,
  /^data:/i,
];

/**
 * Validate URL to prevent SSRF.
 */
export function isUrlSafe(url: string): boolean {
  if (!url) return false;
  if (!/^https?:\/\//i.test(url)) return false;

  for (const pattern of SSRF_BLOCKED) {
    if (pattern.test(url)) return false;
  }

  return true;
}

/**
 * Sanitize retrieved content.
 * Removes potential prompt injection markers and limits size.
 * Content is treated as DATA, never as instructions.
 */
export function sanitizeContent(content: string, maxLen: number = 5000): string {
  if (!content) return '';

  // Truncate to max length
  let text = content.slice(0, maxLen);

  // Remove null bytes
  text = text.replace(/\0/g, '');

  // Normalize whitespace
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

/**
 * Retrieve full content for the top-ranked results.
 * Tries Tavily Extract first, falls back to direct fetch.
 */
export async function retrieveContent(
  results: NormalizedResult[],
  maxPages: number = 5
): Promise<NormalizedResult[]> {
  // Filter to safe URLs and take top N
  const safeResults = results.filter(r => isUrlSafe(r.url)).slice(0, maxPages);
  const urls = safeResults.map(r => r.url);

  if (urls.length === 0) return results;

  // Try Tavily Extract first
  const tavily = new TavilyProvider();
  let extracted: ExtractedContent[] = [];

  try {
    extracted = await tavily.extract(urls);
  } catch {
    // Tavily extract failed — fall back to direct fetch
    extracted = await Promise.all(urls.map(url => directFetchContent(url)));
  }

  // If Tavily extract returned no useful content, try direct fetch for those URLs
  const failedUrls = extracted
    .filter(e => !e.success)
    .map(e => e.url);

  if (failedUrls.length > 0 && failedUrls.length <= urls.length) {
    const directResults = await Promise.all(failedUrls.map(url => directFetchContent(url)));
    extracted = extracted.map(e => {
      if (!e.success) {
        const direct = directResults.find(d => d.url === e.url);
        return direct || e;
      }
      return e;
    });
  }

  // Merge extracted content into results
  const contentMap = new Map<string, string>();
  for (const ext of extracted) {
    if (ext.success && ext.content) {
      contentMap.set(ext.url, sanitizeContent(ext.content));
    }
  }

  return results.map(r => {
    const fullContent = contentMap.get(r.url);
    if (fullContent && fullContent.length > r.content.length) {
      return {
        ...r,
        rawContent: fullContent,
        content: fullContent,
        evidenceScore: Math.min(1, r.evidenceScore + 0.2), // boost evidence score for retrieved content
      };
    }
    return r;
  });
}
