// ─── Platform-level types ────────────────────────────────────────────────────
// These are the core contracts for the AI-tutored educational robotics platform.
// SketchBot is robot #1 — these types are designed to accommodate all future
// robot lines and modular add-ons without requiring new app versions.

// ─── Capabilities & Modules ──────────────────────────────────────────────────

export type Capability =
  | 'draw'
  | 'localize-apriltag'
  | 'stream-video'
  | 'sort'
  | 'navigate-maze'
  | 'sense-distance'
  | 'sense-color'
  | 'grip'
  | string; // open-ended for future robots

export type ModuleDefinition = {
  id: string;
  name: string;
  description: string;
  icon: string; // emoji or path
  unlocksCapabilities: Capability[];
  unlocksChallengePacks: string[]; // challenge pack IDs
};

// ─── AI Tutor Persona ─────────────────────────────────────────────────────────

export type TutorPersona = {
  name: string; // "Sketch", "Sort", "Maze" — the robot's tutor character
  personality: string; // "curious, creative, encouraging"
  greetingMessage: string;
  systemPrompt: string; // Claude API system prompt for this robot's tutor
  avatar: string; // emoji fallback
  accentColor: string; // CSS color, used for tutor chat bubbles
};

// ─── Robot Registry ───────────────────────────────────────────────────────────

export type RobotDefinition = {
  id: string; // 'sketchbot', 'sortbot', etc.
  name: string; // 'SketchBot'
  tagline: string; // 'Learns through drawing'
  description: string;
  version: string;
  avatar: string; // emoji or image path
  accentColor: string; // primary accent CSS color
  tutorPersona: TutorPersona;
  capabilities: Capability[];
  compatibleModules: string[]; // module IDs
  challengePackIds: string[]; // challenge pack IDs
  firmwareRepo?: string;
};

// ─── Challenges ───────────────────────────────────────────────────────────────

export type Subject =
  | 'math'
  | 'art'
  | 'engineering'
  | 'coding'
  | 'science'
  | 'language';

export type ChallengeCompletionCondition =
  | 'automatic' // robot completes the action, step advances
  | 'student-confirms' // student taps "Done"
  | 'camera-detects'; // vision system detects completion

export type RobotActionType =
  | 'draw-prompt' // send a drawing prompt to compose
  | 'draw-svg' // send a specific SVG
  | 'move-to' // navigate to coordinates
  | 'pen-down'
  | 'pen-up'
  | 'pause'
  | string; // open-ended

export type RobotAction = {
  type: RobotActionType;
  payload?: Record<string, unknown>;
};

export type ChallengeStep = {
  id: string;
  tutorMessage: string; // What the AI tutor says at this step
  hint?: string; // Optional hint the student can reveal
  robotAction?: RobotAction; // What the robot does (if anything)
  studentPrompt?: string; // What the student is asked to do or think about
  reflectionQuestion?: string; // Post-action reflection prompt
  completionCondition: ChallengeCompletionCondition;
  durationHint?: number; // expected seconds, for progress display
};

export type Badge = {
  id: string;
  name: string;
  description: string;
  icon: string; // emoji
};

export type Challenge = {
  id: string;
  packId: string; // which challenge pack this belongs to
  robotId: string; // which robot this is for
  requiredModules: string[]; // module IDs required to run this challenge
  title: string;
  subtitle?: string;
  description: string;
  subjects: Subject[];
  difficulty: 1 | 2 | 3 | 4 | 5; // 1 = easiest
  estimatedMinutes: number;
  learningObjectives: string[];
  steps: ChallengeStep[];
  completionBadge?: Badge;
  prerequisiteChallengeIds?: string[];
};

export type ChallengePack = {
  id: string;
  robotId: string;
  name: string;
  description: string;
  challenges: Challenge[];
};

// ─── Live Session ─────────────────────────────────────────────────────────────
// Tracks the in-progress state of a challenge session.

export type SessionStepStatus = 'pending' | 'active' | 'completed' | 'skipped';

export type SessionStep = {
  stepId: string;
  status: SessionStepStatus;
  startedAt?: string; // ISO timestamp
  completedAt?: string;
  studentResponse?: string; // What the student typed or said
};

export type ChallengeSession = {
  sessionId: string;
  challengeId: string;
  challenge: Challenge;
  startedAt: string;
  currentStepIndex: number;
  steps: SessionStep[];
  completed: boolean;
  completedAt?: string;
};

// ─── Classroom & Roster ───────────────────────────────────────────────────────

export type StudentRecord = {
  id: string;
  name: string;
  joinedAt: string;
};

export type RobotRecord = {
  id: string;
  definitionId: string; // references RobotDefinition.id
  name: string; // custom name, e.g. "SketchBot 01"
  registeredAt: string;
  activeModules: string[]; // active module IDs
};

/** Optional policies the teacher sets; enforced client-side for students (v1). */
export type ClassroomRestrictions = {
  /** When non-null and non-empty, only these concept IDs are allowed (Free Draw uses id `free-draw`). */
  allowedConceptIds: string[] | null;
  disableFreeDraw?: boolean;
  disableUpload?: boolean;
  /** Hint button calls tutor with trigger hint_request; 0 = unlimited. */
  maxTutorHintsPerSession?: number;
};

export type ClassroomProfile = {
  classroomName: string;
  teacherName: string;
  students: string[]; // names (simple for v1)
  bots: string[]; // custom bot names (simple for v1)
  restrictions?: ClassroomRestrictions;
};

// ─── Platform Registry Response ───────────────────────────────────────────────
// Shape returned by /api/robots and /api/challenges from both backends.

export type RobotRegistryResponse = {
  robots: RobotDefinition[];
};

export type ChallengeLibraryResponse = {
  packs: ChallengePack[];
};

// ─── Tutor Message ────────────────────────────────────────────────────────────
// Used in TutorChat component to render conversation history.

export type TutorMessageRole = 'tutor' | 'student' | 'system';

export type TutorMessage = {
  id: string;
  role: TutorMessageRole;
  content: string;
  timestamp: string;
  stepId?: string; // which challenge step triggered this message
};
