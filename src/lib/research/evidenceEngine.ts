/**
 * Evidence Engine
 *
 * For each research question, identifies evidence supporting or
 * contradicting claims. Structures findings and computes confidence.
 *
 * Never converts missing evidence into a positive claim.
 */

import type { NormalizedResult, EvidenceItem, ResearchQuestion } from './types';

/**
 * Extract key claims from content.
 * Simple heuristic: find sentences containing factual assertions.
 */
function extractClaimsFromContent(result: NormalizedResult, maxClaims: number = 5): string[] {
  const content = result.content || result.snippet || '';
  if (!content) return [];

  // Split into sentences
  const sentences = content
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.length > 30 && s.length < 500);

  // Look for factual assertion patterns
  const factualPatterns: RegExp[] = [
    /\b(is|are|was|were|has|have|supports|offers|charges|costs?|requires?|available|supported|current|price|fee|limit)\b/i,
    /\b(according to|stated|reported|announced|confirmed|published)\b/i,
    /\b(per|each|percent|%|usd|ngn|naira|bitcoin|crypto)\b/i,
  ];

  const claims: string[] = [];
  for (const sentence of sentences) {
    const isFactual = factualPatterns.some(p => p.test(sentence));
    if (isFactual) {
      claims.push(sentence.trim());
      if (claims.length >= maxClaims) break;
    }
  }

  return claims;
}

/**
 * Check if two claims support or contradict each other.
 * Simple heuristic: look for negation and quantifier conflicts.
 */
function compareClaims(claim1: string, claim2: string): 'support' | 'contradict' | 'neutral' {
  const c1 = claim1.toLowerCase();
  const c2 = claim2.toLowerCase();

  // Check for direct contradiction (negation)
  if (c1.includes('not') && c2.replace('not', '').trim() === c1.replace('not', '').trim()) {
    return 'contradict';
  }

  // Check for numbers/amounts that disagree
  const nums1 = c1.match(/\$?[\d,.]+/g) || [];
  const nums2 = c2.match(/\$?[\d,.]+/g) || [];

  if (nums1.length > 0 && nums2.length > 0) {
    const n1 = parseFloat(nums1[0]!.replace(/[$,]/g, ''));
    const n2 = parseFloat(nums2[0]!.replace(/[$,]/g, ''));

    // If they're talking about the same thing but have different numbers
    if (!isNaN(n1) && !isNaN(n2) && Math.abs(n1 - n2) > 0.01) {
      // Could be contradiction, but also could be different things — be conservative
      if (c1.replace(/\d/g, '').trim() === c2.replace(/\d/g, '').trim()) {
        return 'contradict';
      }
    }
  }

  // Same topic → likely support
  const words1 = new Set(c1.split(/\s+/).filter(w => w.length > 4));
  const words2 = new Set(c2.split(/\s+/).filter(w => w.length > 4));
  const intersection = Array.from(words1).filter(w => words2.has(w));

  if (intersection.length >= 3) return 'support';

  return 'neutral';
}

/**
 * Build evidence items from results for a given research question.
 */
export function buildEvidence(
  question: ResearchQuestion,
  results: NormalizedResult[]
): EvidenceItem[] {
  const evidence: EvidenceItem[] = [];

  for (const result of results) {
    const claims = extractClaimsFromContent(result, 3);

    for (const claim of claims) {
      // Check if this claim relates to the question
      const questionWords = new Set(question.question.toLowerCase().split(/\s+/).filter(w => w.length > 3));
      const claimWords = new Set(claim.toLowerCase().split(/\s+/).filter(w => w.length > 3));
      const overlap = Array.from(questionWords).filter(w => claimWords.has(w));

      if (overlap.length < 1) continue;

      // Check against existing evidence for contradictions
      let supportingSources: string[] = [result.id];
      let contradictingSources: string[] = [];
      let contradicted = false;

      for (const existing of evidence) {
        const relation = compareClaims(claim, existing.claim);
        if (relation === 'contradict') {
          contradictingSources.push(...existing.supportingSources);
          existing.contradictingSources.push(result.id);
          existing.status = 'CONTRADICTED';
          existing.confidence = Math.max(0, existing.confidence - 0.3);
          contradicted = true;
        } else if (relation === 'support') {
          existing.supportingSources.push(result.id);
          existing.confidence = Math.min(1, existing.confidence + 0.2);
          supportingSources.push(...existing.supportingSources);
        }
      }

      // Calculate confidence
      let confidence = 0.5;
      if (result.authorityScore > 0.7) confidence += 0.2;
      if (result.evidenceScore > 0.6) confidence += 0.15;
      if (result.freshnessScore > 0.7 && question.timeSensitive) confidence += 0.1;
      if (contradicted) confidence -= 0.3;

      confidence = Math.max(0, Math.min(1, confidence));

      let status: EvidenceItem['status'] = 'UNCERTAIN';
      if (confidence > 0.7 && !contradicted) status = 'SUPPORTED';
      if (contradicted) status = 'CONTRADICTED';

      evidence.push({
        claim,
        supportingSources,
        contradictingSources,
        confidence: Math.round(confidence * 100) / 100,
        status,
      });
    }

    // Limit evidence per question
    if (evidence.length >= 10) break;
  }

  return evidence;
}

/**
 * Identify contradictions across all evidence.
 */
export function findContradictions(evidence: EvidenceItem[]): string[] {
  return evidence
    .filter(e => e.status === 'CONTRADICTED')
    .map(e => `Contradiction found: "${e.claim.slice(0, 100)}..." — sources disagree`)
    .slice(0, 5);
}

/**
 * Summarize evidence confidence.
 */
export function summarizeConfidence(evidence: EvidenceItem[]): {
  supported: number;
  contradicted: number;
  uncertain: number;
  averageConfidence: number;
} {
  const supported = evidence.filter(e => e.status === 'SUPPORTED').length;
  const contradicted = evidence.filter(e => e.status === 'CONTRADICTED').length;
  const uncertain = evidence.filter(e => e.status === 'UNCERTAIN').length;
  const avg = evidence.length > 0
    ? evidence.reduce((sum, e) => sum + e.confidence, 0) / evidence.length
    : 0;

  return {
    supported,
    contradicted,
    uncertain,
    averageConfidence: Math.round(avg * 100) / 100,
  };
}
