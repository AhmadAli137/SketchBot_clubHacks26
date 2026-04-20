/**
 * Motrix Game Audio Engine
 * Procedural chip-tune music + synthesized sound effects using Web Audio API.
 * No audio file dependencies — fully generative.
 */

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let bgmInterval: ReturnType<typeof setInterval> | null = null;
let bgmOscillators: OscillatorNode[] = [];
let bgmEnabled = true;
let sfxEnabled = true;
let bgmVolume = 0.18;
let sfxVolume = 0.35;

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function getMaster(): GainNode {
  getCtx();
  return masterGain!;
}

// ─── Musical scales ───────────────────────────────────────────────────────────

const SCALES = {
  // Each is a list of semitone offsets from C4 (261.63 Hz)
  major:     [0, 2, 4, 5, 7, 9, 11, 12],
  minor:     [0, 2, 3, 5, 7, 8, 10, 12],
  pentatonic:[0, 2, 4, 7, 9, 12, 14, 16],
  dorian:    [0, 2, 3, 5, 7, 9, 10, 12],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
} as const;

type ScaleName = keyof typeof SCALES;

function noteFreq(semitones: number, rootHz = 261.63): number {
  return rootHz * Math.pow(2, semitones / 12);
}

// ─── Concept BGM configs ──────────────────────────────────────────────────────

type BgmConfig = {
  scale: ScaleName;
  rootHz: number;
  bpm: number;
  waveform: OscillatorType;
  bassWave: OscillatorType;
  arpPattern: number[]; // indices into scale
  bassPattern: number[]; // bass note indices (relative)
  reverbAmount: number;
};

const CONCEPT_BGM: Record<string, BgmConfig> = {
  'coord-systems': {
    scale: 'major', rootHz: 261.63, bpm: 100, waveform: 'square',
    bassWave: 'sawtooth', arpPattern: [0, 2, 4, 7, 4, 2], bassPattern: [0, 0, 4, 0],
    reverbAmount: 0.2,
  },
  'path-planning': {
    scale: 'pentatonic', rootHz: 293.66, bpm: 120, waveform: 'square',
    bassWave: 'triangle', arpPattern: [0, 2, 4, 2, 7, 4, 2, 0], bassPattern: [0, 4, 0, 7],
    reverbAmount: 0.15,
  },
  'geometry-drawing': {
    scale: 'major', rootHz: 329.63, bpm: 90, waveform: 'sine',
    bassWave: 'sine', arpPattern: [0, 4, 7, 12, 7, 4], bassPattern: [0, 0, 7, 0],
    reverbAmount: 0.3,
  },
  'computer-vision': {
    scale: 'dorian', rootHz: 293.66, bpm: 110, waveform: 'sawtooth',
    bassWave: 'sawtooth', arpPattern: [0, 2, 3, 7, 10, 7, 3, 2], bassPattern: [0, 3, 7, 3],
    reverbAmount: 0.1,
  },
  'control-theory': {
    scale: 'minor', rootHz: 246.94, bpm: 105, waveform: 'sawtooth',
    bassWave: 'sawtooth', arpPattern: [0, 3, 7, 10, 7, 3], bassPattern: [0, 7, 3, 7],
    reverbAmount: 0.2,
  },
  'trigonometry-motion': {
    scale: 'major', rootHz: 349.23, bpm: 128, waveform: 'square',
    bassWave: 'triangle', arpPattern: [0, 4, 7, 12, 9, 7, 4, 0], bassPattern: [0, 4, 7, 4],
    reverbAmount: 0.15,
  },
  'systems-engineering': {
    scale: 'dorian', rootHz: 220.0, bpm: 95, waveform: 'sawtooth',
    bassWave: 'sawtooth', arpPattern: [0, 2, 3, 7, 9, 7, 3, 2], bassPattern: [0, 3, 5, 7],
    reverbAmount: 0.25,
  },
  'cone-ring-gauntlet': {
    scale: 'pentatonic', rootHz: 329.63, bpm: 145, waveform: 'square',
    bassWave: 'sawtooth', arpPattern: [0, 4, 7, 9, 12, 9, 7, 4], bassPattern: [0, 0, 7, 0],
    reverbAmount: 0.1,
  },
  'sumo-arena': {
    scale: 'minor', rootHz: 196.00, bpm: 130, waveform: 'sawtooth',
    bassWave: 'sawtooth', arpPattern: [0, 3, 7, 10, 7, 3, 5, 7], bassPattern: [0, 7, 3, 5],
    reverbAmount: 0.18,
  },
  'maze-marathon': {
    scale: 'dorian', rootHz: 261.63, bpm: 115, waveform: 'square',
    bassWave: 'triangle', arpPattern: [0, 2, 3, 5, 7, 5, 3, 2], bassPattern: [0, 3, 7, 5],
    reverbAmount: 0.3,
  },
};

const DEFAULT_BGM: BgmConfig = CONCEPT_BGM['coord-systems']!;

// ─── Build a simple reverb convolver ─────────────────────────────────────────

function makeReverb(audioCtx: AudioContext, duration = 0.4, decay = 2): ConvolverNode {
  const len = audioCtx.sampleRate * duration;
  const impulse = audioCtx.createBuffer(2, len, audioCtx.sampleRate);
  for (let i = 0; i < 2; i++) {
    const ch = impulse.getChannelData(i);
    for (let j = 0; j < len; j++) {
      ch[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / len, decay);
    }
  }
  const conv = audioCtx.createConvolver();
  conv.buffer = impulse;
  return conv;
}

// ─── BGM player ───────────────────────────────────────────────────────────────

let currentBgmConfig: BgmConfig | null = null;
let bgmGain: GainNode | null = null;
let stepIdx = 0;
let bassStepIdx = 0;

function stopBgmOscillators() {
  bgmOscillators.forEach(o => { try { o.stop(); } catch { /* already stopped */ } });
  bgmOscillators = [];
  if (bgmInterval !== null) { clearInterval(bgmInterval); bgmInterval = null; }
  bgmGain = null;
  stepIdx = 0;
  bassStepIdx = 0;
}

export function playBGM(conceptId?: string | null) {
  if (typeof window === 'undefined') return;
  const config = (conceptId ? CONCEPT_BGM[conceptId] : null) ?? DEFAULT_BGM;
  if (currentBgmConfig === config && bgmInterval !== null) return; // already playing this
  stopBgmOscillators();
  if (!bgmEnabled) return;

  currentBgmConfig = config;
  const audioCtx = getCtx();
  const master = getMaster();

  bgmGain = audioCtx.createGain();
  bgmGain.gain.value = 0;
  bgmGain.gain.linearRampToValueAtTime(bgmVolume, audioCtx.currentTime + 1.2);

  // Optional light reverb
  if (config.reverbAmount > 0) {
    const reverb = makeReverb(audioCtx, 0.5, 2);
    const reverbGain = audioCtx.createGain();
    reverbGain.gain.value = config.reverbAmount;
    bgmGain.connect(reverb);
    reverb.connect(reverbGain);
    reverbGain.connect(master);
  }
  bgmGain.connect(master);

  const scale = SCALES[config.scale];
  const beatMs = (60 / config.bpm) * 500; // 8th note in ms

  bgmInterval = setInterval(() => {
    if (!bgmGain || !bgmEnabled) return;
    const now = audioCtx.currentTime;

    // Arpeggio note
    const arpNote = config.arpPattern[stepIdx % config.arpPattern.length];
    const freq = noteFreq(scale[arpNote % scale.length] ?? 0, config.rootHz);
    const osc = audioCtx.createOscillator();
    const env = audioCtx.createGain();
    osc.type = config.waveform;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0.18, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + beatMs / 600);
    osc.connect(env);
    env.connect(bgmGain);
    osc.start(now);
    osc.stop(now + beatMs / 500);
    bgmOscillators.push(osc);

    // Bass note (every 4 steps)
    if (stepIdx % 4 === 0) {
      const bassNote = config.bassPattern[bassStepIdx % config.bassPattern.length];
      const bassFreq = noteFreq((scale[bassNote % scale.length] ?? 0) - 12, config.rootHz);
      const bassOsc = audioCtx.createOscillator();
      const bassEnv = audioCtx.createGain();
      bassOsc.type = config.bassWave;
      bassOsc.frequency.value = bassFreq;
      bassEnv.gain.setValueAtTime(0.22, now);
      bassEnv.gain.exponentialRampToValueAtTime(0.001, now + (beatMs * 4) / 800);
      bassOsc.connect(bassEnv);
      bassEnv.connect(bgmGain);
      bassOsc.start(now);
      bassOsc.stop(now + (beatMs * 4) / 700);
      bgmOscillators.push(bassOsc);
      bassStepIdx++;
    }

    stepIdx++;
    // Clean up finished oscillators
    if (bgmOscillators.length > 80) bgmOscillators.splice(0, 20);
  }, beatMs);
}

export function stopBGM() {
  if (bgmGain) {
    const audioCtx = getCtx();
    bgmGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.5);
    setTimeout(stopBgmOscillators, 600);
  } else {
    stopBgmOscillators();
  }
  currentBgmConfig = null;
}

// ─── Sound effects ────────────────────────────────────────────────────────────

type SfxType =
  | 'click'
  | 'success'
  | 'error'
  | 'coin'
  | 'level-up'
  | 'waypoint'
  | 'engine-start'
  | 'collision'
  | 'celebration'
  | 'unlock'
  | 'whoosh'
  | 'beep';

export function playSfx(type: SfxType) {
  if (typeof window === 'undefined' || !sfxEnabled) return;
  try {
    const audioCtx = getCtx();
    const master = getMaster();
    const sfxGain = audioCtx.createGain();
    sfxGain.gain.value = sfxVolume;
    sfxGain.connect(master);
    const now = audioCtx.currentTime;

    const play = (freq: number, dur: number, wave: OscillatorType, attack = 0.01, release = dur * 0.8, gainVal = 0.4) => {
      const osc = audioCtx.createOscillator();
      const env = audioCtx.createGain();
      osc.type = wave;
      osc.frequency.value = freq;
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(gainVal, now + attack);
      env.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.connect(env);
      env.connect(sfxGain);
      osc.start(now);
      osc.stop(now + dur + 0.01);
    };

    switch (type) {
      case 'click':
        play(880, 0.06, 'square', 0.001, 0.05, 0.2);
        break;
      case 'success':
        play(523.25, 0.12, 'sine', 0.01, 0.1);
        setTimeout(() => play(659.25, 0.12, 'sine', 0.01, 0.1), 100);
        setTimeout(() => play(783.99, 0.2, 'sine', 0.01, 0.18), 200);
        break;
      case 'error':
        play(220, 0.08, 'sawtooth', 0.005, 0.07, 0.3);
        setTimeout(() => play(196, 0.15, 'sawtooth', 0.005, 0.13, 0.3), 90);
        break;
      case 'coin':
        play(1047, 0.06, 'square', 0.001, 0.05, 0.25);
        setTimeout(() => play(1319, 0.1, 'square', 0.001, 0.08, 0.25), 60);
        break;
      case 'level-up': {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((f, i) => setTimeout(() => play(f, 0.18, 'square', 0.01, 0.15, 0.3), i * 80));
        break;
      }
      case 'waypoint':
        play(880, 0.08, 'sine', 0.005, 0.07, 0.35);
        play(1108.73, 0.08, 'sine', 0.005, 0.07, 0.2);
        break;
      case 'engine-start': {
        const osc = audioCtx.createOscillator();
        const env = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.linearRampToValueAtTime(220, now + 0.4);
        env.gain.setValueAtTime(0, now);
        env.gain.linearRampToValueAtTime(0.25, now + 0.15);
        env.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.connect(env);
        env.connect(sfxGain);
        osc.start(now);
        osc.stop(now + 0.55);
        break;
      }
      case 'collision': {
        // Noise burst
        const bufLen = audioCtx.sampleRate * 0.12;
        const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < bufLen; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 2);
        const src = audioCtx.createBufferSource();
        const env = audioCtx.createGain();
        src.buffer = buf;
        env.gain.value = 0.5;
        src.connect(env);
        env.connect(sfxGain);
        src.start(now);
        break;
      }
      case 'celebration': {
        const melody = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
        melody.forEach((f, i) => setTimeout(() => play(f, 0.1, 'square', 0.005, 0.08, 0.28), i * 70));
        break;
      }
      case 'unlock':
        play(440, 0.1, 'sine', 0.01, 0.08);
        setTimeout(() => play(554.37, 0.1, 'sine', 0.01, 0.08), 100);
        setTimeout(() => play(659.25, 0.2, 'sine', 0.01, 0.18), 200);
        setTimeout(() => play(880, 0.3, 'sine', 0.01, 0.28), 300);
        break;
      case 'whoosh': {
        const osc = audioCtx.createOscillator();
        const env = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.2);
        env.gain.setValueAtTime(0.3, now);
        env.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(env);
        env.connect(sfxGain);
        osc.start(now);
        osc.stop(now + 0.25);
        break;
      }
      case 'beep':
        play(1000, 0.05, 'sine', 0.002, 0.04, 0.2);
        break;
    }
  } catch { /* silently ignore audio errors */ }
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export function setBgmEnabled(v: boolean) { bgmEnabled = v; if (!v) stopBGM(); }
export function setSfxEnabled(v: boolean) { sfxEnabled = v; }
export function setBgmVolume(v: number) {
  bgmVolume = Math.max(0, Math.min(1, v));
  if (bgmGain) bgmGain.gain.value = bgmVolume;
}
export function setSfxVolume(v: number) { sfxVolume = Math.max(0, Math.min(1, v)); }
export function getBgmEnabled() { return bgmEnabled; }
export function getSfxEnabled() { return sfxEnabled; }
export function getBgmVolume() { return bgmVolume; }
export function getSfxVolume() { return sfxVolume; }
