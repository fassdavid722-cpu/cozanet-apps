'use client';

import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { useSession, newSession } from '@/hooks/useSession';
import { useChat, Message, SearchStatus } from '@/hooks/useChat';

interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  preview: string;
}

export default function ChatPage() {
  const sessionId = useSession();
  const { messages, isLoading, error, searchStatus, sendMessage, loadHistory, clearChat, stopStreaming } = useChat(sessionId);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Theme init
  useEffect(() => {
    const saved = localStorage.getItem('cozanet-theme') as 'dark' | 'light' | null;
    if (saved) setTheme(saved);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cozanet-theme', theme);
  }, [theme]);

  // Load history
  useEffect(() => {
    if (sessionId && !historyLoaded) {
      loadHistory().then(() => setHistoryLoaded(true));
    }
  }, [sessionId, historyLoaded, loadHistory]);

  // Load conversations list from localStorage
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
      const lastMsg = messages[messages.length - 1];
      const conv: Conversation = {
        id: sessionId,
        title: firstUserMsg?.content.slice(0, 40) || 'New chat',
        createdAt: Date.now(),
        preview: lastMsg?.content.slice(0, 60) || '',
      };
      setConversations(prev => {
        const filtered = prev.filter(c => c.id !== sessionId);
        const updated = [conv, ...filtered].slice(0, 20);
        localStorage.setItem('cozanet-conversations', JSON.stringify(updated));
        return updated;
      });
    }
  }, [messages, sessionId]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, searchStatus]);

  // Textarea auto-grow
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
    }
  }, [input]);

  // Responsive sidebar
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      }
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

  const handleNewSession = () => {
    newSession();
    window.location.reload();
  };

  const handleSuggestion = (text: string) => {
    setInput(text);
    textareaRef.current?.focus();
  };

  const suggestions = [
    { icon: '🔍', text: 'Search the web for latest crypto news', desc: 'Web search' },
    { icon: '💡', text: 'Explain how blockchain consensus works', desc: 'Learn' },
    { icon: '📊', text: 'What is the current price of BNB?', desc: 'Market data' },
    { icon: '🤖', text: 'Help me write a TypeScript function', desc: 'Coding' },
  ];

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Sidebar — Desktop */}
      {sidebarOpen && (
        <aside
          className="hidden md:flex flex-col w-64 shrink-0 border-r"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
        >
          <SidebarContent
            conversations={conversations}
            currentSession={sessionId}
            onNewSession={handleNewSession}
            theme={theme}
            onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          />
        </aside>
      )}

      {/* Sidebar — Mobile overlay */}
      {mobileSidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside
            className="fixed left-0 top-0 bottom-0 z-50 w-64 sidebar-appear md:hidden flex flex-col border-r"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
          >
            <SidebarContent
              conversations={conversations}
              currentSession={sessionId}
              onNewSession={handleNewSession}
              theme={theme}
              onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              onNavigate={() => setMobileSidebarOpen(false)}
            />
          </aside>
        </>
      )}

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header
          className="flex items-center justify-between px-4 py-3 border-b shrink-0 glass"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setSidebarOpen(!sidebarOpen); setMobileSidebarOpen(!mobileSidebarOpen); }}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--muted)' }}
              title="Toggle sidebar"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-bold"
              style={{ background: 'linear-gradient(135deg, var(--accent), #a78bfa)' }}
            >
              C
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                Cozanet OS
              </span>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                AI Assistant · v0.3
              </span>
            </div>
            <span
              className="hidden sm:inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--success)' }} />
              Online
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-1.5 rounded-lg transition-colors theme-icon"
              style={{ color: 'var(--muted)', background: 'var(--surface)' }}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
            <button
              onClick={clearChat}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)' }}
              title="Clear current conversation"
            >
              Clear
            </button>
            <button
              onClick={handleNewSession}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors font-medium"
              style={{ color: 'white', background: 'var(--accent)' }}
              title="Start a new session"
            >
              + New
            </button>
          </div>
        </header>

        {/* Messages */}
        <main className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.length === 0 && historyLoaded && (
              <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                  🧠
                </div>
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Welcome to <span className="gradient-text">Cozanet OS</span>
                  </h2>
                  <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                    Your AI-native assistant. Ask anything — I search the web when needed.
                  </p>
                </div>
                {/* Suggestion cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg mt-4">
                  {suggestions.map((s, i) => (
                    <div
                      key={i}
                      className="suggestion-card rounded-xl p-4 border text-left"
                      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                      onClick={() => handleSuggestion(s.text)}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-xl">{s.icon}</span>
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            {s.text}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                            {s.desc}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {messages.map(msg => (
              <ChatMessage key={msg.id} message={msg} />
            ))}

            {/* Search status indicator */}
            {searchStatus.type === 'searching' && (
              <SearchIndicator query={searchStatus.query || ''} />
            )}

            {/* Search results preview */}
            {searchStatus.type === 'searched' && searchStatus.results && searchStatus.results.length > 0 && (
              <SearchResultsPreview results={searchStatus.results} />
            )}

            {/* Typing indicator */}
            {isLoading && messages[messages.length - 1]?.role !== 'assistant' && searchStatus.type === 'idle' && (
              <div className="flex gap-3 message-appear">
                <Avatar role="assistant" />
                <div
                  className="px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-1"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                  <span className="dot w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
                  <span className="dot w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
                  <span className="dot w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
                </div>
              </div>
            )}

            {error && (
              <div
                className="mx-auto max-w-sm text-xs text-center px-4 py-3 rounded-xl"
                style={{ background: 'var(--surface)', color: 'var(--danger)', border: '1px solid var(--danger)' }}
              >
                {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </main>

        {/* Input */}
        <footer
          className="shrink-0 px-4 py-4 border-t glass"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="max-w-3xl mx-auto">
            <div
              className="flex items-end gap-3 rounded-2xl px-4 py-3"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Cozanet OS…"
                rows={1}
                disabled={!sessionId}
                className="flex-1 resize-none bg-transparent outline-none text-sm leading-relaxed"
                style={{ color: 'var(--text-primary)', caretColor: 'var(--accent)' }}
              />
              {isLoading ? (
                <button
                  onClick={stopStreaming}
                  className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all"
                  style={{ background: 'var(--surface-active)', color: 'var(--danger)' }}
                  title="Stop"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || !sessionId}
                  className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all"
                  style={{
                    background: input.trim() ? 'var(--accent)' : 'var(--surface-active)',
                    color: input.trim() ? 'white' : 'var(--muted-soft)',
                    opacity: !sessionId ? 0.5 : 1,
                  }}
                  title="Send (Enter)"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                </button>
              )}
            </div>
            <p className="text-center text-xs mt-2" style={{ color: 'var(--muted-soft)' }}>
              Enter to send · Shift+Enter for newline · Web search activates automatically when needed
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}

/* ===== Sidebar ===== */
function SidebarContent({
  conversations,
  currentSession,
  onNewSession,
  theme,
  onToggleTheme,
  onNavigate,
}: {
  conversations: Conversation[];
  currentSession: string;
  onNewSession: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between px-4 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
            style={{ background: 'linear-gradient(135deg, var(--accent), #a78bfa)' }}
          >
            C
          </div>
          <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Cozanet OS</span>
        </div>
        <button
          onClick={onToggleTheme}
          className="p-1.5 rounded-lg transition-colors theme-icon"
          style={{ color: 'var(--muted)' }}
          title="Toggle theme"
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>

      <div className="p-3">
        <button
          onClick={onNewSession}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          New conversation
        </button>
      </div>

      <div className="flex-1 overflow-y-auto sidebar-scroll px-2 space-y-1">
        {conversations.length > 0 && (
          <p className="text-xs font-medium px-2 py-2" style={{ color: 'var(--muted-soft)' }}>Recent</p>
        )}
        {conversations.map(conv => (
          <button
            key={conv.id}
            onClick={() => {
              localStorage.setItem('cozanet-session-id', conv.id);
              if (onNavigate) onNavigate();
              window.location.reload();
            }}
            className="w-full text-left px-3 py-2.5 rounded-lg transition-colors text-sm group"
            style={{
              background: conv.id === currentSession ? 'var(--accent-soft)' : 'transparent',
              color: conv.id === currentSession ? 'var(--accent)' : 'var(--text)',
            }}
          >
            <p className="truncate font-medium" style={{ color: conv.id === currentSession ? 'var(--accent)' : 'var(--text)' }}>
              {conv.title}
            </p>
            {conv.preview && (
              <p className="truncate text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                {conv.preview}
              </p>
            )}
          </button>
        ))}
      </div>

      <div className="p-3 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 px-2 py-2">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
            style={{ background: 'var(--surface-active)', color: 'var(--muted)' }}
          >
            U
          </div>
          <span className="text-xs" style={{ color: 'var(--muted)' }}>User</span>
        </div>
      </div>
    </>
  );
}

/* ===== Chat Message ===== */
function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex gap-3 message-appear ${isUser ? 'flex-row-reverse' : ''}`}>
      <Avatar role={message.role} />
      <div className="flex flex-col gap-2 max-w-[80%] sm:max-w-[75%]">
        {/* Search results badge */}
        {message.searched && message.searchResults && message.searchResults.length > 0 && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}
          >
            <SearchIcon />
            <span>Searched: &ldquo;{message.searchQuery}&rdquo;</span>
          </div>
        )}
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap md-content ${
            isUser ? 'rounded-tr-sm' : 'rounded-tl-sm'
          } ${message.streaming ? 'streaming-cursor' : ''}`}
          style={{
            background: isUser ? 'var(--accent)' : 'var(--surface)',
            color: isUser ? 'white' : 'var(--text-primary)',
            border: isUser ? 'none' : '1px solid var(--border)',
          }}
        >
          {message.content || (message.streaming ? '' : '…')}
        </div>
      </div>
    </div>
  );
}

/* ===== Search Indicator ===== */
function SearchIndicator({ query }: { query: string }) {
  return (
    <div className="flex gap-3 message-appear">
      <Avatar role="assistant" />
      <div
        className="px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-2.5"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <SearchIcon spinning />
        <span className="text-sm search-pulse" style={{ color: 'var(--muted)' }}>
          Searching the web for &ldquo;{query}&rdquo;…
        </span>
      </div>
    </div>
  );
}

/* ===== Search Results Preview ===== */
function SearchResultsPreview({ results }: { results: { title: string; url: string }[] }) {
  return (
    <div className="flex gap-3 message-appear">
      <Avatar role="assistant" />
      <div className="flex flex-col gap-1.5 max-w-[75%]">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs" style={{ color: 'var(--muted)' }}>
          <SearchIcon />
          <span>Found {results.length} results</span>
        </div>
        <div className="flex flex-col gap-1">
          {results.slice(0, 3).map((r, i) => (
            <a
              key={i}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2.5 rounded-lg text-xs transition-colors hover:opacity-80"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <span style={{ color: 'var(--text-primary)' }}>{r.title}</span>
              <br />
              <span className="opacity-60" style={{ color: 'var(--muted)' }}>{r.url}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ===== Avatar ===== */
function Avatar({ role }: { role: 'user' | 'assistant' }) {
  return (
    <div
      className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-xs font-semibold"
      style={{
        background: role === 'user' ? 'var(--surface-active)' : 'linear-gradient(135deg, var(--accent), #a78bfa)',
        color: role === 'user' ? 'var(--muted)' : 'white',
      }}
    >
      {role === 'user' ? 'U' : 'C'}
    </div>
  );
}

/* ===== Search Icon ===== */
function SearchIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      className={spinning ? 'animate-spin' : ''}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      style={{ color: 'var(--accent)' }}
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
