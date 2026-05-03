/**
 * Per-concept 3D environment definitions.
 * Each concept gets a unique arena type, color scheme, props layout,
 * tutorial steps per layer, and scoring rules.
 */

export type ArenaType =
  | 'open'        // default open workspace
  | 'sumo'        // circular raised ring
  | 'cone-ring'   // orange cones arranged in gauntlet ring
  | 'maze'        // wall segments forming a navigable maze
  | 'studio'      // geometry studio with drafting props

export type WaypointMarker = {
  x: number;
  z: number;
  color: string;
  label?: string;
};

export type ConeProp = {
  x: number;
  z: number;
  scale?: number;
};

export type WallSegment = {
  x: number;
  z: number;
  width: number;
  depth: number;
  rotation?: number; // Y rotation in radians
};

export type ScoringMetric = {
  name: string;
  maxPoints: number;
  description: string;
};

export type ConceptEnvironment = {
  label: string;
  arenaType: ArenaType;

  // Scene colors
  background: string;
  fog: [string, number, number];
  groundColor: string;
  gridColor: string;
  sectionColor: string;

  // Lighting tints
  ambientColor: string;
  keyLightColor: string;
  fillLightColor: string;
  accentColor: string;

  // Props
  cones?: ConeProp[];
  waypoints?: WaypointMarker[];
  walls?: WallSegment[];
  sumoRingRadius?: number;

  // Tutorial text per layer
  tutorials: {
    intuitive: string[];
    structural: string[];
    precise: string[];
  };

  // Scoring
  scoring: {
    label: string;
    metrics: ScoringMetric[];
  };
};

// ─── Helper ───────────────────────────────────────────────────────────────────

function ringCones(count: number, radius: number, scale = 1): ConeProp[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, scale };
  });
}

// ─── Environment Registry ─────────────────────────────────────────────────────

export const CONCEPT_ENVIRONMENTS: Record<string, ConceptEnvironment> = {

  // Clean blank canvas — no cones, walls, or waypoints. Used by Sandbox / blank sessions.
  // Tuned for "warm play space" — softer twilight backdrop, brighter floor, warmer
  // ambient so kids don't feel like they've walked into a server room. The floor
  // is intentionally lighter and slightly more violet than the background so it
  // reads as a distinct stage instead of blending into the void.
  'sandbox': {
    label: 'Sandbox',
    arenaType: 'open',
    background: '#23264e',
    fog: ['#23264e', 16, 40],
    groundColor: '#3b3e7a',
    gridColor: '#5a629c',
    sectionColor: '#828bc8',
    ambientColor: '#d8d8ff',
    keyLightColor: '#fff8ee',
    fillLightColor: '#cfd8ff',
    accentColor: '#5de4ff',
    tutorials: {
      intuitive: [
        'Free play — try anything!',
        'Drop in objects from the library or just draw freely.',
        'Ask Spark for ideas anytime.',
      ],
      structural: [
        'Use blocks to build your own challenge.',
        'Combine shapes, robots, and obstacles however you like.',
      ],
      precise: [
        'Write Python to procedurally place objects.',
        'Build your own scoring rules and run experiments.',
      ],
    },
    scoring: {
      label: 'Sandbox',
      metrics: [],
    },
  },

  'path-planning': {
    label: 'Waypoint Gauntlet',
    arenaType: 'open',
    background: '#040d12',
    fog: ['#040d12', 14, 36],
    groundColor: '#060f14',
    gridColor: '#0a2030',
    sectionColor: '#123040',
    ambientColor: '#b0e8ff',
    keyLightColor: '#c0f0ff',
    fillLightColor: '#60c0ff',
    accentColor: '#00d4ff',
    waypoints: [
      { x: -1.20, z: -0.90, color: '#ff4060', label: '1' },
      { x: -0.20, z: -1.20, color: '#ff8c00', label: '2' },
      { x:  0.90, z: -0.65, color: '#ffd440', label: '3' },
      { x:  1.20, z:  0.30, color: '#4dffb8', label: '4' },
      { x:  0.45, z:  1.10, color: '#4080ff', label: '5' },
      { x: -0.60, z:  1.00, color: '#a855f7', label: '6' },
      { x: -1.10, z:  0.10, color: '#ff4fd8', label: '7' },
    ],
    tutorials: {
      intuitive: [
        'Guide your robot through all 5 checkpoints — in order!',
        'Which route looks shortest to you? Try it!',
        'Challenge: can you find a path that visits every point exactly once?',
      ],
      structural: [
        'Use the waypoint editor to drop markers and auto-generate a path.',
        'Experiment with different ordering — which order minimizes total distance?',
        'Block code: loop through each waypoint and move to it.',
      ],
      precise: [
        'Implement a greedy nearest-neighbor TSP algorithm.',
        'Calculate the total tour cost for each permutation.',
        'Bonus: implement 2-opt local search to improve your route.',
      ],
    },
    scoring: {
      label: 'Route Efficiency',
      metrics: [
        { name: 'Completion', maxPoints: 50, description: 'Checkpoints visited in order' },
        { name: 'Path length', maxPoints: 30, description: 'Total travel distance vs optimal' },
        { name: 'Smoothness', maxPoints: 20, description: 'Number of turns and direction changes' },
      ],
    },
  },

  'geometry-drawing': {
    label: 'Geometry Studio',
    arenaType: 'studio',
    background: '#0a0a14',
    fog: ['#0a0a14', 16, 40],
    groundColor: '#0c0c18',
    gridColor: '#1a1a30',
    sectionColor: '#282848',
    ambientColor: '#e8d8ff',
    keyLightColor: '#fff0f8',
    fillLightColor: '#c0a0ff',
    accentColor: '#9060ff',
    tutorials: {
      intuitive: [
        'Ask the robot to draw a square. What words do you use?',
        'Can you make it draw a star with 5 points?',
        'What is the biggest circle that fits on the paper?',
      ],
      structural: [
        'Use a repeat block to draw a regular hexagon (6 equal sides).',
        'Combine shapes: draw a house outline using a square and a triangle.',
        'Challenge: draw a spiral by increasing step size each loop.',
      ],
      precise: [
        'Parametrize a regular polygon with n sides using sin/cos.',
        'Draw a Lissajous figure: x = A·sin(at+δ), y = B·sin(bt).',
        'Implement a turtle-geometry L-system for a fractal curve.',
      ],
    },
    scoring: {
      label: 'Drawing Score',
      metrics: [
        { name: 'Precision', maxPoints: 40, description: 'How close shapes are to ideal geometry' },
        { name: 'Creativity', maxPoints: 30, description: 'Complexity and originality of design' },
        { name: 'Symmetry', maxPoints: 20, description: 'Detected symmetry axes' },
        { name: 'Coverage', maxPoints: 10, description: 'Good use of canvas space' },
      ],
    },
  },

  'cone-ring-gauntlet': {
    label: 'Cone Ring Gauntlet',
    arenaType: 'cone-ring',
    background: '#100500',
    fog: ['#100500', 12, 30],
    groundColor: '#140600',
    gridColor: '#201000',
    sectionColor: '#301800',
    ambientColor: '#ffe0a0',
    keyLightColor: '#fff0c0',
    fillLightColor: '#ff9040',
    accentColor: '#ff6600',
    cones: [
      ...ringCones(14, 1.55, 1.0),   // outer gate ring
      ...ringCones(10, 1.05, 0.80),  // mid ring
      ...ringCones(6,  0.55, 0.60),  // inner challenge ring
      ...ringCones(3,  0.22, 0.40),  // tight inner core
    ],
    tutorials: {
      intuitive: [
        'Navigate through the cone ring without knocking anything over!',
        'Speed matters — but so does accuracy. Find the balance.',
        'Can you complete the gauntlet without stopping?',
      ],
      structural: [
        'Program the robot to enter and exit through opposite gaps.',
        'Add a detection block: brake if a cone is within 10 cm.',
        'Challenge: run the gauntlet twice, reducing time each round.',
      ],
      precise: [
        'Model the cone positions as obstacles in a 2D occupancy grid.',
        'Run A* to find the collision-free path through the ring.',
        'Implement velocity profiling to slow before tight passages.',
      ],
    },
    scoring: {
      label: 'Gauntlet Score',
      metrics: [
        { name: 'Completion', maxPoints: 50, description: 'Full ring traversed without hitting cones' },
        { name: 'Time', maxPoints: 30, description: 'Fastest lap time' },
        { name: 'Clearance', maxPoints: 20, description: 'Minimum distance to any cone' },
      ],
    },
  },

  'sumo-arena': {
    label: 'Sumo Arena',
    arenaType: 'sumo',
    background: '#0e0000',
    fog: ['#0e0000', 12, 28],
    groundColor: '#100000',
    gridColor: '#200000',
    sectionColor: '#300000',
    ambientColor: '#ffc0b0',
    keyLightColor: '#ff8060',
    fillLightColor: '#ff4020',
    accentColor: '#ff2000',
    sumoRingRadius: 1.2,
    waypoints: [
      // Spectator markers surrounding the ring at 6 cardinal points
      { x:  0.00, z: -2.10, color: '#ff2000', label: '◉' },
      { x:  1.82, z: -1.05, color: '#ff4400', label: '◉' },
      { x:  1.82, z:  1.05, color: '#ff2000', label: '◉' },
      { x:  0.00, z:  2.10, color: '#ff4400', label: '◉' },
      { x: -1.82, z:  1.05, color: '#ff2000', label: '◉' },
      { x: -1.82, z: -1.05, color: '#ff4400', label: '◉' },
    ],
    tutorials: {
      intuitive: [
        'Stay inside the ring — the robot that leaves loses!',
        'Can you detect when you\'re near the edge using sensors?',
        'Strategy: push toward the center vs rush to the edge?',
      ],
      structural: [
        'Program an edge detection routine using the floor sensor.',
        'Build an opponent-finding behavior: spin and rush when detected.',
        'State machine: SEARCH → CHARGE → EDGE_AVOID → SEARCH.',
      ],
      precise: [
        'Implement a bang-bang controller for the edge-avoidance reflex.',
        'Use a potential field: repulsion from edges, attraction to opponent.',
        'Optimize charge velocity vs. maneuverability tradeoff.',
      ],
    },
    scoring: {
      label: 'Combat Score',
      metrics: [
        { name: 'Ring time', maxPoints: 40, description: 'Seconds spent inside the ring' },
        { name: 'Pushes', maxPoints: 30, description: 'Successful pushes toward ring edge' },
        { name: 'Reaction', maxPoints: 30, description: 'Speed of edge-avoidance response' },
      ],
    },
  },

  'maze-marathon': {
    label: 'Maze Marathon',
    arenaType: 'maze',
    background: '#000a00',
    fog: ['#000a00', 10, 26],
    groundColor: '#000c00',
    gridColor: '#001800',
    sectionColor: '#002800',
    ambientColor: '#a0ffb0',
    keyLightColor: '#c0ffc0',
    fillLightColor: '#40ff80',
    accentColor: '#00cc44',
    walls: [
      // Outer boundary
      { x:  0.00, z: -1.55, width: 3.10, depth: 0.10 },
      { x:  0.00, z:  1.55, width: 3.10, depth: 0.10 },
      { x: -1.55, z:  0.00, width: 0.10, depth: 3.10 },
      { x:  1.55, z:  0.00, width: 0.10, depth: 3.10 },
      // Denser inner maze
      { x: -0.75, z: -0.80, width: 0.10, depth: 1.30 },
      { x:  0.10, z: -0.50, width: 1.50, depth: 0.10 },
      { x:  0.90, z:  0.30, width: 0.10, depth: 1.10 },
      { x:  0.10, z:  1.00, width: 1.30, depth: 0.10 },
      { x: -0.90, z:  0.25, width: 0.10, depth: 0.70 },
      { x: -0.30, z: -1.10, width: 0.90, depth: 0.10 },
      { x:  0.50, z: -0.90, width: 0.10, depth: 0.50 },
      { x:  0.30, z:  0.50, width: 0.70, depth: 0.10 },
    ],
    waypoints: [
      { x: -1.25, z: -1.25, color: '#00ff44', label: 'S' },
      { x:  1.25, z:  1.25, color: '#ff2060', label: 'E' },
    ],
    tutorials: {
      intuitive: [
        'Follow the walls to find your way through the maze!',
        'What happens when you reach a dead end?',
        'Can you remember the path so you can go back faster?',
      ],
      structural: [
        'Implement left-hand wall-following: always keep left wall close.',
        'Mark visited cells and avoid dead-end branches.',
        'Challenge: solve in fewer steps than your first attempt.',
      ],
      precise: [
        'Implement depth-first search with backtracking on the maze graph.',
        'Encode the maze as an adjacency list and run Dijkstra\'s algorithm.',
        'Add real-time SLAM: build the map while navigating.',
      ],
    },
    scoring: {
      label: 'Maze Score',
      metrics: [
        { name: 'Completion', maxPoints: 50, description: 'Reached the exit' },
        { name: 'Path length', maxPoints: 30, description: 'Steps taken vs optimal path' },
        { name: 'Wall clearance', maxPoints: 20, description: 'No wall collisions' },
      ],
    },
  },
};

export function getEnvironment(conceptId: string | null | undefined): ConceptEnvironment {
  // Blank/null conceptId → sandbox (no cones, walls, or waypoints).
  // Unknown conceptId → still falls back to sandbox rather than path-planning,
  // so we never leak waypoint markers into a freshly created session.
  return (
    (conceptId ? CONCEPT_ENVIRONMENTS[conceptId] : null) ??
    CONCEPT_ENVIRONMENTS['sandbox']!
  );
}

export function getTutorialSteps(
  conceptId: string | null | undefined,
  layer: 'intuitive' | 'structural' | 'precise',
): string[] {
  const env = getEnvironment(conceptId);
  return env.tutorials[layer];
}
