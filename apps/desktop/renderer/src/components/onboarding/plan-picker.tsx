'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Users, GraduationCap, ChevronLeft, ChevronRight, Loader2, Cpu, Zap, Trophy } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { MotrixLogo } from '@/components/motrix-logo';
import { SparkSceneBackground, SparkRobot, type SparkPose } from '@/components/spark-robot';
import { SparkStage3D } from '@/components/spark-robot/spark-scene-3d';
import { setClassSession } from '@/lib/session-store';
import { playSfx } from '@/lib/game-audio';
import { getProgressSummary, getStudentProgress } from '@/lib/progress-store';
import type { AuthResult, AuthRole } from '@/components/auth-screen';

type Plan = 'pick' | 'join-class' | 'robots';

type SavedSession = { role: AuthRole; name: string; email?: string };

type PlanPickerProps = {
  apiBase: string;
  savedSession?: SavedSession;
  /** Per-unit serial reported by the firmware (e.g. SKETCH-A1B2-C3D4).
   *  Null when no real chassis is on the LAN — drives the small robot
   *  status chip and the contents of the 'robots' sub-screen. */
  robotSerial?: string | null;
  /** Convenience boolean from app state — the simulator's mock bot
   *  counts as connected too, but only `robotSerial` reflects real
   *  hardware. */
  robotConnected?: boolean;
  onPicked: (result: AuthResult, sessionCode?: string) => void;
  /** Sandbox entry — bypasses auth flow entirely. Available to anyone
   *  (signed in or not); the parent decides whether to upgrade a guest
   *  to a "Player" handle and whether to clear any lesson/concept state. */
  onJustPlay: () => void;
  onTeacherAuth: () => void;
  onPersonalTutor: () => void;
  onClearSavedSession?: () => void;
};

const SCENE_POSES: SparkPose[] = ['wave', 'point', 'celebrate', 'thumbsup', 'think'];
// Accent colors from concept-environments: sumo→red, maze→green, cones→orange, waypoints→cyan, drawing→violet
const SCENE_GLOWS = ['#ff2000', '#00cc44', '#ff6600', '#00d4ff', '#9060ff'];
// Dark / light 3D scene background colors — right panel CSS var matches so the seam blends
const SCENE_BG_DARK  = ['#0e0000', '#000a00', '#100500', '#040d12', '#0a0a14'];
const SCENE_BG_LIGHT = ['#f5eded', '#e8f5ec', '#f6ede4', '#e6eef8', '#ede8f8'];

const TUTOR_LINES = [
  "Hey hey hey! I'm Spark — your AI robotics co-pilot. Servos, swagger, and zero chill when it comes to cool builds. 🤖",
  "See those little bots back there? That'll be YOU after session one. Maze runs, waypoint races, sumo — on real hardware.",
  "BADGE UNLOCKED! My chest LED cannot stop spinning. Sumo champ? Maze speedrunner? XP fiend? You could be all three. 🏆",
  "I watch HOW you learn. Too fast? I push harder. Stuck? I flip the approach. Beginner? Wheels first. Firmware wizard? C++. ⚡",
  "Those bots in the back? Last week's class — sumo finals. One knocked the other clean off the ring. I may have screamed. Anyway — hi!",
  "I've guided hundreds of students. Every single one said I was their favourite tutor. I did count myself… but still. Let's go.",
  "Earn XP, unlock achievements, climb the leaderboard. Yes — I do a full victory dance every time you level up. It's very professional.",
  "Four robots to start, more coming. Waypoint racing, sumo, drawing, maze solving. I'll adapt the curriculum to your exact brain.",
];

export function PlanPicker({ apiBase, savedSession, robotSerial = null, robotConnected = false, onPicked, onJustPlay, onTeacherAuth, onPersonalTutor, onClearSavedSession }: PlanPickerProps) {
  const [plan, setPlan] = useState<Plan>('pick');
  const [joinCode, setJoinCode] = useState('');
  const [studentName, setStudentName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speechIndex, setSpeechIndex] = useState(0);
  const [isDark, setIsDark] = useState(true);
  const codeRef = useRef<HTMLInputElement>(null);

  // Gate all localStorage-derived UI behind a mount flag so SSR/first-client-render
  // match.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const effectiveSession = mounted ? savedSession : undefined;

  const studentProgress = useMemo(() => {
    if (!effectiveSession || effectiveSession.role !== 'student') return null;
    return getProgressSummary(effectiveSession.name);
  }, [effectiveSession]);

  const savedAvatar = useMemo(() => {
    if (!effectiveSession) return null;
    const sp = getStudentProgress(effectiveSession.name, 'builder');
    return {
      kind: sp.profile_avatar_kind ?? 'emoji',
      emoji: sp.avatar ?? '🤖',
      robotPreset: sp.robot_preset ?? 'orbit',
      color: sp.favorite_color ?? 'var(--cyan)',
    } as const;
  }, [effectiveSession]);

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.dataset.theme !== 'light');
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setSpeechIndex((i) => i + 1), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (plan === 'join-class' || plan === 'robots')) { setPlan('pick'); setError(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [plan]);

  const handleJustPlay = () => {
    playSfx('whoosh');
    // Sandbox is for everyone — signed in or not. Hand off to the parent's
    // dedicated sandbox-entry handler so it can decide on session preservation
    // and force the sandbox mode without going through the auth/onboarding
    // branches that handleAuthenticated triggers.
    onJustPlay();
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const code = joinCode.trim().toUpperCase();
    const name = studentName.trim();
    if (!code || !name) return;
    playSfx('click');
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/sessions/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ join_code: code, student_name: name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { detail?: string };
        setError(body.detail ?? 'Invalid or expired code — ask your teacher for a new one.');
        playSfx('error');
        return;
      }
      const data = await res.json() as {
        participant_id: string; session_id: string;
        join_code: string; classroom_name: string; student_name: string;
      };
      setClassSession({
        sessionCode: data.join_code, sessionId: data.session_id,
        participantId: data.participant_id, classroomName: data.classroom_name,
        studentName: data.student_name, joinedAt: new Date().toISOString(),
      });
      playSfx('success');
      onPicked({ role: 'student', name: data.student_name, authSource: 'classroom_device' }, data.join_code);
    } catch {
      setError('Could not reach the app — make sure the desktop runtime is running.');
      playSfx('error');
    } finally {
      setBusy(false);
    }
  };

  const scene = speechIndex % 5;
  const speech = TUTOR_LINES[speechIndex % TUTOR_LINES.length];

  return (
    <div className="plan-shell">
      <div className="auth-bg-orb auth-bg-orb-a" aria-hidden />
      <div className="auth-bg-orb auth-bg-orb-b" aria-hidden />
      <div className="auth-bg-orb auth-bg-orb-c" aria-hidden />

      {/* Robot status chip — visible in 'pick' state so the user sees
          their bot's connection state before drilling into anything.
          Anchored top-right, kept clear of the global toolbar by sitting
          slightly lower-left. Tapping fires the same in-app pair modal
          the home screen uses. */}
      {plan === 'pick' && (
        <button
          type="button"
          className={`plan-robot-chip${robotSerial ? ' is-live' : robotConnected ? ' is-sim' : ''}`}
          onClick={() => window.dispatchEvent(new CustomEvent('sketchbot:open-pair-robot'))}
          title={robotSerial
            ? `Real robot on the LAN — click to manage or pair another`
            : robotConnected
              ? `Simulator active — click to pair a real robot`
              : `No robot detected — click to pair one`}
        >
          <Cpu size={12} />
          <span
            className="plan-robot-chip-dot"
            aria-hidden
            style={{
              background: robotSerial ? 'var(--green)' : robotConnected ? 'var(--amber)' : 'var(--muted)',
              boxShadow: robotSerial ? '0 0 6px var(--green)' : undefined,
            }}
          />
          <span className="plan-robot-chip-label">
            {robotSerial ?? (robotConnected ? 'Simulator' : 'No robot')}
          </span>
        </button>
      )}

      <AnimatePresence mode="wait">
        {plan === 'pick' ? (
          <motion.div
            key="pick"
            className="plan-split"
            style={{ '--plan-scene-glow': SCENE_GLOWS[scene], '--plan-scene-bg': (isDark ? SCENE_BG_DARK : SCENE_BG_LIGHT)[scene] } as React.CSSProperties}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* ─── Left: immersive hero ─── */}
            <motion.div
              className="plan-hero"
              initial={{ x: -30, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <SparkSceneBackground scene={scene} />

              {/* Logo — large, anchored top-left */}
              <motion.div
                className="plan-hero-logo"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
              >
                <MotrixLogo size={52} showWordmark />
              </motion.div>

              {/* 3D canvas fills all remaining height above text section */}
              <div className="plan-spark-hero">
                <SparkStage3D scene={scene} />
              </div>

              {/* Solid text section — below canvas, no animation conflict */}
              <div className="plan-hero-text-area">
                <div className="plan-hero-text">
                  <motion.h1
                    className="plan-hero-title"
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2, duration: 0.4 }}
                  >
                    Learn robotics{' '}
                    <span className="plan-hero-title-accent">by doing</span>
                  </motion.h1>
                  <motion.p
                    className="plan-hero-sub"
                    initial={{ y: 6, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.28, duration: 0.4 }}
                  >
                    Real robots. Real code. Real challenges.
                  </motion.p>
                </div>
                <div className="plan-hero-chips">
                  {[
                    { Icon: Cpu,    label: 'Real hardware' },
                    { Icon: Trophy, label: 'Compete & win' },
                    { Icon: Zap,    label: 'AI Tutor' },
                  ].map(({ Icon, label }, i) => (
                    <motion.div
                      key={label}
                      className="plan-hero-chip"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.35 + i * 0.07 }}
                    >
                      <Icon size={12} />
                      {label}
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* ─── Right: plan selection ─── */}
            <motion.div
              className="plan-right"
              initial={{ x: 30, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
            >
              {/* Profile button moved to global top-right cluster (handled by
                  page.tsx's .app-global-br-controls) so it lives in the same
                  spot on every screen. Sign-in routing happens through the
                  plan cards (Personal Tutor / Teacher) below. */}

              {/* Vertically centred content */}
              <div className="plan-right-body">

                {/* ── Spark intro (centred vertical stack) ── */}
                <div className="plan-spark-intro">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={scene}
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                      transition={{ duration: 0.35 }}
                    >
                      <motion.div
                        animate={{ y: [0, -7, 0] }}
                        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                      >
                        <SparkRobot mode="2d" pose={SCENE_POSES[scene]} size="md" />
                      </motion.div>
                    </motion.div>
                  </AnimatePresence>

                  <div className="plan-spark-id">
                    <span className="plan-spark-name">Spark</span>
                    <span className="plan-spark-badge">AI Tutor</span>
                  </div>

                  <AnimatePresence mode="wait">
                    <motion.p
                      key={speechIndex}
                      className="plan-spark-speech"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4 }}
                    >
                      {speech}
                    </motion.p>
                  </AnimatePresence>
                </div>

                {/* ── Returning-user welcome greeting ── */}
                {effectiveSession && (
                  <motion.div
                    className="plan-welcome-back"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.28 }}
                  >
                    <span className="plan-welcome-text">Welcome back, {effectiveSession.name}!</span>
                    <button
                      type="button"
                      className="plan-welcome-switch"
                      onClick={() => { playSfx('click'); onClearSavedSession?.(); }}
                    >
                      Switch user
                    </button>
                  </motion.div>
                )}

                <div className="plan-divider" />

                {/* ── Plan cards ── */}
                <div className="plan-selection">
                  <p className="plan-right-label">How do you want to play?</p>

                  <div className="plan-cards">
                    {[
                      {
                        cls: 'plan-card--solo',  icon: <Sparkles size={20} />,     title: 'Just Play',
                        desc: 'Sandbox mode — free draw, no account needed.',
                        progressHint: undefined as string | undefined,
                        onCLick: handleJustPlay, tourId: 'plan-card-solo',
                      },
                      {
                        cls: 'plan-card--tutor', icon: <GraduationCap size={20} />, title: 'Personal Tutor',
                        desc: 'AI lessons with Spark, XP, badges, progress sync.',
                        progressHint: studentProgress
                          ? `${studentProgress.levelEmoji} Lv.${studentProgress.level} ${studentProgress.levelName} · ${studentProgress.xp} XP`
                          : undefined,
                        onCLick: () => { playSfx('click'); onPersonalTutor(); }, tourId: 'plan-card-tutor',
                      },
                      {
                        cls: 'plan-card--class', icon: <Users size={20} />,         title: 'Join a Class',
                        desc: "Enter your teacher's room code.",
                        progressHint: undefined as string | undefined,
                        onCLick: () => { playSfx('click'); setPlan('join-class'); setTimeout(() => codeRef.current?.focus(), 80); },
                        tourId: 'plan-card-class',
                      },
                      {
                        cls: 'plan-card--robots', icon: <Cpu size={20} />, title: 'Robots & Calibration',
                        desc: robotSerial
                          ? `Pair, calibrate, surface profiles · ${robotSerial}`
                          : 'Pair a robot, calibrate, set surface profiles.',
                        progressHint: undefined as string | undefined,
                        onCLick: () => { playSfx('click'); setPlan('robots'); },
                        tourId: 'plan-card-robots',
                      },
                    ].map(({ cls, icon, title, desc, progressHint, onCLick, tourId }, i) => (
                      <motion.button
                        key={title}
                        type="button"
                        className={`plan-card ${cls}`}
                        data-tour={tourId}
                        onClick={onCLick}
                        initial={{ x: 16, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.18 + i * 0.07, duration: 0.35 }}
                        whileHover={{ x: 4, scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <div className="plan-card-icon" aria-hidden>{icon}</div>
                        <div className="plan-card-body">
                          <div className="plan-card-title">{title}</div>
                          <div className="plan-card-desc">{desc}</div>
                          {progressHint && <div className="plan-card-progress">{progressHint}</div>}
                        </div>
                        <div className="plan-card-arrow" aria-hidden>→</div>
                      </motion.button>
                    ))}
                  </div>

                  <motion.button
                    type="button"
                    className="plan-teacher-link"
                    data-tour="plan-teacher-link"
                    onClick={() => { playSfx('click'); onTeacherAuth(); }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.45 }}
                    whileHover={{ x: 3 }}
                  >
                    I&apos;m a Teacher →
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : plan === 'robots' ? (
          <motion.div
            key="robots"
            className="plan-join-panel plan-robots-panel"
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.button
              type="button" className="entry-back"
              onClick={() => { setPlan('pick'); setError(null); }}
              whileHover={{ x: -3 }} whileTap={{ scale: 0.95 }}
            >
              <ChevronLeft size={16} /> Back
            </motion.button>

            <div className="plan-join-head">
              <div className="plan-join-icon"><Cpu size={28} /></div>
              <h2 className="plan-join-title">Robots & Calibration</h2>
              <p className="plan-join-desc">
                {robotSerial
                  ? <>Connected to <code style={{ fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.04em' }}>{robotSerial}</code>. Pick an action below.</>
                  : <>No real robot detected yet. Pair one first; calibration unlocks after that.</>}
              </p>
            </div>

            <div className="plan-robots-actions">
              <ActionButton
                label="Pair a robot"
                desc="Find a bot on your Wi-Fi and bind it to your account."
                onClick={() => { playSfx('click'); window.dispatchEvent(new CustomEvent('sketchbot:open-pair-robot')); }}
              />
              <ActionButton
                label="Calibrate"
                desc="4-step camera-measured calibration. Run on a fresh surface."
                disabled={!robotSerial}
                disabledHint="Pair a robot first."
                onClick={() => { playSfx('click'); window.dispatchEvent(new CustomEvent('sketchbot:open-calibration')); }}
              />
              <ActionButton
                label="Drift check"
                desc="~30 s verification — drive 100 mm, rotate 90°. Re-calibrate if it fails."
                disabled={!robotSerial}
                disabledHint="Pair a robot first."
                onClick={() => { playSfx('click'); window.dispatchEvent(new CustomEvent('sketchbot:open-drift-check')); }}
              />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="join"
            className="plan-join-panel"
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.button
              type="button" className="entry-back"
              onClick={() => { setPlan('pick'); setError(null); }}
              whileHover={{ x: -3 }} whileTap={{ scale: 0.95 }}
            >
              <ChevronLeft size={16} /> Back
            </motion.button>

            <div className="plan-join-head">
              <div className="plan-join-icon"><Users size={28} /></div>
              <h2 className="plan-join-title">Join a Class</h2>
              <p className="plan-join-desc">Enter the code your teacher put on the board, then your name.</p>
            </div>

            <form className="entry-form" onSubmit={handleJoinSubmit} style={{ width: '100%', maxWidth: 360 }}>
              <label className="entry-label" htmlFor="join-code">Class Code</label>
              <input id="join-code" ref={codeRef} className="entry-input plan-code-input"
                type="text" placeholder="ABC123" maxLength={10} autoComplete="off" spellCheck={false}
                value={joinCode} onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setError(null); }} />

              <label className="entry-label" htmlFor="student-name">Your Name</label>
              <input id="student-name" className="entry-input" type="text" placeholder="e.g. Alex"
                maxLength={60} autoComplete="given-name" value={studentName}
                onChange={(e) => setStudentName(e.target.value)} />

              <AnimatePresence>
                {error && (
                  <motion.p className="entry-error" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              <Button type="submit" variant="primary" size="lg" className="entry-submit"
                disabled={busy || !joinCode.trim() || !studentName.trim()}>
                {busy ? <><Loader2 size={16} className="plan-spinner" /> Joining…</> : 'Join Class'}
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Compact action row used inside the 'robots' sub-screen. Same chrome
 *  across pair / calibrate / drift so the trio reads as one menu. */
function ActionButton(props: {
  label: string;
  desc: string;
  onClick: () => void;
  disabled?: boolean;
  disabledHint?: string;
}) {
  const { label, desc, onClick, disabled, disabledHint } = props;
  return (
    <button
      type="button"
      className={`plan-robots-action${disabled ? ' is-disabled' : ''}`}
      onClick={() => { if (!disabled) onClick(); }}
      disabled={disabled}
      title={disabled ? disabledHint : undefined}
    >
      <div className="plan-robots-action-label">{label}</div>
      <div className="plan-robots-action-desc">{disabled && disabledHint ? disabledHint : desc}</div>
      <ChevronRight size={16} className="plan-robots-action-arrow" />
    </button>
  );
}
