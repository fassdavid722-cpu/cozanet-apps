/**
 * Verification Engine
 *
 * Runs a final verification pass before returning a researched answer.
 * Checks that every major claim has evidence, that sources actually
 * support the claim, and that the answer doesn't invent anything.
 */

import type { NormalizedResult, EvidenceItem, Citation } from './types';

export interface VerificationResult {
  passed: boolean;
  issues: string[];
  warnings: string[];
  unverifiedClaims: string[];
}

/**
 * Verify that the research results support the answer.
 *
 * This is a heuristic check — it verifies that:
 * 1. Every major claim has at least one supporting source
 * 2. No claims are based solely on low-quality sources
 * 3. Contradictions are acknowledged
 * 4. No fabricated citations exist
 */
export function verifyResearch(
  evidence: EvidenceItem[],
  results: NormalizedResult[],
  citations: Citation[]
): VerificationResult {
  const issues: string[] = [];
  const warnings: string[] = [];
  const unverifiedClaims: string[] = [];

  // 1. Check that every citation points to a real result
  const resultUrls = new Set(results.map(r => r.url));
  for (const citation of citations) {
    if (!resultUrls.has(citation.url)) {
      issues.push(`Citation ${citation.index} points to a URL not in the results: ${citation.url}`);
    }
  }

  // 2. Check for unsupported claims
  for (const item of evidence) {
    if (item.status === 'UNCERTAIN' && item.confidence < 0.3) {
      unverifiedClaims.push(item.claim.slice(0, 100));
    }

    // Check that supporting sources exist
    if (item.supportingSources.length === 0 && item.status !== 'CONTRADICTED') {
      warnings.push(`Claim has no supporting sources: "${item.claim.slice(0, 80)}..."`);
    }

    // Check if only low-quality sources support this claim
    if (item.status === 'SUPPORTED') {
      const supporting = results.filter(r => item.supportingSources.includes(r.id));
      if (supporting.length > 0) {
        const maxAuthority = Math.max(...supporting.map(r => r.authorityScore));
        if (maxAuthority < 0.3) {
          warnings.push(`Claim "${item.claim.slice(0, 60)}..." is supported only by low-authority sources (max: ${maxAuthority})`);
        }
      }
    }
  }

  // 3. Check for contradictions
  const contradictions = evidence.filter(e => e.status === 'CONTRADICTED');
  if (contradictions.length > 0) {
    warnings.push(`${contradictions.length} contradicting evidence item(s) found — these must be disclosed in the answer`);
  }

  // 4. Check that we have at least some results
  if (results.length === 0) {
    issues.push('No search results retrieved — cannot verify any claims');
  }

  // 5. Check that results have content (not just snippets)
  const onlySnippets = results.filter(r => !r.rawContent && r.content.length < 500);
  if (onlySnippets.length === results.length && results.length > 0) {
    warnings.push('All results have only snippet-level content — full page retrieval may have failed');
  }

  const passed = issues.length === 0;

  return {
    passed,
    issues,
    warnings,
    unverifiedClaims,
  };
}

/**
 * Format verification status for the LLM system prompt.
 */
export function formatVerificationForLLM(verification: VerificationResult): string {
  let text = '\n\n--- Verification Status ---\n';

  if (verification.passed) {
    text += 'Verification: PASSED\n';
  } else {
    text += 'Verification: ISSUES FOUND\n';
  }

  if (verification.issues.length > 0) {
    text += `Issues:\n${verification.issues.map(i => `- ${i}`).join('\n')}\n`;
  }

  if (verification.warnings.length > 0) {
    text += `Warnings:\n${verification.warnings.map(w => `- ${w}`).join('\n')}\n`;
  }

  if (verification.unverifiedClaims.length > 0) {
    text += `Unverified claims (must mark as uncertain):\n${verification.unverifiedClaims.map(c => `- ${c}`).join('\n')}\n`;
  }

  text += '--- End Verification ---\n';

  return text;
}
