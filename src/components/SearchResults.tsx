'use client';

import { useState } from 'react';

interface SearchResultsProps {
  query: string;
  results: { title: string; url: string }[];
}

export function SearchResults({ query, results }: SearchResultsProps) {
  const [expanded, setExpanded] = useState(false);

  if (!results || results.length === 0) return null;

  const domain = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  return (
    <div className="mb-2 slide-up">
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer"
        style={{
          background: 'rgba(232, 184, 69, 0.04)',
          border: '1px solid rgba(232, 184, 69, 0.12)',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="plugin-badge plugin-badge-search">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          Web Search
        </span>
        <span className="text-[13px]" style={{ color: 'var(--text-dim)' }}>
          {results.length} results for &ldquo;{query}&rdquo;
        </span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2"
          style={{ marginLeft: 'auto', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {expanded && (
        <div className="mt-2 space-y-2">
          {results.map((r, i) => (
            <a
              key={i}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="search-result-card block group"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="citation-badge">{i + 1}</span>
                <span className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
                  {domain(r.url)}
                </span>
              </div>
              <p className="text-[14px] font-medium transition-colors" style={{ color: 'var(--text)' }}>
                {r.title}
              </p>
              <p className="text-[12px] mt-0.5 truncate" style={{ color: 'var(--text-dim)' }}>
                {r.url}
              </p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
