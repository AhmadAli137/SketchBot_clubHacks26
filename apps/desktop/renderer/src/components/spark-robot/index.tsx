'use client';

import { motion, AnimatePresence } from 'motion/react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SparkPose =
  | 'idle' | 'wave' | 'celebrate' | 'think'
  | 'point' | 'thumbsup' | 'surprised' | 'sad';

export type SparkSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

type Spark3DProps = {
  mode: '3d';
  size?: SparkSize;
  showSpeech?: string | null;
  speechKey?: string | number;
  scene?: number; // 0–3, drives background / pose / prop
  /** Hide the floating prop emoji (trophy / map / lightning / etc).
   *  Useful in tight panels where the prop overlaps the visor. Default: true. */
  showProp?: boolean;
};

type Spark2DProps = {
  mode: '2d';
  pose?: SparkPose;
  size?: SparkSize;
  className?: string;
};

type SparkProps = Spark3DProps | Spark2DProps;

// ─── Size map ─────────────────────────────────────────────────────────────────

const SIZE_PX: Record<SparkSize, number> = {
  xs: 48, sm: 72, md: 100, lg: 140, xl: 200,
};

// ─── Scene configurations ─────────────────────────────────────────────────────

type SceneConfig = {
  bgKey: string;
  propEmoji: string;
  propLeft: string;
  propTop: number;
  propScale: number;
  glowColor: string;
  // Kinematic left arm: upper (shoulder) + lower (elbow)
  lUpperR: number[]; lUpperDur: number;
  lLowerR: number[]; lLowerDur: number;
  // Kinematic right arm
  rUpperR: number[]; rUpperDur: number;
  rLowerR: number[]; rLowerDur: number;
  bodyY: number[];
  bodyDur: number;
  bodyRotateZ?: number[];
  headRotateZ?: number[];
  headRotateY?: number[];
  /** Pitch — for head nods, looking up/down. */
  headRotateX?: number[];
  headDur: number;
  eyeHappy: boolean;
  chestBg: string;
  particleA: string;
  particleB: string;
  floaters: { emoji: string; x: number; y: number; delay: number; dur?: number }[];
};

const SCENES: SceneConfig[] = [
  // 0 — greeting / wave (left arm waves energetically)
  {
    bgKey: 'welcome', propEmoji: '✨', propLeft: 'calc(50% + 88px)', propTop: 60, propScale: 1.8,
    glowColor: '#5de4ff',
    lUpperR: [0, -62, -70, -62, -70, -62, 0],   lUpperDur: 0.92,
    lLowerR: [0, -28, -40, -28, -40, -28, 0],   lLowerDur: 0.92,
    rUpperR: [8, 4, 8],                          rUpperDur: 3.8,
    rLowerR: [-8, -4, -8],                       rLowerDur: 3.8,
    bodyY: [0, -14, 0], bodyDur: 3.6,
    bodyRotateZ: [0, 2, -1, 0],
    headRotateZ: [0, 6, -4, 2, 0], headDur: 3.6,
    eyeHappy: false,
    chestBg: 'linear-gradient(135deg,#3b82f6,#5de4ff)',
    particleA: '#5de4ff', particleB: '#a855f7',
    floaters: [
      { emoji: '✨', x: 9,  y: 15, delay: 0.2, dur: 2.8 },
      { emoji: '💫', x: 80, y: 28, delay: 0.6, dur: 3.2 },
      { emoji: '⭐', x: 56, y: 6,  delay: 1.0, dur: 3.6 },
      { emoji: '🌟', x: 18, y: 72, delay: 0.4, dur: 2.6 },
      { emoji: '💙', x: 72, y: 70, delay: 0.8, dur: 3.0 },
    ],
  },
  // 1 — guide / point (right arm points, head pans, map prop)
  {
    bgKey: 'guide', propEmoji: '🗺️', propLeft: 'calc(50% - 138px)', propTop: 130, propScale: 2.2,
    glowColor: '#6b7cff',
    lUpperR: [5, 8, 5],                          lUpperDur: 3.6,
    lLowerR: [-10, -6, -10],                     lLowerDur: 3.6,
    rUpperR: [-28, -25, -28],                    rUpperDur: 2.4,
    rLowerR: [-18, -14, -18],                    rLowerDur: 2.4,
    bodyY: [0, -12, 0], bodyDur: 4.2,
    headRotateY: [0, 10, 2, -4, 0], headDur: 4.8,
    eyeHappy: false,
    chestBg: 'linear-gradient(135deg,#6b7cff,#a855f7)',
    particleA: '#6b7cff', particleB: '#5de4ff',
    floaters: [
      { emoji: '🔵', x: 8,  y: 36, delay: 0.1, dur: 3.4 },
      { emoji: '🟣', x: 82, y: 20, delay: 0.5, dur: 2.9 },
      { emoji: '📡', x: 70, y: 65, delay: 0.9, dur: 3.1 },
      { emoji: '⚙️', x: 16, y: 74, delay: 0.3, dur: 3.6 },
    ],
  },
  // 2 — celebrate (both arms fist-pump up, head rocks, trophy)
  {
    bgKey: 'celebrate', propEmoji: '🏆', propLeft: 'calc(50% - 22px)', propTop: 28, propScale: 2.6,
    glowColor: '#ffc96b',
    lUpperR: [-68, -75, -68, -75, -68],   lUpperDur: 0.48,
    lLowerR: [-30, -42, -30, -42, -30],   lLowerDur: 0.48,
    rUpperR: [-68, -75, -68, -75, -68],   rUpperDur: 0.48,
    rLowerR: [-30, -42, -30, -42, -30],   rLowerDur: 0.48,
    bodyY: [0, -24, -8, -24, 0], bodyDur: 0.96,
    bodyRotateZ: [0, -4, 4, -2, 0],
    headRotateZ: [0, -10, 10, -6, 0], headDur: 0.96,
    eyeHappy: true,
    chestBg: 'linear-gradient(135deg,#ffc96b,#ff9f40)',
    particleA: '#ffc96b', particleB: '#ff4fd8',
    floaters: [
      { emoji: '🎉', x: 5,  y: 10, delay: 0,    dur: 2.4 },
      { emoji: '⭐', x: 80, y: 8,  delay: 0.25, dur: 2.8 },
      { emoji: '🎊', x: 12, y: 64, delay: 0.5,  dur: 2.6 },
      { emoji: '✨', x: 74, y: 60, delay: 0.75, dur: 3.0 },
      { emoji: '🎈', x: 42, y: 3,  delay: 0.4,  dur: 3.2 },
      { emoji: '🏅', x: 62, y: 14, delay: 0.6,  dur: 2.5 },
    ],
  },
  // 3 — adaptive / thumbs-up (right arm bent thumbs-up, lightning prop)
  {
    bgKey: 'adapt', propEmoji: '⚡', propLeft: 'calc(50% + 82px)', propTop: 155, propScale: 2.0,
    glowColor: '#4dffb8',
    lUpperR: [5, 8, 5],                          lUpperDur: 3.2,
    lLowerR: [-8, -4, -8],                       lLowerDur: 3.2,
    rUpperR: [-52, -50, -52],                    rUpperDur: 2.6,
    rLowerR: [22, 26, 22],                       rLowerDur: 2.6,
    bodyY: [0, -14, 0], bodyDur: 3.8,
    headRotateZ: [0, 4, -3, 0], headDur: 4.2,
    eyeHappy: true,
    chestBg: 'linear-gradient(135deg,#4dffb8,#1bb7d2)',
    particleA: '#4dffb8', particleB: '#6b7cff',
    floaters: [
      { emoji: '💡', x: 10, y: 26, delay: 0.1,  dur: 3.0 },
      { emoji: '🚀', x: 80, y: 16, delay: 0.45, dur: 2.8 },
      { emoji: '⚙️', x: 64, y: 68, delay: 0.8,  dur: 3.4 },
      { emoji: '🌈', x: 20, y: 72, delay: 0.35, dur: 2.6 },
    ],
  },
  // ─── 4 — idle / breathing (default neutral) ──────────────────────────────
  {
    bgKey: 'idle', propEmoji: '', propLeft: 'calc(50% + 88px)', propTop: 60, propScale: 0,
    glowColor: '#5de4ff',
    lUpperR: [4, 7, 4],                  lUpperDur: 4.4,
    lLowerR: [-6, -3, -6],               lLowerDur: 4.4,
    rUpperR: [-4, -7, -4],               rUpperDur: 4.4,
    rLowerR: [6, 3, 6],                  rLowerDur: 4.4,
    bodyY: [0, -5, 0], bodyDur: 4.0,
    headRotateY: [0, 3, 0, -3, 0], headDur: 5.4,
    eyeHappy: false,
    chestBg: 'linear-gradient(135deg,#3b82f6,#5de4ff)',
    particleA: '#5de4ff', particleB: '#a855f7',
    floaters: [],
  },
  // ─── 5 — listening (lean forward, attentive) ─────────────────────────────
  {
    bgKey: 'guide', propEmoji: '👂', propLeft: 'calc(50% - 110px)', propTop: 20, propScale: 1.4,
    glowColor: '#5de4ff',
    lUpperR: [12, 15, 12],               lUpperDur: 3.4,
    lLowerR: [-14, -10, -14],            lLowerDur: 3.4,
    rUpperR: [-12, -15, -12],            rUpperDur: 3.4,
    rLowerR: [14, 10, 14],               rLowerDur: 3.4,
    bodyY: [0, -3, 0], bodyDur: 3.0,
    headRotateX: [-6, -8, -6],           // slight forward lean
    headRotateY: [0, 4, -2, 0], headDur: 3.6,
    eyeHappy: false,
    chestBg: 'linear-gradient(135deg,#3b82f6,#5de4ff)',
    particleA: '#5de4ff', particleB: '#a855f7',
    floaters: [{ emoji: '💭', x: 60, y: 18, delay: 0.4, dur: 3.2 }],
  },
  // ─── 6 — thinking (right hand to chin, head tilt) ────────────────────────
  {
    bgKey: 'guide', propEmoji: '💭', propLeft: 'calc(50% + 70px)', propTop: 4, propScale: 1.6,
    glowColor: '#a855f7',
    lUpperR: [4, 6, 4],                  lUpperDur: 3.8,
    lLowerR: [-6, -3, -6],               lLowerDur: 3.8,
    rUpperR: [-78, -82, -78],            rUpperDur: 3.6,    // hand to chin
    rLowerR: [62, 64, 62],               rLowerDur: 3.6,
    bodyY: [0, -4, 0], bodyDur: 3.6,
    headRotateZ: [-6, -10, -6, -10, -6], headDur: 4.6,
    eyeHappy: false,
    chestBg: 'linear-gradient(135deg,#6b7cff,#a855f7)',
    particleA: '#a855f7', particleB: '#5de4ff',
    floaters: [
      { emoji: '🤔', x: 64, y: 8,  delay: 0.0, dur: 3.4 },
      { emoji: '?',  x: 78, y: 26, delay: 0.7, dur: 2.6 },
    ],
  },
  // ─── 7 — talking (subtle gestures + head bob) ────────────────────────────
  {
    bgKey: 'welcome', propEmoji: '', propLeft: 'calc(50% + 90px)', propTop: 70, propScale: 0,
    glowColor: '#5de4ff',
    lUpperR: [10, 18, 10, 14, 10],       lUpperDur: 1.4,
    lLowerR: [-12, -18, -12, -16, -12],  lLowerDur: 1.4,
    rUpperR: [-10, -18, -10, -14, -10],  rUpperDur: 1.6,
    rLowerR: [12, 18, 12, 16, 12],       rLowerDur: 1.6,
    bodyY: [0, -4, 0], bodyDur: 2.0,
    headRotateZ: [0, 2, -2, 0], headDur: 1.8,
    eyeHappy: false,
    chestBg: 'linear-gradient(135deg,#3b82f6,#5de4ff)',
    particleA: '#5de4ff', particleB: '#a855f7',
    floaters: [],
  },
  // ─── 8 — explaining (both hands gesture wider) ───────────────────────────
  {
    bgKey: 'guide', propEmoji: '✨', propLeft: 'calc(50% - 100px)', propTop: 90, propScale: 1.4,
    glowColor: '#6b7cff',
    lUpperR: [22, 30, 22, 28, 22],       lUpperDur: 2.2,
    lLowerR: [-26, -34, -26, -30, -26],  lLowerDur: 2.2,
    rUpperR: [-22, -30, -22, -28, -22],  rUpperDur: 2.4,
    rLowerR: [26, 34, 26, 30, 26],       rLowerDur: 2.4,
    bodyY: [0, -8, 0], bodyDur: 2.6,
    headRotateY: [0, 6, 0, -6, 0], headDur: 3.0,
    eyeHappy: false,
    chestBg: 'linear-gradient(135deg,#6b7cff,#a855f7)',
    particleA: '#6b7cff', particleB: '#5de4ff',
    floaters: [
      { emoji: '✨', x: 14, y: 30, delay: 0.2, dur: 3.0 },
      { emoji: '💡', x: 78, y: 22, delay: 0.6, dur: 2.8 },
    ],
  },
  // ─── 9 — questioning (one finger up, head tilt) ──────────────────────────
  {
    bgKey: 'guide', propEmoji: '❓', propLeft: 'calc(50% + 80px)', propTop: 0, propScale: 1.8,
    glowColor: '#a855f7',
    lUpperR: [6, 8, 6],                  lUpperDur: 3.4,
    lLowerR: [-8, -4, -8],               lLowerDur: 3.4,
    rUpperR: [-110, -114, -110],         rUpperDur: 2.8,    // finger up
    rLowerR: [-30, -26, -30],            rLowerDur: 2.8,
    bodyY: [0, -6, 0], bodyDur: 3.2,
    headRotateZ: [-12, -8, -12], headDur: 3.4,
    eyeHappy: false,
    chestBg: 'linear-gradient(135deg,#6b7cff,#a855f7)',
    particleA: '#a855f7', particleB: '#6b7cff',
    floaters: [
      { emoji: '❓', x: 70, y: 4,  delay: 0.0, dur: 2.6 },
      { emoji: '?',  x: 14, y: 22, delay: 0.5, dur: 3.2 },
    ],
  },
  // ─── 10 — encouraging (both arms forward, warm) ─────────────────────────
  {
    bgKey: 'celebrate', propEmoji: '💙', propLeft: 'calc(50% + 80px)', propTop: 60, propScale: 1.6,
    glowColor: '#4dffb8',
    lUpperR: [-30, -26, -30],            lUpperDur: 2.8,
    lLowerR: [-50, -46, -50],            lLowerDur: 2.8,
    rUpperR: [30, 26, 30],               rUpperDur: 2.8,
    rLowerR: [50, 46, 50],               rLowerDur: 2.8,
    bodyY: [0, -8, 0], bodyDur: 2.6,
    headRotateZ: [0, 3, 0, -3, 0], headDur: 3.0,
    eyeHappy: true,
    chestBg: 'linear-gradient(135deg,#4dffb8,#5de4ff)',
    particleA: '#4dffb8', particleB: '#5de4ff',
    floaters: [
      { emoji: '💙', x: 14, y: 56, delay: 0.2, dur: 2.8 },
      { emoji: '✨', x: 78, y: 50, delay: 0.5, dur: 3.0 },
    ],
  },
  // ─── 11 — nodding (yes, head pitch) ──────────────────────────────────────
  {
    bgKey: 'celebrate', propEmoji: '✅', propLeft: 'calc(50% + 88px)', propTop: 28, propScale: 1.4,
    glowColor: '#4dffb8',
    lUpperR: [6, 8, 6],                  lUpperDur: 3.0,
    lLowerR: [-8, -4, -8],               lLowerDur: 3.0,
    rUpperR: [-6, -8, -6],               rUpperDur: 3.0,
    rLowerR: [8, 4, 8],                  rLowerDur: 3.0,
    bodyY: [0, -3, 0], bodyDur: 1.4,
    headRotateX: [0, 14, 0, 12, 0],      // pitch forward = nodding yes
    headDur: 1.4,
    eyeHappy: true,
    chestBg: 'linear-gradient(135deg,#4dffb8,#1bb7d2)',
    particleA: '#4dffb8', particleB: '#5de4ff',
    floaters: [{ emoji: '✅', x: 78, y: 32, delay: 0.2, dur: 2.4 }],
  },
  // ─── 12 — clapping (both hands meet repeatedly) ─────────────────────────
  {
    bgKey: 'celebrate', propEmoji: '👏', propLeft: 'calc(50% - 24px)', propTop: 36, propScale: 1.8,
    glowColor: '#ffc96b',
    lUpperR: [-32, -36, -32, -36, -32], lUpperDur: 0.6,
    lLowerR: [-48, -54, -48, -54, -48], lLowerDur: 0.6,
    rUpperR: [32, 36, 32, 36, 32],       rUpperDur: 0.6,
    rLowerR: [48, 54, 48, 54, 48],       rLowerDur: 0.6,
    bodyY: [0, -6, 0, -6, 0], bodyDur: 1.2,
    headRotateZ: [0, 2, -2, 0], headDur: 1.6,
    eyeHappy: true,
    chestBg: 'linear-gradient(135deg,#ffc96b,#ff9f40)',
    particleA: '#ffc96b', particleB: '#ff4fd8',
    floaters: [
      { emoji: '👏', x: 18, y: 48, delay: 0.0, dur: 2.0 },
      { emoji: '👏', x: 70, y: 50, delay: 0.3, dur: 2.0 },
    ],
  },
  // ─── 13 — cheering (bouncing happy) ──────────────────────────────────────
  {
    bgKey: 'celebrate', propEmoji: '🎉', propLeft: 'calc(50% + 70px)', propTop: 6, propScale: 2.2,
    glowColor: '#ff4fd8',
    lUpperR: [-58, -64, -58, -64, -58],  lUpperDur: 0.7,
    lLowerR: [-26, -34, -26, -34, -26],  lLowerDur: 0.7,
    rUpperR: [-58, -64, -58, -64, -58],  rUpperDur: 0.72,
    rLowerR: [-26, -34, -26, -34, -26],  rLowerDur: 0.72,
    bodyY: [0, -22, -4, -22, 0], bodyDur: 1.0,
    headRotateZ: [0, -6, 6, -3, 0], headDur: 1.0,
    eyeHappy: true,
    chestBg: 'linear-gradient(135deg,#ff4fd8,#ffc96b)',
    particleA: '#ff4fd8', particleB: '#ffc96b',
    floaters: [
      { emoji: '🎉', x: 12, y: 12, delay: 0.0, dur: 2.4 },
      { emoji: '🎊', x: 78, y: 14, delay: 0.3, dur: 2.6 },
      { emoji: '⭐', x: 50, y: 4,  delay: 0.5, dur: 2.4 },
    ],
  },
  // ─── 14 — point-left ─────────────────────────────────────────────────────
  {
    bgKey: 'guide', propEmoji: '👈', propLeft: 'calc(50% - 130px)', propTop: 80, propScale: 1.6,
    glowColor: '#6b7cff',
    lUpperR: [-95, -90, -95],            lUpperDur: 3.2,    // arm out left
    lLowerR: [12, 16, 12],               lLowerDur: 3.2,
    rUpperR: [4, 8, 4],                  rUpperDur: 3.6,
    rLowerR: [-8, -4, -8],               rLowerDur: 3.6,
    bodyY: [0, -6, 0], bodyDur: 3.4,
    headRotateY: [-12, -16, -12], headDur: 3.4,             // look left
    eyeHappy: false,
    chestBg: 'linear-gradient(135deg,#6b7cff,#5de4ff)',
    particleA: '#6b7cff', particleB: '#5de4ff',
    floaters: [],
  },
  // ─── 15 — point-right ────────────────────────────────────────────────────
  {
    bgKey: 'guide', propEmoji: '👉', propLeft: 'calc(50% + 110px)', propTop: 80, propScale: 1.6,
    glowColor: '#6b7cff',
    lUpperR: [4, 8, 4],                  lUpperDur: 3.6,
    lLowerR: [-8, -4, -8],               lLowerDur: 3.6,
    rUpperR: [95, 90, 95],               rUpperDur: 3.2,    // arm out right
    rLowerR: [-12, -16, -12],            rLowerDur: 3.2,
    bodyY: [0, -6, 0], bodyDur: 3.4,
    headRotateY: [12, 16, 12], headDur: 3.4,                // look right
    eyeHappy: false,
    chestBg: 'linear-gradient(135deg,#6b7cff,#5de4ff)',
    particleA: '#6b7cff', particleB: '#5de4ff',
    floaters: [],
  },
  // ─── 16 — point-down (at sandbox) ────────────────────────────────────────
  {
    bgKey: 'guide', propEmoji: '👇', propLeft: 'calc(50% + 70px)', propTop: 130, propScale: 1.6,
    glowColor: '#5de4ff',
    lUpperR: [6, 8, 6],                  lUpperDur: 3.4,
    lLowerR: [-8, -4, -8],               lLowerDur: 3.4,
    rUpperR: [50, 54, 50],               rUpperDur: 2.8,
    rLowerR: [40, 44, 40],               rLowerDur: 2.8,
    bodyY: [0, -4, 0], bodyDur: 3.0,
    headRotateX: [10, 14, 10],           // look down
    headDur: 3.4,
    eyeHappy: false,
    chestBg: 'linear-gradient(135deg,#3b82f6,#5de4ff)',
    particleA: '#5de4ff', particleB: '#6b7cff',
    floaters: [{ emoji: '👇', x: 64, y: 90, delay: 0.0, dur: 2.6 }],
  },
  // ─── 17 — point-up (at the sky / "look up there!") ──────────────────────
  {
    bgKey: 'celebrate', propEmoji: '☝️', propLeft: 'calc(50% + 80px)', propTop: 0, propScale: 1.6,
    glowColor: '#ffc96b',
    lUpperR: [6, 8, 6],                  lUpperDur: 3.4,
    lLowerR: [-8, -4, -8],               lLowerDur: 3.4,
    rUpperR: [-130, -134, -130],         rUpperDur: 2.6,    // arm straight up
    rLowerR: [-12, -8, -12],             rLowerDur: 2.6,
    bodyY: [0, -8, 0], bodyDur: 2.8,
    headRotateX: [-12, -16, -12],        // look up
    headDur: 3.0,
    eyeHappy: true,
    chestBg: 'linear-gradient(135deg,#ffc96b,#5de4ff)',
    particleA: '#ffc96b', particleB: '#5de4ff',
    floaters: [{ emoji: '☝️', x: 70, y: 6, delay: 0.0, dur: 2.6 }],
  },
  // ─── 18 — surprised (arms up, eyes wide, jolt back) ─────────────────────
  {
    bgKey: 'adapt', propEmoji: '❗', propLeft: 'calc(50% + 86px)', propTop: 14, propScale: 2.0,
    glowColor: '#ff4fd8',
    lUpperR: [-92, -96, -92],            lUpperDur: 0.8,
    lLowerR: [-30, -36, -30],            lLowerDur: 0.8,
    rUpperR: [92, 96, 92],               rUpperDur: 0.8,
    rLowerR: [30, 36, 30],               rLowerDur: 0.8,
    bodyY: [-12, -16, -12], bodyDur: 1.2,
    bodyRotateZ: [0, 2, -2, 0],
    headRotateX: [-8, -12, -8],
    headDur: 1.6,
    eyeHappy: false,
    chestBg: 'linear-gradient(135deg,#ff4fd8,#ffc96b)',
    particleA: '#ff4fd8', particleB: '#ffc96b',
    floaters: [
      { emoji: '❗', x: 78, y: 6,  delay: 0.0, dur: 1.8 },
      { emoji: '✨', x: 18, y: 16, delay: 0.2, dur: 2.2 },
    ],
  },
  // ─── 19 — confused (head scratch, tilt) ──────────────────────────────────
  {
    bgKey: 'guide', propEmoji: '❓', propLeft: 'calc(50% - 110px)', propTop: 6, propScale: 1.6,
    glowColor: '#a855f7',
    lUpperR: [4, 6, 4],                  lUpperDur: 3.8,
    lLowerR: [-6, -3, -6],               lLowerDur: 3.8,
    rUpperR: [-115, -120, -115, -120, -115], rUpperDur: 1.6,    // hand on head
    rLowerR: [76, 80, 76, 80, 76],       rLowerDur: 1.6,
    bodyY: [0, -4, 0], bodyDur: 3.4,
    headRotateZ: [12, 16, 12, 16, 12], headDur: 2.0,
    eyeHappy: false,
    chestBg: 'linear-gradient(135deg,#6b7cff,#a855f7)',
    particleA: '#a855f7', particleB: '#6b7cff',
    floaters: [
      { emoji: '❓', x: 16, y: 6,  delay: 0.0, dur: 3.2 },
      { emoji: '?',  x: 4,  y: 22, delay: 0.6, dur: 2.8 },
    ],
  },
  // ─── 20 — shrug (palms up, "I dunno") ───────────────────────────────────
  {
    bgKey: 'idle', propEmoji: '🤷', propLeft: 'calc(50% - 22px)', propTop: 0, propScale: 1.8,
    glowColor: '#a855f7',
    lUpperR: [-50, -54, -50],            lUpperDur: 2.4,
    lLowerR: [-92, -96, -92],            lLowerDur: 2.4,
    rUpperR: [50, 54, 50],               rUpperDur: 2.4,
    rLowerR: [92, 96, 92],               rLowerDur: 2.4,
    bodyY: [0, -3, 0], bodyDur: 2.4,
    headRotateZ: [-3, 3, -3], headDur: 2.6,
    eyeHappy: false,
    chestBg: 'linear-gradient(135deg,#6b7cff,#a855f7)',
    particleA: '#a855f7', particleB: '#6b7cff',
    floaters: [],
  },
  // ─── 21 — aha! (lightbulb above head, both arms up briefly) ─────────────
  {
    bgKey: 'celebrate', propEmoji: '💡', propLeft: 'calc(50% - 22px)', propTop: 0, propScale: 2.4,
    glowColor: '#ffc96b',
    lUpperR: [4, -90, 4, 4],             lUpperDur: 2.0,
    lLowerR: [-8, -30, -8, -8],          lLowerDur: 2.0,
    rUpperR: [-4, 90, -4, -4],           rUpperDur: 2.0,
    rLowerR: [8, 30, 8, 8],              rLowerDur: 2.0,
    bodyY: [0, -10, 0], bodyDur: 2.0,
    headRotateX: [0, -10, 0], headDur: 2.0,
    eyeHappy: true,
    chestBg: 'linear-gradient(135deg,#ffc96b,#ff9f40)',
    particleA: '#ffc96b', particleB: '#ff4fd8',
    floaters: [
      { emoji: '💡', x: 50, y: 0,  delay: 0.0, dur: 2.0 },
      { emoji: '✨', x: 18, y: 18, delay: 0.4, dur: 2.4 },
      { emoji: '⭐', x: 80, y: 18, delay: 0.6, dur: 2.4 },
    ],
  },
  // ─── 22 — emphasizing (chopping motion, both hands) ─────────────────────
  {
    bgKey: 'guide', propEmoji: '', propLeft: 'calc(50% + 88px)', propTop: 60, propScale: 0,
    glowColor: '#5de4ff',
    lUpperR: [10, -20, 10, -20, 10],     lUpperDur: 1.0,
    lLowerR: [-20, -50, -20, -50, -20],  lLowerDur: 1.0,
    rUpperR: [-10, 20, -10, 20, -10],    rUpperDur: 1.0,
    rLowerR: [20, 50, 20, 50, 20],       rLowerDur: 1.0,
    bodyY: [0, -4, 0, -4, 0], bodyDur: 1.0,
    headRotateZ: [0, 1, -1, 0], headDur: 1.6,
    eyeHappy: false,
    chestBg: 'linear-gradient(135deg,#3b82f6,#5de4ff)',
    particleA: '#5de4ff', particleB: '#a855f7',
    floaters: [],
  },
  // ─── 23 — sad / sympathetic (head down, slumped) ────────────────────────
  {
    bgKey: 'idle', propEmoji: '💧', propLeft: 'calc(50% + 60px)', propTop: 90, propScale: 1.2,
    glowColor: '#6b7cff',
    lUpperR: [22, 24, 22],               lUpperDur: 4.4,
    lLowerR: [-12, -10, -12],            lLowerDur: 4.4,
    rUpperR: [-22, -24, -22],            rUpperDur: 4.4,
    rLowerR: [12, 10, 12],               rLowerDur: 4.4,
    bodyY: [4, 6, 4], bodyDur: 4.0,                    // slumped (negative bob)
    bodyRotateZ: [-2, -1, -2],
    headRotateX: [10, 12, 10],                          // head down
    headRotateZ: [-3, -2, -3],
    headDur: 4.6,
    eyeHappy: false,
    chestBg: 'linear-gradient(135deg,#6b7cff,#3b82f6)',
    particleA: '#6b7cff', particleB: '#3b82f6',
    floaters: [{ emoji: '💧', x: 60, y: 56, delay: 0.0, dur: 3.8 }],
  },
  // 24-35 — extra robotics workspace states used by Face Mode image assets.
  ...[
    ['guide', '#5de4ff', [-46, -52, -46], [-42, -50, -42], [34, 42, 34], [46, 54, 46], [0, -5, 0], false],
    ['adapt', '#ffc96b', [52, 58, 52], [-56, -62, -56], [72, 78, 72], [48, 56, 48], [6, 2, 6], false],
    ['guide', '#a855f7', [50, 56, 50], [-42, -50, -42], [-44, -50, -44], [56, 64, 56], [4, -2, 4], false],
    ['guide', '#5de4ff', [-78, -84, -78], [18, 24, 18], [-34, -38, -34], [72, 78, 72], [0, -8, 0], false],
    ['guide', '#5de4ff', [34, 38, 34], [-72, -78, -72], [78, 84, 78], [-18, -24, -18], [0, -8, 0], false],
    ['guide', '#6b7cff', [-28, -32, -28], [-58, -62, -58], [28, 32, 28], [58, 62, 58], [0, -4, 0], false],
    ['adapt', '#4dffb8', [-86, -92, -86], [32, 38, 32], [-112, -118, -112], [66, 72, 66], [0, -5, 0], false],
    ['celebrate', '#ff4fd8', [-50, -60, -50, -56, -50], [-20, -34, -20, -30, -20], [50, 60, 50, 56, 50], [20, 34, 20, 30, 20], [0, -18, -4, -18, 0], true],
    ['guide', '#5de4ff', [18, 22, 18], [-20, -24, -20], [64, 70, 64], [48, 56, 48], [8, 4, 8], false],
    ['celebrate', '#ffc96b', [-54, -62, -54], [-28, -36, -28], [-122, -132, -122], [-18, -28, -18], [0, -24, -6, -24, 0], true],
    ['adapt', '#ff9f40', [-52, -58, -52], [-28, -34, -28], [56, 62, 56], [52, 60, 52], [4, 0, 4], false],
    ['celebrate', '#ff4fd8', [-30, -42, -30, -38, -30], [-34, -46, -34, -42, -34], [30, 42, 30, 38, 30], [34, 46, 34, 42, 34], [0, -14, -2, -14, 0], true],
  ].map(([bgKey, glowColor, lUpperR, lLowerR, rUpperR, rLowerR, bodyY, eyeHappy]) => ({
    bgKey: bgKey as string,
    propEmoji: '',
    propLeft: 'calc(50% + 70px)',
    propTop: 96,
    propScale: 0,
    glowColor: glowColor as string,
    lUpperR: lUpperR as number[],
    lUpperDur: 1.8,
    lLowerR: lLowerR as number[],
    lLowerDur: 1.8,
    rUpperR: rUpperR as number[],
    rUpperDur: 1.8,
    rLowerR: rLowerR as number[],
    rLowerDur: 1.8,
    bodyY: bodyY as number[],
    bodyDur: 2.4,
    headRotateZ: [0, 3, -3, 0],
    headDur: 2.4,
    eyeHappy: eyeHappy as boolean,
    chestBg: `linear-gradient(135deg,${glowColor},#5de4ff)`,
    particleA: glowColor as string,
    particleB: '#5de4ff',
    floaters: [],
  })),
];

/**
 * Named scene IDs — use these from face-mode + lesson code instead of raw
 * indices so renumbering is safe.
 */
export const SPARK_SCENES = {
  WAVE:          0,
  GUIDE:         1,
  CELEBRATE:     2,
  ADAPT:         3,
  IDLE:          4,
  LISTENING:     5,
  THINKING:      6,
  TALKING:       7,
  EXPLAINING:    8,
  QUESTIONING:   9,
  ENCOURAGING:  10,
  NODDING:      11,
  CLAPPING:     12,
  CHEERING:     13,
  POINT_LEFT:   14,
  POINT_RIGHT:  15,
  POINT_DOWN:   16,
  POINT_UP:     17,
  SURPRISED:    18,
  CONFUSED:     19,
  SHRUG:        20,
  AHA:          21,
  EMPHASIZING:  22,
  SAD:          23,
  MAZE_BUILDING:       24,
  PLACING_CONES:       25,
  PLACING_OBSTACLES:   26,
  PEEK_LEFT_WINDOW:    27,
  PEEK_RIGHT_WINDOW:   28,
  BLUEPRINT_PLANNING:  29,
  SENSOR_CALIBRATING:  30,
  JUGGLING_IDEAS:      31,
  ROUTE_TRACING:       32,
  FINISH_FLAG:         33,
  DEBUGGING:           34,
  ROVER_DANCE:         35,
} as const;

export type SparkSceneId = keyof typeof SPARK_SCENES;

// ─── Scene Background (exported — render in plan-spark-hero) ──────────────────

export function SparkSceneBackground({ scene }: { scene: number }) {
  const cfg = SCENES[scene % SCENES.length] ?? SCENES[0];
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={cfg.bgKey}
        className={`spark3d-scene-bg spark3d-bg--${cfg.bgKey}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.65 }}
        aria-hidden
      >
        {/* floaters removed */}
      </motion.div>
    </AnimatePresence>
  );
}

// ─── 3D CSS Robot ─────────────────────────────────────────────────────────────

function KinematicArm({
  side,
  upperR, upperDur,
  lowerR, lowerDur,
}: {
  side: 'left' | 'right';
  upperR: number[]; upperDur: number;
  lowerR: number[]; lowerDur: number;
}) {
  const isLeft = side === 'left';
  return (
    <div className={`spark3d-arm-mount spark3d-arm-mount--${side}`}>
      {/* Upper arm — rotates at shoulder */}
      <motion.div
        className={`spark3d-upper-arm spark3d-upper-arm--${side}`}
        animate={{ rotate: upperR }}
        transition={{ duration: upperDur, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformOrigin: isLeft ? 'right center' : 'left center' }}
      >
        <div className="spark3d-arm-seg spark3d-arm-seg--upper" />
        <div className={`spark3d-shoulder-ball spark3d-shoulder-ball--${side}`} />
        {/* Lower arm — rotates at elbow, child of upper arm */}
        <motion.div
          className={`spark3d-lower-arm spark3d-lower-arm--${side}`}
          animate={{ rotate: lowerR }}
          transition={{ duration: lowerDur, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: isLeft ? 'right center' : 'left center' }}
        >
          <div className="spark3d-arm-seg spark3d-arm-seg--lower" />
          <div className={`spark3d-elbow-ball spark3d-elbow-ball--${side}`} />
          {/* Hand */}
          <div className={`spark3d-hand spark3d-hand--${side}`}>
            <div className="spark3d-hand-knuckle" />
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

function Spark3D({ showSpeech, speechKey, size = 'xl', scene = 0, showProp = true }: Omit<Spark3DProps, 'mode'>) {
  const px = SIZE_PX[size];
  const scale = px / 200;
  const cfg = SCENES[scene % SCENES.length] ?? SCENES[0];
  const blinkTimes = cfg.eyeHappy ? [0, 0.75, 0.78, 1] : [0, 0.84, 0.88, 1];

  return (
    <div className="spark3d-wrap" style={{ transform: `scale(${scale})`, transformOrigin: 'bottom center' }}>

      {/* Floating prop */}
      <AnimatePresence mode="wait">
        {showProp && cfg.propEmoji && (
        <motion.div
          key={`prop-${cfg.bgKey}`}
          className="spark3d-prop"
          style={{ left: cfg.propLeft, top: cfg.propTop, fontSize: `${cfg.propScale}rem` }}
          initial={{ opacity: 0, scale: 0.2, rotate: -30, y: 20 }}
          animate={{ opacity: 1, scale: 1, rotate: [0, -8, 5, -3, 0], y: [0, -12, 0] }}
          exit={{ opacity: 0, scale: 0.3, rotate: 20, y: -12 }}
          transition={{
            opacity: { duration: 0.35 },
            scale:   { type: 'spring', damping: 10, stiffness: 220, delay: 0.1 },
            rotate:  { duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: 0.6 },
            y:       { duration: 2.6, repeat: Infinity, ease: 'easeInOut', delay: 0.4 },
          }}
          aria-hidden
        >
          {cfg.propEmoji}
        </motion.div>
        )}
      </AnimatePresence>

      {/* Speech bubble */}
      <AnimatePresence mode="wait">
        {showSpeech && (
          <motion.div
            key={speechKey}
            className="spark3d-speech"
            initial={{ opacity: 0, y: 10, scale: 0.88 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.94 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            {showSpeech}
            <span className="spark3d-speech-tail" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Character root — floats up/down + body lean ── */}
      <motion.div
        className="spark3d-character"
        animate={{
          y: cfg.bodyY,
          rotateZ: cfg.bodyRotateZ ?? [0, 0],
        }}
        transition={{ duration: cfg.bodyDur, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* Kinematic arms */}
        <KinematicArm
          side="left"
          upperR={cfg.lUpperR} upperDur={cfg.lUpperDur}
          lowerR={cfg.lLowerR} lowerDur={cfg.lLowerDur}
        />
        <KinematicArm
          side="right"
          upperR={cfg.rUpperR} upperDur={cfg.rUpperDur}
          lowerR={cfg.rLowerR} lowerDur={cfg.rLowerDur}
        />

        {/* Head — supports independent X (pitch), Y (yaw), Z (roll) animation */}
        <motion.div
          className="spark3d-head"
          animate={{
            rotateX: cfg.headRotateX ?? 0,
            rotateY: cfg.headRotateY ?? (cfg.headRotateZ ? 0 : [0, 6, 0, -6, 0]),
            rotateZ: cfg.headRotateZ ?? 0,
          }}
          transition={{
            rotateX: { duration: cfg.headDur, repeat: Infinity, ease: 'easeInOut' },
            rotateY: { duration: cfg.headDur, repeat: Infinity, ease: 'easeInOut' },
            rotateZ: { duration: cfg.headDur, repeat: Infinity, ease: 'easeInOut' },
          }}
          style={{ perspective: 700 }}
        >
          <div className="spark3d-head-shell">
            <div className="spark3d-head-spec" />
            <div className="spark3d-head-shine" />
            <div className="spark3d-head-seam" />
            <div className="spark3d-ear spark3d-ear--left"><div className="spark3d-ear-dot" /></div>
            <div className="spark3d-ear spark3d-ear--right"><div className="spark3d-ear-dot" /></div>
            <div className="spark3d-visor">
              <div className="spark3d-visor-sheen" />
              <div className="spark3d-visor-reflect" />
              {cfg.eyeHappy ? (
                <>
                  <div className="spark3d-eye-arc spark3d-eye-arc--l" />
                  <div className="spark3d-eye-arc spark3d-eye-arc--r" />
                </>
              ) : (
                <>
                  <motion.div
                    className="spark3d-eye spark3d-eye--left"
                    animate={{ scaleY: [1, 1, 0.06, 1], scaleX: [1, 1, 1.35, 1] }}
                    transition={{ duration: 4.5, repeat: Infinity, times: blinkTimes }}
                  >
                    <div className="spark3d-eye-iris" />
                    <div className="spark3d-eye-pupil" />
                    <div className="spark3d-eye-spec" />
                  </motion.div>
                  <motion.div
                    className="spark3d-eye spark3d-eye--right"
                    animate={{ scaleY: [1, 1, 0.06, 1], scaleX: [1, 1, 1.35, 1] }}
                    transition={{ duration: 4.5, repeat: Infinity, times: blinkTimes, delay: 0.07 }}
                  >
                    <div className="spark3d-eye-iris" />
                    <div className="spark3d-eye-pupil" />
                    <div className="spark3d-eye-spec" />
                  </motion.div>
                </>
              )}
            </div>
            <div className="spark3d-head-chin" />
          </div>
          <div className="spark3d-neck" />
        </motion.div>

        {/* Body */}
        <motion.div
          className="spark3d-body"
          animate={{ scaleX: [1, 1.022, 1], scaleY: [1, 0.978, 1] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="spark3d-body-spec" />
          <div className="spark3d-body-shine" />
          <div className="spark3d-body-seam" />
          <AnimatePresence mode="wait">
            <motion.div
              key={`chest-${cfg.bgKey}`}
              className="spark3d-chest-core"
              style={{ background: cfg.chestBg }}
              animate={{ scale: [1, 1.12, 1], opacity: [0.88, 1, 0.88] }}
              transition={{ duration: 1.8, repeat: Infinity }}
            >
              <div className="spark3d-chest-inner" />
              <div className="spark3d-chest-ring" />
            </motion.div>
          </AnimatePresence>
          <div className="spark3d-body-rim-l" />
          <div className="spark3d-body-rim-r" />
          {/* Shoulder socket markers */}
          <div className="spark3d-shoulder-socket spark3d-shoulder-socket--l" />
          <div className="spark3d-shoulder-socket spark3d-shoulder-socket--r" />
        </motion.div>

        {/* Particles */}
        {[
          { s: 5, x: -62, y: 38, dur: 2.6, d: 0.0 },
          { s: 4, x: 70,  y: 28, dur: 3.1, d: 0.5 },
          { s: 6, x: -50, y: 90, dur: 2.2, d: 0.9 },
          { s: 3, x: 64,  y: 86, dur: 3.4, d: 0.3 },
          { s: 5, x: 4,   y: 18, dur: 2.8, d: 1.1 },
          { s: 4, x: -30, y: 132, dur: 3.0, d: 0.7 },
        ].map((p, i) => (
          <motion.div
            key={i}
            className="spark3d-particle"
            style={{
              width: p.s, height: p.s,
              left: `calc(50% + ${p.x}px)`, top: p.y,
              background: `radial-gradient(circle, ${i % 2 === 0 ? cfg.particleA : cfg.particleB}, transparent)`,
              boxShadow: `0 0 6px ${i % 2 === 0 ? cfg.particleA : cfg.particleB}88`,
            }}
            animate={{ y: [0, -(20 + i * 5), 0], opacity: [0.1, 0.88, 0.1], scale: [1, 1.7, 1] }}
            transition={{ duration: p.dur, repeat: Infinity, ease: 'easeInOut', delay: p.d }}
          />
        ))}

        <motion.div
          className="spark3d-shadow"
          animate={{ scaleX: [1, 0.72, 1], opacity: [0.28, 0.1, 0.28] }}
          transition={{ duration: cfg.bodyDur, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>
    </div>
  );
}

// ─── 2D SVG Poses ─────────────────────────────────────────────────────────────

function SparkSVG({ pose = 'idle', size = 'md' }: { pose: SparkPose; size: SparkSize }) {
  const px = SIZE_PX[size];

  const leftArm: Record<SparkPose, string> = {
    idle:      'M30,90 Q18,85 14,95',
    wave:      'M30,85 Q10,65 14,50',
    celebrate: 'M30,85 Q12,68 8,52',
    think:     'M30,90 Q20,88 22,78',
    point:     'M30,90 Q18,85 14,95',
    thumbsup:  'M30,90 Q18,85 14,95',
    surprised: 'M30,85 Q14,72 10,60',
    sad:       'M30,95 Q18,98 12,102',
  };
  const rightArm: Record<SparkPose, string> = {
    idle:      'M90,90 Q102,85 106,95',
    wave:      'M90,90 Q102,85 106,95',
    celebrate: 'M90,85 Q108,68 112,52',
    think:     'M90,90 Q102,85 106,95',
    point:     'M90,85 Q108,75 115,68',
    thumbsup:  'M90,85 Q105,72 108,58',
    surprised: 'M90,85 Q106,72 110,60',
    sad:       'M90,95 Q102,98 108,102',
  };

  const fill   = '#e8f0ff';
  const accent = '#5de4ff';
  const body   = '#3b82f6';
  const visor  = '#0a1628';

  return (
    <svg viewBox="0 0 120 150" width={px} height={Math.round(px * 1.25)} fill="none">
      <defs>
        <radialGradient id={`hg-${pose}`} cx="38%" cy="28%" r="65%">
          <stop offset="0%"   stopColor="#ffffff" />
          <stop offset="55%"  stopColor="#d8e8ff" />
          <stop offset="100%" stopColor="#b0c8f0" />
        </radialGradient>
        <radialGradient id={`bg-${pose}`} cx="35%" cy="25%" r="70%">
          <stop offset="0%"   stopColor="#ddeeff" />
          <stop offset="60%"  stopColor="#b8d4f8" />
          <stop offset="100%" stopColor="#7aaae8" />
        </radialGradient>
        <filter id={`eg-${pose}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id={`ds-${pose}`} x="-20%" y="-10%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#1a3a6a" floodOpacity="0.25" />
        </filter>
      </defs>
      <ellipse cx="60" cy="148" rx="28" ry="5" fill="#1a3a6a" fillOpacity="0.18" />
      <ellipse cx="60" cy="110" rx="28" ry="22" fill={`url(#bg-${pose})`} stroke="#90b8e8" strokeWidth="1" filter={`url(#ds-${pose})`} />
      <ellipse cx="52" cy="100" rx="10" ry="6" fill="white" fillOpacity="0.35" />
      <circle cx="60" cy="112" r="6" fill={body} fillOpacity="0.9" />
      <circle cx="60" cy="112" r="4" fill={accent} />
      <circle cx="60" cy="112" r="3" fill="white" fillOpacity="0.6" />
      <path d={leftArm[pose]}  stroke={fill} strokeWidth="8" strokeLinecap="round" />
      <path d={leftArm[pose]}  stroke="#90b8e8" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d={rightArm[pose]} stroke={fill} strokeWidth="8" strokeLinecap="round" />
      <path d={rightArm[pose]} stroke="#90b8e8" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <ellipse cx="60" cy="52" rx="32" ry="36" fill={`url(#hg-${pose})`} stroke="#c0d8f5" strokeWidth="1" filter={`url(#ds-${pose})`} />
      <ellipse cx="48" cy="36" rx="14" ry="10" fill="white" fillOpacity="0.5" transform="rotate(-20 48 36)" />
      <rect x="22" y="46" width="5" height="14" rx="2.5" fill={fill} stroke="#90b8e8" strokeWidth="0.8" />
      <rect x="93" y="46" width="5" height="14" rx="2.5" fill={fill} stroke="#90b8e8" strokeWidth="0.8" />
      <rect x="32" y="44" width="56" height="22" rx="6" fill={visor} />
      <rect x="33" y="45" width="54" height="5" rx="3" fill="white" fillOpacity="0.06" />
      {(pose === 'celebrate' || pose === 'thumbsup') ? (
        <>
          <path d="M38,55 Q45,46 52,55" stroke={accent} strokeWidth="4" strokeLinecap="round" filter={`url(#eg-${pose})`} />
          <path d="M68,55 Q75,46 82,55" stroke={accent} strokeWidth="4" strokeLinecap="round" filter={`url(#eg-${pose})`} />
        </>
      ) : pose === 'sad' ? (
        <>
          <path d="M38,53 Q45,58 52,53" stroke={accent} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M68,53 Q75,58 82,53" stroke={accent} strokeWidth="3.5" strokeLinecap="round" />
        </>
      ) : pose === 'think' ? (
        <>
          <circle cx="45" cy="53" r="7" fill={accent} fillOpacity="0.9" filter={`url(#eg-${pose})`} />
          <path d="M68,53 Q75,49 82,53" stroke={accent} strokeWidth="3.5" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="45" cy="53" r="7.5" fill={accent} fillOpacity="0.15" />
          <circle cx="45" cy="53" r="6"   fill={accent} fillOpacity="0.9"  filter={`url(#eg-${pose})`} />
          <circle cx="43" cy="51" r="2"   fill="white"  fillOpacity="0.7" />
          <circle cx="75" cy="53" r="7.5" fill={accent} fillOpacity="0.15" />
          <circle cx="75" cy="53" r="6"   fill={accent} fillOpacity="0.9"  filter={`url(#eg-${pose})`} />
          <circle cx="73" cy="51" r="2"   fill="white"  fillOpacity="0.7" />
        </>
      )}
      {pose === 'surprised' && (
        <>
          <circle cx="45" cy="53" r="9" fill={accent} fillOpacity="0.9" filter={`url(#eg-${pose})`} />
          <circle cx="75" cy="53" r="9" fill={accent} fillOpacity="0.9" filter={`url(#eg-${pose})`} />
          <circle cx="43" cy="51" r="2.5" fill="white" fillOpacity="0.7" />
          <circle cx="73" cy="51" r="2.5" fill="white" fillOpacity="0.7" />
        </>
      )}
      {pose === 'wave' && (
        <>
          <path d="M8,48 Q5,44 9,40"  stroke={accent} strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.6" />
          <path d="M6,54 Q2,50 6,46"  stroke={accent} strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.4" />
        </>
      )}
      {pose === 'celebrate' && (
        <>
          {[[12,40,'#ffd700'],[104,42,'#ff6eb4'],[15,65,'#5de4ff'],[102,60,'#4dffb8'],[20,30,'#fbbf24']].map(
            ([x, y, c], i) => <circle key={i} cx={x as number} cy={y as number} r="3" fill={c as string} fillOpacity="0.85" />
          )}
        </>
      )}
      {pose === 'point' && (
        <polygon points="115,68 108,63 110,72" fill={fill} />
      )}
    </svg>
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function SparkRobot(props: SparkProps) {
  if (props.mode === '3d') {
    return (
      <Spark3D
        showSpeech={props.showSpeech}
        speechKey={props.speechKey}
        size={props.size}
        scene={props.scene}
        showProp={props.showProp}
      />
    );
  }
  return (
    <div className={`spark2d-wrap ${props.className ?? ''}`} style={{ display: 'inline-flex' }}>
      <SparkSVG pose={props.pose ?? 'idle'} size={props.size ?? 'md'} />
    </div>
  );
}

// ─── Animated 2D pose wrapper (for overlays) ──────────────────────────────────

export function SparkPoseCard({ pose, message, size = 'lg' }: {
  pose: SparkPose;
  message: string;
  size?: SparkSize;
}) {
  return (
    <motion.div
      className="spark-pose-card"
      initial={{ opacity: 0, scale: 0.88, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 12 }}
      transition={{ type: 'spring', damping: 18, stiffness: 200 }}
    >
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <SparkSVG pose={pose} size={size} />
      </motion.div>
      <motion.div
        className="spark-pose-bubble"
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.2 }}
      >
        {message}
      </motion.div>
    </motion.div>
  );
}
