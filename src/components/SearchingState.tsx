'use client';

export function SearchingState({ query }: { query?: string }) {
  return (
    <div className="flex justify-start slide-up">
      <div
        className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
        style={{
          background: 'var(--bubble-assistant)',
          border: '1px solid var(--bubble-assistant-border)',
        }}
      >
        <span className="plugin-badge plugin-badge-search">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          Searching{query ? `: ${query}` : ''}
        </span>
        <div className="flex gap-1">
          <span className="dot w-1.5 h-1.5 rounded-full" style={{ background: 'var(--coz-gold)' }} />
          <span className="dot w-1.5 h-1.5 rounded-full" style={{ background: 'var(--coz-gold)' }} />
          <span className="dot w-1.5 h-1.5 rounded-full" style={{ background: 'var(--coz-gold)' }} />
        </div>
      </div>
    </div>
  );
}
