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

export function useEntitlements(isAuthenticated: boolean): {
  entitlements: Entitlements | null;
  loading: boolean;
  refresh: () => void;
} {
  const token = useCloudAuthToken();
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const cachedAtRef = useRef<number>(0);

  useEffect(() => {
    if (!isAuthenticated || token === undefined) return;
    if (!token) {
      // Unauthenticated — show free defaults
      setEntitlements(DEFAULT_FREE);
      return;
    }

    // Don't re-fetch if we refreshed less than 2 minutes ago
    const age = Date.now() - cachedAtRef.current;
    if (entitlements && age < 120_000) return;

    setLoading(true);
    fetch(`${CLOUD_API_URL}/api/subscriptions/entitlements`, {
      headers: cloudHeaders(token),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<Entitlements>;
      })
      .then((data) => {
        setEntitlements(data);
        cachedAtRef.current = Date.now();
      })
      .catch(() => {
        // Network failure → fall back to free defaults so UI isn't broken
        if (!entitlements) setEntitlements(DEFAULT_FREE);
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAuthenticated, tick]);

  return {
    entitlements,
    loading,
    refresh: () => {
      cachedAtRef.current = 0;
      setTick((t) => t + 1);
    },
  };
}
