'use client';

import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { useSession, newSession } from '@/hooks/useSession';
import { useChat } from '@/hooks/useChat';
import { SearchResults } from '@/components/SearchResults';
import { SearchingState } from '@/components/SearchingState';

export default function ChatPage() {
  const sessionId = useSession();
  const { messages, isLoading, searchStatus, sendMessage, loadHistory } = useChat(sessionId);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  useEffect(() => {
    if (sessionId && !historyLoaded) {
      loadHistory().then(() => setHistoryLoaded(true));
    }
  }, [sessionId, historyLoaded, loadHistory]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, searchStatus]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
    }
  }, [input]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    newSession();
    window.location.reload();
  };

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--bg)' }}>
      {/* Header — premium with Cozanet branding */}
      <header
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: 'var(--border)', background: 'var(--header-bg)' }}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <div 
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, var(--coz-gold), var(--coz-gold-dark))' }}
            >
              <span className="text-black font-bold text-[13px]">C</span>
            </div>
            <span className="font-semibold text-[15px]" style={{ color: 'var(--text)' }}>
              Cozanet OS
            </span>
          </div>
          <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,184,0,0.1)', color: 'var(--coz-gold)' }}>
            AI
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Plugin indicators */}
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1" title="Web Search active">
              <span className="plugin-badge plugin-badge-search">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                Search
              </span>
            </div>
            <div className="flex items-center gap-1" title="Browser active">
              <span className="plugin-badge plugin-badge-browser">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
                </svg>
                Browser
              </span>
            </div>
          </div>
          <button
            onClick={handleNewChat}
            className="p-1.5 rounded-md transition-colors"
            style={{ color: 'var(--muted)' }}
            title="New chat"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 space-y-4">
          {messages.length === 0 && historyLoaded && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center" style={{ minHeight: '50vh' }}>
              <div 
                className="w-16 h-16 rounded-2xl flex items-center justify-center pulse-gold"
                style={{ background: 'linear-gradient(135deg, var(--coz-gold), var(--coz-gold-dark))' }}
              >
                <span className="text-black font-bold text-2xl">C</span>
              </div>
              <div>
                <p className="text-lg font-medium" style={{ color: 'var(--text)' }}>
                  Cozanet OS
                </p>
                <p className="text-[14px] mt-1" style={{ color: 'var(--text-dim)' }}>
                  AI with web search, memory, and browser — ask me anything.
                </p>
              </div>
              <div className="flex gap-2 mt-4">
                <div className="premium-card px-3 py-2 text-[12px]" style={{ color: 'var(--text-dim)' }}>
                  💡 Try: "Search cozanet.net"
                </div>
                <div className="premium-card px-3 py-2 text-[12px]" style={{ color: 'var(--text-dim)' }}>
                  🌐 Try: "Browse cozanet.net"
                </div>
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`flex message-appear ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[80%]">
                {/* Search results card (shown above assistant message) */}
                {m.role === 'assistant' && m.searchResults && m.searchResults.length > 0 && (
                  <SearchResults query={m.searchQuery || ''} results={m.searchResults} />
                )}
                
                {/* Message bubble */}
                <div
                  className="px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words md-content"
                  style={{
                    background: m.role === 'user' 
                      ? 'linear-gradient(135deg, var(--coz-gold), var(--coz-gold-dark))' 
                      : 'var(--bubble-assistant)',
                    color: m.role === 'user' ? '#000' : '#fff',
                    borderRadius: 'var(--radius-bubble)',
                    borderBottomRightRadius: m.role === 'user' ? '4px' : 'var(--radius-bubble)',
                    borderBottomLeftRadius: m.role === 'assistant' ? '4px' : 'var(--radius-bubble)',
                  }}
                >
                  {m.content}
                  {m.streaming && !m.content && (
                    <span className="flex gap-1 py-1">
                      <span className="dot w-1.5 h-1.5 rounded-full" style={{ background: 'var(--text-dim)' }} />
                      <span className="dot w-1.5 h-1.5 rounded-full" style={{ background: 'var(--text-dim)' }} />
                      <span className="dot w-1.5 h-1.5 rounded-full" style={{ background: 'var(--text-dim)' }} />
                    </span>
                  )}
                  {m.streaming && m.content && <span className="streaming-cursor" />}
                </div>
              </div>
            </div>
          ))}

          {searchStatus.type === 'searching' && (
            <SearchingState query={searchStatus.query} />
          )}

          {searchStatus.type === 'search_failed' && (
            <div className="flex justify-start slide-up">
              <div className="px-3 py-2 text-[13px] rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>
                ⚠️ Search failed: {searchStatus.error}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </main>

      {/* Input — premium with gold accent */}
      <footer className="shrink-0 border-t" style={{ borderColor: 'var(--border)', background: 'var(--header-bg)' }}>
        <div className="mx-auto w-full max-w-3xl px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Cozanet…"
              rows={1}
              className="flex-1 resize-none outline-none text-[15px] leading-relaxed rounded-3xl px-4 py-2.5"
              style={{ background: 'var(--input-bg)', color: 'var(--text)', caretColor: 'var(--coz-gold)' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all"
              style={{
                background: input.trim() && !isLoading 
                  ? 'linear-gradient(135deg, var(--coz-gold), var(--coz-gold-dark))' 
                  : 'var(--border)',
                color: '#000',
                opacity: !input.trim() || isLoading ? 0.4 : 1,
              }}
              title="Send"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
