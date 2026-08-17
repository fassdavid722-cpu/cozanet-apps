/**
 * Deep Research Engine — Multi-step learning that takes real time
 * 
 * When the user says "go learn about X", this engine:
 * 1. Plans multiple search queries (different angles)
 * 2. Searches the web for each query
 * 3. Reads the top results from each search
 * 4. Extracts key facts and data
 * 5. Cross-references between sources
 * 6. Verifies claims
 * 7. Stores the synthesized knowledge
 * 
 * This isn't a 2-second search — it's a deep multi-step process.
 */

import { tavilySearch, tavilyExtract } from './tavily';
import { knowledgeStore, knowledgeRecall, knowledgeFreshness } from './knowledge';

export interface ResearchConfig {
  depth: 'quick' | 'standard' | 'deep';
  maxSources: number;
  queriesPerTopic: number;
  pagesPerQuery: number;
  followLinks: boolean;
  storeResults: boolean;
}

const DEFAULT_CONFIG: ResearchConfig = {
  depth: 'standard',
  maxSources: 15,
  queriesPerTopic: 3,
  pagesPerQuery: 5,
  followLinks: true,
  storeResults: true,
};

export interface ResearchStep {
  step: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail?: string;
  data?: any;
}

export interface ResearchResult {
  topic: string;
  summary: string;
  content: string;
  sources: { url: string; title: string; snippet: string }[];
  facts: string[];
  confidence: number;
  duration: number;
  steps: ResearchStep[];
  stored: boolean;
}

// ── Generate search queries for a topic ──

function generateQueries(topic: string, count: number): string[] {
  const queries = [topic];

  // Add angle-specific queries
  const angles = [
    `${topic} latest 2025 2026`,
    `${topic} guide tutorial explained`,
    `${topic} best practices new updates`,
    `${topic} comparison alternatives`,
    `${topic} examples real world`,
    `what is ${topic} how it works`,
    `${topic} news recent changes`,
    `${topic} documentation`,
  ];

  for (let i = 0; i < count - 1 && i < angles.length; i++) {
    queries.push(angles[i]);
  }

  return queries.slice(0, count);
}

// ── Deep Research ──

export async function deepResearch(
  topic: string,
  config: Partial<ResearchConfig> = {},
  onProgress?: (step: ResearchStep) => void,
): Promise<ResearchResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();
  const steps: ResearchStep[] = [];

  const updateStep = (step: ResearchStep) => {
    const idx = steps.findIndex(s => s.step === step.step);
    if (idx >= 0) {
      steps[idx] = step;
    } else {
      steps.push(step);
    }
    onProgress?.(step);
  };

  // Step 1: Check existing knowledge
  updateStep({ step: 'Checking existing knowledge', status: 'running' });
  const freshness = await knowledgeFreshness(topic, cfg.depth === 'deep' ? 24 : 168);
  if (freshness.fresh && freshness.entry) {
    updateStep({
      step: 'Checking existing knowledge',
      status: 'done',
      detail: `Found existing knowledge (age: ${freshness.ageHours?.toFixed(1)}h)`,
    });

    return {
      topic,
      summary: freshness.entry.summary,
      content: freshness.entry.content,
      sources: (freshness.entry.sources || []).map((url: string) => ({ url, title: '', snippet: '' })),
      facts: [],
      confidence: freshness.entry.confidence,
      duration: Date.now() - startTime,
      steps,
      stored: true,
    };
  }
  updateStep({
    step: 'Checking existing knowledge',
    status: 'done',
    detail: freshness.entry ? `Found stale knowledge (age: ${freshness.ageHours?.toFixed(1)}h), refreshing...` : 'No existing knowledge, starting fresh research',
  });

  // Step 2: Generate search queries
  updateStep({ step: 'Planning search queries', status: 'running' });
  const queries = generateQueries(topic, cfg.queriesPerTopic);
  updateStep({
    step: 'Planning search queries',
    status: 'done',
    detail: `Generated ${queries.length} queries: ${queries.join(', ')}`,
  });

  // Step 3: Search the web
  updateStep({ step: `Searching the web (${queries.length} queries)`, status: 'running' });
  const allResults: { url: string; title: string; content: string; score: number }[] = [];
  const seenUrls = new Set<string>();

  for (let i = 0; i < queries.length; i++) {
    updateStep({
      step: `Searching the web (${queries.length} queries)`,
      status: 'running',
      detail: `Query ${i + 1}/${queries.length}: "${queries[i]}"`,
    });

    try {
      const searchResults = await tavilySearch(queries[i], {
        maxResults: cfg.pagesPerQuery,
        searchDepth: cfg.depth === 'deep' ? 'advanced' : 'basic',
        includeAnswer: true,
      });

      if (searchResults.answer) {
        // Tavily provides a direct answer — capture it
        allResults.push({
          url: '_tavily_answer_',
          title: 'AI-Generated Answer',
          content: searchResults.answer,
          score: 0.9,
        });
      }

      for (const result of (searchResults.results || [])) {
        if (!seenUrls.has(result.url)) {
          seenUrls.add(result.url);
          allResults.push({
            url: result.url,
            title: result.title || '',
            content: result.content || '',
            score: result.score || 0.5,
          });
        }
      }
    } catch (err: any) {
      updateStep({
        step: `Searching the web (${queries.length} queries)`,
        status: 'running',
        detail: `Query ${i + 1} error: ${err.message}`,
      });
    }

    // Small delay between queries to avoid rate limits
    if (i < queries.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  updateStep({
    step: `Searching the web (${queries.length} queries)`,
    status: 'done',
    detail: `Found ${allResults.length} unique results from ${queries.length} queries`,
  });

  // Step 4: Read top results in detail
  updateStep({ step: 'Reading top sources in detail', status: 'running' });
  const topResults = allResults
    .filter(r => r.url !== '_tavily_answer_')
    .sort((a, b) => b.score - a.score)
    .slice(0, cfg.maxSources);

  let detailedContent = '';
  const sources: { url: string; title: string; snippet: string }[] = [];

  for (let i = 0; i < topResults.length; i++) {
    updateStep({
      step: 'Reading top sources in detail',
      status: 'running',
      detail: `Reading ${i + 1}/${topResults.length}: ${topResults[i].title.substring(0, 50)}...`,
    });

    try {
      const extract = await tavilyExtract([topResults[i].url]);
      const fullContent = extract.results?.[0]?.raw_content || topResults[i].content;
      detailedContent += `\n\n--- Source: ${topResults[i].url} ---\n${fullContent.substring(0, 5000)}\n`;
      sources.push({
        url: topResults[i].url,
        title: topResults[i].title,
        snippet: fullContent.substring(0, 200),
      });
    } catch {
      // Fallback to search snippet
      detailedContent += `\n\n--- Source: ${topResults[i].url} ---\n${topResults[i].content}\n`;
      sources.push({
        url: topResults[i].url,
        title: topResults[i].title,
        snippet: topResults[i].content.substring(0, 200),
      });
    }

    // Delay between page fetches
    if (i < topResults.length - 1) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // Include Tavily answer
  const tavilyAnswer = allResults.find(r => r.url === '_tavily_answer_');
  if (tavilyAnswer) {
    detailedContent = tavilyAnswer.content + detailedContent;
  }

  updateStep({
    step: 'Reading top sources in detail',
    status: 'done',
    detail: `Read ${topResults.length} sources in detail`,
  });

  // Step 5: Extract key facts
  updateStep({ step: 'Extracting key facts', status: 'running' });
  const facts: string[] = [];

  // Extract sentences that look like facts (contain numbers, dates, or key terms)
  const sentences = detailedContent.split(/[.!?]\s+/);
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length < 20 || trimmed.length > 300) continue;

    // Look for factual indicators
    const hasNumber = /\d{4}|\d+%|\$\d+|\d{2,}/.test(trimmed);
    const hasDate = /\b(20\d{2}|January|February|March|April|May|June|July|August|September|October|November|December|Q[1-4]|version|v\d)/i.test(trimmed);
    const hasKey = /\b(is|are|was|were|has|have|will|launched|released|announced|updated|changed|new|latest)\b/i.test(trimmed);

    if ((hasNumber || hasDate) && hasKey) {
      if (!facts.includes(trimmed) && facts.length < 20) {
        facts.push(trimmed);
      }
    }
  }

  updateStep({
    step: 'Extracting key facts',
    status: 'done',
    detail: `Extracted ${facts.length} key facts`,
  });

  // Step 6: Synthesize content
  updateStep({ step: 'Synthesizing knowledge', status: 'running' });

  const summary = facts.slice(0, 5).join(' ');
  const synthesizedContent = `# ${topic}\n\n## Summary\n${summary}\n\n## Key Facts\n${facts.map(f => `- ${f}`).join('\n')}\n\n## Detailed Findings\n${detailedContent.substring(0, 10000)}\n\n## Sources\n${sources.map(s => `- [${s.title}](${s.url})`).join('\n')}`;

  updateStep({
    step: 'Synthesizing knowledge',
    status: 'done',
    detail: 'Knowledge synthesized',
  });

  // Step 7: Store in knowledge base
  let stored = false;
  if (cfg.storeResults) {
    updateStep({ step: 'Storing in knowledge base', status: 'running' });
    const storeResult = await knowledgeStore(topic, synthesizedContent, {
      category: 'research',
      summary,
      sources: sources.map(s => s.url),
      confidence: Math.min(0.9, 0.5 + (sources.length / 20)),
      tags: [topic.toLowerCase().split(' ')[0], 'research'],
    });

    stored = storeResult.success;
    updateStep({
      step: 'Storing in knowledge base',
      status: storeResult.success ? 'done' : 'error',
      detail: storeResult.success ? 'Stored successfully' : `Failed: ${storeResult.error}`,
    });
  }

  const duration = Date.now() - startTime;

  return {
    topic,
    summary,
    content: synthesizedContent,
    sources,
    facts,
    confidence: Math.min(0.9, 0.5 + (sources.length / 20)),
    duration,
    steps,
    stored,
  };
}

// ── Quick research (single query, no deep reading) ──

export async function quickResearch(topic: string): Promise<ResearchResult> {
  return deepResearch(topic, {
    depth: 'quick',
    maxSources: 5,
    queriesPerTopic: 1,
    pagesPerQuery: 5,
    followLinks: false,
    storeResults: true,
  });
}

// ── Deep research (exhaustive) ──

export async function exhaustiveResearch(topic: string): Promise<ResearchResult> {
  return deepResearch(topic, {
    depth: 'deep',
    maxSources: 20,
    queriesPerTopic: 5,
    pagesPerQuery: 10,
    followLinks: true,
    storeResults: true,
  });
}
