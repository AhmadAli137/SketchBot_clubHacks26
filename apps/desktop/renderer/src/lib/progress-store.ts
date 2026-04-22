// ─── Student Progress Store ───────────────────────────────────────────────────
// localStorage-backed persistence for student progress, badges, drawings,
// XP, levels, streaks, and scoring.
// Keyed by student name — simple for v1 classroom use.

import type {
  AgeGroup,
  ConceptLayer,
  ConceptProgress,
  DrawingRecord,
  InputMode,
  LayerProgress,
  ProfileAvatarKind,
  ScoreRecord,
  StreakData,
  StudentProgress,
} from './concept-types';

import { rollChest, SPARK_RATES, CHESTS } from './game-economy';

const STORAGE_KEY = 'sketchbot-progress-v1';
const LAYER_ORDER: ConceptLayer[] = ['intuitive', 'structural', 'precise'];
const CONCEPT_BADGE_MAP: Partial<Record<string, string>> = {
  'path-planning': 'curve-master',
  'symmetry-reflection': 'symmetry-seeker',
  'symmetry': 'symmetry-seeker',
};

// ─── Gamification Config ─────────────────────────────────────────────────────

export const GAMIFICATION_CONFIG = {
  xp_drawing_submitted: 10,
  xp_drawing_passed: 25,
  xp_layer_intuitive: 50,
  xp_layer_structural: 75,
  xp_layer_precise: 100,
  xp_concept_mastered: 150,
  xp_badge_earned: 30,
  xp_daily_login: 5,
  xp_streak_bonus_per_day: 10,
  xp_streak_cap_days: 7,
  xp_lesson_completed: 40,
  xp_quiz_correct: 15,
  xp_score_bonus_per_10: 5,
} as const;

export const LEVEL_CURVE: { level: number; name: string; xp: number; emoji: string }[] = [
  { level: 1,  name: 'Doodler',      xp: 0,     emoji: '✏️' },
  { level: 2,  name: 'Sketcher',     xp: 50,    emoji: '🖊️' },
  { level: 3,  name: 'Artist',       xp: 150,   emoji: '🎨' },
  { level: 4,  name: 'Explorer',     xp: 350,   emoji: '🧭' },
  { level: 5,  name: 'Inventor',     xp: 650,   emoji: '💡' },
  { level: 6,  name: 'Builder',      xp: 1100,  emoji: '🔧' },
  { level: 7,  name: 'Engineer',     xp: 1700,  emoji: '⚙️' },
  { level: 8,  name: 'Architect',    xp: 2500,  emoji: '📐' },
  { level: 9,  name: 'Visionary',    xp: 3500,  emoji: '🔭' },
  { level: 10, name: 'Master',       xp: 5000,  emoji: '🏆' },
  { level: 11, name: 'Grandmaster',  xp: 7000,  emoji: '👑' },
  { level: 12, name: 'Legend',       xp: 10000, emoji: '⭐' },
];

export type ConceptProgressSnapshot = {
  concept_id: string;
  layer_progress: Record<ConceptLayer, LayerProgress>;
  highest_layer_reached: ConceptLayer;
  mastered: boolean;
  completed_layer_count: number;
  next_layer_to_explore: ConceptLayer | null;
};

export type TutorEvaluationResult = {
  newly_completed: boolean;
  newly_mastered: boolean;
  next_layer_available: ConceptLayer | null;
  awarded_badges: string[];
  snapshot: ConceptProgressSnapshot;
  xpAwarded: number;
  scoreDetails?: { score: number; creativity: number; concept_alignment: number; complexity: number };
  leveledUp: boolean;
  newLevel: number;
};

function now(): string {
  return new Date().toISOString();
}

function load(): Record<string, StudentProgress> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, StudentProgress>) : {};
  } catch {
    return {};
  }
}

function save(store: Record<string, StudentProgress>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // storage quota exceeded — fail silently
  }
}

const DEFAULT_AVATAR = '🤖';
const DEFAULT_FAVORITE_COLOR = 'var(--cyan)';

function defaultStreaks(): StreakData {
  return { current_streak_days: 0, longest_streak_days: 0, last_active_date: '' };
}

function defaultProgress(name: string, ageGroup: AgeGroup): StudentProgress {
  return {
    student_name: name,
    age_group: ageGroup,
    avatar: DEFAULT_AVATAR,
    profile_avatar_kind: 'emoji',
    robot_preset: 'orbit',
    favorite_color: DEFAULT_FAVORITE_COLOR,
    bio: '',
    concepts: {},
    badges: [],
    drawings: [],
    total_sessions: 0,
    xp: 0,
    level: 1,
    sparks: 0,
    owned_items: ['body-orbit', 'color-cyan', 'trail-none', 'emote-wave', 'frame-none'],
    opened_chests: [],
    scores: [],
    streaks: defaultStreaks(),
    used_input_modes: [],
    lessons_completed: 0,
    quizzes_correct: 0,
    created_at: now(),
    updated_at: now(),
  };
}

function migrateProgress(raw: StudentProgress): StudentProgress {
  if (raw.xp === undefined) raw.xp = 0;
  if (raw.level === undefined) raw.level = 1;
  if (raw.sparks === undefined) raw.sparks = 0;
  if (!Array.isArray(raw.owned_items)) raw.owned_items = ['body-orbit', 'color-cyan', 'trail-none', 'emote-wave', 'frame-none'];
  if (!Array.isArray(raw.opened_chests)) raw.opened_chests = [];
  if (!Array.isArray(raw.scores)) raw.scores = [];
  if (!raw.streaks) raw.streaks = defaultStreaks();
  if (!Array.isArray(raw.used_input_modes)) raw.used_input_modes = [];
  if (typeof raw.lessons_completed !== 'number') raw.lessons_completed = 0;
  if (typeof raw.quizzes_correct !== 'number') raw.quizzes_correct = 0;
  // difficulty_level is intentionally left undefined if not set (triggers onboarding)
  if (raw.profile_avatar_kind !== 'emoji' && raw.profile_avatar_kind !== 'robot') {
    raw.profile_avatar_kind = 'emoji';
  }
  if (raw.robot_preset === undefined || raw.robot_preset === '') {
    raw.robot_preset = 'orbit';
  }
  return raw;
}

function ensureStudent(store: Record<string, StudentProgress>, name: string, ageGroup: AgeGroup): StudentProgress {
  if (!store[name]) {
    store[name] = defaultProgress(name, ageGroup);
  } else {
    store[name] = migrateProgress(store[name]);
  }
  return store[name];
}

// ─── XP & Level Engine ───────────────────────────────────────────────────────

export function getLevelForXP(xp: number): { level: number; name: string; emoji: string; currentXP: number; nextXP: number; progress: number } {
  let current = LEVEL_CURVE[0];
  for (const entry of LEVEL_CURVE) {
    if (xp >= entry.xp) current = entry;
    else break;
  }
  const nextEntry = LEVEL_CURVE.find((e) => e.xp > current.xp);
  const nextXP = nextEntry?.xp ?? current.xp;
  const rangeXP = nextXP - current.xp;
  const progress = rangeXP > 0 ? Math.min((xp - current.xp) / rangeXP, 1) : 1;
  return { level: current.level, name: current.name, emoji: current.emoji, currentXP: current.xp, nextXP, progress };
}

export type XPAwardResult = {
  xpAwarded: number;
  newTotalXP: number;
  previousLevel: number;
  newLevel: number;
  leveledUp: boolean;
  levelName: string;
  levelEmoji: string;
};

export function awardXP(studentName: string, amount: number): XPAwardResult | null {
  if (amount <= 0) return null;
  const store = load();
  const student = store[studentName];
  if (!student) return null;
  migrateProgress(student);

  const prevLevel = student.level;
  student.xp += amount;
  const levelInfo = getLevelForXP(student.xp);
  student.level = levelInfo.level;
  student.updated_at = now();
  save(store);

  return {
    xpAwarded: amount,
    newTotalXP: student.xp,
    previousLevel: prevLevel,
    newLevel: levelInfo.level,
    leveledUp: levelInfo.level > prevLevel,
    levelName: levelInfo.name,
    levelEmoji: levelInfo.emoji,
  };
}

export function getStudentXPInfo(studentName: string): { xp: number; level: number; levelName: string; levelEmoji: string; progress: number; nextXP: number } | null {
  const store = load();
  const student = store[studentName];
  if (!student) return null;
  migrateProgress(student);
  const info = getLevelForXP(student.xp);
  return { xp: student.xp, level: info.level, levelName: info.name, levelEmoji: info.emoji, progress: info.progress, nextXP: info.nextXP };
}

// ─── Streak Engine ───────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00Z');
  const db = new Date(b + 'T00:00:00Z');
  return Math.round(Math.abs(db.getTime() - da.getTime()) / 86400000);
}

export function updateStreak(studentName: string): { current: number; longest: number; xpAwarded: number } | null {
  const store = load();
  const student = store[studentName];
  if (!student) return null;
  migrateProgress(student);

  const today = todayISO();
  const s = student.streaks;

  if (s.last_active_date === today) {
    return { current: s.current_streak_days, longest: s.longest_streak_days, xpAwarded: 0 };
  }

  let xpAwarded = GAMIFICATION_CONFIG.xp_daily_login;

  if (s.last_active_date && daysBetween(s.last_active_date, today) === 1) {
    s.current_streak_days += 1;
  } else if (s.last_active_date && daysBetween(s.last_active_date, today) > 1) {
    s.current_streak_days = 1;
  } else {
    s.current_streak_days = 1;
  }

  if (s.current_streak_days > s.longest_streak_days) {
    s.longest_streak_days = s.current_streak_days;
  }

  const streakBonus = Math.min(s.current_streak_days, GAMIFICATION_CONFIG.xp_streak_cap_days) * GAMIFICATION_CONFIG.xp_streak_bonus_per_day;
  xpAwarded += streakBonus;

  s.last_active_date = today;
  student.xp += xpAwarded;
  student.sparks = (student.sparks ?? 0) + SPARK_RATES.streak_day;
  student.level = getLevelForXP(student.xp).level;
  student.updated_at = now();
  save(store);

  checkBadgeUnlocks(studentName);

  return { current: s.current_streak_days, longest: s.longest_streak_days, xpAwarded };
}

export function getStreakInfo(studentName: string): StreakData | null {
  const store = load();
  const student = store[studentName];
  if (!student) return null;
  migrateProgress(student);
  return { ...student.streaks };
}

// ─── Score Recording ─────────────────────────────────────────────────────────

export function recordScore(studentName: string, score: Omit<ScoreRecord, 'timestamp'>): void {
  const store = load();
  const student = store[studentName];
  if (!student) return;
  migrateProgress(student);
  student.scores = [{ ...score, timestamp: now() }, ...student.scores].slice(0, 100);
  student.updated_at = now();
  save(store);
}

function ensureConcept(student: StudentProgress, conceptId: string): ConceptProgress {
  if (!student.concepts[conceptId]) {
    student.concepts[conceptId] = {
      concept_id: conceptId,
      layer_progress: { intuitive: 'untouched', structural: 'untouched', precise: 'untouched' },
      highest_layer_reached: 'intuitive',
      mastered: false,
      last_visited: now(),
    };
  }
  return student.concepts[conceptId];
}

function buildSnapshot(progress: ConceptProgress): ConceptProgressSnapshot {
  const completedLayerCount = LAYER_ORDER.filter((layer) => progress.layer_progress[layer] === 'completed').length;
  const nextLayerToExplore =
    LAYER_ORDER.find((layer) => progress.layer_progress[layer] !== 'completed') ?? null;

  return {
    concept_id: progress.concept_id,
    layer_progress: { ...progress.layer_progress },
    highest_layer_reached: progress.highest_layer_reached,
    mastered: progress.mastered,
    completed_layer_count: completedLayerCount,
    next_layer_to_explore: nextLayerToExplore,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getStudentProgress(name: string, ageGroup: AgeGroup): StudentProgress {
  const store = load();
  ensureStudent(store, name, ageGroup);
  save(store);
  return store[name];
}

export function getDifficultyLevel(name: string): AgeGroup | null {
  const store = load();
  const student = store[name];
  if (!student) return null;
  return student.difficulty_level ?? null;
}

export function setDifficultyLevel(name: string, level: AgeGroup): void {
  const store = load();
  if (!store[name]) return;
  migrateProgress(store[name]);
  store[name].difficulty_level = level;
  store[name].age_group = level; // keep age_group in sync for tutor context
  store[name].updated_at = now();
  save(store);
}

export function setAgeGroup(name: string, ageGroup: AgeGroup): void {
  const store = load();
  const student = ensureStudent(store, name, ageGroup);
  student.age_group = ageGroup;
  student.updated_at = now();
  save(store);
}

export function updateStudentProfile(
  studentName: string,
  options: {
    avatar?: string;
    favorite_color?: string;
    bio?: string;
    profile_avatar_kind?: ProfileAvatarKind;
    robot_preset?: string;
  },
): void {
  const store = load();
  const student = store[studentName];
  if (!student) return;
  migrateProgress(student);
  if (options.avatar !== undefined) student.avatar = options.avatar;
  if (options.favorite_color !== undefined) student.favorite_color = options.favorite_color;
  if (options.bio !== undefined) student.bio = options.bio;
  if (options.profile_avatar_kind !== undefined) student.profile_avatar_kind = options.profile_avatar_kind;
  if (options.robot_preset !== undefined) student.robot_preset = options.robot_preset;
  student.updated_at = now();
  save(store);
}

export function touchConcept(
  studentName: string,
  conceptId: string,
  layer: ConceptLayer,
): void {
  const store = load();
  const student = store[studentName];
  if (!student) return;

  const cp = ensureConcept(student, conceptId);
  if (cp.layer_progress[layer] === 'untouched') {
    cp.layer_progress[layer] = 'started';
  }
  cp.last_visited = now();

  const currentHighest = LAYER_ORDER.indexOf(cp.highest_layer_reached);
  const thisLayer = LAYER_ORDER.indexOf(layer);
  if (thisLayer > currentHighest) {
    cp.highest_layer_reached = layer;
  }

  student.updated_at = now();
  save(store);
}

export function completeConceptLayer(
  studentName: string,
  conceptId: string,
  layer: ConceptLayer,
): void {
  const store = load();
  const student = store[studentName];
  if (!student) return;

  const concept = ensureConcept(student, conceptId);
  concept.layer_progress[layer] = 'completed';
  concept.last_visited = now();
  if (LAYER_ORDER.indexOf(layer) > LAYER_ORDER.indexOf(concept.highest_layer_reached)) {
    concept.highest_layer_reached = layer;
  }
  student.updated_at = now();
  save(store);
}

export function markConceptMastered(studentName: string, conceptId: string): void {
  const store = load();
  const student = store[studentName];
  if (!student) return;

  const concept = ensureConcept(student, conceptId);
  concept.mastered = true;
  concept.layer_progress.precise = 'completed';
  concept.highest_layer_reached = 'precise';
  student.updated_at = now();
  save(store);
}

export function awardBadge(studentName: string, badgeId: string): boolean {
  const store = load();
  const student = store[studentName];
  if (!student) return false;
  if (student.badges.includes(badgeId)) return false; // already earned

  student.badges.push(badgeId);
  student.updated_at = now();
  save(store);
  return true; // newly awarded
}

export function saveDrawing(
  studentName: string,
  drawing: Omit<DrawingRecord, 'id' | 'timestamp'>,
): void {
  const store = load();
  const student = store[studentName];
  if (!student) return;

  const record: DrawingRecord = {
    ...drawing,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: now(),
  };

  // Keep latest 50 drawings per student
  student.drawings = [record, ...student.drawings].slice(0, 50);
  student.updated_at = now();
  save(store);
}

export function incrementSessions(studentName: string): void {
  const store = load();
  const student = store[studentName];
  if (!student) return;
  student.total_sessions += 1;
  student.updated_at = now();
  save(store);
}

export function getConceptSummary(
  studentName: string,
  conceptId: string,
): ConceptProgress | null {
  const store = load();
  return store[studentName]?.concepts[conceptId] ?? null;
}

export function getConceptProgressSnapshot(
  studentName: string,
  conceptId: string,
): ConceptProgressSnapshot | null {
  const progress = getConceptSummary(studentName, conceptId);
  return progress ? buildSnapshot(progress) : null;
}

export function applyTutorEvaluation(
  studentName: string,
  conceptId: string,
  layer: ConceptLayer,
  passed: boolean,
  suggestNextLayer: boolean,
  scoreDetails?: { score: number; creativity: number; concept_alignment: number; complexity: number },
): TutorEvaluationResult | null {
  const store = load();
  const student = store[studentName];
  if (!student) {
    return null;
  }
  migrateProgress(student);

  const concept = ensureConcept(student, conceptId);
  const awardedBadges: string[] = [];
  let newlyCompleted = false;
  let newlyMastered = false;
  let nextLayerAvailable: ConceptLayer | null = null;
  let totalXP = 0;

  concept.last_visited = now();
  if (concept.layer_progress[layer] === 'untouched') {
    concept.layer_progress[layer] = 'started';
  }

  // XP for drawing submission
  totalXP += GAMIFICATION_CONFIG.xp_drawing_submitted;

  if (passed && concept.layer_progress[layer] !== 'completed') {
    concept.layer_progress[layer] = 'completed';
    newlyCompleted = true;

    totalXP += GAMIFICATION_CONFIG.xp_drawing_passed;

    // Layer completion XP
    const layerXPMap: Record<ConceptLayer, number> = {
      intuitive: GAMIFICATION_CONFIG.xp_layer_intuitive,
      structural: GAMIFICATION_CONFIG.xp_layer_structural,
      precise: GAMIFICATION_CONFIG.xp_layer_precise,
    };
    totalXP += layerXPMap[layer];
  } else if (passed) {
    totalXP += GAMIFICATION_CONFIG.xp_drawing_passed;
  }

  // Score-based XP bonus
  if (scoreDetails) {
    totalXP += Math.floor(scoreDetails.score / 10) * GAMIFICATION_CONFIG.xp_score_bonus_per_10;
    recordScore(studentName, {
      concept_id: conceptId,
      layer,
      score: scoreDetails.score,
      creativity: scoreDetails.creativity,
      concept_alignment: scoreDetails.concept_alignment,
      complexity: scoreDetails.complexity,
    });
  }

  if (LAYER_ORDER.indexOf(layer) > LAYER_ORDER.indexOf(concept.highest_layer_reached)) {
    concept.highest_layer_reached = layer;
  }

  const currentLayerIndex = LAYER_ORDER.indexOf(layer);
  const nextLayer = currentLayerIndex < LAYER_ORDER.length - 1 ? LAYER_ORDER[currentLayerIndex + 1] : null;

  if (passed && suggestNextLayer && nextLayer) {
    if (concept.layer_progress[nextLayer] === 'untouched') {
      concept.layer_progress[nextLayer] = 'started';
    }
    if (LAYER_ORDER.indexOf(nextLayer) > LAYER_ORDER.indexOf(concept.highest_layer_reached)) {
      concept.highest_layer_reached = nextLayer;
    }
    nextLayerAvailable = nextLayer;
  }

  if (passed && layer === 'precise' && !concept.mastered) {
    concept.mastered = true;
    newlyMastered = true;
    totalXP += GAMIFICATION_CONFIG.xp_concept_mastered;
    const conceptBadgeId = CONCEPT_BADGE_MAP[conceptId];
    if (conceptBadgeId && !student.badges.includes(conceptBadgeId)) {
      student.badges.push(conceptBadgeId);
      awardedBadges.push(conceptBadgeId);
    }
  }

  // XP for any new badges
  totalXP += awardedBadges.length * GAMIFICATION_CONFIG.xp_badge_earned;

  // Award Sparks alongside XP
  let sparksEarned = 0;
  if (newlyCompleted) {
    const sparkMap: Record<ConceptLayer, number> = {
      intuitive: SPARK_RATES.layer_intuitive,
      structural: SPARK_RATES.layer_structural,
      precise: SPARK_RATES.layer_precise,
    };
    sparksEarned += sparkMap[layer];
  }
  if (newlyMastered) sparksEarned += SPARK_RATES.concept_mastered;
  if (scoreDetails && scoreDetails.score >= 90) sparksEarned += SPARK_RATES.perfect_score;
  sparksEarned += awardedBadges.length * SPARK_RATES.badge_earned;
  student.sparks = (student.sparks ?? 0) + sparksEarned;

  const prevLevel = student.level;
  student.xp += totalXP;
  const levelInfo = getLevelForXP(student.xp);
  student.level = levelInfo.level;
  student.updated_at = now();
  save(store);

  // Check for additional badge unlocks
  const extraBadges = checkBadgeUnlocks(studentName);
  awardedBadges.push(...extraBadges);

  return {
    newly_completed: newlyCompleted,
    newly_mastered: newlyMastered,
    next_layer_available: nextLayerAvailable,
    awarded_badges: awardedBadges,
    snapshot: buildSnapshot(concept),
    xpAwarded: totalXP,
    scoreDetails,
    leveledUp: levelInfo.level > prevLevel,
    newLevel: levelInfo.level,
  };
}

// ─── Computed helpers ─────────────────────────────────────────────────────────

export function getNodeStatus(
  studentName: string,
  conceptId: string,
): 'locked' | 'touched' | 'mastered' {
  const store = load();
  const student = store[studentName];
  if (!student) return 'locked';
  const cp = student.concepts[conceptId];
  if (!cp) return 'locked';
  if (cp.mastered) return 'mastered';
  return 'touched';
}

export function getLayerPillState(
  snapshot: ConceptProgressSnapshot | null,
  layer: ConceptLayer,
): 'untouched' | 'started' | 'completed' {
  return snapshot?.layer_progress[layer] ?? 'untouched';
}

export function hasFirstDrawing(studentName: string): boolean {
  const store = load();
  return (store[studentName]?.drawings?.length ?? 0) > 0;
}

// ─── Badge definitions ────────────────────────────────────────────────────────

export type BadgeCategory = 'exploration' | 'creation' | 'mastery' | 'session' | 'concept';

export type BadgeDefinition = {
  name: string;
  emoji: string;
  description: string;
  category: BadgeCategory;
  xp_reward: number;
};

export const BADGE_DEFINITIONS: Record<string, BadgeDefinition> = {
  // Concept mastery badges
  'coordinate-explorer':  { name: 'Coordinate Explorer', emoji: '🗺️',  description: 'Explored coordinate systems',                 category: 'concept', xp_reward: 30 },
  'curve-master':         { name: 'Curve Master',        emoji: '〰️', description: 'Mastered Bezier curves and smooth paths',      category: 'concept', xp_reward: 30 },
  'vision-pioneer':       { name: 'Vision Pioneer',      emoji: '👁️',  description: 'Understood how the robot sees',                category: 'concept', xp_reward: 30 },
  'sine-surfer':          { name: 'Sine Surfer',         emoji: '〰️', description: 'Drew a sine wave with the robot',              category: 'concept', xp_reward: 30 },
  'symmetry-seeker':      { name: 'Symmetry Seeker',     emoji: '🦋',  description: 'Explored mirror symmetry through drawing',     category: 'concept', xp_reward: 30 },
  'system-thinker':       { name: 'System Thinker',      emoji: '🧠',  description: 'Designed your own challenge',                  category: 'concept', xp_reward: 30 },
  // Exploration badges
  'first-steps':          { name: 'First Steps',         emoji: '👣',  description: 'Completed first concept\'s intuitive layer',   category: 'exploration', xp_reward: 30 },
  'cartographer':         { name: 'Cartographer',        emoji: '🗺️',  description: 'Visited every concept on the knowledge map',   category: 'exploration', xp_reward: 50 },
  'deep-diver':           { name: 'Deep Diver',          emoji: '🤿',  description: 'Reached the precise layer on any concept',     category: 'exploration', xp_reward: 30 },
  'went-deeper':          { name: 'Went Deeper',         emoji: '🔬',  description: 'Advanced to a deeper knowledge layer',         category: 'exploration', xp_reward: 20 },
  // Creation badges
  'first-drawing':        { name: 'First Drawing',       emoji: '✏️',  description: 'Made your first drawing with SketchBot',      category: 'creation', xp_reward: 20 },
  'prolific':             { name: 'Prolific',            emoji: '🎨',  description: 'Saved 10 drawings',                            category: 'creation', xp_reward: 40 },
  'century-club':         { name: 'Century Club',        emoji: '💯',  description: 'Saved 100 drawings',                           category: 'creation', xp_reward: 100 },
  'code-debut':           { name: 'Code Debut',          emoji: '💻',  description: 'Wrote your first robot code',                  category: 'creation', xp_reward: 30 },
  // Mastery badges
  'completionist':        { name: 'Completionist',       emoji: '🏅',  description: 'Mastered all concepts in a domain',            category: 'mastery', xp_reward: 100 },
  'renaissance-bot':      { name: 'Renaissance Bot',     emoji: '🎭',  description: 'Mastered concepts in 3+ different domains',    category: 'mastery', xp_reward: 150 },
  // Session / streak badges
  'streak-3':             { name: '3-Day Streak',        emoji: '🔥',  description: '3 days in a row!',                             category: 'session', xp_reward: 20 },
  'streak-7':             { name: 'Week Warrior',        emoji: '🔥',  description: '7-day streak!',                                category: 'session', xp_reward: 40 },
  'streak-14':            { name: 'Fortnight Focus',     emoji: '🔥',  description: '14-day streak!',                               category: 'session', xp_reward: 60 },
  'streak-30':            { name: 'Monthly Master',      emoji: '🔥',  description: '30-day streak — incredible dedication!',       category: 'session', xp_reward: 100 },
  'early-bird':           { name: 'Early Bird',          emoji: '🌅',  description: 'Started a session before 8am',                 category: 'session', xp_reward: 25 },
  'night-owl':            { name: 'Night Owl',           emoji: '🌙',  description: 'Started a session after 9pm',                  category: 'session', xp_reward: 25 },
  // Polyglot (creation)
  'polyglot':             { name: 'Polyglot',            emoji: '🗣️',  description: 'Used all three input modes — language, blocks, and code', category: 'creation', xp_reward: 60 },
  // Lesson / quiz
  'lesson-learner':       { name: 'Lesson Learner',      emoji: '📚',  description: 'Completed your first guided lesson',           category: 'exploration', xp_reward: 30 },
  'quiz-whiz':            { name: 'Quiz Whiz',           emoji: '🧠',  description: 'Answered 10 quiz questions correctly',         category: 'exploration', xp_reward: 40 },
};

// ─── Badge Unlock Checker ────────────────────────────────────────────────────

export function checkBadgeUnlocks(studentName: string): string[] {
  const store = load();
  const student = store[studentName];
  if (!student) return [];
  migrateProgress(student);

  const newBadges: string[] = [];
  const has = (id: string) => student.badges.includes(id);
  const award = (id: string) => {
    if (!has(id)) {
      student.badges.push(id);
      student.xp += BADGE_DEFINITIONS[id]?.xp_reward ?? GAMIFICATION_CONFIG.xp_badge_earned;
      newBadges.push(id);
    }
  };

  const concepts = Object.values(student.concepts);

  // First Steps: completed any concept's intuitive layer
  if (concepts.some((c) => c.layer_progress.intuitive === 'completed')) award('first-steps');

  // Deep Diver: reached precise on any concept
  if (concepts.some((c) => c.highest_layer_reached === 'precise')) award('deep-diver');

  // Went Deeper: reached structural or higher on any concept
  if (concepts.some((c) => LAYER_ORDER.indexOf(c.highest_layer_reached) >= 1)) award('went-deeper');

  // Cartographer: visited every concept (at least 5 concepts touched)
  if (concepts.length >= 5) award('cartographer');

  // Drawing count badges
  if (student.drawings.length >= 1) award('first-drawing');
  if (student.drawings.length >= 10) award('prolific');
  if (student.drawings.length >= 100) award('century-club');

  // Mastery badges: completionist (all in a domain) and renaissance-bot (3+ domains mastered)
  const masteredByDomain = new Map<string, number>();
  for (const c of concepts) {
    if (c.mastered) {
      const domain = c.concept_id.split('-')[0] || 'other';
      masteredByDomain.set(domain, (masteredByDomain.get(domain) ?? 0) + 1);
    }
  }
  if ([...masteredByDomain.values()].some((count) => count >= 2)) award('completionist');
  if (masteredByDomain.size >= 3) award('renaissance-bot');

  // Streak badges
  const streak = student.streaks.current_streak_days;
  if (streak >= 3) award('streak-3');
  if (streak >= 7) award('streak-7');
  if (streak >= 14) award('streak-14');
  if (streak >= 30) award('streak-30');

  // Polyglot: used all three input modes
  const modes = student.used_input_modes ?? [];
  if (modes.includes('language') && modes.includes('blocks') && modes.includes('code')) {
    award('polyglot');
  }

  // Lesson / quiz badges
  if ((student.lessons_completed ?? 0) >= 1) award('lesson-learner');
  if ((student.quizzes_correct ?? 0) >= 10) award('quiz-whiz');

  // Time-of-day session badges
  const hour = new Date().getHours();
  if (hour < 8) award('early-bird');
  if (hour >= 21) award('night-owl');

  if (newBadges.length > 0) {
    student.level = getLevelForXP(student.xp).level;
    student.updated_at = now();
    save(store);
  }

  return newBadges;
}

// ─── Input mode tracking ─────────────────────────────────────────────────────

export function recordInputModeUsed(studentName: string, mode: InputMode): string[] {
  const store = load();
  const student = store[studentName];
  if (!student) return [];
  migrateProgress(student);

  const modes = new Set(student.used_input_modes ?? []);
  if (modes.has(mode)) return [];
  modes.add(mode);
  student.used_input_modes = Array.from(modes);
  student.updated_at = now();
  save(store);

  return checkBadgeUnlocks(studentName);
}

// ─── Gamified Action Helpers ─────────────────────────────────────────────────

export function awardLessonXP(studentName: string): XPAwardResult | null {
  const store = load();
  const student = store[studentName];
  if (student) {
    migrateProgress(student);
    student.lessons_completed = (student.lessons_completed ?? 0) + 1;
    student.sparks = (student.sparks ?? 0) + SPARK_RATES.lesson_completed;
    save(store);
  }
  const result = awardXP(studentName, GAMIFICATION_CONFIG.xp_lesson_completed);
  checkBadgeUnlocks(studentName);
  return result;
}

export function awardQuizXP(studentName: string): XPAwardResult | null {
  const store = load();
  const student = store[studentName];
  if (student) {
    migrateProgress(student);
    student.quizzes_correct = (student.quizzes_correct ?? 0) + 1;
    save(store);
  }
  const result = awardXP(studentName, GAMIFICATION_CONFIG.xp_quiz_correct);
  checkBadgeUnlocks(studentName);
  return result;
}

export function getProgressSummary(studentName: string): {
  xp: number;
  level: number;
  levelName: string;
  levelEmoji: string;
  progress: number;
  nextXP: number;
  streak: StreakData;
  badges: string[];
  scores: ScoreRecord[];
  drawingCount: number;
  conceptsStarted: number;
  conceptsMastered: number;
  totalSessions: number;
} | null {
  const store = load();
  const student = store[studentName];
  if (!student) return null;
  migrateProgress(student);
  const info = getLevelForXP(student.xp);
  const concepts = Object.values(student.concepts);
  return {
    xp: student.xp,
    level: info.level,
    levelName: info.name,
    levelEmoji: info.emoji,
    progress: info.progress,
    nextXP: info.nextXP,
    streak: { ...student.streaks },
    badges: [...student.badges],
    scores: [...student.scores],
    drawingCount: student.drawings.length,
    conceptsStarted: concepts.length,
    conceptsMastered: concepts.filter((c) => c.mastered).length,
    totalSessions: student.total_sessions,
  };
}

// ─── Backend Sync ────────────────────────────────────────────────────────────
// Fire-and-forget helper so every XP-awarding action can push to the classroom
// leaderboard. Debounced per-student to coalesce rapid bursts of awards.

const _syncTimers = new Map<string, ReturnType<typeof setTimeout>>();
let _apiBaseOverride: string | null = null;

export function setProgressSyncApiBase(base: string | null): void {
  _apiBaseOverride = base && base.length > 0 ? base : null;
}

function resolveApiBase(): string {
  if (_apiBaseOverride) return _apiBaseOverride;
  if (typeof window !== 'undefined') {
    const w = window as unknown as { __SKETCHBOT_API_BASE__?: string };
    if (w.__SKETCHBOT_API_BASE__) return w.__SKETCHBOT_API_BASE__;
  }
  return '';
}

export async function syncProgressNow(studentName: string): Promise<boolean> {
  const summary = getProgressSummary(studentName);
  if (!summary) return false;
  const base = resolveApiBase();
  if (!base) return false;
  try {
    await fetch(`${base}/api/progress/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_name: studentName,
        xp: summary.xp,
        level: summary.level,
        level_name: summary.levelName,
        level_emoji: summary.levelEmoji,
        badge_count: summary.badges.length,
        streak_days: summary.streak.current_streak_days,
        drawings_count: summary.drawingCount,
        concepts_started: summary.conceptsStarted,
        concepts_mastered: summary.conceptsMastered,
      }),
    });
    return true;
  } catch {
    return false;
  }
}

// ─── Spark Economy ───────────────────────────────────────────────────────────

export function getSparks(studentName: string): number {
  const store = load();
  const student = store[studentName];
  if (!student) return 0;
  migrateProgress(student);
  return student.sparks ?? 0;
}

export function awardSparks(studentName: string, amount: number): number {
  if (amount <= 0) return 0;
  const store = load();
  const student = store[studentName];
  if (!student) return 0;
  migrateProgress(student);
  student.sparks = (student.sparks ?? 0) + amount;
  student.updated_at = now();
  save(store);
  return student.sparks;
}

export function spendSparks(studentName: string, amount: number): boolean {
  const store = load();
  const student = store[studentName];
  if (!student) return false;
  migrateProgress(student);
  if ((student.sparks ?? 0) < amount) return false;
  student.sparks -= amount;
  student.updated_at = now();
  save(store);
  return true;
}

export function purchaseShopItem(studentName: string, itemId: string, cost: number): boolean {
  const store = load();
  const student = store[studentName];
  if (!student) return false;
  migrateProgress(student);
  if (student.owned_items.includes(itemId)) return true; // already owned
  if ((student.sparks ?? 0) < cost) return false;
  student.sparks -= cost;
  student.owned_items = [...student.owned_items, itemId];
  student.updated_at = now();
  save(store);
  return true;
}

export function ownsItem(studentName: string, itemId: string): boolean {
  const store = load();
  const student = store[studentName];
  if (!student) return false;
  migrateProgress(student);
  return student.owned_items.includes(itemId);
}

export function getOwnedItems(studentName: string): string[] {
  const store = load();
  const student = store[studentName];
  if (!student) return [];
  migrateProgress(student);
  return [...student.owned_items];
}

export type ChestOpenResult = {
  sparksAwarded: number;
  bonusItemId: string | null;
  newTotal: number;
};

export function openChest(studentName: string, chestId: string): ChestOpenResult | null {
  const store = load();
  const student = store[studentName];
  if (!student) return null;
  migrateProgress(student);
  if (student.opened_chests.includes(chestId)) return null; // already opened

  const chest = CHESTS.find((c) => c.id === chestId);
  if (!chest) return null;

  const { sparks, bonusItemId } = rollChest(chest);
  student.sparks = (student.sparks ?? 0) + sparks;
  student.opened_chests = [...student.opened_chests, chestId];
  if (bonusItemId && !student.owned_items.includes(bonusItemId)) {
    student.owned_items = [...student.owned_items, bonusItemId];
  }
  student.updated_at = now();
  save(store);

  return { sparksAwarded: sparks, bonusItemId, newTotal: student.sparks };
}

export function hasOpenedChest(studentName: string, chestId: string): boolean {
  const store = load();
  const student = store[studentName];
  if (!student) return false;
  migrateProgress(student);
  return student.opened_chests.includes(chestId);
}

export function getAvailableChests(studentName: string): string[] {
  const store = load();
  const student = store[studentName];
  if (!student) return [];
  migrateProgress(student);
  const masteredCount = Object.values(student.concepts).filter((c) => c.mastered).length;
  return CHESTS
    .filter((c) => c.milestoneAfterConcepts <= masteredCount && !student.opened_chests.includes(c.id))
    .map((c) => c.id);
}

export function scheduleProgressSync(studentName: string, debounceMs = 800): void {
  if (!studentName) return;
  const existing = _syncTimers.get(studentName);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    _syncTimers.delete(studentName);
    void syncProgressNow(studentName);
  }, debounceMs);
  _syncTimers.set(studentName, timer);
}
