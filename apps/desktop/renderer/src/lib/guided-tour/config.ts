import type { TourFlowId, TourStep } from './types';

export const GUIDED_TOUR_STORAGE: Record<TourFlowId, string> = {
  studentSession: 'aibotics-tour-session-v2',
  studentHome:    'aibotics-tour-home-v2',
  planPicker:     'aibotics-tour-plan-v2',
  progressMap:    'aibotics-tour-map-v2',
  challenge:      'aibotics-tour-challenge-v2',
  lessonPlayer:   'aibotics-tour-lesson-v2',
  blockEditor:    'aibotics-tour-blocks-v2',
  simPlayground:  'aibotics-tour-sim-v2',
};

// ─── Plan Picker ─────────────────────────────────────────────────────────────
export const PLAN_PICKER_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to AIbotics!',
    body: 'I\'m Spark, your AI robotics tutor. I\'ll guide you through everything — building robots, learning to code, and competing with friends.',
    targetSelector: null,
    placement: 'center',
    tutorSpeech: 'Hey there! So excited to meet you!',
    emoji: '👋',
  },
  {
    id: 'just-play',
    title: 'Just Play — free sandbox',
    body: 'Jump straight into the simulator with no login. Draw anything you want and experiment freely.',
    targetSelector: 'plan-card-solo',
    placement: 'right',
    showClickCursor: true,
    tutorSpeech: 'Perfect if you just want to explore first!',
    emoji: '✏️',
  },
  {
    id: 'personal-tutor',
    title: 'Personal Tutor — that\'s me!',
    body: 'Sign in and I\'ll create a personalized learning path, track your XP, award badges, and adapt each lesson to your pace.',
    targetSelector: 'plan-card-tutor',
    placement: 'right',
    showClickCursor: true,
    spotlightColor: 'rgba(168, 85, 247, 0.6)',
    tutorSpeech: 'This is how we level up together! 🚀',
    emoji: '🎓',
  },
  {
    id: 'join-class',
    title: 'Join a Class — team mode',
    body: 'If your teacher gave you a room code, enter it here. You\'ll compete with classmates in sumo, maze, and waypoint challenges!',
    targetSelector: 'plan-card-class',
    placement: 'right',
    showClickCursor: true,
    spotlightColor: 'rgba(107, 124, 255, 0.6)',
    tutorSpeech: 'Team battles are my favourite! ⚡',
    emoji: '👥',
  },
  {
    id: 'teacher',
    title: 'Teachers — dashboard & controls',
    body: 'Teachers get a full classroom dashboard: session codes, real-time leaderboards, robot pairing, and lesson plans.',
    targetSelector: 'plan-teacher-link',
    placement: 'top',
    tutorSpeech: 'Teachers — click the link at the bottom!',
    emoji: '📋',
  },
];

// ─── Student Home ─────────────────────────────────────────────────────────────
export const STUDENT_HOME_STEPS: TourStep[] = [
  {
    id: 'welcome-back',
    title: 'Your learning hub',
    body: 'This is your home base — see your progress, pick a lesson, or launch the simulator. Everything you need is right here.',
    targetSelector: null,
    placement: 'center',
    tutorSpeech: 'Back again? Let\'s continue your journey!',
    emoji: '🏠',
  },
  {
    id: 'profile',
    title: 'Your profile & XP',
    body: 'Track your XP, level, streak, and badges here. Click to customize your avatar and robot skin in the shop!',
    targetSelector: 'home-profile',
    placement: 'bottom',
    showClickCursor: true,
    tutorSpeech: 'You\'re level {level}! Keep going!',
    emoji: '⭐',
  },
  {
    id: 'sparks',
    title: 'Sparks — the game currency',
    body: 'Earn ⚡ Sparks by completing lessons, winning challenges, and daily streaks. Spend them in the Avatar Shop on skins, trails, and emotes.',
    targetSelector: 'header-sparks',
    placement: 'bottom',
    spotlightColor: 'rgba(255, 201, 107, 0.6)',
    tutorSpeech: 'Collect them all! The shop has cool stuff!',
    emoji: '⚡',
  },
  {
    id: 'topics',
    title: 'Pick your lesson',
    body: 'Start with Free Draw, explore geometry and coordinates, or head to the robot labs — each concept has 3 depth layers: Intuitive, Structural, and Precise.',
    targetSelector: 'home-topics',
    placement: 'top',
    showClickCursor: true,
    tutorSpeech: 'Not sure where to start? Try coordinates!',
    emoji: '📚',
  },
  {
    id: 'progress-map',
    title: 'Your progress map',
    body: 'Click "Map" to see your Duolingo-style learning path. Complete concepts to unlock new ones, earn chest rewards, and climb the league ranks.',
    targetSelector: 'header-map-btn',
    placement: 'bottom',
    showClickCursor: true,
    spotlightColor: 'rgba(93, 228, 255, 0.5)',
    tutorSpeech: 'The map shows your whole journey at a glance!',
    emoji: '🗺️',
  },
];

// ─── Student Session ──────────────────────────────────────────────────────────
export const STUDENT_SESSION_STEPS: TourStep[] = [
  {
    id: 'concept-overview',
    title: 'You picked a lesson!',
    body: 'Every concept has 3 layers — Intuitive (explore), Structural (build), and Precise (code & math). Start intuitive and unlock deeper layers as you progress.',
    targetSelector: null,
    placement: 'center',
    tutorSpeech: 'Let\'s dive in! I\'ll guide you every step.',
    emoji: '🚀',
  },
  {
    id: 'hub',
    title: 'Navigation & concept switcher',
    body: 'Switch between concepts and age groups here. Click your concept name to browse all available lessons.',
    targetSelector: 'session-hub',
    placement: 'bottom',
    showClickCursor: true,
    tutorSpeech: 'You can always switch topics from up here!',
    emoji: '🔀',
  },
  {
    id: 'workspace',
    title: 'Simulator, camera & code',
    body: 'Three tabs: Simulator (3D preview), Live Camera (connect your real robot), and Programming (blocks or code).',
    targetSelector: 'session-tabs',
    placement: 'bottom',
    showClickCursor: true,
    tutorSpeech: 'The simulator is always safe to experiment in!',
    emoji: '🖥️',
  },
  {
    id: 'sim-3d',
    title: 'The 3D simulator',
    body: 'Watch your robot come alive in 3D. Each concept has its own arena — sumo ring, maze, waypoint course, or drawing canvas.',
    targetSelector: 'sim-viewport',
    placement: 'bottom',
    spotlightColor: 'rgba(93, 228, 255, 0.4)',
    tutorSpeech: 'Click the arena and drag to rotate the view!',
    emoji: '🤖',
  },
  {
    id: 'prompt',
    title: 'Describe what to do',
    body: 'Type a natural language command ("draw a square") or use blocks and code. The AI converts it to robot instructions automatically.',
    targetSelector: 'session-prompt',
    placement: 'top',
    showClickCursor: true,
    tutorSpeech: 'Just tell me what you want to build!',
    emoji: '💬',
  },
  {
    id: 'tutor',
    title: 'I\'m right here — always',
    body: 'Ask me anything! Hints, challenge explanations, coding help, or concept questions. I adapt my answers to your level.',
    targetSelector: 'session-tutor',
    placement: 'left',
    tutorSpeech: 'Chat with me anytime — I never judge! 😊',
    emoji: '💡',
  },
  {
    id: 'layers',
    title: 'Unlock deeper layers',
    body: 'Complete the Intuitive layer to unlock Structural. When you\'re ready, I\'ll suggest going deeper right here in the tutor panel — complete all 3 layers to earn a badge + Sparks!',
    targetSelector: 'session-tutor',
    placement: 'left',
    spotlightColor: 'rgba(168, 85, 247, 0.5)',
    tutorSpeech: 'Three stars = mastered! Can you do it? 🌟',
    emoji: '🏆',
  },
  {
    id: 'xp-bar',
    title: 'XP & level up!',
    body: 'Every drawing you submit earns XP. Pass the AI evaluation to earn bonus XP and Sparks. Hit milestones to level up!',
    targetSelector: 'gamification-bar',
    placement: 'bottom',
    tutorSpeech: 'You\'re so close to the next level!',
    emoji: '📈',
  },
];

// ─── Progress Map ─────────────────────────────────────────────────────────────
export const PROGRESS_MAP_STEPS: TourStep[] = [
  {
    id: 'map-intro',
    title: 'Your learning path',
    body: 'This is your AIbotics journey map — like Duolingo but for robotics! Complete concepts to unlock new nodes on the path.',
    targetSelector: null,
    placement: 'center',
    tutorSpeech: 'Every node is a concept you can master!',
    emoji: '🗺️',
  },
  {
    id: 'map-leagues',
    title: 'League sections',
    body: 'The path is divided into leagues: Rookie, Explorer, Builder, and Engineer. Progress through all four to become a Master Engineer!',
    targetSelector: 'pmap-league-rookie',
    placement: 'right',
    tutorSpeech: 'I started as a Rookie too! You\'ve got this!',
    emoji: '🌱',
  },
  {
    id: 'map-nodes',
    title: 'Concept nodes — tap to expand',
    body: 'Tap any unlocked node to see details and start or continue that lesson. Stars show how many layers you\'ve completed (max 3).',
    targetSelector: 'pmap-first-node',
    placement: 'right',
    showClickCursor: true,
    spotlightColor: 'rgba(93, 228, 255, 0.5)',
    tutorSpeech: 'Three stars means you totally nailed it!',
    emoji: '⭐',
  },
  {
    id: 'map-chests',
    title: 'Milestone chests 📦',
    body: 'Complete milestones to unlock treasure chests! Bronze, silver, gold, and legendary chests contain Sparks and bonus cosmetic items.',
    targetSelector: 'pmap-chest',
    placement: 'right',
    spotlightColor: 'rgba(251, 191, 36, 0.6)',
    showClickCursor: true,
    tutorSpeech: 'Opening a legendary chest is SO satisfying!',
    emoji: '📦',
  },
  {
    id: 'map-sparks',
    title: '⚡ Sparks & the Avatar Shop',
    body: 'Click the Sparks button to open the Avatar Shop! Spend Sparks on robot body skins, color accents, particle trails, emotes, and badge frames.',
    targetSelector: 'pmap-sparks-btn',
    placement: 'bottom',
    showClickCursor: true,
    spotlightColor: 'rgba(255, 201, 107, 0.6)',
    tutorSpeech: 'I love the rainbow trail — just saying! 🌈',
    emoji: '🛍️',
  },
];

// ─── Challenge ────────────────────────────────────────────────────────────────
export const CHALLENGE_STEPS: TourStep[] = [
  {
    id: 'challenge-intro',
    title: 'Challenge mode!',
    body: 'Time to put your skills to the test. Each challenge has a specific goal — knock out cones, defeat opponents in sumo, or navigate a maze.',
    targetSelector: null,
    placement: 'center',
    tutorSpeech: 'No more practice — this is the real deal!',
    emoji: '🏆',
  },
  {
    id: 'challenge-arena',
    title: 'The arena',
    body: 'Watch the 3D simulation — your robot is already in position. Study the layout before you start coding your strategy.',
    targetSelector: 'sim-viewport',
    placement: 'bottom',
    spotlightColor: 'rgba(255, 79, 107, 0.4)',
    tutorSpeech: 'Rotate the view to see all the angles!',
    emoji: '👁️',
  },
  {
    id: 'challenge-scoring',
    title: 'Scoring system',
    body: 'Points are awarded for speed, accuracy, and creativity. Earn bonus Sparks for perfect scores. Beat classmates to top the leaderboard!',
    targetSelector: 'sim-score-panel',
    placement: 'left',
    spotlightColor: 'rgba(251, 191, 36, 0.5)',
    tutorSpeech: 'Go for 100% — the bonus Sparks are worth it!',
    emoji: '📊',
  },
  {
    id: 'challenge-strategy',
    title: 'Build your strategy',
    body: 'Use blocks or code to program your robot. Think about: approach angle, speed control, when to push vs. retreat.',
    targetSelector: 'session-prompt',
    placement: 'top',
    showClickCursor: true,
    tutorSpeech: 'Ask me for a hint if you get stuck! 😄',
    emoji: '🧠',
  },
];

// ─── Lesson Player ────────────────────────────────────────────────────────────
export const LESSON_PLAYER_STEPS: TourStep[] = [
  {
    id: 'lesson-welcome',
    title: 'Guided lesson mode',
    body: 'I\'ve prepared a step-by-step lesson for you. Read each slide, answer the quiz questions, and complete the challenge at the end!',
    targetSelector: null,
    placement: 'center',
    tutorSpeech: 'Let\'s learn something new together!',
    emoji: '📖',
  },
  {
    id: 'lesson-progress',
    title: 'Lesson progress',
    body: 'This bar shows how far you\'ve gotten. Complete all steps to earn lesson XP and Sparks.',
    targetSelector: 'lesson-progress-bar',
    placement: 'bottom',
    tutorSpeech: 'You\'re making great progress!',
    emoji: '📏',
  },
  {
    id: 'lesson-quiz',
    title: 'Quick-fire quizzes',
    body: 'Answer correctly on the first try for bonus XP! No pressure — wrong answers just mean we review the concept again.',
    targetSelector: 'lesson-quiz-section',
    placement: 'top',
    spotlightColor: 'rgba(93, 228, 255, 0.4)',
    tutorSpeech: 'Take your time — there\'s no timer!',
    emoji: '❓',
  },
  {
    id: 'lesson-challenge',
    title: 'Mini challenge at the end',
    body: 'Apply what you learned in a short code or blocks challenge. Completing it earns the biggest XP reward of the lesson!',
    targetSelector: 'lesson-challenge-section',
    placement: 'top',
    spotlightColor: 'rgba(168, 85, 247, 0.5)',
    tutorSpeech: 'You\'ve got everything you need — go for it!',
    emoji: '🎯',
  },
];

// ─── Block Editor ─────────────────────────────────────────────────────────────
export const BLOCK_EDITOR_STEPS: TourStep[] = [
  {
    id: 'blocks-intro',
    title: 'Visual block programming',
    body: 'Drag and drop blocks to build robot programs — no typing required! This is the Structural layer of every concept.',
    targetSelector: null,
    placement: 'center',
    tutorSpeech: 'Blocks = real code, just visually!',
    emoji: '🧩',
  },
  {
    id: 'blocks-palette',
    title: 'Block palette',
    body: 'Categories on the left: Motion, Drawing, Math, Control, and Sensors. Drag blocks to the canvas to build your program.',
    targetSelector: 'block-palette',
    placement: 'right',
    showClickCursor: true,
    tutorSpeech: 'Try dragging a "Move Forward" block first!',
    emoji: '📦',
  },
  {
    id: 'blocks-canvas',
    title: 'The canvas',
    body: 'Connect blocks by snapping them together. Blocks must connect to the "Start" block to run. Use the trash icon to delete.',
    targetSelector: 'block-canvas',
    placement: 'top',
    tutorSpeech: 'Snap them together — it clicks into place!',
    emoji: '🖼️',
  },
  {
    id: 'blocks-run',
    title: 'Run your program',
    body: 'Hit Run to execute your blocks in the simulator. Watch your robot respond in real time. Adjust and try again!',
    targetSelector: 'block-run-btn',
    placement: 'bottom',
    showClickCursor: true,
    spotlightColor: 'rgba(77, 255, 184, 0.5)',
    tutorSpeech: 'Hit run and watch the magic happen! ✨',
    emoji: '▶️',
  },
  {
    id: 'blocks-code',
    title: 'See the generated code',
    body: 'Switch to Code mode to see the Python code your blocks generated. This is how blocks teach real programming!',
    targetSelector: 'block-code-toggle',
    placement: 'bottom',
    showClickCursor: true,
    tutorSpeech: 'Your blocks ARE code — pretty cool, right?',
    emoji: '💻',
  },
];

// ─── Sim Playground ───────────────────────────────────────────────────────────
export const SIM_PLAYGROUND_STEPS: TourStep[] = [
  {
    id: 'sim-welcome',
    title: 'The 3D simulator',
    body: 'This is your safe sandbox — test any program here before running it on a real robot. Drag to rotate, scroll to zoom.',
    targetSelector: 'sim-viewport',
    placement: 'bottom',
    spotlightColor: 'rgba(93, 228, 255, 0.4)',
    tutorSpeech: 'No robots were harmed in testing this!',
    emoji: '🌐',
  },
  {
    id: 'sim-tutorial',
    title: 'Step-by-step tutorial',
    body: 'Click the 📖 button to open the tutorial panel — I\'ll walk you through each concept with animations and hints.',
    targetSelector: 'sim-tutorial-btn',
    placement: 'bottom',
    showClickCursor: true,
    tutorSpeech: 'I prepared special tutorials for each topic!',
    emoji: '📖',
  },
  {
    id: 'sim-score',
    title: 'Live scoring',
    body: 'See your score update in real time as your robot performs. Each metric has a breakdown — tap to see details.',
    targetSelector: 'sim-score-btn',
    placement: 'left',
    spotlightColor: 'rgba(251, 191, 36, 0.5)',
    tutorSpeech: 'Aim for 100% — it\'s totally achievable!',
    emoji: '🏆',
  },
  {
    id: 'sim-env-badge',
    title: 'Concept environment badge',
    body: 'This badge shows which concept you\'re exploring. Every concept has its own arena, lighting, and props — tailored to the lesson!',
    targetSelector: 'sim-env-badge',
    placement: 'bottom',
    tutorSpeech: 'Each arena was designed just for that skill!',
    emoji: '🎨',
  },
];

// ─── Registry ────────────────────────────────────────────────────────────────

export function stepsForFlow(flow: TourFlowId): TourStep[] {
  switch (flow) {
    case 'planPicker':     return PLAN_PICKER_STEPS;
    case 'studentHome':   return STUDENT_HOME_STEPS;
    case 'studentSession': return STUDENT_SESSION_STEPS;
    case 'progressMap':   return PROGRESS_MAP_STEPS;
    case 'challenge':     return CHALLENGE_STEPS;
    case 'lessonPlayer':  return LESSON_PLAYER_STEPS;
    case 'blockEditor':   return BLOCK_EDITOR_STEPS;
    case 'simPlayground': return SIM_PLAYGROUND_STEPS;
    default: return [];
  }
}

export function storageKeyForFlow(flow: TourFlowId): string {
  return GUIDED_TOUR_STORAGE[flow] ?? 'motrix-tour-unknown';
}

export function hasDoneTour(flow: TourFlowId): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(storageKeyForFlow(flow)) === '1';
}

export function markTourDone(flow: TourFlowId): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(storageKeyForFlow(flow), '1');
}

export function resetTour(flow: TourFlowId): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(storageKeyForFlow(flow));
}
