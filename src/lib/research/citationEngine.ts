/**
 * Citation Engine
 *
 * Tracks sources throughout the research pipeline and formats citations
 * for the final response. Every factual claim should be traceable to
 * its supporting source.
 *
 * Never generates fake citations — citations correspond to actual
 * retrieved sources only.
 */

import type { NormalizedResult, Citation, EvidenceItem } from './types';

/**
 * Build citations from the selected results.
 * Returns a numbered citation list.
 */
export function buildCitations(results: NormalizedResult[]): Citation[] {
  return results.map((result, index) => ({
    index: index + 1,
    title: result.title,
    url: result.url,
    domain: result.domain,
    sourceType: result.sourceType,
    publishedAt: result.publishedAt,
  }));
}

/**
 * Format research context text with inline citation markers.
 * This text gets passed to the LLM to generate the final answer.
 */
export function formatResearchContext(
  results: NormalizedResult[],
  citations: Citation[],
  evidence: EvidenceItem[]
): string {
  if (results.length === 0) return '';

  let text = '\n\n--- Research Evidence ---\n';
  text += `The following sources were retrieved. Use ONLY this evidence. `;
  text += `Do not invent information not present in these sources. `;
  text += `When making factual claims, reference sources by their number [1], [2], etc.\n\n`;

  // Sources
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const citation = citations[i];
    const authorityLabel = getAuthorityLabel(r.sourceType);

    text += `[${citation.index}] ${r.title}\n`;
    text += `    URL: ${r.url}\n`;
    text += `    Source type: ${authorityLabel} (authority: ${r.authorityScore})\n`;
    if (r.publishedAt) {
      text += `    Published: ${r.publishedAt}\n`;
    }
    text += `    Content: ${r.content.slice(0, 1500)}\n\n`;
  }

  // Evidence summary
  if (evidence.length > 0) {
    text += '--- Evidence Summary ---\n';
    for (const item of evidence.slice(0, 8)) {
      const sourceNums = item.supportingSources
        .map(id => {
          const idx = results.findIndex(r => r.id === id);
          return idx >= 0 ? `[${idx + 1}]` : '';
        })
        .filter(s => s)
        .join(', ');

      text += `- Claim: "${item.claim.slice(0, 150)}"\n`;
      text += `  Status: ${item.status} (confidence: ${item.confidence})\n`;
      if (sourceNums) text += `  Supporting sources: ${sourceNums}\n`;
      if (item.contradictingSources.length > 0) {
        text += `  ⚠ Contradicting sources exist\n`;
      }
    }
    text += '--- End Evidence Summary ---\n';
  }

  text += '--- End Research Evidence ---\n';

  // Anti-hallucination instructions
  text += '\nIMPORTANT RULES:\n';
  text += '1. Only state facts that are supported by the sources above.\n';
  text += '2. If the sources disagree, acknowledge the disagreement.\n';
  text += '3. If information is missing from the sources, say "I could not verify this."\n';
  text += '4. Never invent URLs, prices, dates, or API endpoints.\n';
  text += '5. Cite sources using [1], [2], etc. notation.\n';
  text += '6. Distinguish between FACT (directly stated in source), INFERENCE (reasonable conclusion), and UNCERTAIN.\n';

  return text;
}

/**
 * Get human-readable authority label.
 */
export function getAuthorityLabel(sourceType: string): string {
  const labels: Record<string, string> = {
    government: 'Government/Regulator',
    official_documentation: 'Official Documentation',
    official_company: 'Official Company Source',
    primary_source: 'Primary Source',
    academic: 'Academic Source',
    established_journalism: 'Established Journalism',
    reputable_publication: 'Reputable Publication',
    industry_publication: 'Industry Publication',
    forum: 'Forum',
    social_media: 'Social Media',
    seo_content: 'SEO Content',
    scraped_site: 'Scraped Site',
    spam: 'Spam',
    duplicate: 'Duplicate',
    ai_generated: 'AI-Generated Content',
    unknown: 'Unverified Source',
  };

  return labels[sourceType] || 'Unknown Source Type';
}

/**
 * Format citations for display in the UI.
 */
export function formatCitationsForUI(citations: Citation[]): string[] {
  return citations.map(c =>
    `[${c.index}] ${c.title} — ${c.domain}${c.publishedAt ? ` (${c.publishedAt.split('T')[0]})` : ''}`
  );
}
