/**
 * Public exports for the research module.
 *
 * Import from here: `import { conductResearch } from '@/lib/research'`
 */

export { conductResearch } from './orchestrator';
export { makeSearchDecision } from './searchDecision';
export { planQueries } from './queryPlanner';
export { getProvider, registerProvider, TavilyProvider } from './searchProvider';
export { normalizeResults, normalizeResult, classifySourceType, extractDomain } from './normalizer';
export { rankResults, selectTopResults, scoreAuthority, scoreRelevance, scoreFreshness, scoreEvidence } from './sourceRanker';
export { retrieveContent, isUrlSafe, sanitizeContent } from './contentRetriever';
export { buildEvidence, findContradictions, summarizeConfidence } from './evidenceEngine';
export { buildCitations, formatResearchContext, formatCitationsForUI } from './citationEngine';
export { verifyResearch, formatVerificationForLLM } from './verificationEngine';
export { isTimeSensitive, filterStaleResults } from './recencyEngine';
export { logResearch, getRecentLogs, clearLogs, generateRequestId } from './logger';

export type {
  ResearchContext,
  SearchDecision,
  QueryPlan,
  ResearchQuestion,
  NormalizedResult,
  SourceType,
  EvidenceItem,
  Citation,
  SearchProvider,
  SearchProviderResponse,
  SearchProviderResult,
  SearchOptions,
  ExtractedContent,
  ResearchLogEntry,
  ResearchCategory,
  ResearchMode,
} from './types';
