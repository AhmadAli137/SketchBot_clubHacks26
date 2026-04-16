// ─── Student Progress Store ───────────────────────────────────────────────────
// localStorage-backed persistence for student progress, badges, and drawings.
// Keyed by student name — simple for v1 classroom use.

import type {
  AgeGroup,
  ConceptLayer,
  ConceptProgress,
  DrawingRecord,
  LayerProgress,
  StudentProgress,
} from './concept-types';

const STORAGE_KEY = 'sketchbot-progress-v1';
const LAYER_ORDER: ConceptLayer[] = ['intuitive', 'structural', 'precise'];
const CONCEPT_BADGE_MAP: Partial<Record<string, string>> = {
  'coord-systems': 'coordinate-explorer',
  'path-planning': 'curve-master',
  'computer-vision': 'vision-pioneer',
  'systems-engineering': 'system-thinker',
  'trigonometry-motion': 'sine-surfer',
};

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

function defaultProgress(name: string, ageGroup: AgeGroup): StudentProgress {
  return {
    student_name: name,
    age_group: ageGroup,
    avatar: DEFAULT_AVATAR,
    favorite_color: DEFAULT_FAVORITE_COLOR,
    bio: '',
    concepts: {},
    badges: [],
    drawings: [],
    total_sessions: 0,
    created_at: now(),
    updated_at: now(),
  };
}

function ensureStudent(store: Record<string, StudentProgress>, name: string, ageGroup: AgeGroup): StudentProgress {
  if (!store[name]) {
    store[name] = defaultProgress(name, ageGroup);
  }
  return store[name];
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

export function setAgeGroup(name: string, ageGroup: AgeGroup): void {
  const store = load();
  const student = ensureStudent(store, name, ageGroup);
  student.age_group = ageGroup;
  student.updated_at = now();
  save(store);
}

export function updateStudentProfile(
  studentName: string,
  options: { avatar?: string; favorite_color?: string; bio?: string },
): void {
  const store = load();
  const student = store[studentName];
  if (!student) return;
  if (options.avatar !== undefined) student.avatar = options.avatar;
  if (options.favorite_color !== undefined) student.favorite_color = options.favorite_color;
  if (options.bio !== undefined) student.bio = options.bio;
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
): TutorEvaluationResult | null {
  const store = load();
  const student = store[studentName];
  if (!student) {
    return null;
  }

  const concept = ensureConcept(student, conceptId);
  const awardedBadges: string[] = [];
  let newlyCompleted = false;
  let newlyMastered = false;
  let nextLayerAvailable: ConceptLayer | null = null;

  concept.last_visited = now();
  if (concept.layer_progress[layer] === 'untouched') {
    concept.layer_progress[layer] = 'started';
  }

  if (passed && concept.layer_progress[layer] !== 'completed') {
    concept.layer_progress[layer] = 'completed';
    newlyCompleted = true;
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
    const conceptBadgeId = CONCEPT_BADGE_MAP[conceptId];
    if (conceptBadgeId && !student.badges.includes(conceptBadgeId)) {
      student.badges.push(conceptBadgeId);
      awardedBadges.push(conceptBadgeId);
    }
  }

  student.updated_at = now();
  save(store);

  return {
    newly_completed: newlyCompleted,
    newly_mastered: newlyMastered,
    next_layer_available: nextLayerAvailable,
    awarded_badges: awardedBadges,
    snapshot: buildSnapshot(concept),
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

export const BADGE_DEFINITIONS: Record<string, { name: string; emoji: string; description: string }> = {
  'first-drawing':        { name: 'First Drawing',       emoji: '✏️',  description: 'Made your first drawing with SketchBot' },
  'coordinate-explorer':  { name: 'Coordinate Explorer', emoji: '🗺️',  description: 'Explored coordinate systems' },
  'curve-master':         { name: 'Curve Master',        emoji: '〰️', description: 'Mastered Bezier curves and smooth paths' },
  'vision-pioneer':       { name: 'Vision Pioneer',      emoji: '👁️',  description: 'Understood how the robot sees' },
  'went-deeper':          { name: 'Went Deeper',         emoji: '🔬',  description: 'Advanced to a deeper knowledge layer' },
  'code-debut':           { name: 'Code Debut',          emoji: '💻',  description: 'Wrote your first robot code' },
  'sine-surfer':          { name: 'Sine Surfer',         emoji: '〰️', description: 'Drew a sine wave with the robot' },
  'symmetry-seeker':      { name: 'Symmetry Seeker',     emoji: '🦋',  description: 'Explored mirror symmetry through drawing' },
  'system-thinker':       { name: 'System Thinker',      emoji: '🧠',  description: 'Designed your own challenge' },
};
