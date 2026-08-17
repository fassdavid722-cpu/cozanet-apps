/**
 * Supabase-backed memory store for CozanetOS.
 *
 * Three types of data in ai_memory table:
 *   - CHAT_USER / CHAT_ASSISTANT: conversation history (source = session_id)
 *   - MEMORY: persistent user memories (source = category tag)
 *
 * All types persist across Vercel cold starts and redeployments.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yjwhpprzyuvlizzdywfg.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

interface StoredMessage {
  role: string;
  content: string;
  timestamp: number;
}

// ── Chat History ──

export async function getSession(sessionId: string): Promise<StoredMessage[]> {
  if (!SUPABASE_KEY) return [];

  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_memory?source=eq.${encodeURIComponent(sessionId)}&memory_type=in.(CHAT_USER,CHAT_ASSISTANT)&order=created_at.asc&select=memory_type,content,created_at`,
      { headers: HEADERS }
    );

    if (!resp.ok) return [];

    const data = await resp.json() as any[];
    return data.map(r => ({
      role: r.memory_type === 'CHAT_USER' ? 'user' : 'assistant',
      content: r.content,
      timestamp: new Date(r.created_at).getTime(),
    }));
  } catch {
    return [];
  }
}

export async function saveMessage(sessionId: string, role: string, content: string): Promise<void> {
  if (!SUPABASE_KEY) return;

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/ai_memory`, {
      method: 'POST',
      headers: { ...HEADERS, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        memory_type: role === 'user' ? 'CHAT_USER' : 'CHAT_ASSISTANT',
        content,
        importance: 0,
        source: sessionId,
        is_active: true,
      }),
    });
  } catch {}
}

export async function getHistory(sessionId: string, limit = 20): Promise<StoredMessage[]> {
  const all = await getSession(sessionId);
  return all.slice(-limit);
}

export async function clearSession(sessionId: string): Promise<void> {
  if (!SUPABASE_KEY) return;

  try {
    await fetch(
      `${SUPABASE_URL}/rest/v1/ai_memory?source=eq.${encodeURIComponent(sessionId)}&memory_type=in.(CHAT_USER,CHAT_ASSISTANT)`,
      { method: 'DELETE', headers: HEADERS }
    );
  } catch {}
}

// ── Persistent Memories ──

export async function saveMemory(content: string, category: string = 'general', importance: number = 5): Promise<void> {
  if (!SUPABASE_KEY) return;

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/ai_memory`, {
      method: 'POST',
      headers: { ...HEADERS, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        memory_type: 'MEMORY',
        content,
        importance,
        source: category,
        is_active: true,
      }),
    });
  } catch {}
}

export async function getMemories(category?: string): Promise<{ id: string; content: string; category: string; created_at: string }[]> {
  if (!SUPABASE_KEY) return [];

  try {
    let url = `${SUPABASE_URL}/rest/v1/ai_memory?memory_type=eq.MEMORY&is_active=eq.true&order=created_at.desc&limit=100&select=id,content,source,created_at`;
    if (category) {
      url += `&source=eq.${encodeURIComponent(category)}`;
    }
    const resp = await fetch(url, { headers: HEADERS });
    if (!resp.ok) return [];

    const data = await resp.json() as any[];
    return data.map(r => ({
      id: r.id,
      content: r.content,
      category: r.source || 'general',
      created_at: r.created_at,
    }));
  } catch {
    return [];
  }
}

export async function deleteMemory(id: string): Promise<void> {
  if (!SUPABASE_KEY) return;

  try {
    await fetch(
      `${SUPABASE_URL}/rest/v1/ai_memory?id=eq.${id}`,
      { method: 'DELETE', headers: HEADERS }
    );
  } catch {}
}

export async function searchMemories(query: string): Promise<string[]> {
  if (!SUPABASE_KEY) return [];

  try {
    // Simple text search using ilike
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_memory?memory_type=eq.MEMORY&is_active=eq.true&content=ilike.%${encodeURIComponent(query)}%&order=importance.desc&limit=10&select=content`,
      { headers: HEADERS }
    );
    if (!resp.ok) return [];

    const data = await resp.json() as any[];
    return data.map(r => r.content);
  } catch {
    return [];
  }
}
