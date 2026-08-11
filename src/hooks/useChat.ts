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
    setMessages(prev => [...prev, userMsg]);

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

            // Handle status events (searching, searched, search_failed, generating)
            if (parsed.status === 'searching') {
              searchQuery = parsed.query || content.trim();
              setSearchStatus({ type: 'searching', query: searchQuery });
            } else if (parsed.status === 'searched') {
              didSearch = true;
              searchResults = parsed.results || [];
              setSearchStatus({ type: 'searched', query: searchQuery, results: searchResults });
              // Update the assistant message with search metadata
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

      // Mark streaming complete
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, streaming: false } : m
      ));

    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Connection failed');
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: '⚠️ Failed to get response. Please try again.', streaming: false }
          : m
      ));
    } finally {
      setIsLoading(false);
      setSearchStatus({ type: 'idle' });
    }
  }, [sessionId, isLoading]);

  const loadHistory = useCallback(async () => {
    // History is in-memory on the server, so we just clear locally on load
    // In a real deployment with DB, this would fetch from the server
  }, [sessionId]);

  const clearChat = useCallback(async () => {
    if (!sessionId) return;
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
