/**
 * Motrix Game Audio Engine
 * Procedural chip-tune music + synthesized sound effects using Web Audio API.
 * No audio file dependencies — fully generative.
 */

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
/** Shared reverb send bus — BGM and SFX both feed into this at their own wet levels.
 *  Glues the mix into a single acoustic space. */
let reverbBus: GainNode | null = null;
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

    // Build the shared reverb send bus once. Any source can connect to `reverbBus`
    // at its own wet level; the bus itself outputs to master at a fixed gain.
    const conv = makeReverbImpulse(ctx, 1.1, 2.4);
    reverbBus = ctx.createGain();
    reverbBus.gain.value = 1.0;
    const reverbReturn = ctx.createGain();
    reverbReturn.gain.value = 0.5;
    reverbBus.connect(conv);
    conv.connect(reverbReturn);
    reverbReturn.connect(masterGain);

    masterGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function getMaster(): GainNode {
  getCtx();
  return masterGain!;
}

function getReverbBus(): GainNode {
  getCtx();
  return reverbBus!;
}

/** Build a noise-decay impulse response for the shared reverb convolver. */
function makeReverbImpulse(audioCtx: AudioContext, duration: number, decay: number): ConvolverNode {
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

/**
 * A song section — one structural piece of the track (intro / verse / chorus / …).
 * Each section has its own patterns, chord progression, and arrangement density,
 * so the song evolves over time instead of looping one static phrase.
 */
type Section = {
  name: 'intro' | 'verse' | 'chorus' | 'bridge' | 'outro';
  bars: number;              // how many bars this section lasts
  chords: number[];          // one scale-degree per bar (cycles if shorter)
  arpPattern: number[];      // 8-step arp pattern (scale degrees)
  bassPattern: number[];     // bass notes relative to chord root (scale degrees, usually [0] or varies)
  drums: { kick: boolean; snare: boolean; hatDensity: number };
  hasLead: boolean;          // sustained lead line on top of the arp
  intensity: number;         // 0..1 — overall volume mult for this section
  padLevel: number;          // 0..1 — how loud the chord pad is
};

type BgmConfig = {
  scale: ScaleName;
  rootHz: number;
  bpm: number;
  waveform: OscillatorType;  // lead/arp timbre
  bassWave: OscillatorType;  // bass timbre
  padWave: OscillatorType;   // pad timbre
  reverbAmount: number;
  sections: Section[];       // sequential song structure (loops after last section)
};

// ─── Per-concept song structures ─────────────────────────────────────────────
// Each song: intro → verse → chorus → verse → chorus → outro (≈ 40-48 bars ≈ 60-90s).
// Progressions are hand-tuned to fit each challenge's character.

const CONCEPT_BGM: Record<string, BgmConfig> = {
  // Path-planning: flowing pentatonic, contemplative. Like a zen puzzle game.
  'path-planning': {
    scale: 'pentatonic', rootHz: 293.66, bpm: 120,
    waveform: 'square', bassWave: 'triangle', padWave: 'sawtooth',
    reverbAmount: 0.22,
    sections: [
      { name: 'intro',  bars: 4, chords: [0, 0, 4, 4], arpPattern: [0, 2, 4, 2, 7, 4, 2, 0], bassPattern: [0],
        drums: { kick: false, snare: false, hatDensity: 0 }, hasLead: false, intensity: 0.55, padLevel: 0.16 },
      { name: 'verse',  bars: 8, chords: [0, 4, 3, 2], arpPattern: [0, 2, 4, 2, 7, 4, 2, 0], bassPattern: [0],
        drums: { kick: true, snare: false, hatDensity: 0.5 }, hasLead: false, intensity: 0.78, padLevel: 0.14 },
      { name: 'chorus', bars: 8, chords: [3, 4, 0, 4], arpPattern: [4, 7, 9, 7, 4, 2, 4, 7], bassPattern: [0],
        drums: { kick: true, snare: true,  hatDensity: 0.9 }, hasLead: true,  intensity: 1.0,  padLevel: 0.18 },
      { name: 'verse',  bars: 8, chords: [0, 4, 3, 2], arpPattern: [0, 4, 2, 7, 4, 2, 0, 4], bassPattern: [0],
        drums: { kick: true, snare: true,  hatDensity: 0.7 }, hasLead: false, intensity: 0.82, padLevel: 0.14 },
      { name: 'chorus', bars: 8, chords: [3, 4, 0, 4], arpPattern: [7, 9, 12, 9, 7, 4, 2, 4], bassPattern: [0],
        drums: { kick: true, snare: true,  hatDensity: 1.0 }, hasLead: true,  intensity: 1.0,  padLevel: 0.2  },
      { name: 'outro',  bars: 4, chords: [0, 0, 4, 0], arpPattern: [0, 2, 4, 2, 7, 4, 2, 0], bassPattern: [0],
        drums: { kick: true, snare: false, hatDensity: 0.3 }, hasLead: false, intensity: 0.55, padLevel: 0.18 },
    ],
  },

  // Geometry-drawing: gentle major, lo-fi playful. For creative time.
  'geometry-drawing': {
    scale: 'major', rootHz: 329.63, bpm: 90,
    waveform: 'sine', bassWave: 'sine', padWave: 'triangle',
    reverbAmount: 0.35,
    sections: [
      { name: 'intro',  bars: 4, chords: [0, 0, 0, 0], arpPattern: [0, 4, 7, 4, 0, 4, 7, 11], bassPattern: [0],
        drums: { kick: false, snare: false, hatDensity: 0 }, hasLead: false, intensity: 0.55, padLevel: 0.14 },
      { name: 'verse',  bars: 8, chords: [0, 3, 5, 4], arpPattern: [0, 4, 7, 4, 0, 4, 7, 11], bassPattern: [0],
        drums: { kick: true, snare: false, hatDensity: 0.4 }, hasLead: false, intensity: 0.72, padLevel: 0.13 },
      { name: 'chorus', bars: 8, chords: [5, 3, 0, 4], arpPattern: [7, 4, 2, 7, 11, 7, 4, 2], bassPattern: [0],
        drums: { kick: true, snare: true,  hatDensity: 0.7 }, hasLead: true,  intensity: 1.0,  padLevel: 0.17 },
      { name: 'verse',  bars: 8, chords: [0, 3, 5, 4], arpPattern: [0, 2, 4, 2, 7, 4, 2, 4], bassPattern: [0],
        drums: { kick: true, snare: true,  hatDensity: 0.55 }, hasLead: false, intensity: 0.75, padLevel: 0.13 },
      { name: 'chorus', bars: 8, chords: [5, 3, 0, 4], arpPattern: [7, 11, 7, 4, 7, 11, 7, 4], bassPattern: [0],
        drums: { kick: true, snare: true,  hatDensity: 0.8 }, hasLead: true,  intensity: 1.0,  padLevel: 0.19 },
      { name: 'outro',  bars: 4, chords: [0, 4, 0, 0], arpPattern: [0, 4, 7, 4, 0, 4, 7, 11], bassPattern: [0],
        drums: { kick: true, snare: false, hatDensity: 0.2 }, hasLead: false, intensity: 0.5,  padLevel: 0.17 },
    ],
  },

  // Cone-ring-gauntlet: fast pentatonic synthwave. Racing. 4/4 four-on-the-floor.
  'cone-ring-gauntlet': {
    scale: 'pentatonic', rootHz: 329.63, bpm: 145,
    waveform: 'square', bassWave: 'sawtooth', padWave: 'sawtooth',
    reverbAmount: 0.12,
    sections: [
      { name: 'intro',  bars: 4, chords: [0, 0, 4, 4], arpPattern: [0, 4, 7, 4, 0, 4, 7, 9], bassPattern: [0],
        drums: { kick: true,  snare: false, hatDensity: 0.4 }, hasLead: false, intensity: 0.65, padLevel: 0.12 },
      { name: 'verse',  bars: 8, chords: [0, 4, 3, 2], arpPattern: [0, 4, 7, 9, 12, 9, 7, 4], bassPattern: [0],
        drums: { kick: true,  snare: true,  hatDensity: 0.85 }, hasLead: false, intensity: 0.88, padLevel: 0.1  },
      { name: 'chorus', bars: 8, chords: [3, 4, 0, 4], arpPattern: [4, 9, 12, 9, 7, 12, 9, 7], bassPattern: [0],
        drums: { kick: true,  snare: true,  hatDensity: 1.0  }, hasLead: true,  intensity: 1.0,  padLevel: 0.14 },
      { name: 'verse',  bars: 8, chords: [0, 4, 3, 2], arpPattern: [0, 7, 4, 9, 7, 4, 12, 9], bassPattern: [0],
        drums: { kick: true,  snare: true,  hatDensity: 0.9  }, hasLead: false, intensity: 0.92, padLevel: 0.1  },
      { name: 'chorus', bars: 8, chords: [3, 4, 0, 4], arpPattern: [9, 12, 14, 12, 9, 7, 9, 12], bassPattern: [0],
        drums: { kick: true,  snare: true,  hatDensity: 1.0  }, hasLead: true,  intensity: 1.0,  padLevel: 0.16 },
      { name: 'outro',  bars: 4, chords: [0, 4, 0, 0], arpPattern: [0, 4, 7, 4, 0, 4, 7, 9], bassPattern: [0],
        drums: { kick: true,  snare: true,  hatDensity: 0.5  }, hasLead: false, intensity: 0.6,  padLevel: 0.14 },
    ],
  },

  // Sumo-arena: heavy minor combat. Aggressive and tense.
  'sumo-arena': {
    scale: 'minor', rootHz: 196.00, bpm: 130,
    waveform: 'sawtooth', bassWave: 'sawtooth', padWave: 'sawtooth',
    reverbAmount: 0.2,
    sections: [
      { name: 'intro',  bars: 4, chords: [0, 0, 0, 0], arpPattern: [0, 3, 7, 3, 0, 3, 7, 10], bassPattern: [0],
        drums: { kick: true,  snare: false, hatDensity: 0.2 }, hasLead: false, intensity: 0.55, padLevel: 0.2  },
      { name: 'verse',  bars: 8, chords: [0, 5, 4, 0], arpPattern: [0, 3, 7, 10, 7, 3, 5, 7], bassPattern: [0],
        drums: { kick: true,  snare: true,  hatDensity: 0.7 }, hasLead: false, intensity: 0.9,  padLevel: 0.16 },
      { name: 'chorus', bars: 8, chords: [0, 4, 5, 0], arpPattern: [3, 7, 10, 12, 10, 7, 3, 5], bassPattern: [0],
        drums: { kick: true,  snare: true,  hatDensity: 0.95 }, hasLead: true,  intensity: 1.0,  padLevel: 0.22 },
      { name: 'bridge', bars: 4, chords: [3, 0, 4, 0], arpPattern: [7, 10, 12, 10, 7, 5, 3, 0], bassPattern: [0],
        drums: { kick: true,  snare: false, hatDensity: 0.3 }, hasLead: false, intensity: 0.7,  padLevel: 0.25 },
      { name: 'chorus', bars: 8, chords: [0, 4, 5, 0], arpPattern: [3, 10, 12, 10, 7, 12, 10, 7], bassPattern: [0],
        drums: { kick: true,  snare: true,  hatDensity: 1.0 }, hasLead: true,  intensity: 1.0,  padLevel: 0.24 },
      { name: 'outro',  bars: 4, chords: [0, 0, 0, 0], arpPattern: [0, 3, 7, 3, 0, 3, 7, 10], bassPattern: [0],
        drums: { kick: true,  snare: true,  hatDensity: 0.4 }, hasLead: false, intensity: 0.65, padLevel: 0.2  },
    ],
  },

  // Maze-marathon: mysterious dorian puzzle. Restrained until chorus.
  'maze-marathon': {
    scale: 'dorian', rootHz: 261.63, bpm: 115,
    waveform: 'square', bassWave: 'triangle', padWave: 'sawtooth',
    reverbAmount: 0.34,
    sections: [
      { name: 'intro',  bars: 2, chords: [0, 0], arpPattern: [0, 2, 3, 5, 7, 5, 3, 2], bassPattern: [0],
        drums: { kick: false, snare: false, hatDensity: 0 }, hasLead: false, intensity: 0.45, padLevel: 0.2  },
      { name: 'verse',  bars: 8, chords: [0, 3, 0, 6], arpPattern: [0, 2, 3, 5, 7, 5, 3, 2], bassPattern: [0],
        drums: { kick: true,  snare: false, hatDensity: 0.4 }, hasLead: false, intensity: 0.75, padLevel: 0.16 },
      { name: 'chorus', bars: 8, chords: [0, 3, 4, 6], arpPattern: [3, 5, 7, 5, 9, 7, 5, 3], bassPattern: [0],
        drums: { kick: true,  snare: true,  hatDensity: 0.85 }, hasLead: true,  intensity: 1.0,  padLevel: 0.19 },
      { name: 'bridge', bars: 4, chords: [5, 0, 3, 0], arpPattern: [7, 5, 3, 2, 0, 2, 3, 5], bassPattern: [0],
        drums: { kick: false, snare: false, hatDensity: 0.2 }, hasLead: false, intensity: 0.55, padLevel: 0.22 },
      { name: 'chorus', bars: 8, chords: [0, 3, 4, 6], arpPattern: [5, 7, 9, 7, 5, 3, 5, 7], bassPattern: [0],
        drums: { kick: true,  snare: true,  hatDensity: 0.9 }, hasLead: true,  intensity: 1.0,  padLevel: 0.2  },
      { name: 'outro',  bars: 4, chords: [0, 0, 0, 0], arpPattern: [0, 2, 3, 5, 7, 5, 3, 2], bassPattern: [0],
        drums: { kick: true,  snare: false, hatDensity: 0.2 }, hasLead: false, intensity: 0.55, padLevel: 0.2  },
    ],
  },
};

const DEFAULT_BGM: BgmConfig = CONCEPT_BGM['path-planning']!;

/**
 * Sandbox playlist — when no concept is active (free-play / blank session)
 * we rotate through these tracks instead of looping one. Each entry is a
 * key into CONCEPT_BGM. Order is roughly ascending energy:
 *   geometry-drawing   — gentle major lo-fi (calm)
 *   maze-marathon      — mysterious dorian (focused)
 *   path-planning      — flowing pentatonic (zen)
 * Plays one full song cycle each, then crossfades to the next, then loops
 * the playlist forever.
 */
const SANDBOX_BGM_PLAYLIST: string[] = [
  'geometry-drawing',
  'maze-marathon',
  'path-planning',
];

/** Resolve which section and bar-within-section applies at a given absolute bar index,
 *  wrapping around once the song ends so the track loops structurally. */
function resolveSection(config: BgmConfig, absBarIdx: number): { section: Section; barInSection: number } {
  const totalBars = config.sections.reduce((a, s) => a + s.bars, 0);
  const wrapped = ((absBarIdx % totalBars) + totalBars) % totalBars;
  let barSum = 0;
  for (const s of config.sections) {
    if (wrapped < barSum + s.bars) {
      return { section: s, barInSection: wrapped - barSum };
    }
    barSum += s.bars;
  }
  // Unreachable if sections.length > 0; safety fallback
  return { section: config.sections[0]!, barInSection: 0 };
}

// ─── Pad / chord voice ───────────────────────────────────────────────────────

/**
 * Sustained triad pad. Builds a chord from scale-degree [root, root+2, root+4]
 * with each note played as a detuned-unison pair through a warm lowpass.
 * Slow attack/release so chord changes feel like they breathe instead of click.
 */
function playPadChord(
  audioCtx: AudioContext,
  dest: AudioNode,
  scale: readonly number[],
  rootHz: number,
  chordRootDegree: number,
  dur: number,
  peak: number,
  wave: OscillatorType,
): OscillatorNode[] {
  const now = audioCtx.currentTime;

  const amp = audioCtx.createGain();
  amp.gain.setValueAtTime(0, now);
  amp.gain.linearRampToValueAtTime(peak, now + 0.35);
  amp.gain.setValueAtTime(peak, now + Math.max(0.36, dur - 0.4));
  amp.gain.linearRampToValueAtTime(0, now + dur);
  amp.connect(dest);

  const tone = audioCtx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 1800;
  tone.Q.value = 0.5;
  tone.connect(amp);

  const voices: OscillatorNode[] = [];
  const triad = [chordRootDegree, chordRootDegree + 2, chordRootDegree + 4];
  const endAt = now + dur + 0.1;

  for (const d of triad) {
    const wrapped = ((d % scale.length) + scale.length) % scale.length;
    const octaveShift = Math.floor(d / scale.length);
    const semis = (scale[wrapped] ?? 0) + octaveShift * 12;
    const freq = rootHz * Math.pow(2, semis / 12);

    const a = audioCtx.createOscillator();
    a.type = wave;
    a.frequency.value = freq;
    a.detune.value = -6;
    const b = audioCtx.createOscillator();
    b.type = wave;
    b.frequency.value = freq;
    b.detune.value = +6;
    a.connect(tone);
    b.connect(tone);
    a.start(now); a.stop(endAt);
    b.start(now); b.stop(endAt);
    voices.push(a, b);
  }

  return voices;
}

/**
 * Sustained single-note lead (sine, one octave above the chord's 5th).
 * Used in chorus sections to put a melodic anchor over the arp.
 */
function playLeadSustain(
  audioCtx: AudioContext,
  dest: AudioNode,
  freq: number,
  dur: number,
  peak: number,
): OscillatorNode {
  const now = audioCtx.currentTime;

  const amp = audioCtx.createGain();
  amp.gain.setValueAtTime(0, now);
  amp.gain.linearRampToValueAtTime(peak, now + 0.12);
  amp.gain.setValueAtTime(peak, now + Math.max(0.13, dur - 0.25));
  amp.gain.linearRampToValueAtTime(0, now + dur);
  amp.connect(dest);

  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;
  osc.connect(amp);
  osc.start(now);
  osc.stop(now + dur + 0.05);
  return osc;
}

// ─── Percussion voices ────────────────────────────────────────────────────────

/** Kick drum: fast pitch sweep 120Hz → 40Hz with a click transient. */
function playKick(audioCtx: AudioContext, dest: AudioNode, accent: number): OscillatorNode {
  const now = audioCtx.currentTime;
  const peak = 0.5 + 0.3 * accent;

  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(42, now + 0.06);

  const amp = audioCtx.createGain();
  amp.gain.setValueAtTime(peak, now);
  amp.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

  // Subtle click transient so the kick "starts" crisply
  const click = audioCtx.createOscillator();
  click.type = 'triangle';
  click.frequency.value = 1800;
  const clickAmp = audioCtx.createGain();
  clickAmp.gain.setValueAtTime(0.12 * peak, now);
  clickAmp.gain.exponentialRampToValueAtTime(0.001, now + 0.005);

  osc.connect(amp);
  click.connect(clickAmp);
  clickAmp.connect(amp);
  amp.connect(dest);

  osc.start(now); osc.stop(now + 0.2);
  click.start(now); click.stop(now + 0.01);
  return osc;
}

/** Closed hi-hat: very short highpassed noise burst. */
function playHat(audioCtx: AudioContext, dest: AudioNode, accent: number): AudioBufferSourceNode {
  const now = audioCtx.currentTime;
  const dur = 0.028 + 0.02 * accent;

  const bufLen = Math.floor(audioCtx.sampleRate * dur);
  const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) ch[i] = (Math.random() * 2 - 1);

  const src = audioCtx.createBufferSource();
  src.buffer = buf;

  const hp = audioCtx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7000;
  hp.Q.value = 0.8;

  const amp = audioCtx.createGain();
  amp.gain.setValueAtTime(0.18 + 0.1 * accent, now);
  amp.gain.exponentialRampToValueAtTime(0.001, now + dur);

  src.connect(hp);
  hp.connect(amp);
  amp.connect(dest);

  src.start(now);
  return src;
}

/** Snare/clap: noise burst + 220Hz tonal ping for body. */
function playSnare(audioCtx: AudioContext, dest: AudioNode, accent: number): AudioBufferSourceNode {
  const now = audioCtx.currentTime;
  const dur = 0.13;

  const bufLen = Math.floor(audioCtx.sampleRate * dur);
  const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) {
    ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 2.5);
  }
  const src = audioCtx.createBufferSource();
  src.buffer = buf;

  const bp = audioCtx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1800;
  bp.Q.value = 0.9;

  const noiseAmp = audioCtx.createGain();
  noiseAmp.gain.setValueAtTime(0.28 + 0.15 * accent, now);
  noiseAmp.gain.exponentialRampToValueAtTime(0.001, now + dur);

  src.connect(bp);
  bp.connect(noiseAmp);
  noiseAmp.connect(dest);

  // Tonal body for that snare "thwack"
  const body = audioCtx.createOscillator();
  body.type = 'triangle';
  body.frequency.setValueAtTime(220, now);
  body.frequency.exponentialRampToValueAtTime(140, now + 0.05);
  const bodyAmp = audioCtx.createGain();
  bodyAmp.gain.setValueAtTime(0.22 + 0.1 * accent, now);
  bodyAmp.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  body.connect(bodyAmp);
  bodyAmp.connect(dest);
  body.start(now);
  body.stop(now + 0.1);

  src.start(now);
  return src;
}

// ─── BGM player ───────────────────────────────────────────────────────────────

let currentBgmConfig: BgmConfig | null = null;
let bgmGain: GainNode | null = null;
let stepIdx = 0;
let bassStepIdx = 0;

/** Sandbox playlist state — only meaningful when conceptId === null. */
let sandboxPlaylistIdx = 0;
let isPlayingSandboxPlaylist = false;

function stopBgmOscillators() {
  bgmOscillators.forEach(o => { try { o.stop(); } catch { /* already stopped */ } });
  bgmOscillators = [];
  if (bgmInterval !== null) { clearInterval(bgmInterval); bgmInterval = null; }
  bgmGain = null;
  stepIdx = 0;
  bassStepIdx = 0;
}

/**
 * Fat bass voice: pure-sine sub + detuned-unison body through a resonant lowpass
 * with an envelope-swept cutoff. Gives weight (sub), body (unison), and movement
 * (filter envelope) where a naked oscillator just gives a thin fundamental.
 */
function playBassVoice(
  audioCtx: AudioContext,
  dest: AudioNode,
  freq: number,
  dur: number,
  wave: OscillatorType,
  accent: number, // 0..1, downbeats louder
): OscillatorNode[] {
  const now = audioCtx.currentTime;
  const peak = 0.28 + 0.12 * accent;

  // Master amp envelope — soft attack kills the click, smooth decay
  const amp = audioCtx.createGain();
  amp.gain.setValueAtTime(0, now);
  amp.gain.linearRampToValueAtTime(peak, now + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.001, now + dur);
  amp.connect(dest);

  // Resonant lowpass filter with envelope sweep — the "ooh" of analog bass.
  // Opens fast on attack, closes slowly so decay tails are darker than the peak.
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 4.5;
  filter.frequency.setValueAtTime(140, now);
  filter.frequency.linearRampToValueAtTime(800 + 400 * accent, now + 0.05);
  filter.frequency.exponentialRampToValueAtTime(220, now + dur * 0.7);
  filter.connect(amp);

  // Sub layer: pure sine one octave below. This is where the weight comes from.
  const sub = audioCtx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = freq * 0.5;
  const subGain = audioCtx.createGain();
  subGain.gain.value = 0.9;
  sub.connect(subGain);
  subGain.connect(amp); // sub bypasses the filter — always present

  // Body: detuned unison pair for width and "fatness"
  const bodyGain = audioCtx.createGain();
  bodyGain.gain.value = 0.55;
  const a = audioCtx.createOscillator();
  a.type = wave;
  a.frequency.value = freq;
  a.detune.value = -5;
  const b = audioCtx.createOscillator();
  b.type = wave;
  b.frequency.value = freq;
  b.detune.value = +5;
  a.connect(bodyGain);
  b.connect(bodyGain);
  bodyGain.connect(filter);

  const endAt = now + dur + 0.05;
  sub.start(now); a.start(now); b.start(now);
  sub.stop(endAt); a.stop(endAt); b.stop(endAt);

  return [sub, a, b];
}

/**
 * Lead/arpeggio voice: detuned pair for body + quiet sine-octave sparkle on
 * downbeats. Gentler attack and smoother decay than a naked oscillator so
 * the lead sings instead of beeps.
 */
function playLeadVoice(
  audioCtx: AudioContext,
  dest: AudioNode,
  freq: number,
  dur: number,
  wave: OscillatorType,
  accent: number, // 0..1, downbeats louder
): OscillatorNode[] {
  const now = audioCtx.currentTime;
  const peak = 0.12 + 0.08 * accent;

  const amp = audioCtx.createGain();
  amp.gain.setValueAtTime(0, now);
  amp.gain.linearRampToValueAtTime(peak, now + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.001, now + dur);
  amp.connect(dest);

  // Warm the tone with a gentle lowpass — tames harsh square/saw harmonics
  const tone = audioCtx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.Q.value = 0.7;
  tone.frequency.value = 3800;
  tone.connect(amp);

  // Detuned unison — ±3 cents for subtle thickness without slowing the arp
  const a = audioCtx.createOscillator();
  a.type = wave;
  a.frequency.value = freq;
  a.detune.value = -3;
  const b = audioCtx.createOscillator();
  b.type = wave;
  b.frequency.value = freq;
  b.detune.value = +3;
  a.connect(tone);
  b.connect(tone);

  const endAt = now + dur + 0.05;
  const voices: OscillatorNode[] = [a, b];
  a.start(now); b.start(now);
  a.stop(endAt); b.stop(endAt);

  // Octave-up sine sparkle on accented notes only (keeps the groove moving)
  if (accent > 0.5) {
    const sparkle = audioCtx.createOscillator();
    sparkle.type = 'sine';
    sparkle.frequency.value = freq * 2;
    const sparkleGain = audioCtx.createGain();
    sparkleGain.gain.setValueAtTime(0, now);
    sparkleGain.gain.linearRampToValueAtTime(peak * 0.35, now + 0.015);
    sparkleGain.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.7);
    sparkle.connect(sparkleGain);
    sparkleGain.connect(amp);
    sparkle.start(now);
    sparkle.stop(endAt);
    voices.push(sparkle);
  }

  return voices;
}

/** Tracks an in-flight outgoing BGM during a crossfade so we can cancel it
 *  if another track change happens before the fade completes. */
let outgoingBgmCleanup: (() => void) | null = null;

/** Crossfade duration when switching between BGM tracks. Long enough to feel
 *  seamless, short enough that a user who navigates fast doesn't hear two
 *  songs playing for ages. */
const CROSSFADE_SEC = 1.2;

export function playBGM(conceptId?: string | null) {
  if (typeof window === 'undefined') return;

  // Sandbox / no concept → rotate through the playlist. Pick the current
  // playlist track as the resolved config; the setInterval loop below
  // detects song-cycle completion and advances sandboxPlaylistIdx so the
  // next call to this function picks up the next track.
  let resolvedConfig: BgmConfig;
  if (conceptId) {
    isPlayingSandboxPlaylist = false;
    resolvedConfig = CONCEPT_BGM[conceptId] ?? DEFAULT_BGM;
  } else {
    isPlayingSandboxPlaylist = true;
    const id = SANDBOX_BGM_PLAYLIST[sandboxPlaylistIdx % SANDBOX_BGM_PLAYLIST.length]!;
    resolvedConfig = CONCEPT_BGM[id] ?? DEFAULT_BGM;
  }
  const config = resolvedConfig;

  if (currentBgmConfig === config && bgmInterval !== null) return; // already playing this
  if (!bgmEnabled) { stopBgmOscillators(); return; }

  const audioCtx = getCtx();
  const master = getMaster();
  const reverb = getReverbBus();

  // ── Crossfade out the current track (if any) instead of hard-stopping it ──
  if (bgmInterval !== null && bgmGain) {
    // Cancel any previous crossfade that hasn't finished yet
    if (outgoingBgmCleanup) outgoingBgmCleanup();

    const outGain = bgmGain;
    const outInterval = bgmInterval;
    const outOscillators = bgmOscillators;
    const now = audioCtx.currentTime;
    outGain.gain.cancelScheduledValues(now);
    outGain.gain.setValueAtTime(outGain.gain.value, now);
    outGain.gain.linearRampToValueAtTime(0, now + CROSSFADE_SEC);

    const timeout = setTimeout(() => {
      clearInterval(outInterval);
      outOscillators.forEach(o => { try { o.stop(); } catch { /* noop */ } });
      outgoingBgmCleanup = null;
    }, (CROSSFADE_SEC + 0.2) * 1000);

    outgoingBgmCleanup = () => {
      clearTimeout(timeout);
      clearInterval(outInterval);
      outOscillators.forEach(o => { try { o.stop(); } catch { /* noop */ } });
      outgoingBgmCleanup = null;
    };
  }

  // Reset module state for the incoming track (outgoing refs are captured in closure above)
  currentBgmConfig = config;
  bgmOscillators = [];
  stepIdx = 0;
  bassStepIdx = 0;

  // ── Incoming track: dry path to master + send to shared reverb bus ──
  bgmGain = audioCtx.createGain();
  bgmGain.gain.value = 0;
  bgmGain.gain.linearRampToValueAtTime(bgmVolume, audioCtx.currentTime + CROSSFADE_SEC);
  bgmGain.connect(master);

  if (config.reverbAmount > 0) {
    const bgmReverbSend = audioCtx.createGain();
    bgmReverbSend.gain.value = config.reverbAmount;
    bgmGain.connect(bgmReverbSend);
    bgmReverbSend.connect(reverb);
  }

  const scale = SCALES[config.scale];
  const beatMs = (60 / config.bpm) * 500; // 8th note in ms

  /** Total bars in this song. Used to detect a full song-cycle completion
   *  so we can advance the sandbox playlist to the next track. */
  const totalBars = config.sections.reduce((a, s) => a + s.bars, 0);
  const totalSteps = totalBars * 8;

  bgmInterval = setInterval(() => {
    if (!bgmGain || !bgmEnabled) return;

    // ── Sandbox playlist advance ───────────────────────────────────────
    // When the song hits the end of its full structural cycle (intro →
    // chorus → outro), rotate to the next track in the playlist. The
    // crossfade in playBGM() handles the transition smoothly.
    if (isPlayingSandboxPlaylist && stepIdx > 0 && stepIdx % totalSteps === 0) {
      sandboxPlaylistIdx += 1;
      // Defer to next tick so we don't recurse-mutate during this interval body.
      setTimeout(() => playBGM(null), 0);
      return;
    }

    const stepInBar = stepIdx % 8;
    const absBarIdx = Math.floor(stepIdx / 8);
    const { section, barInSection } = resolveSection(config, absBarIdx);
    const chordRoot = section.chords[barInSection % section.chords.length] ?? 0;
    const intensity = section.intensity;

    // ── On each bar boundary: new chord pad + (optional) lead sustain ──
    if (stepInBar === 0 && section.padLevel > 0) {
      const barDurSec = (beatMs * 8) / 1000;
      const padVoices = playPadChord(
        audioCtx, bgmGain, scale, config.rootHz,
        chordRoot, barDurSec * 0.98, section.padLevel * intensity, config.padWave,
      );
      bgmOscillators.push(...padVoices);

      if (section.hasLead) {
        // Lead sustain: the 5th of the current chord, one octave up. Melodic anchor.
        const leadDegree = chordRoot + 2;
        const wrapped = ((leadDegree % scale.length) + scale.length) % scale.length;
        const octaveShift = Math.floor(leadDegree / scale.length) + 1;
        const leadFreq = noteFreq((scale[wrapped] ?? 0) + octaveShift * 12, config.rootHz);
        const leadOsc = playLeadSustain(audioCtx, bgmGain, leadFreq, barDurSec * 0.95, 0.09 * intensity);
        bgmOscillators.push(leadOsc);
      }
    }

    // ── Arpeggio ── pattern comes from current section
    const arpNote = section.arpPattern[stepIdx % section.arpPattern.length] ?? 0;
    const arpFreq = noteFreq(scale[arpNote % scale.length] ?? 0, config.rootHz);
    const arpAccentBase = stepInBar === 0 ? 1.0 : stepInBar === 4 ? 0.75 : stepInBar % 2 === 0 ? 0.4 : 0.15;
    const arpAccent = arpAccentBase * intensity;
    const arpDur = beatMs / 500;
    const arpVoices = playLeadVoice(audioCtx, bgmGain, arpFreq, arpDur, config.waveform, arpAccent);
    bgmOscillators.push(...arpVoices);

    // ── Bass ── note follows the CHORD root (so bass tracks progression, not a static pattern)
    if (stepIdx % 4 === 0) {
      // Bass plays the chord's root one octave down, for grounding
      const bassSemi = (scale[chordRoot % scale.length] ?? 0) - 12 + Math.floor(chordRoot / scale.length) * 12;
      const bassFreq = noteFreq(bassSemi, config.rootHz);
      const dur = (beatMs * 4) / 1000 * 0.9;
      const voices = playBassVoice(audioCtx, bgmGain, bassFreq, dur, config.bassWave, 1.0 * intensity);
      bgmOscillators.push(...voices);
      bassStepIdx++;
    } else if (stepIdx % 4 === 2 && intensity > 0.6) {
      // Off-beat ghost — only in denser sections
      const bassSemi = (scale[chordRoot % scale.length] ?? 0) - 12 + Math.floor(chordRoot / scale.length) * 12;
      const bassFreq = noteFreq(bassSemi, config.rootHz);
      const dur = (beatMs * 2) / 1000 * 0.5;
      const voices = playBassVoice(audioCtx, bgmGain, bassFreq, dur, config.bassWave, 0.0);
      bgmOscillators.push(...voices);
    }

    // ── Drums ── per-section mask drives kick/snare/hat presence
    if (section.drums.kick && (stepInBar === 0 || stepInBar === 4)) {
      const kick = playKick(audioCtx, bgmGain, (stepInBar === 0 ? 1.0 : 0.7) * intensity);
      bgmOscillators.push(kick);
    }
    if (section.drums.snare && (stepInBar === 2 || stepInBar === 6)) {
      playSnare(audioCtx, bgmGain, (stepInBar === 2 ? 0.8 : 1.0) * intensity);
    }
    // Hi-hat density modulates how often 16th-note hats hit
    if (section.drums.hatDensity > 0) {
      const shouldHat = stepInBar % 2 === 0
        ? section.drums.hatDensity > 0.5   // on-beats only when density is moderate+
        : section.drums.hatDensity > 0.2;  // off-beats when density is any
      if (shouldHat) {
        const hatAccent = (stepInBar === 3 || stepInBar === 7) ? 0.8 : stepInBar % 2 === 1 ? 0.5 : 0.25;
        playHat(audioCtx, bgmGain, hatAccent * section.drums.hatDensity * intensity);
      }
    }

    // ── Section-boundary fill: snare flurry on the last step of the last bar
    // of chorus/verse sections → announces the transition to the next section.
    const lastStepOfSection = stepInBar === 7 && barInSection === section.bars - 1;
    if (lastStepOfSection && (section.name === 'chorus' || section.name === 'verse') && section.drums.snare) {
      // Quick double-hit snare fill — the "tsssk-TSSK" before the downbeat
      playSnare(audioCtx, bgmGain, 0.7 * intensity);
      setTimeout(() => {
        if (bgmGain && bgmEnabled) playSnare(audioCtx, bgmGain, 0.9 * intensity);
      }, beatMs * 0.5);
    }

    stepIdx++;
    if (bgmOscillators.length > 160) bgmOscillators.splice(0, 60);
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
  // Reset playlist mode so a future playBGM() starts fresh
  isPlayingSandboxPlaylist = false;
}

// ─── Musical context for SFX ──────────────────────────────────────────────────
// SFX pitches are derived from the currently-playing BGM's scale/root so every
// click, success chime, coin pickup lands IN KEY. When no BGM is playing we fall
// back to C major so the defaults still sound pleasant.

function getActiveKey(): { scale: readonly number[]; rootHz: number } {
  if (currentBgmConfig) {
    return { scale: SCALES[currentBgmConfig.scale], rootHz: currentBgmConfig.rootHz };
  }
  return { scale: SCALES.major, rootHz: 261.63 };
}

/** Get a frequency for a scale degree (0=root) at a given octave offset. */
function scaleNote(degree: number, octaveShift = 0): number {
  const { scale, rootHz } = getActiveKey();
  const wrapped = ((degree % scale.length) + scale.length) % scale.length;
  const semitone = (scale[wrapped] ?? 0) + octaveShift * 12;
  return noteFreq(semitone, rootHz);
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
    const reverb = getReverbBus();
    const sfxGain = audioCtx.createGain();
    sfxGain.gain.value = sfxVolume;
    sfxGain.connect(master);

    // Small reverb send — puts SFX in the same acoustic space as the BGM
    // so UI sounds feel like they belong to the music, not laid on top.
    const sfxReverbSend = audioCtx.createGain();
    sfxReverbSend.gain.value = 0.12;
    sfxGain.connect(sfxReverbSend);
    sfxReverbSend.connect(reverb);

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
        // Scale-degree 5 (dominant), 2 octaves up — a bright in-key tick
        play(scaleNote(4, 2), 0.06, 'square', 0.004, 0.05, 0.2);
        break;
      case 'success': {
        // Tonic-third-fifth ascending: the "ta-da!" triad, in the active key
        play(scaleNote(0, 1), 0.12, 'sine', 0.008, 0.1);
        setTimeout(() => play(scaleNote(2, 1), 0.12, 'sine', 0.008, 0.1), 100);
        setTimeout(() => play(scaleNote(4, 1), 0.2, 'sine', 0.008, 0.18), 200);
        break;
      }
      case 'error': {
        // Flat-second down to tonic (minor-2nd drop) — tension resolve that doesn't
        // clash with any scale because both notes are close to the root
        const { rootHz } = getActiveKey();
        play(rootHz * 1.06, 0.08, 'sawtooth', 0.006, 0.07, 0.25);
        setTimeout(() => play(rootHz * 0.94, 0.15, 'sawtooth', 0.006, 0.13, 0.25), 90);
        break;
      }
      case 'coin':
        // Octave + third above: sparkly in-key ping
        play(scaleNote(0, 2), 0.06, 'square', 0.003, 0.05, 0.22);
        setTimeout(() => play(scaleNote(2, 2), 0.1, 'square', 0.003, 0.08, 0.22), 60);
        break;
      case 'level-up': {
        // Full 1-3-5-8 ascending arpeggio in the active scale — triumphant
        const degrees = [0, 2, 4, 7];
        degrees.forEach((d, i) =>
          setTimeout(() => play(scaleNote(d, 1), 0.18, 'square', 0.008, 0.15, 0.28), i * 80),
        );
        break;
      }
      case 'waypoint':
        // Tonic + major 3rd two octaves up — bright but rooted
        play(scaleNote(0, 2), 0.08, 'sine', 0.005, 0.07, 0.32);
        play(scaleNote(2, 2), 0.08, 'sine', 0.005, 0.07, 0.18);
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
        // 1-3-5-8-5-8 "charge fanfare" in the active key
        const degrees = [0, 2, 4, 7, 4, 7];
        degrees.forEach((d, i) =>
          setTimeout(() => play(scaleNote(d, 1), 0.1, 'square', 0.005, 0.08, 0.28), i * 70),
        );
        break;
      }
      case 'unlock':
        // Smooth 1-3-5-8 ascending sines — regal reveal, in the active key
        play(scaleNote(0, 0), 0.1, 'sine', 0.01, 0.08);
        setTimeout(() => play(scaleNote(2, 0), 0.1, 'sine', 0.01, 0.08), 100);
        setTimeout(() => play(scaleNote(4, 0), 0.2, 'sine', 0.01, 0.18), 200);
        setTimeout(() => play(scaleNote(0, 1), 0.3, 'sine', 0.01, 0.28), 300);
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
        // Tonic, 2 octaves up — clean in-key beep
        play(scaleNote(0, 2), 0.05, 'sine', 0.004, 0.04, 0.2);
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
