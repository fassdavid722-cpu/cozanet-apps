/**
 * Web Research Orchestrator
 *
 * Manages the entire web-research lifecycle:
 *
 *   USER REQUEST
 *   → INTENT ANALYSIS (searchDecision)
 *   → SEARCH DECISION
 *   → QUERY GENERATION (queryPlanner)
 *   → TAVILY SEARCH (searchProvider)
 *   → RESULT NORMALIZATION (normalizer)
 *   → SOURCE QUALITY SCORING (sourceRanker)
 *   → CONTENT RETRIEVAL (contentRetriever)
 *   → EVIDENCE EXTRACTION (evidenceEngine)
 *   → CROSS-CHECKING
 *   → CITATION BUILDING (citationEngine)
 *   → VERIFICATION (verificationEngine)
 *   → RESEARCH CONTEXT OUTPUT
 *
 * The chat route receives the formatted context and passes it
 * to the LLM for final answer generation.
 *
 * This module is provider-agnostic — swap the search provider
 * without touching the research logic.
 */

import type {
  ResearchContext,
  SearchDecision,
  QueryPlan,
  NormalizedResult,
  EvidenceItem,
  Citation,
  ResearchLogEntry,
} from './types';

import { makeSearchDecision } from './searchDecision';
import { planQueries } from './queryPlanner';
import { getProvider } from './searchProvider';
import { normalizeResults } from './normalizer';
import { rankResults, selectTopResults } from './sourceRanker';
import { retrieveContent } from './contentRetriever';
import { buildEvidence, findContradictions } from './evidenceEngine';
import { buildCitations, formatResearchContext } from './citationEngine';
import { verifyResearch, formatVerificationForLLM } from './verificationEngine';
import { isTimeSensitive } from './recencyEngine';
import { logResearch, generateRequestId } from './logger';

// ── Research budget limits ───────────────────────────────────────

const MAX_SEARCHES_BY_MODE = {
  QUICK_SEARCH: 3,
  NORMAL_RESEARCH: 8,
  DEEP_RESEARCH: 15,
};

const MAX_RESULTS_PER_SEARCH = {
  QUICK_SEARCH: 5,
  NORMAL_RESEARCH: 8,
  DEEP_RESEARCH: 10,
};

const MAX_CONTENT_PAGES = {
  QUICK_SEARCH: 2,
  NORMAL_RESEARCH: 5,
  DEEP_RESEARCH: 8,
};

const MAX_FINAL_RESULTS = {
  QUICK_SEARCH: 3,
  NORMAL_RESEARCH: 5,
  DEEP_RESEARCH: 8,
};

/**
 * Main orchestration function.
 * Returns a ResearchContext ready for LLM consumption.
 */
export async function conductResearch(
  message: string,
  history?: { role: string; content: string }[]
): Promise<ResearchContext> {
  const requestId = generateRequestId();
  const startTime = Date.now();
  const failures: string[] = [];
  let totalSearches = 0;

  // ── 1. Search Decision ──────────────────────────────────────
  const decision: SearchDecision = makeSearchDecision(message);

  logResearch({
    requestId,
    timestamp: new Date().toISOString(),
    phase: 'decision',
    classification: decision.category,
    mode: decision.mode,
    queries: undefined,
    resultCount: undefined,
    duration: Date.now() - startTime,
    error: undefined,
  });

  // If no search needed, return empty context
  if (!decision.shouldSearch) {
    return {
      requestId,
      originalQuestion: message,
      decision,
      queryPlan: null,
      results: [],
      evidence: [],
      citations: [],
      contradictions: [],
      limitations: ['No web search was deemed necessary for this query'],
      contextText: '',
      searchProviderUsed: 'none',
      totalSearches: 0,
      duration: Date.now() - startTime,
      success: true,
    };
  }

  // ── 2. Query Planning ──────────────────────────────────────
  const queryPlan: QueryPlan = planQueries(message, decision.category, decision.mode);

  logResearch({
    requestId,
    timestamp: new Date().toISOString(),
    phase: 'planning',
    queries: queryPlan.questions.flatMap(q => q.queries),
    duration: Date.now() - startTime,
  });

  // ── 3. Execute Searches ────────────────────────────────────
  const provider = getProvider('tavily');
  if (!provider) {
    return {
      requestId,
      originalQuestion: message,
      decision,
      queryPlan,
      results: [],
      evidence: [],
      citations: [],
      contradictions: [],
      limitations: ['Search provider not available'],
      contextText: '',
      searchProviderUsed: 'none',
      totalSearches: 0,
      duration: Date.now() - startTime,
      success: false,
      failureReason: 'No search provider available',
    };
  }

  const searchBudget = MAX_SEARCHES_BY_MODE[decision.mode];
  const maxPerSearch = MAX_RESULTS_PER_SEARCH[decision.mode];
  const timeSensitive = isTimeSensitive(message);

  let allRawResults: { query: string; results: any[]; answer?: string }[] = [];

  for (const question of queryPlan.questions) {
    if (totalSearches >= searchBudget) break;

    for (const query of question.queries) {
      if (totalSearches >= searchBudget) break;

      totalSearches++;
      const searchStartTime = Date.now();

      const searchResponse = await provider.search(query, {
        maxResults: maxPerSearch,
        searchDepth: decision.mode === 'DEEP_RESEARCH' ? 'advanced' : 'basic',
        includeAnswer: true,
        includeRawContent: false,
        domainRestrictions: question.domainRestrictions,
        timeRange: question.timeSensitive ? 'month' : null,
      });

      if (searchResponse.error) {
        failures.push(`Search "${query}": ${searchResponse.error}`);
        logResearch({
          requestId,
          timestamp: new Date().toISOString(),
          phase: 'search',
          queries: [query],
          searchProvider: provider.name,
          resultCount: 0,
          duration: Date.now() - searchStartTime,
          failures: failures,
          error: searchResponse.error,
        });
        continue;
      }

      logResearch({
        requestId,
        timestamp: new Date().toISOString(),
        phase: 'search',
        queries: [query],
        searchProvider: provider.name,
        resultCount: searchResponse.results.length,
        duration: Date.now() - searchStartTime,
      });

      allRawResults.push({
        query,
        results: searchResponse.results,
        answer: searchResponse.answer,
      });
    }
  }

  // ── 4. Normalize Results ────────────────────────────────────
  let normalized: NormalizedResult[] = [];

  for (const raw of allRawResults) {
    const results = normalizeResults(raw.results, raw.query);
    normalized.push(...results);
  }

  // Deduplicate by URL (keep highest-scoring)
  const urlMap = new Map<string, NormalizedResult>();
  for (const r of normalized) {
    const existing = urlMap.get(r.url);
    if (!existing || r.relevanceScore > existing.relevanceScore) {
      urlMap.set(r.url, r);
    }
  }
  normalized = Array.from(urlMap.values());

  logResearch({
    requestId,
    timestamp: new Date().toISOString(),
    phase: 'normalization',
    resultCount: normalized.length,
    duration: Date.now() - startTime,
  });

  if (normalized.length === 0) {
    return {
      requestId,
      originalQuestion: message,
      decision,
      queryPlan,
      results: [],
      evidence: [],
      citations: [],
      contradictions: [],
      limitations: ['Search returned no results', ...failures],
      contextText: '',
      searchProviderUsed: provider.name,
      totalSearches,
      duration: Date.now() - startTime,
      success: false,
      failureReason: failures.length > 0 ? failures.join('; ') : 'Empty search results',
    };
  }

  // ── 5. Rank Results ─────────────────────────────────────────
  const ranked = rankResults(normalized, message, timeSensitive, decision.mode);
  const maxFinal = MAX_FINAL_RESULTS[decision.mode];
  const selected = selectTopResults(ranked, maxFinal);

  logResearch({
    requestId,
    timestamp: new Date().toISOString(),
    phase: 'ranking',
    resultCount: selected.length,
    sourceScores: selected.map(r => ({
      url: r.url,
      authority: r.authorityScore,
      relevance: r.relevanceScore,
      freshness: r.freshnessScore,
      overall: r.overallScore,
    })),
    duration: Date.now() - startTime,
  });

  // ── 6. Content Retrieval ────────────────────────────────────
  const maxPages = MAX_CONTENT_PAGES[decision.mode];
  const withContent = await retrieveContent(selected, maxPages);

  logResearch({
    requestId,
    timestamp: new Date().toISOString(),
    phase: 'retrieval',
    resultCount: withContent.filter(r => r.rawContent).length,
    duration: Date.now() - startTime,
  });

  // ── 7. Evidence Extraction ──────────────────────────────────
  let evidence: EvidenceItem[] = [];
  for (const question of queryPlan.questions) {
    const questionEvidence = buildEvidence(question, withContent);
    evidence.push(...questionEvidence);
  }

  const contradictions = findContradictions(evidence);

  logResearch({
    requestId,
    timestamp: new Date().toISOString(),
    phase: 'evidence',
    resultCount: evidence.length,
    duration: Date.now() - startTime,
  });

  // ── 8. Build Citations ──────────────────────────────────────
  const citations: Citation[] = buildCitations(withContent);

  // ── 9. Verification ──────────────────────────────────────────
  const verification = verifyResearch(evidence, withContent, citations);

  logResearch({
    requestId,
    timestamp: new Date().toISOString(),
    phase: 'verification',
    verificationResult: verification.passed ? 'PASSED' : 'ISSUES',
    duration: Date.now() - startTime,
    failures: verification.issues,
  });

  // ── 10. Format Research Context ─────────────────────────────
  let contextText = formatResearchContext(withContent, citations, evidence);
  contextText += formatVerificationForLLM(verification);

  // Add contradiction notice
  if (contradictions.length > 0) {
    contextText += '\n⚠ CONTRADICTING SOURCES DETECTED — acknowledge disagreements in your answer.\n';
    contextText += contradictions.map(c => `- ${c}`).join('\n') + '\n';
  }

  // Add limitations
  const limitations: string[] = [];
  if (failures.length > 0) limitations.push(...failures);
  if (verification.warnings.length > 0) limitations.push(...verification.warnings);
  if (withContent.some(r => !r.rawContent)) {
    limitations.push('Some sources have only snippet-level content (full page retrieval failed)');
  }
  if (verification.unverifiedClaims.length > 0) {
    limitations.push('Some claims could not be fully verified');
  }

  // Final log
  logResearch({
    requestId,
    timestamp: new Date().toISOString(),
    phase: 'complete',
    resultCount: withContent.length,
    selectedSources: withContent.length,
    searchProvider: provider.name,
    duration: Date.now() - startTime,
  });

  return {
    requestId,
    originalQuestion: message,
    decision,
    queryPlan,
    results: withContent,
    evidence,
    citations,
    contradictions,
    limitations,
    contextText,
    searchProviderUsed: provider.name,
    totalSearches,
    duration: Date.now() - startTime,
    success: true,
  };
}
