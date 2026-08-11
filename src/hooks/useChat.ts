'use client';
import { useState, useCallback, useRef } from 'react';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  streaming?: boolean;
  searched?: boolean;
  searchResults?: { title: string; url: string }[];
  searchQuery?: string;
}

export interface SearchStatus {
  type: 'idle' | 'searching' | 'searched' | 'search_failed';
  query?: string;
  results?: { title: string; url: string }[];
  error?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

/**
 * Load messages from localStorage for a given session.
 */
function loadLocalHistory(sessionId: string): Message[] {
  try {
    const stored = localStorage.getItem(`cozanet-history-${sessionId}`);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

/**
 * Save messages to localStorage for a given session.
 */
function saveLocalHistory(sessionId: string, messages: Message[]) {
  try {
    // Only save non-streaming, complete messages
    const clean = messages.filter(m => !m.streaming);
    localStorage.setItem(`cozanet-history-${sessionId}`, JSON.stringify(clean));
  } catch {}
}

export function useChat(sessionId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>({ type: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || !sessionId || isLoading) return;

    setError(null);
    setSearchStatus({ type: 'idle' });

    // Add user message
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
    };
    setMessages(prev => {
      const updated = [...prev, userMsg];
      saveLocalHistory(sessionId, updated);
      return updated;
    });

    // Add placeholder assistant message (streaming)
    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      streaming: true,
    };
    setMessages(prev => [...prev, assistantMsg]);
    setIsLoading(true);

    abortRef.current = new AbortController();

    try {
      const url = API_URL ? `${API_URL}/api/chat` : '/api/chat';
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content.trim(), sessionId }),
        signal: abortRef.current.signal,
      });

      if (!resp.ok) {
        throw new Error(`Server error: ${resp.status}`);
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let assembled = '';
      let didSearch = false;
      let searchResults: { title: string; url: string }[] = [];
      let searchQuery = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split('\n').filter(l => l.startsWith('data: '));

        for (const line of lines) {
          const data = line.slice(6);
          try {
            const parsed = JSON.parse(data);

            // Handle status events
            if (parsed.status === 'searching') {
              searchQuery = parsed.query || content.trim();
              setSearchStatus({ type: 'searching', query: searchQuery });
            } else if (parsed.status === 'searched') {
              didSearch = true;
              searchResults = parsed.results || [];
              setSearchStatus({ type: 'searched', query: searchQuery, results: searchResults });
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, searched: true, searchResults, searchQuery }
                  : m
              ));
            } else if (parsed.status === 'search_failed') {
              setSearchStatus({ type: 'search_failed', error: parsed.error });
            } else if (parsed.status === 'generating') {
              setSearchStatus({ type: 'idle' });
            }

            if (parsed.done) break;
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.chunk) {
              assembled += parsed.chunk;
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: assembled, streaming: true }
                  : m
              ));
            }
          } catch (e: any) {
            if (e.message && !e.message.includes('JSON')) throw e;
          }
        }
      }

      // Mark streaming complete and save to localStorage
      setMessages(prev => {
        const updated = prev.map(m =>
          m.id === assistantId ? { ...m, streaming: false } : m
        );
        saveLocalHistory(sessionId, updated);
        return updated;
      });

    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Connection failed');
      setMessages(prev => {
        const updated = prev.map(m =>
          m.id === assistantId
            ? { ...m, content: '⚠️ Failed to get response. Please try again.', streaming: false }
            : m
        );
        saveLocalHistory(sessionId, updated);
        return updated;
      });
    } finally {
      setIsLoading(false);
      setSearchStatus({ type: 'idle' });
    }
  }, [sessionId, isLoading]);

  const loadHistory = useCallback(async () => {
    // Load from localStorage — survives serverless restarts
    if (!sessionId) return;
    const stored = loadLocalHistory(sessionId);
    if (stored.length > 0) {
      setMessages(stored);
    }
  }, [sessionId]);

  const clearChat = useCallback(async () => {
    if (!sessionId) return;
    // Clear localStorage history
    localStorage.removeItem(`cozanet-history-${sessionId}`);
    // Also clear server-side if available
    try {
      const url = API_URL ? `${API_URL}/api/chat` : '/api/chat';
      await fetch(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
    } catch { /* ignore */ }
    setMessages([]);
  }, [sessionId]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, isLoading, error, searchStatus, sendMessage, loadHistory, clearChat, stopStreaming };
}
