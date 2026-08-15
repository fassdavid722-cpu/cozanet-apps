'use client';

interface PluginIndicatorProps {
  type: 'search' | 'memory' | 'browser';
  label?: string;
}

export function PluginIndicator({ type, label }: PluginIndicatorProps) {
  const config = {
    search: {
      badge: 'plugin-badge-search',
      icon: <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
      defaultLabel: 'Web Search',
    },
    memory: {
      badge: 'plugin-badge-memory',
      icon: <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>,
      defaultLabel: 'Memory',
    },
    browser: {
      badge: 'plugin-badge-browser',
      icon: <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>,
      defaultLabel: 'Browser',
    },
  };

  const c = config[type];

  return (
    <span className={`plugin-badge ${c.badge}`}>
      {c.icon}
      {label || c.defaultLabel}
    </span>
  );
}
