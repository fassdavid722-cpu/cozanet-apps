'use client';

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';
import { useChat, type Activity } from '@/hooks/useChat';

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

function statusLabel(activity: Activity): string {
  switch (activity.type) {
    case 'thinking': return 'Thinking…';
    case 'searching': return `Searching for "${activity.detail}"…`;
    case 'searched': return activity.label;
    case 'browsing': return `Browsing ${activity.url}…`;
    case 'browsed': return `Read ${activity.title || activity.url}`;
    case 'screenshot': return 'Captured screenshot';
    case 'weather': return `Checking weather for ${activity.detail}…`;
    case 'memory': return activity.label;
    case 'calculating': return `Calculating ${activity.detail}…`;
    case 'translating': return 'Translating…';
    case 'code_running': return 'Running code…';
    case 'tool': return activity.label;
    case 'error': return activity.label;
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

  useEffect(() => {
    if (sessionId && !historyLoaded) {
      loadHistory().then(() => setHistoryLoaded(true));
    }
  }, [sessionId, historyLoaded, loadHistory]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, currentActivities]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, [input]);

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
    localStorage.removeItem('cozanet-session-id');
    window.location.reload();
  };

  const lastAssistant = messages[messages.length - 1];
  const isStreamingLast = lastAssistant?.role === 'assistant' && lastAssistant.streaming;

  // Collect all screenshots from current activities
  const liveScreenshots = currentActivities.filter(a => a.screenshotUrl).map(a => a.screenshotUrl!);
  const liveShot = liveScreenshots[liveScreenshots.length - 1];

  return (
    <div className="chat-shell">
      {/* Header */}
      <header className="chat-header">
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
          // Collect screenshots from this message's activities
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
                  <div className="typing-row">
                    Cozanet AI is typing
                    <span className="typing-dots">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Expanded screenshot modal */}
      {expandedShot && (
        <div className="shot-modal" onClick={() => setExpandedShot(null)}>
          <img src={expandedShot} alt="expanded screenshot" />
          <div className="shot-modal-close" onClick={(e) => { e.stopPropagation(); setExpandedShot(null); }}>×</div>
        </div>
      )}

      {/* Input */}
      <div className="chat-input-wrap">
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
        <div className="input-bar">
          <input
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            ref={fileInputRef}
            onChange={(e) => { handleImageFiles(e.target.files); e.target.value = ''; }}
          />
          <button className="icon-btn" onClick={() => fileInputRef.current?.click()} title="Attach image">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Type a message…"
            rows={1}
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
  );
}
