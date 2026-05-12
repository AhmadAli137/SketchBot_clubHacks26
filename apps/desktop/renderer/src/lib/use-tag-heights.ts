'use client';

/**
 * Read / update the AprilTag service's per-tag height registry.
 *
 * Heights feed the parallax-correct back-projection in
 * apriltag_service.py: the corner tags should be 0 mm (they lie on
 * the paper), the bot tag should match the chassis mount height.
 * Wrong heights → robot pose reads with a systematic offset.
 */

import { useCallback, useEffect, useState } from 'react';

export type TagHeights = Record<number, number>;

type State = {
  heights:   TagHeights;
  isLoading: boolean;
  error:     string | null;
};

const parse = (raw: Record<string, number>): TagHeights => {
  const out: TagHeights = {};
  for (const [k, v] of Object.entries(raw)) {
    const id = Number(k);
    if (Number.isFinite(id) && Number.isFinite(v)) out[id] = v;
  }
  return out;
};

export function useTagHeights({
  apiBase,
  enabled = true,
}: {
  apiBase: string;
  enabled?: boolean;
}) {
  const [state, setState] = useState<State>({
    heights:   {},
    isLoading: false,
    error:     null,
  });

  const refresh = useCallback(async () => {
    if (!enabled || !apiBase) {
      setState({ heights: {}, isLoading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const res = await fetch(`${apiBase}/api/apriltag/tag-heights`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Record<string, number>;
      setState({ heights: parse(data), isLoading: false, error: null });
    } catch (err) {
      setState({
        heights:   {},
        isLoading: false,
        error:     err instanceof Error ? err.message : 'unknown',
      });
    }
  }, [apiBase, enabled]);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = useCallback(async (updates: TagHeights) => {
    if (!apiBase) throw new Error('No runtime configured');
    const res = await fetch(`${apiBase}/api/apriltag/tag-heights`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ heights: updates }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { detail?: string };
      throw new Error(body?.detail ?? `HTTP ${res.status}`);
    }
    const data = (await res.json()) as Record<string, number>;
    const parsed = parse(data);
    setState({ heights: parsed, isLoading: false, error: null });
    return parsed;
  }, [apiBase]);

  return { heights: state.heights, isLoading: state.isLoading, error: state.error, refresh, save };
}
