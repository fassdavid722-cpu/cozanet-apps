/**
 * Knowledge Base — Persistent learning storage in Supabase
 * 
 * The AI stores everything it learns here: facts, research results, code patterns,
 * API docs, etc. This persists across sessions so the AI doesn't just assume
 * based on training data — it can recall what it actually researched.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yjwhpprzyuvlizzdywfg.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPA_HEADERS: Record<string, string> = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

// ── Knowledge Entry ──

export interface KnowledgeEntry {
  id: string;
  topic: string;           // e.g. "React 19 changes", "SvelteKit deployment"
  category: string;         // e.g. "tech", "science", "business", "general"
  content: string;          // The actual learned content (markdown)
  summary: string;          // Short summary for quick recall
  sources: string[];        // URLs where info was found
  confidence: number;       // 0-1, how confident the AI is in this info
  freshness: string;        // ISO date when this was last verified
  tags: string[];           // For searchability
  created_at: string;
  updated_at: string;
}

// ── Store knowledge ──

export async function knowledgeStore(
  topic: string,
  content: string,
  options: {
    category?: string;
    summary?: string;
    sources?: string[];
    confidence?: number;
    tags?: string[];
  } = {},
): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!SUPABASE_KEY) return { success: false, error: 'Database not configured' };

  const now = new Date().toISOString();
  const category = options.category || 'general';
  const summary = options.summary || content.substring(0, 200);
  const sources = options.sources || [];
  const confidence = options.confidence ?? 0.8;
  const tags = options.tags || [];

  try {
    // Check if entry with same topic exists
    const existingResp = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_knowledge?topic=eq.${encodeURIComponent(topic)}&select=id&limit=1`,
      { headers: SUPA_HEADERS },
    );
    const existing = await existingResp.json() as any[];

    if (existing.length > 0) {
      // Update existing entry
      const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/ai_knowledge?id=eq.${existing[0].id}`,
        {
          method: 'PATCH',
          headers: { ...SUPA_HEADERS, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content,
            summary,
            sources,
            confidence,
            freshness: now,
            updated_at: now,
            tags,
          }),
        },
      );
      if (!resp.ok) return { success: false, error: `Failed: ${resp.status}` };
      return { success: true, id: existing[0].id };
    }

    // Create new entry
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/ai_knowledge`, {
      method: 'POST',
      headers: { ...SUPA_HEADERS, 'Prefer': 'return=representation' },
      body: JSON.stringify({
        topic,
        category,
        content,
        summary,
        sources,
        confidence,
        freshness: now,
        tags,
        created_at: now,
        updated_at: now,
      }),
    });

    if (!resp.ok) return { success: false, error: `Failed: ${resp.status}` };
    const data = await resp.json() as any[];
    return { success: true, id: data[0]?.id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── Retrieve knowledge ──

export async function knowledgeRecall(
  topic: string,
  exact: boolean = false,
): Promise<{ success: boolean; entries?: KnowledgeEntry[]; error?: string }> {
  if (!SUPABASE_KEY) return { success: false, error: 'Database not configured' };

  try {
    let url: string;
    if (exact) {
      url = `${SUPABASE_URL}/rest/v1/ai_knowledge?topic=eq.${encodeURIComponent(topic)}&order=updated_at.desc&limit=5`;
    } else {
      // Use full-text search via Supabase's textSearch
      url = `${SUPABASE_URL}/rest/v1/ai_knowledge?or=(topic.ilike.%${encodeURIComponent(topic)}%,summary.ilike.%${encodeURIComponent(topic)}%,content.ilike.%${encodeURIComponent(topic)}%)&order=updated_at.desc&limit=10`;
    }

    const resp = await fetch(url, { headers: SUPA_HEADERS });
    if (!resp.ok) return { success: false, error: `Failed: ${resp.status}` };
    const entries = await resp.json() as KnowledgeEntry[];
    return { success: true, entries };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── List all knowledge ──

export async function knowledgeList(
  category?: string,
  limit: number = 50,
): Promise<{ success: boolean; entries?: any[]; error?: string }> {
  if (!SUPABASE_KEY) return { success: false, error: 'Database not configured' };

  try {
    let url: string;
    if (category) {
      url = `${SUPABASE_URL}/rest/v1/ai_knowledge?category=eq.${encodeURIComponent(category)}&order=updated_at.desc&limit=${limit}&select=id,topic,category,summary,confidence,freshness,tags,updated_at`;
    } else {
      url = `${SUPABASE_URL}/rest/v1/ai_knowledge?order=updated_at.desc&limit=${limit}&select=id,topic,category,summary,confidence,freshness,tags,updated_at`;
    }

    const resp = await fetch(url, { headers: SUPA_HEADERS });
    if (!resp.ok) return { success: false, error: `Failed: ${resp.status}` };
    const entries = await resp.json();
    return { success: true, entries };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── Delete knowledge ──

export async function knowledgeDelete(
  topic: string,
): Promise<{ success: boolean; error?: string }> {
  if (!SUPABASE_KEY) return { success: false, error: 'Database not configured' };

  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_knowledge?topic=eq.${encodeURIComponent(topic)}`,
      { method: 'DELETE', headers: SUPA_HEADERS },
    );
    return { success: resp.ok, error: resp.ok ? undefined : `Failed: ${resp.status}` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── Check if knowledge is stale ──

export async function knowledgeFreshness(
  topic: string,
  maxAgeHours: number = 168, // 1 week default
): Promise<{ fresh: boolean; entry?: KnowledgeEntry; ageHours?: number }> {
  const result = await knowledgeRecall(topic, true);
  if (!result.success || !result.entries || result.entries.length === 0) {
    return { fresh: false };
  }

  const entry = result.entries[0];
  const freshness = new Date(entry.freshness).getTime();
  const ageHours = (Date.now() - freshness) / (1000 * 60 * 60);

  return { fresh: ageHours < maxAgeHours, entry, ageHours };
}
