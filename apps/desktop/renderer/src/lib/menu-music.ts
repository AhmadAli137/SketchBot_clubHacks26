'use client';

import { useEffect, useRef, useState } from 'react';

// ─── Timing ───────────────────────────────────────────────────────────────────
const BPM       = 148;
const BEAT      = 60 / BPM;
const EIGHTH    = BEAT / 2;
const SIXTEENTH = BEAT / 4;
const BAR       = BEAT * 4;
const LOOP_BARS  = 32;
const SHORT_BARS = 8;   // A section only — renders fast for quick startup
const LOOP_DUR  = BAR * LOOP_BARS;
const SR        = 44100;

// Pre-baked noise — generated once at module load
const NOISE_LEN  = SR * 2;
const NOISE_DATA = new Float32Array(NOISE_LEN);
for (let i = 0; i < NOISE_LEN; i++) NOISE_DATA[i] = Math.random() * 2 - 1;

function noiseBuffer(ctx: BaseAudioContext, durationSec: number): AudioBuffer {
  const len = Math.min(Math.ceil(SR * durationSec), NOISE_LEN);
  const buf = ctx.createBuffer(1, len, SR);
  buf.getChannelData(0).set(NOISE_DATA.subarray(0, len));
  return buf;
}

// ─── Melodies (A major) ───────────────────────────────────────────────────────
const MELODY_A: [number, number][] = [
  [440,0.5],[554,0.5],[659,0.5],[880,0.5],
  [880,0.25],[740,0.25],[659,0.25],[554,0.25],[494,0.5],[440,0.25],[392,0.25],
  [440,0.25],[554,0.25],[659,0.25],[880,0.25],[659,0.25],[554,0.25],[494,0.25],[440,0.25],
  [554,0.5],[659,0.5],[880,0.25],[740,0.25],[659,0.5],
  [494,0.25],[659,0.25],[880,0.5],[740,0.25],[659,0.25],[554,0.5],
  [880,0.25],[659,0.25],[554,0.25],[440,0.25],[880,0.25],[659,0.25],[554,0.25],[440,0.25],
  [440,0.25],[494,0.25],[554,0.25],[659,0.25],[740,0.25],[880,0.25],[740,0.25],[659,0.25],
  [880,0.75],[659,0.25],[554,0.5],[440,0.5],
];
const MELODY_B: [number, number][] = [
  [330,0.25],[330,0.25],[440,0.5],[494,0.25],[440,0.25],[330,0.5],
  [440,0.25],[494,0.25],[554,0.25],[659,0.25],[740,0.5],[659,0.5],
  [659,0.25],[554,0.25],[659,0.25],[554,0.25],[440,0.25],[392,0.25],[440,0.5],
  [880,0.5],[659,0.5],[554,0.25],[494,0.25],[440,0.5],
  [880,0.25],[988,0.25],[880,0.25],[740,0.25],[659,0.25],[554,0.25],[494,0.25],[440,0.25],
  [494,0.5],[440,0.5],[554,0.25],[659,0.25],[740,0.5],
  [440,0.25],[494,0.25],[554,0.25],[659,0.25],[740,0.25],[880,0.25],[988,0.25],[1175,0.25],
  [1175,0.5],[880,0.25],[659,0.25],[554,0.5],[440,0.5],
];
const BASS_A: [number, number][] = [
  [110,0.5],[110,0.5],[165,0.5],[165,0.5],[147,0.5],[147,0.5],[165,0.5],[110,0.5],
];
const BASS_B: [number, number][] = [
  [110,0.25],[110,0.25],[110,0.5],[165,0.25],[165,0.25],[147,0.5],
  [110,0.25],[131,0.25],[147,0.5],[165,0.5],[110,0.25],[131,0.25],
];
// C — breakdown: sparser, lower, builds suspense (bars 16-23)
const MELODY_C: [number, number][] = [
  [330,1.0],[440,0.5],[494,0.5],
  [330,0.5],[440,0.5],[554,1.0],
  [494,0.5],[440,0.5],[392,0.5],[330,0.5],
  [330,0.25],[392,0.25],[440,0.5],[494,0.25],[440,0.25],[330,0.5],
  [440,1.0],[494,0.5],[554,0.5],
  [659,0.5],[554,0.5],[494,0.5],[440,0.5],
  [494,0.25],[440,0.25],[392,0.25],[330,0.25],[440,0.5],[494,0.5],
  [659,0.75],[554,0.25],[494,0.5],[440,0.5],
];
// D — big outro: high energy, wide range (bars 24-31)
const MELODY_D: [number, number][] = [
  [880,0.5],[1047,0.5],[1175,0.5],[880,0.5],
  [880,0.25],[740,0.25],[659,0.5],[880,0.25],[740,0.25],[659,0.5],
  [659,0.25],[554,0.25],[659,0.25],[554,0.25],[494,0.25],[440,0.25],[554,0.5],
  [880,0.5],[659,0.25],[554,0.25],[880,0.5],[659,0.5],
  [1047,0.25],[880,0.25],[740,0.25],[659,0.25],[880,0.25],[740,0.25],[659,0.25],[554,0.25],
  [659,0.5],[554,0.5],[440,0.25],[554,0.25],[659,0.5],
  [440,0.25],[494,0.25],[554,0.25],[659,0.25],[740,0.25],[880,0.25],[740,0.25],[659,0.25],
  [880,0.5],[1047,0.25],[880,0.25],[659,0.5],[440,0.5],
];
const BASS_C: [number, number][] = [
  [110,1.0],[165,1.0],[147,1.0],[110,1.0],
];
// A major arpeggio — 8 pitches cycling across 16th notes
const ARP: number[] = [440, 554, 659, 880, 659, 554, 440, 330];

// ─── Soft clipper on master bus ───────────────────────────────────────────────
function makeSoftClipper(ctx: BaseAudioContext): WaveShaperNode {
  const ws = ctx.createWaveShaper();
  const N = 256;
  const curve = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = (i * 2) / N - 1;
    curve[i] = x / (1 + Math.abs(x * 1.5));
  }
  ws.curve = curve;
  ws.oversample = '2x';
  return ws;
}

// ─── Percussion ───────────────────────────────────────────────────────────────
type Ctx = BaseAudioContext;

function kick(ctx: Ctx, dest: AudioNode, t: number) {
  // Sine body
  const osc = ctx.createOscillator(), env = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(38, t + 0.09);
  env.gain.setValueAtTime(0.9, t); env.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  osc.connect(env); env.connect(dest); osc.start(t); osc.stop(t + 0.26);
  // Triangle click transient for definition
  const cl = ctx.createOscillator(), clEnv = ctx.createGain();
  cl.type = 'triangle'; cl.frequency.value = 240;
  clEnv.gain.setValueAtTime(0.42, t); clEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.018);
  cl.connect(clEnv); clEnv.connect(dest); cl.start(t); cl.stop(t + 0.022);
}

function snare(ctx: Ctx, dest: AudioNode, t: number, vol = 0.45) {
  // Noise component
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, 0.18);
  const flt = ctx.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 2400; flt.Q.value = 0.75;
  const env = ctx.createGain();
  env.gain.setValueAtTime(vol, t); env.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  src.connect(flt); flt.connect(env); env.connect(dest); src.start(t); src.stop(t + 0.22);
  // Tonal triangle body for warmth
  const body = ctx.createOscillator(), bodyEnv = ctx.createGain();
  body.type = 'triangle'; body.frequency.value = 200;
  bodyEnv.gain.setValueAtTime(vol * 0.30, t); bodyEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  body.connect(bodyEnv); bodyEnv.connect(dest); body.start(t); body.stop(t + 0.09);
}

function clap(ctx: Ctx, dest: AudioNode, t: number) {
  for (const off of [0, 0.009]) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, 0.12);
    const hi  = ctx.createBiquadFilter(); hi.type = 'highpass'; hi.frequency.value = 1200;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.20, t + off); env.gain.exponentialRampToValueAtTime(0.001, t + off + 0.10);
    src.connect(hi); hi.connect(env); env.connect(dest); src.start(t + off); src.stop(t + off + 0.14);
  }
}

function hat(ctx: Ctx, dest: AudioNode, t: number, vol = 0.11) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, 0.06);
  const flt = ctx.createBiquadFilter(); flt.type = 'highpass'; flt.frequency.value = 7500;
  const env = ctx.createGain();
  env.gain.setValueAtTime(vol, t);
  env.gain.exponentialRampToValueAtTime(0.001, t + (vol > 0.16 ? 0.055 : 0.028));
  src.connect(flt); flt.connect(env); env.connect(dest); src.start(t); src.stop(t + 0.08);
}

function openHat(ctx: Ctx, dest: AudioNode, t: number) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, 0.28);
  const flt = ctx.createBiquadFilter(); flt.type = 'highpass'; flt.frequency.value = 6000;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.18, t); env.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
  src.connect(flt); flt.connect(env); env.connect(dest); src.start(t); src.stop(t + 0.30);
}

// 16th-note hi-hat groove with velocity variation and open hat on beat 4-and
function hats16(ctx: Ctx, dest: AudioNode, bs: number) {
  for (let i = 0; i < 16; i++) {
    const t = bs + i * SIXTEENTH;
    if (i === 14) { openHat(ctx, dest, t); continue; }
    const vol = i % 4 === 0 ? 0.22 : i % 2 === 1 ? 0.07 : 0.12;
    hat(ctx, dest, t, vol);
  }
}

// ─── Schedulers (all accept maxBars to limit node creation for short render) ──

function drums(ctx: Ctx, dest: AudioNode, s: number, maxBars = LOOP_BARS) {
  for (let b = 0; b < maxBars; b++) {
    const bs      = s + b * BAR;
    const section = b < 8 ? 'A' : b < 16 ? 'B' : b < 24 ? 'C' : 'D';

    // Kicks
    if (section !== 'C') {
      kick(ctx, dest, bs); kick(ctx, dest, bs + BEAT * 2);
    } else {
      // Breakdown: half-time feel — kick only on 1
      kick(ctx, dest, bs);
      if (b % 2 === 1) kick(ctx, dest, bs + BEAT * 3);
    }
    if (section === 'A' && b % 2 === 1) kick(ctx, dest, bs + BEAT * 2.5);
    if (section === 'B' || section === 'D') {
      if (b % 4 !== 3) kick(ctx, dest, bs + BEAT * 1.5);
      if (b % 2 === 1) kick(ctx, dest, bs + BEAT * 3.5);
    }

    // Snares
    snare(ctx, dest, bs + BEAT); snare(ctx, dest, bs + BEAT * 3);
    if (section === 'B' || section === 'D') {
      clap(ctx, dest, bs + BEAT); clap(ctx, dest, bs + BEAT * 3);
    }

    // Ghost snares
    if (section === 'A') {
      if (b % 2 === 0) snare(ctx, dest, bs + BEAT * 1.5, 0.06);
      snare(ctx, dest, bs + BEAT * 2.5, 0.05);
      if (b % 2 === 1) snare(ctx, dest, bs + BEAT * 3.5, 0.07);
    } else if (section === 'B' || section === 'D') {
      snare(ctx, dest, bs + BEAT * 0.75, 0.09);
      if (b % 2 === 0) snare(ctx, dest, bs + BEAT * 2.75, 0.07);
    }

    // Hi-hats: sparse 8ths in A+C, dense 16ths in B+D
    if (section === 'B' || section === 'D') {
      hats16(ctx, dest, bs);
    } else if (section === 'C') {
      // Breakdown: only on beats 1 and 3
      hat(ctx, dest, bs, 0.16); hat(ctx, dest, bs + BEAT * 2, 0.14);
    } else {
      for (let e = 0; e < 8; e++) hat(ctx, dest, bs + e * EIGHTH, e % 4 === 0 ? 0.20 : 0.10);
    }

    // Snare fill at end of each 4-bar phrase
    const fillBars = [3, 7, 11, 15, 19, 23, 27, 31];
    if (fillBars.includes(b))
      for (let f = 0; f < 4; f++) snare(ctx, dest, bs + BEAT * 3 + f * SIXTEENTH, 0.28 + f * 0.06);
  }
}

function bass(ctx: Ctx, dest: AudioNode, s: number, maxBars = LOOP_BARS) {
  const note = (f: number, beats: number, t: number, vol: number, lpHz: number) => {
    const dur = beats * BEAT;
    // Sawtooth main
    const osc = ctx.createOscillator(), env = ctx.createGain(), lp = ctx.createBiquadFilter();
    osc.type = 'sawtooth'; osc.frequency.value = f;
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(vol, t + 0.014);
    env.gain.setValueAtTime(vol * 0.65, t + dur * 0.52); env.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.9);
    lp.type = 'lowpass'; lp.frequency.value = lpHz;
    osc.connect(lp); lp.connect(env); env.connect(dest); osc.start(t); osc.stop(t + dur);
    // Sine sub (octave below) for warmth
    const sub = ctx.createOscillator(), subEnv = ctx.createGain();
    sub.type = 'sine'; sub.frequency.value = f / 2;
    subEnv.gain.setValueAtTime(0, t); subEnv.gain.linearRampToValueAtTime(vol * 0.42, t + 0.018);
    subEnv.gain.setValueAtTime(vol * 0.28, t + dur * 0.5); subEnv.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.9);
    sub.connect(subEnv); subEnv.connect(dest); sub.start(t); sub.stop(t + dur);
    return t + dur;
  };
  let t = s;
  // Bars 0-7: BASS_A
  const repsA1 = Math.min(8, maxBars);
  for (let r = 0; r < repsA1; r++) for (const [f, nb] of BASS_A) t = note(f, nb, t, 0.38, 540);
  if (maxBars <= 8) return;
  // Bars 8-15: BASS_B
  for (let r = 0; r < 8; r++) for (const [f, nb] of BASS_B) t = note(f, nb, t, 0.42, 580);
  if (maxBars <= 16) return;
  // Bars 16-23: BASS_C (slower, repeat 2x)
  for (let r = 0; r < 2; r++) for (const [f, nb] of BASS_C) t = note(f, nb, t, 0.32, 480);
  if (maxBars <= 24) return;
  // Bars 24-31: BASS_A high-energy
  for (let r = 0; r < 8; r++) for (const [f, nb] of BASS_A) t = note(f, nb, t, 0.46, 600);
}

// Triangle melody with detuned layer (+3 cents) for thickness
function notes(ctx: Ctx, dest: AudioNode, arr: [number,number][], t0: number, peak: number, lpHz: number) {
  let t = t0;
  for (const [f, nb] of arr) {
    const dur = nb * BEAT;
    for (const df of [0, 3]) {
      const osc = ctx.createOscillator(), env = ctx.createGain(), lp = ctx.createBiquadFilter();
      osc.type = 'triangle';
      osc.frequency.value = f * Math.pow(2, df / 1200);
      const vol = df === 0 ? peak : peak * 0.55;
      env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(vol, t + 0.012);
      env.gain.setValueAtTime(vol * 0.72, t + dur * 0.42); env.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.92);
      lp.type = 'lowpass'; lp.frequency.value = lpHz;
      osc.connect(lp); lp.connect(env); env.connect(dest); osc.start(t); osc.stop(t + dur + 0.01);
    }
    t += dur;
  }
  return t;
}

function melody(ctx: Ctx, dest: AudioNode, s: number, maxBars = LOOP_BARS) {
  // Bars 0-7: A section (two passes)
  let t = s;
  t = notes(ctx, dest, MELODY_A, t, 0.28, 3200);
  t = notes(ctx, dest, MELODY_A, t, 0.25, 3200);
  if (maxBars <= 8) return;
  // Bars 8-15: B section (two passes)
  t = s + BAR * 8;
  t = notes(ctx, dest, MELODY_B, t, 0.24, 4200);
  t = notes(ctx, dest, MELODY_B, t, 0.21, 4200);
  if (maxBars <= 16) return;
  // Bars 16-23: C breakdown (two passes, quieter)
  t = s + BAR * 16;
  t = notes(ctx, dest, MELODY_C, t, 0.18, 2800);
  t = notes(ctx, dest, MELODY_C, t, 0.16, 2800);
  if (maxBars <= 24) return;
  // Bars 24-31: D finale (two passes, louder + brighter filter)
  t = s + BAR * 24;
  t = notes(ctx, dest, MELODY_D, t, 0.30, 5000);
  notes(ctx, dest, MELODY_D, t, 0.27, 5000);
}

// Arpeggio texture — 16th note triangles
function arp(ctx: Ctx, dest: AudioNode, s: number, maxBars = LOOP_BARS) {
  for (const b of [2, 3, 4, 5, 10, 11, 12, 13, 20, 21, 22, 23, 26, 27, 28, 29]) {
    if (b >= maxBars) continue;
    const bs = s + b * BAR;
    for (let i = 0; i < 16; i++) {
      const t = bs + i * SIXTEENTH;
      const f = ARP[i % ARP.length];
      const dur = SIXTEENTH * 0.82;
      const osc = ctx.createOscillator(), env = ctx.createGain(), lp = ctx.createBiquadFilter();
      osc.type = 'triangle'; osc.frequency.value = f;
      env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.07, t + 0.008);
      env.gain.exponentialRampToValueAtTime(0.001, t + dur);
      lp.type = 'lowpass'; lp.frequency.value = 3800;
      osc.connect(lp); lp.connect(env); env.connect(dest); osc.start(t); osc.stop(t + dur + 0.01);
    }
  }
}

// Triangle chord stabs — B section (8-15) and D section (24-31)
function stabs(ctx: Ctx, dest: AudioNode, s: number, maxBars = LOOP_BARS) {
  const chord = [220, 277, 330];
  for (let b = 8; b < Math.min(LOOP_BARS, maxBars); b++) {
    if (b >= 16 && b < 24) continue; // silence during C breakdown
    const bs = s + b * BAR;
    for (const beat of [1, 3]) {
      const t = bs + beat * BEAT;
      for (const f of chord) {
        const osc = ctx.createOscillator(), env = ctx.createGain(), lp = ctx.createBiquadFilter();
        osc.type = 'triangle'; osc.frequency.value = f;
        env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.13, t + 0.006);
        env.gain.exponentialRampToValueAtTime(0.001, t + BEAT * 0.32);
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(280, t); lp.frequency.exponentialRampToValueAtTime(1800, t + 0.06);
        osc.connect(lp); lp.connect(env); env.connect(dest); osc.start(t); osc.stop(t + BEAT);
      }
    }
    if ((b - 8) % 2 === 1) {
      const t = bs + BEAT * 2.5;
      for (const f of chord) {
        const osc = ctx.createOscillator(), env = ctx.createGain(), lp = ctx.createBiquadFilter();
        osc.type = 'triangle'; osc.frequency.value = f;
        env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.07, t + 0.006);
        env.gain.exponentialRampToValueAtTime(0.001, t + EIGHTH * 0.7);
        lp.type = 'lowpass'; lp.frequency.value = 900;
        osc.connect(lp); lp.connect(env); env.connect(dest); osc.start(t); osc.stop(t + EIGHTH);
      }
    }
  }
}

// Richer pad — 7 chord tones x 3 detuned sine voices (full loop only)
function pad(ctx: Ctx, dest: AudioNode, s: number) {
  const padNotes = [110, 165, 220, 277, 330, 440, 554];
  const detuneFactors = [1, 0.997, 1.003];
  for (const f of padNotes) {
    const baseVol = 0.018 / Math.sqrt(f / 110);
    for (const dt of detuneFactors) {
      const osc = ctx.createOscillator(), env = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = f * dt;
      env.gain.setValueAtTime(0, s); env.gain.linearRampToValueAtTime(baseVol, s + 1.4);
      env.gain.setValueAtTime(baseVol * 0.9, s + BAR * 6);
      env.gain.linearRampToValueAtTime(baseVol * 1.45, s + BAR * 9);
      env.gain.setValueAtTime(baseVol * 1.2, s + BAR * 14);
      env.gain.linearRampToValueAtTime(baseVol * 0.55, s + BAR * 16);
      env.gain.setValueAtTime(baseVol * 0.55, s + BAR * 22);
      env.gain.linearRampToValueAtTime(baseVol * 1.7, s + BAR * 26);
      env.gain.setValueAtTime(baseVol * 1.5, s + LOOP_DUR - 1.4);
      env.gain.linearRampToValueAtTime(0, s + LOOP_DUR);
      osc.connect(env); env.connect(dest); osc.start(s); osc.stop(s + LOOP_DUR);
    }
  }
}

// ─── Offline render ───────────────────────────────────────────────────────────

async function renderLoopBuffer(maxBars: number): Promise<AudioBuffer> {
  const dur = BAR * maxBars;
  const offline = new OfflineAudioContext(1, Math.ceil(SR * dur), SR);
  const clipper = makeSoftClipper(offline);
  clipper.connect(offline.destination);
  const master = offline.createGain(); master.gain.value = 0.92; master.connect(clipper);

  const dBus = offline.createGain(); dBus.gain.value = 0.52; dBus.connect(master);
  const bBus = offline.createGain(); bBus.gain.value = 0.40; bBus.connect(master);
  const mBus = offline.createGain(); mBus.gain.value = 0.58;
  const aBus = offline.createGain(); aBus.gain.value = 0.55; aBus.connect(master);
  const sBus = offline.createGain(); sBus.gain.value = 0.65; sBus.connect(master);
  const pBus = offline.createGain(); pBus.gain.value = 0.38; pBus.connect(master);

  // Melody echo delay
  const dl = offline.createDelay(0.5); dl.delayTime.value = EIGHTH;
  const fb = offline.createGain(); fb.gain.value = 0.14;
  const eo = offline.createGain(); eo.gain.value = 0.22;
  mBus.connect(eo); eo.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(master); mBus.connect(master);

  drums(offline, dBus, 0, maxBars);
  bass(offline, bBus, 0, maxBars);
  melody(offline, mBus, 0, maxBars);
  arp(offline, aBus, 0, maxBars);
  stabs(offline, sBus, 0, maxBars);
  if (maxBars >= LOOP_BARS) pad(offline, pBus, 0); // pad only makes sense for full loop

  return offline.startRendering();
}

let shortBufferPromise: Promise<AudioBuffer> | null = null;
let bufferPromise: Promise<AudioBuffer> | null = null;

function getShortLoopBuffer(): Promise<AudioBuffer> {
  if (shortBufferPromise) return shortBufferPromise;
  shortBufferPromise = renderLoopBuffer(SHORT_BARS);
  return shortBufferPromise;
}

function getLoopBuffer(): Promise<AudioBuffer> {
  if (bufferPromise) return bufferPromise;
  bufferPromise = renderLoopBuffer(LOOP_BARS);
  return bufferPromise;
}

// Kick off short render immediately on import; chain full render after it completes
if (typeof window !== 'undefined') {
  void getShortLoopBuffer().then(() => void getLoopBuffer());
}

export { getShortLoopBuffer, getLoopBuffer };

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMenuMusic() {
  const [muted, setMuted] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    let cancelled = false;

    const stopAll = () => {
      try { srcRef.current?.stop(); } catch { /* ok */ }
      srcRef.current = null;
      try { ctxRef.current?.close(); } catch { /* ok */ }
      ctxRef.current = null;
    };

    if (muted) { stopAll(); return; }

    const go = async () => {
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      void ctx.resume();

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.30, ctx.currentTime + 1.2);
      gain.connect(ctx.destination);

      const switchTo = async (buffer: AudioBuffer) => {
        if (cancelled || ctxRef.current !== ctx) return;
        // Ensure context is running — required in packaged Electron even with no-user-gesture-required
        if (ctx.state !== 'running') await ctx.resume();
        if (cancelled || ctxRef.current !== ctx) return;
        const newSrc = ctx.createBufferSource();
        newSrc.buffer = buffer;
        newSrc.loop = true;
        newSrc.connect(gain);
        newSrc.start();
        const old = srcRef.current;
        srcRef.current = newSrc;
        if (old) try { old.stop(ctx.currentTime + 0.3); } catch { /* ok */ }
      };

      // Phase 1: play A-section loop immediately (renders fast)
      const shortBuf = await getShortLoopBuffer();
      if (!cancelled) switchTo(shortBuf);

      // Phase 2: seamlessly switch to full 32-bar loop when ready
      const fullBuf = await getLoopBuffer();
      if (!cancelled) switchTo(fullBuf);
    };

    void go().catch(console.error);

    return () => {
      cancelled = true;
      stopAll();
    };
  }, [muted]);

  return { muted, toggleMute: () => setMuted(m => !m) };
}
