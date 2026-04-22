'use client';

import { useEffect, useRef, useState } from 'react';

import { CLOUD_API_URL } from './cloud-api';
import type { ChallengePack, Subject } from './platform-types';

const CACHE_MS = 5 * 60 * 1000; // 5 minutes

let _cachedPacks: ChallengePack[] | null = null;
let _cachedAt = 0;

function fromApiPack(raw: Record<string, unknown>): ChallengePack {
  return {
    id: String(raw.id ?? ''),
    robotId: String(raw.robot_id ?? raw.robotId ?? 'sketchbot'),
    conceptId: raw.concept_id != null ? String(raw.concept_id) : undefined,
    name: String(raw.name ?? ''),
    description: String(raw.description ?? ''),
    challenges: Array.isArray(raw.challenges)
      ? (raw.challenges as Record<string, unknown>[]).map((c) => ({
          id: String(c.id ?? ''),
          packId: String(c.pack_id ?? c.packId ?? raw.id ?? ''),
          robotId: String(c.robot_id ?? c.robotId ?? 'sketchbot'),
          requiredModules: Array.isArray(c.required_modules) ? (c.required_modules as string[]) : [],
          title: String(c.title ?? ''),
          subtitle: c.subtitle != null ? String(c.subtitle) : undefined,
          description: String(c.description ?? ''),
          subjects: Array.isArray(c.subjects) ? (c.subjects as Subject[]) : [],
          difficulty: (Number(c.difficulty ?? 1) as 1 | 2 | 3 | 4 | 5),
          estimatedMinutes: Number(c.estimated_minutes ?? c.estimatedMinutes ?? 10),
          learningObjectives: Array.isArray(c.learning_objectives)
            ? (c.learning_objectives as string[])
            : [],
          steps: Array.isArray(c.steps)
            ? (c.steps as Record<string, unknown>[]).map((s) => ({
                id: String(s.id ?? ''),
                tutorMessage: String(s.tutor_message ?? s.tutorMessage ?? ''),
                hint: s.hint != null ? String(s.hint) : undefined,
                robotAction: (s.robot_action ?? s.robotAction) != null
                  ? {
                      type: String(((s.robot_action ?? s.robotAction) as Record<string, unknown>).type ?? ''),
                      payload: ((s.robot_action ?? s.robotAction) as Record<string, unknown>).payload as Record<string, unknown> | undefined,
                    }
                  : undefined,
                studentPrompt: s.student_prompt != null ? String(s.student_prompt) : s.studentPrompt != null ? String(s.studentPrompt) : undefined,
                reflectionQuestion: s.reflection_question != null ? String(s.reflection_question) : s.reflectionQuestion != null ? String(s.reflectionQuestion) : undefined,
                completionCondition: String(s.completion_condition ?? s.completionCondition ?? 'student-confirms') as 'automatic' | 'student-confirms' | 'camera-detects',
                durationHint: s.duration_hint != null ? Number(s.duration_hint) : s.durationHint != null ? Number(s.durationHint) : undefined,
              }))
            : [],
          completionBadge: c.completion_badge != null
            ? {
                id: String((c.completion_badge as Record<string, unknown>).id ?? ''),
                name: String((c.completion_badge as Record<string, unknown>).name ?? ''),
                description: String((c.completion_badge as Record<string, unknown>).description ?? ''),
                icon: String((c.completion_badge as Record<string, unknown>).icon ?? ''),
              }
            : undefined,
          prerequisiteChallengeIds: Array.isArray(c.prerequisite_challenge_ids)
            ? (c.prerequisite_challenge_ids as string[])
            : [],
        }))
      : [],
  };
}

async function fetchPacks(url: string): Promise<ChallengePack[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { packs?: Record<string, unknown>[] };
  return (data.packs ?? []).map(fromApiPack);
}

export function useChallenges(robotId = 'sketchbot', localApiBase?: string) {
  const [packs, setPacks] = useState<ChallengePack[]>(_cachedPacks ?? []);
  const [loading, setLoading] = useState(_cachedPacks === null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    if (_cachedPacks && Date.now() - _cachedAt < CACHE_MS) {
      setPacks(_cachedPacks);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        // Priority: local runtime → cloud API → bundled static file (always works)
        const urls = [
          localApiBase ? `${localApiBase}/api/challenges/${robotId}` : null,
          `${CLOUD_API_URL}/api/challenges/${robotId}`,
          '/challenges.json', // static fallback bundled with the renderer
        ].filter(Boolean) as string[];

        let mapped: ChallengePack[] | null = null;
        for (const url of urls) {
          try {
            mapped = await fetchPacks(url);
            if (mapped.length > 0) break;
          } catch {
            // try next source
          }
        }

        if (!cancelled && mapped && mapped.length > 0) {
          _cachedPacks = mapped;
          _cachedAt = Date.now();
          setPacks(mapped);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [robotId, localApiBase]);

  return { packs, loading };
}
