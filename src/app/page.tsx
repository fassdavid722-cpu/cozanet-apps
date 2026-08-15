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
    <div className="flex flex-col h-screen relative" style={{ background: 'var(--bg)', zIndex: 1 }}>
      {/* Ambient gradient overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(108, 43, 217, 0.08) 0%, transparent 50%)',
          zIndex: 0,
        }}
      />

      {/* Header — glassmorphic premium */}
      <header
        className="flex items-center justify-between px-4 py-3 shrink-0 relative z-10 glass"
        style={{ borderBottom: '1px solid var(--header-border)' }}
      >
        <div className="flex items-center gap-2.5">
          {/* Cozanet brand mark — gold gradient with glow */}
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center brand-mark"
              style={{ borderRadius: '10px' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2L3 7v6c0 5 3.5 9 9 11 5.5-2 9-6 9-11V7l-9-5z"
                  stroke="#0B0A0F"
                  strokeWidth="1.5"
                  fill="none"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="10" r="2.5" fill="#0B0A0F" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-[15px] tracking-tight" style={{ color: 'var(--text)' }}>
                Cozanet OS
              </span>
              <span className="text-[10px] font-medium" style={{ color: 'var(--text-dim)' }}>
                AI ASSISTANT
              </span>
            </div>
          </div>
          <span
            className="text-[10px] px-2 py-0.5 rounded-md font-semibold tracking-wide"
            style={{
              background: 'rgba(232, 184, 69, 0.1)',
              color: 'var(--coz-gold-bright)',
              border: '1px solid rgba(232, 184, 69, 0.15)',
            }}
          >
            BETA
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Plugin indicators */}
          <div className="flex items-center gap-1.5">
            <span className="plugin-badge plugin-badge-search">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              Search
            </span>
            <span className="plugin-badge plugin-badge-browser">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
              </svg>
              Browser
            </span>
            <span className="plugin-badge plugin-badge-memory">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
              </svg>
              Memory
            </span>
          </div>
          <button
            onClick={handleNewChat}
            className="p-1.5 rounded-lg transition-all"
            style={{ color: 'var(--text-dim)', background: 'transparent' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--coz-surface)'; e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-dim)'; }}
            title="New chat"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto relative z-10">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 space-y-4">
          {messages.length === 0 && historyLoaded && (
            <div className="flex flex-col items-center justify-center gap-5 text-center" style={{ minHeight: '55vh' }}>
              {/* Premium brand mark with glow */}
              <div className="relative">
                <div
                  className="absolute inset-0 rounded-2xl blur-2xl opacity-40"
                  style={{ background: 'var(--coz-gold-gradient)' }}
                />
                <div
                  className="relative w-20 h-20 rounded-2xl flex items-center justify-center pulse-gold brand-mark"
                  style={{ borderRadius: '16px' }}
                >
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 2L3 7v6c0 5 3.5 9 9 11 5.5-2 9-6 9-11V7l-9-5z"
                      stroke="#0B0A0F"
                      strokeWidth="1.5"
                      fill="none"
                      strokeLinejoin="round"
                    />
                    <circle cx="12" cy="10" r="2.5" fill="#0B0A0F" />
                  </svg>
                </div>
              </div>

              <div>
                <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>
                  Cozanet OS
                </h1>
                <p className="text-[14px] mt-1.5" style={{ color: 'var(--text-dim)' }}>
                  Your AI assistant — web search, memory, and browser built in.
                </p>
              </div>

              {/* Premium suggestion cards */}
              <div className="grid grid-cols-2 gap-2.5 mt-2 w-full max-w-lg">
                <button
                  onClick={() => { setInput('Search the web for latest crypto news'); }}
                  className="premium-card px-4 py-3 text-left group"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--coz-gold-bright)" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <span className="text-[12px] font-medium" style={{ color: 'var(--coz-gold-bright)' }}>Search</span>
                  </div>
                  <p className="text-[13px]" style={{ color: 'var(--text-dim)' }}>Find latest crypto news</p>
                </button>
                <button
                  onClick={() => { setInput('Browse defillama.com and show top protocols'); }}
                  className="premium-card px-4 py-3 text-left group"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
                    </svg>
                    <span className="text-[12px] font-medium" style={{ color: '#60A5FA' }}>Browser</span>
                  </div>
                  <p className="text-[13px]" style={{ color: 'var(--text-dim)' }}>Browse defillama.com</p>
                </button>
                <button
                  onClick={() => { setInput('Write a Python function to reverse a string'); }}
                  className="premium-card px-4 py-3 text-left group"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="2">
                      <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
                    </svg>
                    <span className="text-[12px] font-medium" style={{ color: '#A78BFA' }}>Code</span>
                  </div>
                  <p className="text-[13px]" style={{ color: 'var(--text-dim)' }}>Reverse a string in Python</p>
                </button>
                <button
                  onClick={() => { setInput('Help me plan my day'); }}
                  className="premium-card px-4 py-3 text-left group"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--coz-gold-bright)" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    <span className="text-[12px] font-medium" style={{ color: 'var(--coz-gold-bright)' }}>Plan</span>
                  </div>
                  <p className="text-[13px]" style={{ color: 'var(--text-dim)' }}>Help me plan my day</p>
                </button>
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

                {/* Assistant avatar for first message */}
                {m.role === 'assistant' && (
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="w-6 h-6 rounded-lg flex items-center justify-center brand-mark shrink-0"
                      style={{ borderRadius: '8px' }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path d="M12 2L3 7v6c0 5 3.5 9 9 11 5.5-2 9-6 9-11V7l-9-5z" stroke="#0B0A0F" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <span className="text-[11px] font-medium" style={{ color: 'var(--text-dim)' }}>Cozanet OS</span>
                  </div>
                )}

                {/* Message bubble */}
                <div
                  className="px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words md-content"
                  style={{
                    background: m.role === 'user'
                      ? 'var(--coz-gold-gradient)'
                      : 'var(--bubble-assistant)',
                    border: m.role === 'assistant' ? '1px solid var(--bubble-assistant-border)' : 'none',
                    color: m.role === 'user' ? '#0B0A0F' : 'var(--text)',
                    borderRadius: 'var(--radius-bubble)',
                    borderBottomRightRadius: m.role === 'user' ? '4px' : 'var(--radius-bubble)',
                    borderBottomLeftRadius: m.role === 'assistant' ? '4px' : 'var(--radius-bubble)',
                    boxShadow: m.role === 'user' ? '0 2px 12px rgba(232, 184, 69, 0.2)' : 'none',
                    fontWeight: m.role === 'user' ? '500' : '400',
                  }}
                >
                  {m.content}
                  {m.streaming && !m.content && (
                    <span className="flex gap-1 py-1">
                      <span className="dot w-1.5 h-1.5 rounded-full" style={{ background: 'var(--coz-gold)' }} />
                      <span className="dot w-1.5 h-1.5 rounded-full" style={{ background: 'var(--coz-gold)' }} />
                      <span className="dot w-1.5 h-1.5 rounded-full" style={{ background: 'var(--coz-gold)' }} />
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
              <div className="px-3 py-2 text-[13px] rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.15)' }}>
                ⚠️ Search failed: {searchStatus.error}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </main>

      {/* Input — premium glass with gold accent */}
      <footer
        className="shrink-0 relative z-10 glass"
        style={{ borderTop: '1px solid var(--header-border)' }}
      >
        <div className="mx-auto w-full max-w-3xl px-4 py-3">
          <div className="flex items-end gap-2.5">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Cozanet…"
              rows={1}
              className="premium-input flex-1 resize-none outline-none text-[15px] leading-relaxed rounded-3xl px-4 py-2.5"
              style={{ color: 'var(--text)', caretColor: 'var(--coz-gold-bright)' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="premium-send-btn shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
              style={{
                color: '#0B0A0F',
                opacity: !input.trim() || isLoading ? 0.4 : 1,
              }}
              title="Send"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>
          <p className="text-[10px] mt-2 text-center" style={{ color: 'var(--muted)' }}>
            Cozanet OS can search the web, browse sites, and remember context.
          </p>
        </div>
      </footer>
    </div>
  );
}
