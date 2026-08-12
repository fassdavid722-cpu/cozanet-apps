'use client';

import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { useSession, newSession } from '@/hooks/useSession';
import { useChat } from '@/hooks/useChat';

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
      {/* Header */}
      <header
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: 'var(--border)', background: 'var(--header-bg)' }}
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: 'var(--online)' }} />
          <span className="font-semibold text-[15px]" style={{ color: 'var(--text)' }}>
            Cozanet OS
          </span>
        </div>
        <button
          onClick={handleNewChat}
          className="p-1.5 rounded-md transition-colors"
          style={{ color: 'var(--muted)' }}
          title="New chat"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </header>

      {/* Messages — centered with max-width like ChatGPT/Claude */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 space-y-4">
          {messages.length === 0 && historyLoaded && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center" style={{ minHeight: '50vh' }}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'var(--bubble-assistant)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.5">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                </svg>
              </div>
              <p className="text-base" style={{ color: 'var(--text-dim)' }}>
                How can I help you today?
              </p>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`flex message-appear ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className="max-w-[80%] px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words md-content"
                style={{
                  background: m.role === 'user' ? 'var(--bubble-user)' : 'var(--bubble-assistant)',
                  color: '#fff',
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
          ))}

          {searchStatus.type === 'searching' && (
            <div className="flex justify-start">
              <div className="px-4 py-2 text-[13px] rounded-full" style={{ background: 'var(--bubble-assistant)', color: 'var(--text-dim)' }}>
                🔍 Searching the web…
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </main>

      {/* Input — centered to match message width */}
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
              style={{ background: 'var(--input-bg)', color: 'var(--text)', caretColor: 'var(--bubble-user)' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-opacity"
              style={{
                background: 'var(--bubble-user)',
                color: '#fff',
                opacity: !input.trim() || isLoading ? 0.4 : 1,
              }}
              title="Send"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
