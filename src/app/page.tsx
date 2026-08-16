'use client';

import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { useSession, newSession } from '@/hooks/useSession';
import { useChat, Activity } from '@/hooks/useChat';

interface Conversation {
  id: string;
  title: string;
  createdAt: number;
}

/* ── Activity icons ── */
function ActivityIcon({ type }: { type: Activity['type'] }) {
  const common = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (type) {
    case 'thinking':
      return <svg {...common}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
    case 'searching':
      return <svg {...common}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
    case 'browsing':
      return <svg {...common}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>;
    case 'browsed':
      return <svg {...common}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>;
    case 'searched':
      return <svg {...common}><polyline points="20 6 9 17 4 12"/></svg>;
    case 'weather':
      return <svg {...common}><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>;
    case 'screenshot':
      return <svg {...common}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>;
    case 'memory':
      return <svg {...common}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
    case 'calculating':
      return <svg {...common}><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="8" y2="10"/><line x1="12" y1="10" x2="12" y2="10"/><line x1="16" y1="10" x2="16" y2="10"/></svg>;
    case 'translating':
      return <svg {...common}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>;
    case 'code_running':
      return <svg {...common}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>;
    case 'error':
      return <svg {...common}><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>;
    default:
      return <svg {...common}><circle cx="12" cy="12" r="10"/></svg>;
  }
}

/* ── Single activity row ── */
function ActivityRow({ activity, isLive }: { activity: Activity; isLive?: boolean }) {
  const isActive = isLive || ['thinking', 'searching', 'browsing', 'calculating', 'translating', 'code_running', 'weather', 'memory', 'screenshot'].includes(activity.type);
  const isDone = ['browsed', 'searched', 'screenshot'].includes(activity.type);
  const isError = activity.type === 'error';

  return (
    <div className="activity-row" style={{ opacity: isDone && !isLive ? 0.6 : 1 }}>
      <div
        className="activity-icon-wrap"
        style={{
          color: isError ? '#ef4444' : isDone ? '#22c55e' : 'var(--accent)',
        }}
      >
        {isActive ? (
          <span className="activity-spinner">
            <ActivityIcon type={activity.type} />
          </span>
        ) : (
          <ActivityIcon type={activity.type} />
        )}
      </div>
      <span className="activity-label" style={{ color: isError ? '#ef4444' : 'var(--text-dim)' }}>
        {activity.label}
        {activity.detail && <span className="activity-detail"> — {activity.detail}</span>}
      </span>
    </div>
  );
}

/* ── Search results card ── */
function SearchResultsCard({ results }: { results: { title: string; url: string }[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!results || results.length === 0) return null;
  const display = expanded ? results : results.slice(0, 3);

  return (
    <div className="activity-card" style={{ marginTop: 4 }}>
      {display.map((r, i) => (
        <a
          key={i}
          href={r.url}
          target="_blank"
          rel="noopener noreferrer"
          className="search-result-link"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0" style={{ color: 'var(--muted)' }}>
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
          <span className="truncate" style={{ color: 'var(--text-dim)' }}>{r.title || r.url}</span>
        </a>
      ))}
      {results.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="activity-expand-btn"
        >
          {expanded ? 'Show less' : `+${results.length - 3} more`}
        </button>
      )}
    </div>
  );
}

/* ── Browsed URL card (rich) ── */
function BrowsedCard({ activity }: { activity: Activity }) {
  const url = activity.url || '';
  const title = activity.title || '';
  const excerpt = activity.excerpt || '';
  const ogImage = activity.ogImage || '';
  const siteName = activity.siteName || '';
  const wordCount = activity.wordCount || 0;
  const via = activity.via || 'direct';

  let displayUrl = url;
  try {
    const u = new URL(url);
    displayUrl = u.hostname;
  } catch {}

  const viaLabel = via === 'jina' || via === 'jina-fallback' ? 'Jina Reader' : 'Direct fetch';

  return (
    <div className="activity-card browser-card" style={{ marginTop: 4 }}>
      {/* Use screenshot if available, otherwise og:image */}
      {activity.screenshotUrl ? (
        <div className="browser-thumb screenshot-thumb" style={{
          backgroundImage: `url(${activity.screenshotUrl})`,
        }} />
      ) : ogImage ? (
        <div className="browser-thumb" style={{
          backgroundImage: `url(${ogImage})`,
        }} />
      ) : null}
      <div className="browser-info">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="browser-title-link"
        >
          <span style={{ color: 'var(--text)', fontWeight: 500 }}>{title || displayUrl}</span>
        </a>
        {siteName && (
          <span className="browser-site">{siteName}</span>
        )}
        {excerpt && (
          <p className="browser-excerpt">{excerpt.slice(0, 150)}{(excerpt.length > 150) ? '…' : ''}</p>
        )}
        <div className="browser-meta">
          <span className="browser-meta-item">{displayUrl}</span>
          {wordCount > 0 && <span className="browser-meta-item">{wordCount.toLocaleString()} words</span>}
          <span className="browser-via">{viaLabel}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Screenshot card ── */
function ScreenshotCard({ activity }: { activity: Activity }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="activity-card screenshot-card" style={{ marginTop: 4 }}>
      <div className="screenshot-wrap">
        {!loaded && (
          <div className="screenshot-placeholder">
            <div className="activity-spinner" style={{ color: 'var(--accent)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            </div>
          </div>
        )}
        <img
          src={activity.screenshotUrl}
          alt={`Screenshot of ${activity.url || 'page'}`}
          className="screenshot-img"
          style={{ opacity: loaded ? 1 : 0 }}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(false)}
        />
      </div>
      {activity.url && (
        <a href={activity.url} target="_blank" rel="noopener noreferrer" className="screenshot-url">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          <span className="truncate">{activity.url}</span>
        </a>
      )}
    </div>
  );
}

/* ── Activity feed for a message ── */
function ActivityFeed({ activities, isLive }: { activities: Activity[]; isLive?: boolean }) {
  if (!activities || activities.length === 0) return null;
  return (
    <div className="activity-feed">
      {activities.map((act, i) => (
        <div key={act.id || i}>
          <ActivityRow activity={act} isLive={isLive && i === activities.length - 1} />
          {act.type === 'searched' && act.results && <SearchResultsCard results={act.results} />}
          {act.type === 'browsed' && act.url && <BrowsedCard activity={act} />}
          {act.type === 'screenshot' && act.screenshotUrl && <ScreenshotCard activity={act} />}
        </div>
      ))}
    </div>
  );
}

export default function ChatPage() {
  const sessionId = useSession();
  const { messages, isLoading, currentActivities, sendMessage, loadHistory } = useChat(sessionId);
  const [input, setInput] = useState('');
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  }, [messages, currentActivities]);

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
    if ((!input.trim() && pendingImages.length === 0) || isLoading) return;
    sendMessage(input || 'What do you see in this image?', pendingImages.length > 0 ? pendingImages : undefined);
    setInput('');
    setPendingImages([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleImageUpload = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      if (file.size > 5 * 1024 * 1024) return; // 5MB limit
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUri = e.target?.result as string;
        setPendingImages((prev) => [...prev, dataUri]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const dataUri = ev.target?.result as string;
            setPendingImages((prev) => [...prev, dataUri]);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const removePendingImage = (index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
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

  // Get the last assistant message id for live activities
  const lastAssistantId = messages.length > 0 ? [...messages].reverse().find(m => m.role === 'assistant')?.id : null;

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
          {isLoading && (
            <span className="flex items-center gap-1.5 ml-auto">
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#22c55e' }} />
              <span className="text-xs" style={{ color: 'var(--muted)' }}>active</span>
            </span>
          )}
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
                {/* User message */}
                {m.role === 'user' ? (
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-medium" style={{ background: '#5a5a5a', color: '#fff' }}>
                      U
                    </div>
                    <div className="flex-1 pt-1 min-w-0">
                      {/* Uploaded images */}
                      {m.images && m.images.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {m.images.map((img, i) => (
                            <img key={i} src={img} alt="upload" className="uploaded-image" />
                          ))}
                        </div>
                      )}
                      <div className="whitespace-pre-wrap break-words md-content text-[15px] leading-relaxed" style={{ color: 'var(--text)' }}>
                        {m.content}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Assistant message */
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold" style={{ background: 'var(--accent)', color: '#fff' }}>
                      C
                    </div>
                    <div className="flex-1 pt-1">
                      {/* Activity feed (past activities stored on message) */}
                      {m.activities && m.activities.length > 0 && !m.streaming && (
                        <ActivityFeed activities={m.activities} isLive={false} />
                      )}

                      {/* Live activities (current streaming message) */}
                      {m.streaming && m.id === lastAssistantId && currentActivities.length > 0 && (
                        <ActivityFeed activities={currentActivities} isLive={true} />
                      )}

                      {/* Message content */}
                      <div className="whitespace-pre-wrap break-words md-content text-[15px] leading-relaxed" style={{ color: 'var(--text)' }}>
                        {m.content}
                        {m.streaming && !m.content && currentActivities.length === 0 && (
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
                )}
              </div>
            ))}

            <div ref={bottomRef} />
          </div>
        </main>

        {/* Input */}
        <footer className="shrink-0 pb-4 pt-2">
          <div className="mx-auto w-full max-w-3xl px-4">
            {/* Pending image previews */}
            {pendingImages.length > 0 && (
              <div className="flex gap-2 mb-2 flex-wrap px-2">
                {pendingImages.map((img, i) => (
                  <div key={i} className="relative group">
                    <img src={img} alt="pending" className="w-16 h-16 rounded-lg object-cover" style={{ border: '1px solid var(--border)' }} />
                    <button
                      onClick={() => removePendingImage(i)}
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs"
                      style={{ background: 'var(--text)', color: 'var(--bg)' }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2 rounded-3xl px-4 py-3" style={{ background: 'var(--input-bg)' }}>
              {/* Image upload button */}
              <input
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                ref={fileInputRef}
                onChange={(e) => { handleImageUpload(e.target.files); e.target.value = ''; }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-opacity"
                style={{ color: 'var(--text-dim)' }}
                title="Upload image"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="Message Cozanet…"
                rows={1}
                className="flex-1 resize-none outline-none bg-transparent text-[15px] leading-relaxed"
                style={{ color: 'var(--text)', caretColor: 'var(--accent)' }}
              />
              <button
                onClick={handleSend}
                disabled={(!input.trim() && pendingImages.length === 0) || isLoading}
                className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-opacity"
                style={{
                  background: 'var(--accent)',
                  color: '#fff',
                  opacity: (!input.trim() && pendingImages.length === 0) || isLoading ? 0.4 : 1,
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
