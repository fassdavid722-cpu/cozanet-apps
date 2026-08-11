'use client';
import { useState, useEffect } from 'react';

/**
 * Returns a stable sessionId that persists in localStorage.
 */
export function useSession(): string {
  const [sessionId, setSessionId] = useState<string>('');

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

export function newSession(): string {
  const id = crypto.randomUUID();
  localStorage.setItem('cozanet-session-id', id);
  return id;
}
