/**
 * Core type definitions for the Web Research system.
 *
 * These types flow through the entire pipeline:
 *   Orchestrator → Decision → Query Planner → Search Provider
 *   → Normalizer → Ranker → Retriever → Evidence → Verification
 *   → Citation → Response
 */

// ── Search Decision ──────────────────────────────────────────────

export type ResearchCategory =
  | 'GENERAL_KNOWLEDGE'
  | 'CURRENT_INFORMATION'
  | 'NEWS'
  | 'PRICE_MARKET'
  | 'PRODUCT_RESEARCH'
  | 'COMPANY_RESEARCH'
  | 'TECHNICAL_DOCUMENTATION'
  | 'LEGAL_REGULATORY'
  | 'FINANCIAL'
  | 'LOCATION'
  | 'FACT_VERIFICATION'
  | 'DEEP_RESEARCH';

export type ResearchMode = 'QUICK_SEARCH' | 'NORMAL_RESEARCH' | 'DEEP_RESEARCH';

export interface SearchDecision {
  shouldSearch: boolean;
  category: ResearchCategory;
  mode: ResearchMode;
  reason: string;
  explicitSearch: boolean;
}

// ── Query Planning ──────────────────────────────────────────────

export interface ResearchQuestion {
  id: string;
  question: string;
  queries: string[];
  domainRestrictions?: string[];
  timeSensitive: boolean;
  priority: number;
}

export interface QueryPlan {
  questions: ResearchQuestion[];
  totalQueries: number;
  primarySubject: string;
  intent: string;
  entities: string[];
  timePeriod?: string;
  geographicScope?: string;
  preferredSourceTypes: string[];
  requiresMultipleSearches: boolean;
}

// ── Search Provider ──────────────────────────────────────────────

export interface SearchProviderResult {
  title: string;
  url: string;
  content: string;
  score?: number;
  publishedDate?: string;
}

export interface SearchProviderResponse {
  query: string;
  results: SearchProviderResult[];
  answer?: string;
  error?: string;
}

export interface SearchProvider {
  name: string;
  search(query: string, options: SearchOptions): Promise<SearchProviderResponse>;
  extract(urls: string[]): Promise<ExtractedContent[]>;
}

export interface SearchOptions {
  maxResults?: number;
  searchDepth?: 'basic' | 'advanced';
  includeAnswer?: boolean;
  includeRawContent?: boolean;
  domainRestrictions?: string[];
  excludeDomains?: string[];
  timeRange?: 'day' | 'week' | 'month' | 'year' | null;
  maxTokens?: number;
}

// ── Normalized Result ────────────────────────────────────────────

export interface NormalizedResult {
  id: string;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  content: string;
  rawContent?: string;
  publishedAt: string | null;
  retrievedAt: string;
  sourceType: SourceType;
  relevanceScore: number;
  authorityScore: number;
  freshnessScore: number;
  evidenceScore: number;
  overallScore: number;
}

export type SourceType =
  | 'government'
  | 'official_documentation'
  | 'official_company'
  | 'primary_source'
  | 'reputable_publication'
  | 'academic'
  | 'established_journalism'
  | 'industry_publication'
  | 'forum'
  | 'social_media'
  | 'seo_content'
  | 'scraped_site'
  | 'spam'
  | 'duplicate'
  | 'ai_generated'
  | 'unknown';

// ── Extracted Content ───────────────────────────────────────────

export interface ExtractedContent {
  url: string;
  content: string;
  success: boolean;
  error?: string;
}

// ── Evidence ────────────────────────────────────────────────────

export interface EvidenceItem {
  claim: string;
  supportingSources: string[]; // result IDs
  contradictingSources: string[];
  confidence: number; // 0-1
  status: 'SUPPORTED' | 'CONTRADICTED' | 'UNCERTAIN';
  notes?: string;
}

// ── Citation ─────────────────────────────────────────────────────

export interface Citation {
  index: number;
  title: string;
  url: string;
  domain: string;
  sourceType: SourceType;
  publishedAt: string | null;
}

export interface CitationMap {
  [claim: string]: Citation[];
}

// ── Research Context ────────────────────────────────────────────

export interface ResearchContext {
  requestId: string;
  originalQuestion: string;
  decision: SearchDecision;
  queryPlan: QueryPlan | null;
  results: NormalizedResult[];
  evidence: EvidenceItem[];
  citations: Citation[];
  contradictions: string[];
  limitations: string[];
  contextText: string; // formatted text for LLM consumption
  searchProviderUsed: string;
  totalSearches: number;
  duration: number;
  success: boolean;
  failureReason?: string;
}

// ── Research Log Entry ──────────────────────────────────────────

export interface ResearchLogEntry {
  requestId: string;
  timestamp: string;
  phase: string;
  classification?: ResearchCategory;
  mode?: ResearchMode;
  queries?: string[];
  searchProvider?: string;
  resultCount?: number;
  selectedSources?: number;
  sourceScores?: { url: string; authority: number; relevance: number; freshness: number; overall: number }[];
  verificationResult?: string;
  duration?: number;
  failures?: string[];
  error?: string;
}
