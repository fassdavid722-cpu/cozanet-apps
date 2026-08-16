'use client';
import { useState, useCallback, useRef } from 'react';

export interface Activity {
  id: string;
  type: 'thinking' | 'searching' | 'browsed' | 'searched' | 'browsing' | 'generating' | 'tool' | 'weather' | 'memory' | 'calculating' | 'translating' | 'code_running' | 'error' | 'screenshot';
  label: string;
  detail?: string;
  timestamp: number;
  results?: { title: string; url: string }[];
  url?: string;
  title?: string;
  description?: string;
  excerpt?: string;
  ogImage?: string;
  siteName?: string;
  wordCount?: number;
  via?: string;
  screenshotUrl?: string;
  images?: string[];
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  streaming?: boolean;
  activities?: Activity[];
  images?: string[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

function loadLocalHistory(sessionId: string): Message[] {
  try {
    const stored = localStorage.getItem(`cozanet-history-${sessionId}`);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

function saveLocalHistory(sessionId: string, messages: Message[]) {
  try {
    const clean = messages.filter(m => !m.streaming);
    localStorage.setItem(`cozanet-history-${sessionId}`, JSON.stringify(clean));
  } catch {}
}

let activityCounter = 0;
function makeActivityId() {
  activityCounter++;
  return `act-${Date.now()}-${activityCounter}`;
}

export function useChat(sessionId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentActivities, setCurrentActivities] = useState<Activity[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const addActivity = useCallback((assistantId: string, activity: Activity) => {
    setCurrentActivities(prev => [...prev, activity]);
    setMessages(prev => prev.map(m =>
      m.id === assistantId
        ? { ...m, activities: [...(m.activities || []), activity] }
        : m
    ));
  }, []);

  const updateActivity = useCallback((assistantId: string, activityId: string, updates: Partial<Activity>) => {
    setCurrentActivities(prev => prev.map(a =>
      a.id === activityId ? { ...a, ...updates } : a
    ));
    setMessages(prev => prev.map(m =>
      m.id === assistantId
        ? { ...m, activities: (m.activities || []).map(a => a.id === activityId ? { ...a, ...updates } : a) }
        : m
    ));
  }, []);

  const sendMessage = useCallback(async (content: string, images?: string[]) => {
    if (!content.trim() || !sessionId || isLoading) return;

    setError(null);
    setCurrentActivities([]);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
      images: images || undefined,
    };
    setMessages(prev => {
      const updated = [...prev, userMsg];
      saveLocalHistory(sessionId, updated);
      return updated;
    });

    const assistantId = crypto.randomUUID();
    setMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      streaming: true,
      activities: [],
    }]);
    setIsLoading(true);

    try {
      const url = API_URL ? `${API_URL}/api/chat` : '/api/chat';
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content.trim(), sessionId, images: images || [] }),
      });

      if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
      if (!resp.body) throw new Error('No response body');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();

      let sseBuffer = '';
      let assembled = '';
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });

        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;

          let parsed: any;
          try {
            parsed = JSON.parse(trimmed.slice(6));
          } catch {
            continue;
          }

          // ── Handle status events ──
          if (parsed.status === 'thinking') {
            addActivity(assistantId, {
              id: makeActivityId(),
              type: 'thinking',
              label: 'Thinking',
              timestamp: Date.now(),
            });
          } else if (parsed.status === 'searching') {
            addActivity(assistantId, {
              id: makeActivityId(),
              type: 'searching',
              label: 'Searching the web',
              detail: parsed.query || '',
              timestamp: Date.now(),
            });
          } else if (parsed.status === 'browsing') {
            addActivity(assistantId, {
              id: makeActivityId(),
              type: 'browsing',
              label: 'Browsing',
              detail: parsed.detail || '',
              url: parsed.url || '',
              timestamp: Date.now(),
            });
          } else if (parsed.status === 'screenshot') {
            if (parsed.screenshotUrl) {
              addActivity(assistantId, {
                id: makeActivityId(),
                type: 'screenshot',
                label: 'Captured screenshot',
                url: parsed.url || '',
                screenshotUrl: parsed.screenshotUrl,
                timestamp: Date.now(),
              });
            }
          } else if (parsed.status === 'browsed') {
            if (parsed.url) {
              addActivity(assistantId, {
                id: makeActivityId(),
                type: 'browsed',
                label: 'Read page',
                url: parsed.url,
                title: parsed.title || '',
                description: parsed.description || '',
                excerpt: parsed.excerpt || '',
                ogImage: parsed.ogImage || '',
                siteName: parsed.siteName || '',
                wordCount: parsed.wordCount || 0,
                via: parsed.via || 'direct',
                screenshotUrl: parsed.screenshotUrl || '',
                timestamp: Date.now(),
              });
            }
          } else if (parsed.status === 'searched') {
            const results = parsed.results || [];
            if (results.length > 0) {
              addActivity(assistantId, {
                id: makeActivityId(),
                type: 'searched',
                label: `Found ${results.length} results`,
                detail: parsed.query || '',
                results,
                timestamp: Date.now(),
              });
            }
          } else if (parsed.status === 'browse_failed') {
            addActivity(assistantId, {
              id: makeActivityId(),
              type: 'error',
              label: 'Browse failed',
              detail: parsed.error || '',
              timestamp: Date.now(),
            });
          } else if (parsed.status === 'search_failed') {
            addActivity(assistantId, {
              id: makeActivityId(),
              type: 'error',
              label: 'Search failed',
              detail: parsed.error || '',
              timestamp: Date.now(),
            });
          } else if (parsed.status === 'tool_running') {
            addActivity(assistantId, {
              id: makeActivityId(),
              type: 'tool',
              label: parsed.toolName || 'Using tool',
              detail: parsed.toolDetail || '',
              timestamp: Date.now(),
            });
          } else if (parsed.status === 'weather') {
            addActivity(assistantId, {
              id: makeActivityId(),
              type: 'weather',
              label: 'Checking weather',
              detail: parsed.location || '',
              timestamp: Date.now(),
            });
          } else if (parsed.status === 'memory') {
            addActivity(assistantId, {
              id: makeActivityId(),
              type: 'memory',
              label: parsed.memoryType === 'save' ? 'Saving to memory' : 'Recalling memory',
              detail: parsed.detail || '',
              timestamp: Date.now(),
            });
          } else if (parsed.status === 'calculating') {
            addActivity(assistantId, {
              id: makeActivityId(),
              type: 'calculating',
              label: 'Calculating',
              detail: parsed.expression || '',
              timestamp: Date.now(),
            });
          } else if (parsed.status === 'translating') {
            addActivity(assistantId, {
              id: makeActivityId(),
              type: 'translating',
              label: 'Translating',
              detail: parsed.detail || '',
              timestamp: Date.now(),
            });
          } else if (parsed.status === 'code_running') {
            addActivity(assistantId, {
              id: makeActivityId(),
              type: 'code_running',
              label: 'Running code',
              timestamp: Date.now(),
            });
          } else if (parsed.status === 'generating') {
            setCurrentActivities([]);
          }

          if (parsed.done) { streamDone = true; break; }
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.chunk) {
            assembled += parsed.chunk;
            setCurrentActivities([]);
            setMessages(prev => prev.map(m =>
              m.id === assistantId
                ? { ...m, content: assembled, streaming: true }
                : m
            ));
          }
        }
      }

      setMessages(prev => {
        const updated = prev.map(m =>
          m.id === assistantId ? { ...m, streaming: false } : m
        );
        saveLocalHistory(sessionId, updated);
        return updated;
      });

    } catch (err: any) {
      if (err.name === 'AbortError') return;
      let friendly = err.message || 'Connection failed';
      if (/rate.?limit|429/i.test(friendly)) {
        friendly = "I'm getting a lot of requests right now — give me a few seconds and try again.";
      } else if (/Failed to fetch|NetworkError|network/i.test(friendly)) {
        friendly = "Couldn't reach the server — check your connection and try again.";
      }
      setError(friendly);
      setMessages(prev => {
        const updated = prev.map(m =>
          m.id === assistantId
            ? { ...m, content: '⚠️ ' + friendly, streaming: false }
            : m
        );
        saveLocalHistory(sessionId, updated);
        return updated;
      });
    } finally {
      setIsLoading(false);
      setCurrentActivities([]);
    }
  }, [sessionId, isLoading, addActivity, updateActivity]);

  const loadHistory = useCallback(async () => {
    if (!sessionId) return;
    const stored = loadLocalHistory(sessionId);
    if (stored.length > 0) setMessages(stored);
  }, [sessionId]);

  const clearChat = useCallback(async () => {
    if (!sessionId) return;
    localStorage.removeItem(`cozanet-history-${sessionId}`);
    try {
      const url = API_URL ? `${API_URL}/api/chat` : '/api/chat';
      await fetch(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
    } catch {}
    setMessages([]);
  }, [sessionId]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, isLoading, error, currentActivities, sendMessage, loadHistory, clearChat, stopStreaming };
}
