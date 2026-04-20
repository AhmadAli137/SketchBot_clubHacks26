'use client';

import { useEffect, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from './supabase-browser';

/**
 * Base URL for the Aibotics cloud backend — holds API keys, validates auth.
 * All AI endpoints (tutor chat, TTS, evaluate) go here; hardware stays at the local runtime.
 */
export const CLOUD_API_URL =
  process.env.NEXT_PUBLIC_CLOUD_API_URL ?? 'https://sketchbot-backend.onrender.com';

/**
 * Returns the current Supabase access token (auto-refreshed).
 * Returns null if Supabase is not configured (dev without auth).
 */
export function useCloudAuthToken(): string | null {
  const [token, setToken] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const refresh = async () => {
      const { data } = await supabase.auth.getSession();
      setToken(data.session?.access_token ?? null);
    };

    void refresh();

    // Re-read on auth state change (sign-in, token refresh, sign-out)
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setToken(session?.access_token ?? null);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  return token;
}

/**
 * Build headers for a cloud API request.
 * Includes Authorization if a token is available.
 */
export function cloudHeaders(token: string | null): HeadersInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}
