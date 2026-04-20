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
  | 'track'       // curved race track with control nodes
  | 'lab'         // computer-vision sensor lab
  | 'studio'      // geometry studio with drafting props
  | 'circuit'     // systems engineering circuit board floor

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

  'coord-systems': {
    label: 'Coordinate Grid Arena',
    arenaType: 'open',
    background: '#060a18',
    fog: ['#060a18', 14, 38],
    groundColor: '#080c18',
    gridColor: '#1a2a50',
    sectionColor: '#2a3e7a',
    ambientColor: '#c8d4ff',
    keyLightColor: '#d0e8ff',
    fillLightColor: '#8ab0ff',
    accentColor: '#4080ff',
    waypoints: [
      { x: -0.8, z: -0.6, color: '#ff4060', label: 'A' },
      { x: 0.8, z: -0.6, color: '#4080ff', label: 'B' },
      { x: 0, z: 0.8, color: '#4dffb8', label: 'C' },
      { x: -0.8, z: 0.6, color: '#ffd440', label: 'D' },
    ],
    tutorials: {
      intuitive: [
        'Can you tell the robot where point A is on the grid?',
        'Every spot on the floor has a secret address — try moving your robot to (2, 3).',
        'What happens when both numbers are negative? Explore the other side!',
      ],
      structural: [
        'Set up the X and Y axes by placing waypoints at each corner.',
        'Write a command that moves the robot from origin (0,0) to point (3,2).',
        'Challenge: reach all 4 waypoints in the fewest moves.',
      ],
      precise: [
        'Express each waypoint as a vector from the origin.',
        'Calculate the Euclidean distance between A and C.',
        'Prove your path is optimal by comparing |AB| + |BC| vs |AC|.',
      ],
    },
    scoring: {
      label: 'Navigation Score',
      metrics: [
        { name: 'Accuracy', maxPoints: 40, description: 'Stopping within 5 cm of each target' },
        { name: 'Efficiency', maxPoints: 30, description: 'Total path length vs optimal route' },
        { name: 'Speed', maxPoints: 20, description: 'Completion time' },
        { name: 'Concept mastery', maxPoints: 10, description: 'Correctly name all axis directions' },
      ],
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

  'computer-vision': {
    label: 'Vision Lab',
    arenaType: 'lab',
    background: '#04081a',
    fog: ['#04081a', 12, 32],
    groundColor: '#060a1c',
    gridColor: '#0a1040',
    sectionColor: '#101860',
    ambientColor: '#c0c8ff',
    keyLightColor: '#d0d8ff',
    fillLightColor: '#8090ff',
    accentColor: '#5060ff',
    waypoints: [
      { x: -0.7, z: -0.5, color: '#ff2060', label: '◎' },
      { x: 0.7, z: -0.5, color: '#ff2060', label: '◎' },
      { x: 0, z: 0.7, color: '#ff2060', label: '◎' },
    ],
    tutorials: {
      intuitive: [
        'The robot has a camera eye — can it find the red marker?',
        'Cover one AprilTag and see how the robot reacts!',
        'How does the robot know which way it is facing?',
      ],
      structural: [
        'Set up the camera calibration block and detect all 4 AprilTags.',
        'Write code that makes the robot drive toward the biggest colored blob.',
        'Challenge: detect when the robot crosses a drawn line.',
      ],
      precise: [
        'Implement homographic transformation from camera pixels to world coords.',
        'Compute the robot pose using PnP from AprilTag corners.',
        'Kalman filter: fuse odometry and camera pose estimates.',
      ],
    },
    scoring: {
      label: 'Detection Score',
      metrics: [
        { name: 'Tag detection', maxPoints: 40, description: 'AprilTags successfully localized' },
        { name: 'Pose accuracy', maxPoints: 35, description: 'Position error vs ground truth' },
        { name: 'Robustness', maxPoints: 25, description: 'Performance under partial occlusion' },
      ],
    },
  },

  'control-theory': {
    label: 'PID Control Track',
    arenaType: 'track',
    background: '#0c0800',
    fog: ['#0c0800', 14, 38],
    groundColor: '#100a00',
    gridColor: '#201400',
    sectionColor: '#302000',
    ambientColor: '#ffe8b0',
    keyLightColor: '#fff0c0',
    fillLightColor: '#ffc060',
    accentColor: '#ff8c00',
    waypoints: [
      { x: -1.0, z: 0, color: '#ff8c00', label: 'Start' },
      { x: 1.0, z: 0, color: '#ff4060', label: 'End' },
    ],
    tutorials: {
      intuitive: [
        'Watch what happens when the robot overshoots the target — it wiggles!',
        'Can you adjust the sensitivity to make it stop smoothly?',
        'Imagine you\'re steering a remote-control car — how do you avoid crashing?',
      ],
      structural: [
        'Use the PID sliders to tune Kp, Ki, and Kd.',
        'Graph the error over time — what shape appears with too much Kp?',
        'Challenge: reach the target in under 3 seconds with <2 cm overshoot.',
      ],
      precise: [
        'Implement a discrete PID controller: u(t) = Kp·e + Ki·∫e dt + Kd·ė.',
        'Tune using Ziegler-Nichols method (find Ku and Tu).',
        'Add anti-windup to clamp the integral term.',
      ],
    },
    scoring: {
      label: 'Control Score',
      metrics: [
        { name: 'Settle time', maxPoints: 35, description: 'Time to reach ±2% of target' },
        { name: 'Overshoot', maxPoints: 30, description: 'Max overshoot percentage' },
        { name: 'Steady state', maxPoints: 25, description: 'Final error from target' },
        { name: 'Tuning insight', maxPoints: 10, description: 'Explanation of each parameter' },
      ],
    },
  },

  'trigonometry-motion': {
    label: 'Unit Circle Field',
    arenaType: 'open',
    background: '#08060e',
    fog: ['#08060e', 14, 36],
    groundColor: '#0a0812',
    gridColor: '#181028',
    sectionColor: '#241840',
    ambientColor: '#d0c0ff',
    keyLightColor: '#e8d8ff',
    fillLightColor: '#a080ff',
    accentColor: '#7040ff',
    waypoints: [
      { x: 0.9, z: 0, color: '#ff4060', label: '0°' },
      { x: 0, z: -0.9, color: '#4dffb8', label: '90°' },
      { x: -0.9, z: 0, color: '#4080ff', label: '180°' },
      { x: 0, z: 0.9, color: '#ffd440', label: '270°' },
    ],
    tutorials: {
      intuitive: [
        'Make the robot drive in a circle — what shape appears on the paper?',
        'Sine and cosine are just the robot\'s X and Y position as it goes around!',
        'Can you draw a figure-8? What angles does the robot use?',
      ],
      structural: [
        'Use sin(t) and cos(t) to drive in a circle of radius 0.5 m.',
        'Challenge: draw a spiral by increasing the radius over time.',
        'Encode a lemniscate (figure-8): x = cos(t), y = sin(2t)/2.',
      ],
      precise: [
        'Derive the wheel velocities for circular motion: v = ωr, Δv = ωd.',
        'Parametrize a rose curve: r = cos(kθ).',
        'Implement continuous curvature splines between waypoints.',
      ],
    },
    scoring: {
      label: 'Curve Score',
      metrics: [
        { name: 'Circularity', maxPoints: 40, description: 'How round the circle is (eccentricity)' },
        { name: 'Radius accuracy', maxPoints: 30, description: 'Target vs actual radius' },
        { name: 'Smoothness', maxPoints: 30, description: 'Curvature variance along the path' },
      ],
    },
  },

  'systems-engineering': {
    label: 'Systems Lab',
    arenaType: 'circuit',
    background: '#000d0a',
    fog: ['#000d0a', 14, 36],
    groundColor: '#001008',
    gridColor: '#002010',
    sectionColor: '#003018',
    ambientColor: '#a0ffd0',
    keyLightColor: '#c0fff0',
    fillLightColor: '#40ffb0',
    accentColor: '#00e870',
    tutorials: {
      intuitive: [
        'Your robot is a system — it has inputs, outputs, and states. Can you name one of each?',
        'What happens if the battery gets low? Which part of the system changes?',
        'Draw a block diagram of your robot on the paper!',
      ],
      structural: [
        'Map out subsystems: sensing → planning → actuation.',
        'Build a finite state machine with three states: Idle, Draw, Return.',
        'Add an error recovery state that triggers when sensing fails.',
      ],
      precise: [
        'Write a state transition matrix for your FSM.',
        'Implement a watchdog timer using a hardware interrupt simulation.',
        'Profile memory and CPU usage per subsystem and identify bottlenecks.',
      ],
    },
    scoring: {
      label: 'System Score',
      metrics: [
        { name: 'Modularity', maxPoints: 35, description: 'Clean separation of subsystems' },
        { name: 'Robustness', maxPoints: 35, description: 'Handles sensor failures gracefully' },
        { name: 'Efficiency', maxPoints: 30, description: 'Resource usage per task' },
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
  return (
    (conceptId ? CONCEPT_ENVIRONMENTS[conceptId] : null) ??
    CONCEPT_ENVIRONMENTS['coord-systems']!
  );
}

export function getTutorialSteps(
  conceptId: string | null | undefined,
  layer: 'intuitive' | 'structural' | 'precise',
): string[] {
  const env = getEnvironment(conceptId);
  return env.tutorials[layer];
}
