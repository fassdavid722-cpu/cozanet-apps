'use client';
import { useState } from 'react';

/**
 * Returns a stable sessionId that persists in localStorage.
 * Uses lazy initialization so the value is available on first render.
 */
export function useSession(): string {
  const [sessionId] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    let id = localStorage.getItem('cozanet-session-id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('cozanet-session-id', id);
    }
    return id;
  });

  return sessionId;
}

export function newSession(): string {
  const id = crypto.randomUUID();
  localStorage.setItem('cozanet-session-id', id);
  return id;
}
