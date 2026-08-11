/**
 * In-memory session store for chat history.
 * Works on Vercel serverless (no DB required).
 */

interface StoredMessage {
  role: string;
  content: string;
  timestamp: number;
}

const sessions = new Map<string, StoredMessage[]>();

export function getSession(sessionId: string): StoredMessage[] {
  if (!sessions.has(sessionId)) sessions.set(sessionId, []);
  return sessions.get(sessionId)!;
}

export function saveMessage(sessionId: string, role: string, content: string): void {
  const session = getSession(sessionId);
  session.push({ role, content, timestamp: Date.now() });
}

export function getHistory(sessionId: string, limit = 20): StoredMessage[] {
  const session = getSession(sessionId);
  return session.slice(-limit);
}

export function clearSession(sessionId: string): void {
  sessions.delete(sessionId);
}
