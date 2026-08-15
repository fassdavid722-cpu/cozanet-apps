'use client';

import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { useSession, newSession } from '@/hooks/useSession';
import { useChat } from '@/hooks/useChat';

interface Conversation {
  id: string;
  title: string;
  createdAt: number;
}

export default function ChatPage() {
  const sessionId = useSession();
  const { messages, isLoading, searchStatus, sendMessage, loadHistory } = useChat(sessionId);
  const [input, setInput] = useState('');
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
    }
  }, [input]);

  // Load conversation list from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('cozanet-conversations');
    if (stored) {
      try { setConversations(JSON.parse(stored)); } catch {}
    }
  }, []);

  // Save conversation when messages change
  useEffect(() => {
    if (messages.length > 0 && sessionId) {
      const firstUserMsg = messages.find(m => m.role === 'user');
      const conv: Conversation = {
        id: sessionId,
        title: firstUserMsg?.content.slice(0, 40) || 'New chat',
        createdAt: Date.now(),
      };
      setConversations(prev => {
        const filtered = prev.filter(c => c.id !== sessionId);
        const updated = [conv, ...filtered].slice(0, 30);
        localStorage.setItem('cozanet-conversations', JSON.stringify(updated));
        return updated;
      });
    }
  }, [messages, sessionId]);

  // Close sidebar on mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) setSidebarOpen(false);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const switchToSession = (id: string) => {
    localStorage.setItem('cozanet-session-id', id);
    window.location.reload();
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Sidebar */}
      {sidebarOpen && (
        <aside
          className="hidden md:flex flex-col w-[260px] shrink-0 sidebar-appear"
          style={{ background: 'var(--bg-sidebar)' }}
        >
          {/* New chat button */}
          <div className="p-3">
            <button
              onClick={handleNewChat}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-colors hover:bg-[var(--bg-hover)]"
              style={{ color: 'var(--text)' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New chat
            </button>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5">
            <p className="text-xs font-medium px-3 py-2" style={{ color: 'var(--muted)' }}>Recent</p>
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => switchToSession(c.id)}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-left transition-colors hover:bg-[var(--bg-hover)]"
                style={{
                  background: c.id === sessionId ? 'var(--bg-active)' : 'transparent',
                  color: c.id === sessionId ? 'var(--text)' : 'var(--text-dim)',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span className="truncate">{c.title}</span>
              </button>
            ))}
          </div>
        </aside>
      )}

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {sidebarOpen && (
        <aside
          className="fixed left-0 top-0 bottom-0 z-50 w-[260px] sidebar-appear md:hidden flex flex-col"
          style={{ background: 'var(--bg-sidebar)' }}
        >
          <div className="p-3">
            <button
              onClick={handleNewChat}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-colors hover:bg-[var(--bg-hover)]"
              style={{ color: 'var(--text)' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New chat
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5">
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => switchToSession(c.id)}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-left transition-colors hover:bg-[var(--bg-hover)]"
                style={{
                  background: c.id === sessionId ? 'var(--bg-active)' : 'transparent',
                  color: c.id === sessionId ? 'var(--text)' : 'var(--text-dim)',
                }}
              >
                <span className="truncate">{c.title}</span>
              </button>
            ))}
          </div>
        </aside>
      )}

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top bar */}
        <header className="flex items-center gap-3 px-4 py-3 shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-dim)' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="font-semibold text-[15px]" style={{ color: 'var(--text)' }}>
            Cozanet OS
          </span>
        </header>

        {/* Messages */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-6">
            {messages.length === 0 && historyLoaded && (
              <div className="flex flex-col items-center justify-center text-center gap-4" style={{ minHeight: '50vh' }}>
                <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'var(--bg-hover)' }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.5">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                  </svg>
                </div>
                <p className="text-lg" style={{ color: 'var(--text-dim)' }}>
                  How can I help you today?
                </p>
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className="message-appear py-3">
                {/* User message — no bubble, just text with avatar */}
                {m.role === 'user' ? (
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-medium" style={{ background: '#5a5a5a', color: '#fff' }}>
                      U
                    </div>
                    <div className="flex-1 pt-1 whitespace-pre-wrap break-words md-content text-[15px] leading-relaxed" style={{ color: 'var(--text)' }}>
                      {m.content}
                    </div>
                  </div>
                ) : (
                  /* Assistant message — no bubble, just text with avatar */
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold" style={{ background: 'var(--accent)', color: '#fff' }}>
                      C
                    </div>
                    <div className="flex-1 pt-1 whitespace-pre-wrap break-words md-content text-[15px] leading-relaxed" style={{ color: 'var(--text)' }}>
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
                )}
              </div>
            ))}

            {/* Tool status indicators */}
            {searchStatus.type === 'searching' && (
              <div className="flex gap-4 py-3">
                <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold" style={{ background: 'var(--accent)', color: '#fff' }}>
                  C
                </div>
                <div className="flex-1 pt-1">
                  <span className="text-[14px]" style={{ color: 'var(--text-dim)' }}>
                    🔍 Searching the web…
                  </span>
                </div>
              </div>
            )}

            {searchStatus.type === 'browsing' && (
              <div className="flex gap-4 py-3">
                <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold" style={{ background: 'var(--accent)', color: '#fff' }}>
                  C
                </div>
                <div className="flex-1 pt-1">
                  <span className="text-[14px]" style={{ color: 'var(--text-dim)' }}>
                    🌐 Browsing{searchStatus.url ? ` — ${searchStatus.url}` : '…'}
                  </span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </main>

        {/* Input */}
        <footer className="shrink-0 pb-4 pt-2">
          <div className="mx-auto w-full max-w-3xl px-4">
            <div className="flex items-end gap-2 rounded-3xl px-4 py-3" style={{ background: 'var(--input-bg)' }}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Cozanet…"
                rows={1}
                className="flex-1 resize-none outline-none bg-transparent text-[15px] leading-relaxed"
                style={{ color: 'var(--text)', caretColor: 'var(--accent)' }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-opacity"
                style={{
                  background: 'var(--accent)',
                  color: '#fff',
                  opacity: !input.trim() || isLoading ? 0.4 : 1,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              </button>
            </div>
            <p className="text-center text-xs mt-2" style={{ color: 'var(--muted)' }}>
              Cozanet AI can make mistakes. Verify important info.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
