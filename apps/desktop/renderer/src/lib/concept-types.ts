// ─── Knowledge Layer System ───────────────────────────────────────────────────
// Every robotics/engineering concept is taught at 3 layers matched to
// age group and demonstrated mastery. Layers are NOT locked by age —
// a curious 9-year-old can peek at Structural; a HS student can revisit Intuitive.

export type AgeGroup = 'explorer' | 'builder' | 'engineer';

export type ConceptLayer = 'intuitive' | 'structural' | 'precise';

export type ConceptDomain =
  | 'coordinates'
  | 'kinematics'
  | 'vision'
  | 'control'
  | 'geometry'
  | 'systems'
  | 'sensors'
  | 'competition'
  | 'navigation';

export type IntuitiveLayer = {
  hook: string;            // Opening question to create curiosity
  activity: string;        // Activity type: 'drag_waypoints', 'language_prompt', 'observe'
  robot_demo?: string;     // Demo sequence ID to trigger
  tutor_intro: string;     // Opening tutor message for this layer
  starter_prompt?: string; // Pre-filled drawing prompt to get started fast
};

export type StructuralLayer = {
  block_template?: string;  // Block editor preset
  visual_tool?: string;     // Special UI tool: 'waypoint_editor', 'pid_sliders', 'shape_builder'
  challenge_id?: string;    // Associated challenge
  tutor_intro: string;
  starter_prompt?: string;
};

export type PreciseLayer = {
  notebook_slug?: string;       // Code notebook reference
  code_scaffold?: string;       // Starter code snippet
  math_notation?: string;       // LaTeX-style math for display
  tutor_intro: string;
  starter_prompt?: string;
};

export type ConceptDefinition = {
  concept_id: string;
  domain: ConceptDomain;
  title: string;
  subtitle: string;
  emoji: string;
  description: string;
  prerequisite_ids?: string[];   // Concepts that should come first
  layers: {
    intuitive: IntuitiveLayer;
    structural: StructuralLayer;
    precise: PreciseLayer;
  };
};

// ─── Student Progress ─────────────────────────────────────────────────────────

export type LayerProgress = 'untouched' | 'started' | 'completed';

export type ConceptProgress = {
  concept_id: string;
  layer_progress: Record<ConceptLayer, LayerProgress>;
  highest_layer_reached: ConceptLayer;
  mastered: boolean;        // Tutor evaluated full mastery
  last_visited: string;     // ISO timestamp
};

export type ScoreRecord = {
  concept_id: string;
  layer: ConceptLayer;
  score: number;
  creativity: number;
  concept_alignment: number;
  complexity: number;
  timestamp: string;
};

export type StreakData = {
  current_streak_days: number;
  longest_streak_days: number;
  last_active_date: string;
};

export type InputMode = 'language' | 'blocks' | 'code';

export type ProfileAvatarKind = 'emoji' | 'robot';

export type StudentProgress = {
  student_name: string;
  age_group: AgeGroup;
  avatar?: string;
  /** When `robot`, show `RobotAvatarPreset` with `robot_preset` + `favorite_color`. */
  profile_avatar_kind?: ProfileAvatarKind;
  /** Preset id from `ROBOT_PRESETS` in `@/lib/robot-presets`. */
  robot_preset?: string;
  favorite_color?: string;
  bio?: string;
  concepts: Record<string, ConceptProgress>;
  badges: string[];
  drawings: DrawingRecord[];
  total_sessions: number;
  xp: number;
  level: number;
  sparks: number;
  owned_items: string[];
  opened_chests: string[];
  scores: ScoreRecord[];
  streaks: StreakData;
  used_input_modes?: InputMode[];
  lessons_completed?: number;
  quizzes_correct?: number;
  created_at: string;
  updated_at: string;
};

export type DrawingRecord = {
  id: string;
  svg_content?: string;
  prompt?: string;
  concept_id?: string;
  layer: ConceptLayer;
  timestamp: string;
};

// ─── Tutor Session ────────────────────────────────────────────────────────────

export type TutorSessionContext = {
  student_name: string;
  age_group: AgeGroup;
  concept_id: string;
  layer: ConceptLayer;
  step_description?: string;
  student_message?: string;
  drawing_prompt?: string;
  path_count?: number;
  learning_objective?: string;
  completion_condition?: string;
  session_history?: Array<{ role: 'tutor' | 'student'; content: string }>;
};

// ─── Age group meta ───────────────────────────────────────────────────────────

export const AGE_GROUP_META: Record<AgeGroup, {
  label: string;
  description: string;
  emoji: string;
  color: string;
}> = {
  explorer: {
    label: 'Explorer',
    description: 'Ages 6–10',
    emoji: '🚀',
    color: 'var(--amber)',
  },
  builder: {
    label: 'Builder',
    description: 'Ages 11–14',
    emoji: '⚙️',
    color: 'var(--blue)',
  },
  engineer: {
    label: 'Engineer',
    description: 'Ages 15+',
    emoji: '🧮',
    color: 'var(--violet)',
  },
};

// ─── Layer meta ───────────────────────────────────────────────────────────────

export const LAYER_META: Record<ConceptLayer, {
  label: string;
  description: string;
  color: string;
}> = {
  intuitive: {
    label: 'Intuitive',
    description: 'Explore with words & visuals',
    color: 'var(--amber)',
  },
  structural: {
    label: 'Structural',
    description: 'Build with blocks & tools',
    color: 'var(--blue)',
  },
  precise: {
    label: 'Precise',
    description: 'Code & math notation',
    color: 'var(--violet)',
  },
};
