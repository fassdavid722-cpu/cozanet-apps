/**
 * Supabase-backed memory store for chat conversations.
 *
 * Uses the existing ai_memory table with:
 *   - memory_type: 'CHAT_USER' | 'CHAT_ASSISTANT' (encodes role)
 *   - content:     message text
 *   - source:      session_id
 *   - importance:  0 (chat history is low-priority memory)
 *   - is_active:   true
 *
 * This replaces the old in-memory Map — conversations now persist
 * across Vercel serverless cold starts, redeployments, and restarts.
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

/**
 * Get all messages for a session, ordered chronologically.
 */
export async function getSession(sessionId: string): Promise<StoredMessage[]> {
  if (!SUPABASE_KEY) {
    console.warn('[memory] SUPABASE_SERVICE_ROLE_KEY not set — returning empty history');
    return [];
  }

  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_memory?source=eq.${encodeURIComponent(sessionId)}&memory_type=in.(CHAT_USER,CHAT_ASSISTANT)&order=created_at.asc&select=memory_type,content,created_at`,
      { headers: HEADERS }
    );

    if (!resp.ok) {
      console.error('[memory] getSession failed:', resp.status, await resp.text());
      return [];
    }

    const data = await resp.json() as any[];
    return data.map(r => ({
      role: r.memory_type === 'CHAT_USER' ? 'user' : 'assistant',
      content: r.content,
      timestamp: new Date(r.created_at).getTime(),
    }));
  } catch (err: any) {
    console.error('[memory] getSession error:', err.message);
    return [];
  }
}

/**
 * Save a single message to Supabase.
 */
export async function saveMessage(sessionId: string, role: string, content: string): Promise<void> {
  if (!SUPABASE_KEY) {
    console.warn('[memory] SUPABASE_SERVICE_ROLE_KEY not set — skipping save');
    return;
  }

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
  } catch (err: any) {
    console.error('[memory] saveMessage error:', err.message);
  }
}

/**
 * Get recent conversation history (last N messages).
 */
export async function getHistory(sessionId: string, limit = 20): Promise<StoredMessage[]> {
  const all = await getSession(sessionId);
  return all.slice(-limit);
}

/**
 * Clear all messages for a session.
 */
export async function clearSession(sessionId: string): Promise<void> {
  if (!SUPABASE_KEY) return;

  try {
    await fetch(
      `${SUPABASE_URL}/rest/v1/ai_memory?source=eq.${encodeURIComponent(sessionId)}&memory_type=in.(CHAT_USER,CHAT_ASSISTANT)`,
      { method: 'DELETE', headers: HEADERS }
    );
  } catch (err: any) {
    console.error('[memory] clearSession error:', err.message);
  }
}
