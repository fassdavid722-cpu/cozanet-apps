'use client';

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';
import { useChat, type Activity } from '@/hooks/useChat';

// ── Session management ──
function useSession() {
  const [sessionId, setSessionId] = useState('');
  useEffect(() => {
    let id = localStorage.getItem('cozanet-session-id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('cozanet-session-id', id);
    }
    setSessionId(id);
  }, []);
  return sessionId;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDate(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function statusLabel(activity: Activity): string {
  switch (activity.type) {
    case 'thinking': return 'Thinking…';
    case 'searching': return `Searching for "${activity.detail}"…`;
    case 'searched': return activity.label;
    case 'browsing': return activity.detail ? `${activity.detail} ${activity.url || ''}` : `Browsing ${activity.url || ''}…`;
    case 'browsed': return `Read ${activity.title || activity.url}`;
    case 'screenshot': return 'Captured screenshot';
    case 'weather': return `Checking weather for ${activity.detail}…`;
    case 'memory': return activity.label;
    case 'calculating': return `Calculating ${activity.detail}…`;
    case 'translating': return 'Translating…';
    case 'code_running': return 'Running code…';
    case 'tool': return activity.label;
    case 'error': return activity.label;
    case 'key_detected': return '🔐 API key detected & saved';
    default: return activity.label;
  }
}

function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  html = html.replace(/```([\s\S]*?)```/g, (_m, code) => `<pre><code>${code.trim()}</code></pre>`);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);
  html = html.split(/\n{2,}/).map((p) => (p.startsWith('<ul>') || p.startsWith('<pre>') ? p : `<p>${p.replace(/\n/g, '<br/>')}</p>`)).join('');
  return html;
}

// ── Conversation list type ──
interface ConversationMeta {
  sessionId: string;
  lastMessage: string;
  lastTimestamp: number;
}

// ── Memory item type ──
interface MemoryItem {
  id: string;
  content: string;
  category: string;
  created_at: string;
}

export default function ChatPage() {
  const sessionId = useSession();
  const { messages, isLoading, currentActivities, sendMessage, loadHistory, clearChat } = useChat(sessionId);
  const [input, setInput] = useState('');
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [expandedShot, setExpandedShot] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'chats' | 'memories'>('chats');
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(false);

  // Load history when session changes
  useEffect(() => {
    if (sessionId && !historyLoaded) {
      loadHistory().then(() => setHistoryLoaded(true));
    }
  }, [sessionId, historyLoaded, loadHistory]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, currentActivities]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, [input]);

  // Load conversations list from localStorage
  useEffect(() => {
    const loadConversations = () => {
      try {
        const stored = localStorage.getItem('cozanet-conversations');
        if (stored) {
          setConversations(JSON.parse(stored));
        }
      } catch {}
    };
    loadConversations();
    // Refresh when sessionId changes
    window.addEventListener('storage', loadConversations);
    return () => window.removeEventListener('storage', loadConversations);
  }, []);

  // Save current conversation to the list
  useEffect(() => {
    if (messages.length > 0 && sessionId) {
      const lastMsg = messages[messages.length - 1];
      setConversations(prev => {
        const filtered = prev.filter(c => c.sessionId !== sessionId);
        const updated = [
          { sessionId, lastMessage: lastMsg.content?.slice(0, 80) || 'New chat', lastTimestamp: lastMsg.timestamp },
          ...filtered,
        ].slice(0, 50);
        localStorage.setItem('cozanet-conversations', JSON.stringify(updated));
        return updated;
      });
    }
  }, [messages, sessionId]);

  // Load memories when sidebar opens
  const loadMemories = useCallback(async () => {
    setMemoriesLoading(true);
    try {
      const resp = await fetch('/api/memory');
      if (resp.ok) {
        const data = await resp.json();
        setMemories(data.memories || []);
      }
    } catch {}
    setMemoriesLoading(false);
  }, []);

  useEffect(() => {
    if (sidebarOpen && sidebarTab === 'memories' && memories.length === 0) {
      loadMemories();
    }
  }, [sidebarOpen, sidebarTab, memories.length, loadMemories]);

  const handleSend = () => {
    if ((!input.trim() && pendingImages.length === 0) || isLoading) return;
    sendMessage(input || 'What do you see in this image?', pendingImages.length > 0 ? pendingImages : undefined);
    setInput('');
    setPendingImages([]);
  };

  const handleImageFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      if (file.size > 5 * 1024 * 1024) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUri = e.target?.result as string;
        setPendingImages((prev) => [...prev, dataUri]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => setPendingImages((prev) => [...prev, ev.target?.result as string]);
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
    clearChat();
    const newId = crypto.randomUUID();
    localStorage.setItem('cozanet-session-id', newId);
    window.location.reload();
  };

  const handleSwitchConversation = (convSessionId: string) => {
    localStorage.setItem('cozanet-session-id', convSessionId);
    setSidebarOpen(false);
    window.location.reload();
  };

  const handleDeleteMemory = async (id: string) => {
    try {
      await fetch('/api/memory', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setMemories(prev => prev.filter(m => m.id !== id));
    } catch {}
  };

  const lastAssistant = messages[messages.length - 1];
  const isStreamingLast = lastAssistant?.role === 'assistant' && lastAssistant.streaming;

  // Collect all screenshots from current activities
  const liveScreenshots = currentActivities.filter(a => a.screenshotUrl).map(a => a.screenshotUrl!);
  const liveShot = liveScreenshots[liveScreenshots.length - 1];

  return (
    <div className="app-root">
      {/* ── Sidebar Overlay ── */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* ── Sidebar ── */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="bot-avatar small">C</div>
            <span>Cozanet AI</span>
          </div>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* New chat button */}
        <button className="new-chat-btn" onClick={handleNewChat}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Chat
        </button>

        {/* Tabs */}
        <div className="sidebar-tabs">
          <button className={`tab ${sidebarTab === 'chats' ? 'active' : ''}`} onClick={() => setSidebarTab('chats')}>
            Chats
          </button>
          <button className={`tab ${sidebarTab === 'memories' ? 'active' : ''}`} onClick={() => setSidebarTab('memories')}>
            Memories
          </button>
        </div>

        {/* Tab content */}
        <div className="sidebar-content">
          {sidebarTab === 'chats' && (
            <div className="chat-list">
              {conversations.length === 0 ? (
                <div className="empty-sidebar">No conversations yet. Start chatting!</div>
              ) : (
                conversations.map(conv => (
                  <button
                    key={conv.sessionId}
                    className={`chat-item ${conv.sessionId === sessionId ? 'active' : ''}`}
                    onClick={() => handleSwitchConversation(conv.sessionId)}
                  >
                    <div className="chat-item-preview">
                      {conv.lastMessage || 'New chat'}
                    </div>
                    <div className="chat-item-time">{formatDate(conv.lastTimestamp)}</div>
                  </button>
                ))
              )}
            </div>
          )}

          {sidebarTab === 'memories' && (
            <div className="memory-list">
              {memoriesLoading ? (
                <div className="empty-sidebar">Loading memories…</div>
              ) : memories.length === 0 ? (
                <div className="empty-sidebar">No memories saved yet. The AI will remember things automatically.</div>
              ) : (
                memories.map(mem => (
                  <div key={mem.id} className="memory-item">
                    <div className="memory-content">{mem.content}</div>
                    <div className="memory-meta">
                      <span className="memory-cat">{mem.category}</span>
                      <button className="memory-delete" onClick={() => handleDeleteMemory(mem.id)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </aside>

      {/* ── Main chat area ── */}
      <div className="chat-shell">
        {/* Header with hamburger */}
        <header className="chat-header">
          <button className="hamburger-btn" onClick={() => setSidebarOpen(!sidebarOpen)} title="Menu">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div className="bot-avatar">C</div>
          <div className="header-info">
            <div className="header-name">Cozanet AI</div>
            <div className="header-status">
              <span className="status-dot" />
              Online
            </div>
          </div>
          <button className="header-btn" onClick={handleNewChat} title="New chat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </header>

        {/* Messages */}
        <div className="chat-scroll" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="empty-state">
              <div className="bot-avatar">C</div>
              <h2>Cozanet AI</h2>
              <p>Ask me anything — I can browse the web, look at images, and remember our conversation.</p>
            </div>
          )}

          {messages.map((m) => {
            const isLastStreaming = m.streaming && m.id === lastAssistant?.id;
            const msgScreenshots = (m.activities || []).filter(a => a.screenshotUrl).map(a => a.screenshotUrl!);

            return (
              <div key={m.id}>
                <div className={`msg-row ${m.role}`}>
                  <div className="bubble-col">
                    {m.images && m.images.length > 0 && (
                      <div className="bubble-images">
                        {m.images.map((img, i) => (
                          <img key={i} src={img} alt="attachment" />
                        ))}
                      </div>
                    )}
                    {(m.content || !isLastStreaming) && (
                      <div className={`bubble ${m.role}`}>
                        {m.role === 'assistant' ? (
                          <span
                            className="md-inline"
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
                          />
                        ) : (
                          m.content
                        )}
                        {m.streaming && m.content && <span className="streaming-cursor" />}
                      </div>
                    )}
                    {m.content && (
                      <div className="bubble-time">{formatTime(m.timestamp)}</div>
                    )}
                  </div>
                </div>

                {/* API key detection cards */}
                {(m.activities || []).filter(a => a.type === 'key_detected' && a.keys).map((act) => (
                  <div key={act.id} className="msg-row assistant">
                    <div className="bubble-col">
                      <div className="key-detected-card">
                        <div className="key-detected-header">
                          <span className="key-icon">🔐</span>
                          <span className="key-title">API Key Auto-Detected</span>
                        </div>
                        {act.keys!.map((k, i) => (
                          <div key={i} className={`key-item ${k.stored ? 'key-stored' : 'key-failed'}`}>
                            <div className="key-service">{k.serviceName}</div>
                            <div className="key-name">{k.keyName}</div>
                            <div className="key-value">{k.masked}</div>
                            <div className="key-status">
                              {k.stored ? '✓ Saved' : `✗ ${k.error || 'Failed'}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Screenshot thumbnails from completed browse activities */}
                {msgScreenshots.length > 0 && m.content && (
                  <div className="msg-row assistant">
                    <div className="bubble-col">
                      <div className="shot-strip">
                        {msgScreenshots.map((shot, i) => (
                          <div key={i} className="shot-thumb" onClick={() => setExpandedShot(shot)}>
                            <img src={shot} alt="page screenshot" />
                            <div className="shot-overlay">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                              </svg>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Live status + screenshot while streaming */}
                {isLastStreaming && currentActivities.length > 0 && (
                  <div className="msg-row assistant">
                    <div className="bubble-col">
                      {currentActivities.slice(-1).map((act) => (
                        <div key={act.id}>
                          <div className="status-line">
                            <span className="status-spinner" />
                            {statusLabel(act)}
                          </div>
                          {act.screenshotUrl && (
                            <div className="live-shot" onClick={() => setExpandedShot(act.screenshotUrl!)}>
                              <img src={act.screenshotUrl} alt="browsing screenshot" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Typing indicator before first token */}
                {isLastStreaming && currentActivities.length === 0 && !m.content && (
                  <div className="msg-row assistant">
                    <div className="bubble-col">
                      <div className="typing-row">
                        <div className="typing-dots">
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Pending images */}
        {pendingImages.length > 0 && (
          <div className="pending-images-row">
            {pendingImages.map((img, i) => (
              <div key={i} className="pending-image-item">
                <img src={img} alt="pending" />
                <button className="pending-image-remove" onClick={() => removePendingImage(i)}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="chat-input-wrap">
          <div className="input-bar">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => handleImageFiles(e.target.files)}
            />
            <button className="icon-btn" onClick={() => fileInputRef.current?.click()} title="Attach image">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <textarea
              ref={textareaRef}
              className="chat-textarea"
              placeholder="Type a message…"
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
            />
            <button
              className="send-btn"
              onClick={handleSend}
              disabled={(!input.trim() && pendingImages.length === 0) || isLoading}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Screenshot modal */}
      {expandedShot && (
        <div className="shot-modal" onClick={() => setExpandedShot(null)}>
          <img src={expandedShot} alt="screenshot" />
        </div>
      )}
    </div>
  );
}
