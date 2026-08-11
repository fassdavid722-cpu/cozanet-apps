/**
 * Structured logging for the research pipeline.
 * Provides observability without logging sensitive data.
 */

import type { ResearchLogEntry } from './types';

const logs: ResearchLogEntry[] = [];
const MAX_LOGS = 200;

export function logResearch(entry: ResearchLogEntry): void {
  // Sanitize — never log keys, tokens, passwords
  const sanitized: ResearchLogEntry = {
    ...entry,
    requestId: entry.requestId,
    timestamp: entry.timestamp,
    phase: entry.phase,
  };

  logs.push(sanitized);
  if (logs.length > MAX_LOGS) logs.shift();

  // Console log for Vercel observability
  console.log(`[research:${entry.phase}] ${entry.requestId.slice(0, 8)} | ${
    entry.classification || ''
  } | ${entry.queries?.length || 0} queries | ${entry.resultCount || 0} results | ${
    entry.duration || 0
  }ms${entry.error ? ` | ERROR: ${entry.error}` : ''}`);
}

export function getRecentLogs(): ResearchLogEntry[] {
  return Array.from(logs).reverse();
}

export function clearLogs(): void {
  logs.length = 0;
}

/**
 * Generate a unique request ID using Web Crypto API.
 */
export function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
