'use client';

import { useEffect, useRef, useState } from 'react';
import { CLOUD_API_URL, cloudHeaders, useCloudAuthToken } from './cloud-api';

export type PlanTier = 'free' | 'home' | 'classroom' | 'school' | 'district';

export type Entitlements = {
  tier: PlanTier;
  monthly_credits: number;
  credits_used: number;
  credits_remaining: number;
  status: string;
  period_end: string | null;
  trial_end: string | null;
  can_connect_robot: boolean;
  can_use_ai: boolean;
};

const DEFAULT_FREE: Entitlements = {
  tier: 'free',
  monthly_credits: 50,
  credits_used: 0,
  credits_remaining: 50,
  status: 'active',
  period_end: null,
  trial_end: null,
  can_connect_robot: false,
  can_use_ai: true,
};

const TIER_LABEL: Record<PlanTier, string> = {
  free:      'Explorer (Free)',
  home:      'Home',
  classroom: 'Classroom',
  school:    'School',
  district:  'District',
};

export function tierLabel(tier: PlanTier): string {
  return TIER_LABEL[tier] ?? tier;
}

// Module-level cache shared across all hook instances so any component that
// calls useEntitlements gets the already-fetched result immediately on mount.
let _cachedEntitlements: Entitlements | null = null;
let _cachedAt = 0;
let _inflight: Promise<Entitlements> | null = null;

export function useEntitlements(isAuthenticated: boolean): {
  entitlements: Entitlements | null;
  loading: boolean;
  refresh: () => void;
} {
  const token = useCloudAuthToken();
  const [entitlements, setEntitlements] = useState<Entitlements | null>(_cachedEntitlements);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isAuthenticated || token === undefined) return;
    if (!token) {
      setEntitlements(DEFAULT_FREE);
      return;
    }

    // Serve from cache if fresh (< 2 min)
    const age = Date.now() - _cachedAt;
    if (_cachedEntitlements && age < 120_000 && tick === 0) {
      setEntitlements(_cachedEntitlements);
      return;
    }

    // Deduplicate: reuse any in-flight request
    if (!_inflight) {
      setLoading(true);
      _inflight = fetch(`${CLOUD_API_URL}/api/subscriptions/entitlements`, {
        headers: cloudHeaders(token),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`${res.status}`);
          return res.json() as Promise<Entitlements>;
        })
        .then((data) => {
          _cachedEntitlements = data;
          _cachedAt = Date.now();
          return data;
        })
        .catch(() => {
          const fallback = _cachedEntitlements ?? DEFAULT_FREE;
          _cachedEntitlements = fallback;
          _cachedAt = Date.now();
          return fallback;
        })
        .finally(() => { _inflight = null; });
    }

    _inflight
      .then((data) => setEntitlements(data))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAuthenticated, tick]);

  return {
    entitlements,
    loading,
    refresh: () => {
      _cachedAt = 0;
      _cachedEntitlements = null;
      setTick((t) => t + 1);
    },
  };
}
