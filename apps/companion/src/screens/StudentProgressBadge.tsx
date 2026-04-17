/**
 * StudentProgressBadge — companion app mini XP/level/streak strip.
 *
 * Polls the local runtime's `/api/progress/{student_name}` endpoint and
 * shows the student's XP, level, and streak alongside the live classroom
 * info card so kids can see their score ticking up from the phone.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

export type StudentProgressBadgeProps = {
  backendUrl: string;
  studentName: string;
  pollIntervalMs?: number;
};

type ProgressEntry = {
  found: boolean;
  xp?: number;
  level?: number;
  level_name?: string;
  level_emoji?: string;
  badge_count?: number;
  streak_days?: number;
};

export function StudentProgressBadge({
  backendUrl,
  studentName,
  pollIntervalMs = 4000,
}: StudentProgressBadgeProps) {
  const [entry, setEntry] = useState<ProgressEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const xpPulse = useRef(new Animated.Value(1)).current;
  const prevXPRef = useRef<number>(0);

  useEffect(() => {
    if (!backendUrl || !studentName) return;
    let cancelled = false;

    const fetchProgress = async () => {
      try {
        const res = await fetch(
          `${backendUrl}/api/progress/${encodeURIComponent(studentName)}`,
          { cache: 'no-store' },
        );
        if (!res.ok || cancelled) return;
        const payload = (await res.json()) as ProgressEntry;
        if (cancelled) return;
        setEntry(payload);
        setError(null);

        const nextXP = payload.xp ?? 0;
        if (nextXP > prevXPRef.current && prevXPRef.current > 0) {
          xpPulse.setValue(1);
          Animated.sequence([
            Animated.timing(xpPulse, {
              toValue: 1.18,
              duration: 200,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(xpPulse, {
              toValue: 1,
              duration: 280,
              easing: Easing.inOut(Easing.cubic),
              useNativeDriver: true,
            }),
          ]).start();
        }
        prevXPRef.current = nextXP;
      } catch {
        if (!cancelled) setError('offline');
      }
    };

    void fetchProgress();
    const timer = setInterval(() => {
      void fetchProgress();
    }, pollIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [backendUrl, studentName, pollIntervalMs, xpPulse]);

  if (!entry?.found) {
    return (
      <View style={styles.cardIdle}>
        <Text style={styles.eyebrow}>Your progress</Text>
        <Text style={styles.copy}>
          {error
            ? 'Could not reach the classroom. Make sure the desktop is live.'
            : 'Draw on the desktop to start earning XP — it will show up here.'}
        </Text>
      </View>
    );
  }

  const xp = entry.xp ?? 0;
  const level = entry.level ?? 1;
  const levelName = entry.level_name ?? 'Doodler';
  const levelEmoji = entry.level_emoji ?? '✏️';
  const streak = entry.streak_days ?? 0;
  const badges = entry.badge_count ?? 0;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.eyebrow}>Your progress</Text>
        <Text style={styles.studentLabel} numberOfLines={1}>
          {studentName}
        </Text>
      </View>

      <View style={styles.levelRow}>
        <View style={styles.levelBadge}>
          <Text style={styles.levelEmoji}>{levelEmoji}</Text>
          <Text style={styles.levelNumber}>Lv {level}</Text>
        </View>
        <View style={styles.levelMeta}>
          <Text style={styles.levelName}>{levelName}</Text>
          <Animated.Text
            style={[styles.xp, { transform: [{ scale: xpPulse }] }]}
          >
            {xp.toLocaleString()} XP
          </Animated.Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statPill}>
          <Text style={styles.statLabel}>Streak</Text>
          <Text style={styles.statValue}>🔥 {streak}d</Text>
        </View>
        <View style={styles.statPill}>
          <Text style={styles.statLabel}>Badges</Text>
          <Text style={styles.statValue}>🏅 {badges}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: '#0d1525',
    borderWidth: 1,
    borderColor: '#1c2a46',
    gap: 12,
  },
  cardIdle: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: '#0d1525',
    borderWidth: 1,
    borderColor: '#1c2a46',
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: '#7be0ff',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  studentLabel: {
    color: '#a8c0e8',
    fontSize: 13,
    fontWeight: '700',
    maxWidth: '55%',
  },
  copy: {
    color: '#8096bf',
    fontSize: 14,
    lineHeight: 20,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  levelBadge: {
    width: 68,
    height: 68,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(123, 224, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(123, 224, 255, 0.24)',
  },
  levelEmoji: {
    fontSize: 26,
    lineHeight: 30,
  },
  levelNumber: {
    color: '#ffd76b',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  levelMeta: {
    flex: 1,
    gap: 4,
  },
  levelName: {
    color: '#f0f6ff',
    fontSize: 20,
    fontWeight: '900',
  },
  xp: {
    color: '#7be0ff',
    fontSize: 16,
    fontWeight: '800',
    alignSelf: 'flex-start',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statPill: {
    flex: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#091428',
    gap: 2,
  },
  statLabel: {
    color: '#7084aa',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  statValue: {
    color: '#e8f0ff',
    fontSize: 15,
    fontWeight: '800',
  },
});
