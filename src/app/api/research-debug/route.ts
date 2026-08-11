/**
 * Research Debug API — Developer observability endpoint.
 *
 * GET /api/research-debug?message=...
 * Runs the research orchestrator on a test message and returns
 * the full internal state: decision, query plan, results, scores,
 * evidence, citations, verification, and logs.
 */

import { NextRequest } from 'next/server';
import { conductResearch, getRecentLogs } from '@/lib/research';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const message = req.nextUrl.searchParams.get('message');

  if (!message) {
    return new Response(JSON.stringify({
      usage: 'GET /api/research-debug?message=your+query+here',
      recentLogs: getRecentLogs().slice(0, 10),
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const research = await conductResearch(message);

  return new Response(JSON.stringify({
    requestId: research.requestId,
    decision: research.decision,
    queryPlan: research.queryPlan,
    results: research.results.map(r => ({
      title: r.title,
      url: r.url,
      domain: r.domain,
      sourceType: r.sourceType,
      scores: {
        authority: r.authorityScore,
        relevance: r.relevanceScore,
        freshness: r.freshnessScore,
        evidence: r.evidenceScore,
        overall: r.overallScore,
      },
      publishedAt: r.publishedAt,
      hasFullContent: !!r.rawContent,
      contentLength: r.content.length,
    })),
    evidence: research.evidence.slice(0, 10).map(e => ({
      claim: e.claim.slice(0, 200),
      status: e.status,
      confidence: e.confidence,
      supportingSources: e.supportingSources.length,
      contradictingSources: e.contradictingSources.length,
    })),
    citations: research.citations,
    contradictions: research.contradictions,
    limitations: research.limitations,
    metadata: {
      provider: research.searchProviderUsed,
      totalSearches: research.totalSearches,
      duration: research.duration,
      success: research.success,
      failureReason: research.failureReason,
    },
    recentLogs: getRecentLogs().slice(0, 20),
  }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
}
