/**
 * Spark behavior coordinator — the singleton that decides which scene Spark
 * should be in at any given moment, layered:
 *
 *   TTS (highest) > REACTIVE (event triggered) > AMBIENT (idle cycling) > IDLE
 *
 * TTS is *not* managed here — tutor-face-mode owns its TTS-driven scene
 * selection and only consults the coordinator when no speech is active. The
 * coordinator handles the other three layers.
 *
 * The coordinator also tracks a rolling "mood" (recent successes vs failures)
 * which biases ambient choices, and runs the proactive layer (struggle / idle
 * nudges) by emitting `spark.nudge.*` events back through the bus.
 */

import { SPARK_SCENES } from '@/components/spark-robot';
import { emitSparkEvent, onSparkEvent, type SparkEventDetail, type SparkEventKind } from './spark-events';

type SceneId = number;

interface ReactionSpec {
  scene: SceneId;
  durationMs: number;
  /** Marked milestones get a longer hold and beat ambient cycles harder. */
  milestone?: boolean;
}

/**
 * Visual reactions are reserved for moments that actually matter — sim
 * outcomes, evaluation outcomes, milestones, session opens, returning from
 * idle. Low-level user actions (place, delete, rotate, code-run, sim.start)
 * are deliberately *silent here* — the coordinator still observes them to
 * track activity, mood, idle and struggle, but they don't override the
 * scene. That keeps Spark feeling like a tutor who's watching the work,
 * not a notification light flashing on every click.
 */
const REACTION_MAP: Partial<Record<SparkEventKind, ReactionSpec>> = {
  'sim.complete':            { scene: SPARK_SCENES.CELEBRATE,   durationMs: 2400, milestone: true },
  'sim.fail':                { scene: SPARK_SCENES.CONFUSED,    durationMs: 1800 },
  'tutor.evaluation.pass':   { scene: SPARK_SCENES.CHEERING,    durationMs: 2400, milestone: true },
  'tutor.evaluation.fail':   { scene: SPARK_SCENES.ENCOURAGING, durationMs: 1800 },
  'tutor.level-up':          { scene: SPARK_SCENES.AHA,         durationMs: 3000, milestone: true },
  'tutor.layer-up':          { scene: SPARK_SCENES.AHA,         durationMs: 3000, milestone: true },
  'tutor.concept-mastered':  { scene: SPARK_SCENES.CHEERING,    durationMs: 3000, milestone: true },
  'session.open':            { scene: SPARK_SCENES.WAVE,        durationMs: 1500 },
  'session.return':          { scene: SPARK_SCENES.WAVE,        durationMs: 1500 },
  'user.active':             { scene: SPARK_SCENES.WAVE,        durationMs: 1200 },
};

// Ambient pools, biased by mood. Heavy IDLE bias (often duplicated) so Spark
// stays still by default — scene changes should *mean* something. Per-mood
// pools intentionally only have one or two non-IDLE candidates so drift
// feels deliberate, not random.
const AMBIENT_POOLS = {
  curious: [SPARK_SCENES.IDLE, SPARK_SCENES.IDLE, SPARK_SCENES.LISTENING],
  happy:   [SPARK_SCENES.IDLE, SPARK_SCENES.IDLE, SPARK_SCENES.NODDING],
  patient: [SPARK_SCENES.IDLE, SPARK_SCENES.IDLE, SPARK_SCENES.THINKING],
  sleepy:  [SPARK_SCENES.IDLE],
  // User is actively manipulating things — Spark watches. Single candidate
  // so we don't bounce between LISTENING/GUIDE on every cycle.
  engaged: [SPARK_SCENES.IDLE, SPARK_SCENES.LISTENING],
} as const;

type Mood = keyof typeof AMBIENT_POOLS;

// Slower ambient drift — the previous 4–8s felt twitchy. 15–28s gives
// Spark room to *stay put* between meaningful events.
const AMBIENT_MIN_MS = 15_000;
const AMBIENT_MAX_MS = 28_000;
// Safety cap for the observe-in-flight state. If we never get a
// matching `spark.observe.end` (network blackhole), fall back to ambient
// rather than holding LISTENING forever.
const OBSERVE_INFLIGHT_MAX_MS = 8_000;

// Layer 3 — proactive thresholds. Only fire when a session is "active" (i.e.,
// the user has done something at least once since this coordinator started).
const IDLE_NUDGE_MS = 60_000;     // 60s with zero events → nudge
const STRUGGLE_FAIL_THRESHOLD = 3; // 3 failures in a row → nudge
const NUDGE_COOLDOWN_MS = 90_000; // don't pester more than once per 90s
const MOOD_WINDOW_MS = 90_000;    // events within last 90s influence mood

interface BehaviorState {
  scene: SceneId;
  source: 'reactive' | 'observing' | 'ambient' | 'idle';
  mood: Mood;
  isMilestone: boolean;
}

type Subscriber = (state: BehaviorState) => void;

class SparkBehaviorCoordinator {
  private subs = new Set<Subscriber>();
  private state: BehaviorState = {
    scene: SPARK_SCENES.IDLE,
    source: 'idle',
    mood: 'curious',
    isMilestone: false,
  };

  private reactiveTimer: ReturnType<typeof setTimeout> | null = null;
  private ambientTimer: ReturnType<typeof setTimeout> | null = null;
  private nudgeTimer: ReturnType<typeof setTimeout> | null = null;
  private observingTimer: ReturnType<typeof setTimeout> | null = null;

  private lastEventTs = 0;
  private lastNudgeTs = 0;
  private hasUserActed = false;
  private failStreak = 0;
  private successStreak = 0;
  // Rolling success/fail history, timestamps only.
  private recentSuccesses: number[] = [];
  private recentFails: number[] = [];
  // Rolling low-level build activity (place/delete/rotate/code-run/sim.start).
  // Used only for mood inference — none of these events trigger a visual
  // reaction on their own.
  private recentBuilds: number[] = [];
  // Event log — ring buffer of the last EVENT_LOG_MAX events. Powers the
  // tutor's situational-awareness context preamble. Read-only externally.
  private eventLog: SparkEventDetail[] = [];
  private static EVENT_LOG_MAX = 30;
  // Wallclock when this coordinator (and effectively this session) booted —
  // used to derive "session duration" for the tutor context.
  private startedAt = Date.now();

  private unsub: (() => void) | null = null;
  private started = false;

  start() {
    if (this.started) return;
    this.started = true;
    this.unsub = onSparkEvent((detail) => this.handle(detail));
    this.scheduleAmbient();
    this.scheduleNudgeCheck();
  }

  stop() {
    this.started = false;
    this.unsub?.();
    this.unsub = null;
    if (this.reactiveTimer) clearTimeout(this.reactiveTimer);
    if (this.ambientTimer) clearTimeout(this.ambientTimer);
    if (this.nudgeTimer) clearTimeout(this.nudgeTimer);
    if (this.observingTimer) clearTimeout(this.observingTimer);
    this.reactiveTimer = this.ambientTimer = this.nudgeTimer = this.observingTimer = null;
  }

  subscribe(fn: Subscriber): () => void {
    this.subs.add(fn);
    fn(this.state); // emit current immediately
    return () => { this.subs.delete(fn); };
  }

  getState(): BehaviorState {
    return this.state;
  }

  /**
   * Read-only snapshot of the rolling event log. Most-recent last.
   * Used by the spark-context builder when assembling the tutor's
   * situational-awareness preamble.
   */
  getRecentEvents(limit?: number): SparkEventDetail[] {
    if (limit === undefined || limit >= this.eventLog.length) return [...this.eventLog];
    return this.eventLog.slice(-limit);
  }

  /** Wallclock when the current session began (last session.open). */
  getSessionStart(): number {
    return this.startedAt;
  }

  /** Current rolling fail / success counters — used for context summaries. */
  getStreaks(): { failStreak: number; successStreak: number } {
    return { failStreak: this.failStreak, successStreak: this.successStreak };
  }

  private emit() {
    for (const sub of this.subs) sub(this.state);
  }

  private setState(patch: Partial<BehaviorState>) {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private handle(detail: SparkEventDetail) {
    const { kind, ts } = detail;
    this.lastEventTs = ts;

    // Don't recurse on our own nudge events.
    if (kind === 'spark.nudge.idle' || kind === 'spark.nudge.struggle') return;

    // Observation lifecycle — when the renderer kicks off /api/tutor/observe
    // we show a "looking at your work" pose so the visual change has a
    // reason. When the call returns silently, drop back to ambient. When it
    // returns spoken/with a tool, the reactive override (further down) will
    // take precedence anyway.
    if (kind === 'spark.observe.start') {
      this.enterObserving();
      return;
    }
    if (kind === 'spark.observe.end') {
      this.exitObserving();
      return;
    }

    // Append to the rolling event log — used by the tutor context builder
    // to give the AI situational awareness. Skip pure signals (idle/active)
    // and tick artefacts so the log stays meaningful.
    if (kind !== 'user.idle' && kind !== 'user.active') {
      this.eventLog.push(detail);
      if (this.eventLog.length > SparkBehaviorCoordinator.EVENT_LOG_MAX) {
        this.eventLog.shift();
      }
    }

    // session.open marks a fresh session — reset the duration anchor and
    // clear the history so a returning user doesn't drag old context with
    // them into a new sandbox.
    if (kind === 'session.open' || kind === 'session.return') {
      this.startedAt = ts;
      this.eventLog = [];
      this.recentSuccesses = [];
      this.recentFails = [];
      this.recentBuilds = [];
      this.failStreak = 0;
      this.successStreak = 0;
    }

    // Mark "user has done something" so we know a session is in progress.
    // user.idle / user.active aren't real actions, just signals.
    if (kind !== 'user.idle' && kind !== 'user.active') {
      this.hasUserActed = true;
    }

    // Update mood signals.
    if (kind === 'tutor.evaluation.pass' || kind === 'sim.complete' ||
        kind === 'tutor.level-up' || kind === 'tutor.layer-up' ||
        kind === 'tutor.concept-mastered') {
      this.successStreak += 1;
      this.failStreak = 0;
      this.recentSuccesses.push(ts);
    }
    if (kind === 'tutor.evaluation.fail' || kind === 'sim.fail') {
      this.failStreak += 1;
      this.successStreak = 0;
      this.recentFails.push(ts);
    }
    if (kind === 'user.place' || kind === 'user.delete' || kind === 'user.rotate' ||
        kind === 'user.code-run' || kind === 'sim.start') {
      this.recentBuilds.push(ts);
    }
    this.pruneMoodHistory(ts);
    this.recomputeMood();

    // user.idle is a signal, not a reaction. Drop into a quieter ambient mood.
    if (kind === 'user.idle') {
      // mood remains; ambient cycle naturally picks calmer scenes.
      return;
    }

    const reaction = REACTION_MAP[kind];
    if (!reaction) return;

    this.triggerReaction(reaction);

    // Layer 3 — struggle nudge (instant trigger)
    if (this.failStreak >= STRUGGLE_FAIL_THRESHOLD) {
      this.fireNudge('struggle');
    }
  }

  private pruneMoodHistory(now: number) {
    const cutoff = now - MOOD_WINDOW_MS;
    const buildCutoff = now - 30_000; // shorter window — build activity is "now-ish"
    this.recentSuccesses = this.recentSuccesses.filter((t) => t > cutoff);
    this.recentFails = this.recentFails.filter((t) => t > cutoff);
    this.recentBuilds = this.recentBuilds.filter((t) => t > buildCutoff);
  }

  private recomputeMood() {
    const s = this.recentSuccesses.length;
    const f = this.recentFails.length;
    const b = this.recentBuilds.length;
    let mood: Mood = 'curious';
    // Outcome moods take priority — recent fails / wins paint the temperament.
    if (f >= 2 && f > s) mood = 'patient';
    else if (s >= 2 && s > f) mood = 'happy';
    // Otherwise, if the user is actively building, Spark watches attentively.
    else if (b >= 4) mood = 'engaged';
    else if (s + f + b === 0 && Date.now() - this.lastEventTs > 30_000) mood = 'sleepy';
    if (mood !== this.state.mood) {
      this.setState({ mood });
    }
  }

  private enterObserving() {
    // Don't override an active reaction (celebrate, etc.) — those are louder
    // signals than "I'm thinking about your work".
    if (this.state.source === 'reactive') return;
    if (this.observingTimer) clearTimeout(this.observingTimer);
    this.setState({
      scene: SPARK_SCENES.LISTENING,
      source: 'observing',
      isMilestone: false,
    });
    // Safety: never hold "observing" forever if the matching end event
    // doesn't arrive. Ambient takes back over after the cap.
    this.observingTimer = setTimeout(() => {
      this.observingTimer = null;
      if (this.state.source === 'observing') this.pickAmbient();
    }, OBSERVE_INFLIGHT_MAX_MS);
  }

  private exitObserving() {
    if (this.observingTimer) clearTimeout(this.observingTimer);
    this.observingTimer = null;
    // Only drop back to ambient if we're still in observing mode. If a
    // reaction fired in the meantime (the tutor spoke or used a tool),
    // it owns the scene now.
    if (this.state.source === 'observing') this.pickAmbient();
  }

  private triggerReaction(reaction: ReactionSpec) {
    if (this.reactiveTimer) clearTimeout(this.reactiveTimer);
    this.setState({
      scene: reaction.scene,
      source: 'reactive',
      isMilestone: !!reaction.milestone,
    });
    this.reactiveTimer = setTimeout(() => {
      this.reactiveTimer = null;
      // After reaction expires, drop back to ambient.
      this.pickAmbient();
    }, reaction.durationMs);
  }

  private scheduleAmbient() {
    const dwell = AMBIENT_MIN_MS + Math.random() * (AMBIENT_MAX_MS - AMBIENT_MIN_MS);
    if (this.ambientTimer) clearTimeout(this.ambientTimer);
    this.ambientTimer = setTimeout(() => {
      this.ambientTimer = null;
      // Don't override an active reaction OR an in-flight observation —
      // both have a stronger narrative reason to be on screen.
      if (this.state.source !== 'reactive' && this.state.source !== 'observing') {
        this.pickAmbient();
      }
      this.scheduleAmbient();
    }, dwell);
  }

  private pickAmbient() {
    const pool = AMBIENT_POOLS[this.state.mood];
    // Pick something different from current to avoid sticking on one frame.
    const candidates = pool.filter((s) => s !== this.state.scene);
    const next = candidates.length
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : pool[0];
    this.setState({ scene: next, source: 'ambient', isMilestone: false });
  }

  private scheduleNudgeCheck() {
    if (this.nudgeTimer) clearTimeout(this.nudgeTimer);
    this.nudgeTimer = setTimeout(() => {
      this.nudgeTimer = null;
      this.checkIdleNudge();
      if (this.started) this.scheduleNudgeCheck();
    }, 5_000);
  }

  private checkIdleNudge() {
    if (!this.hasUserActed) return;
    const now = Date.now();
    const idleFor = now - this.lastEventTs;
    if (idleFor >= IDLE_NUDGE_MS) {
      this.fireNudge('idle');
    }
  }

  private fireNudge(reason: 'idle' | 'struggle') {
    const now = Date.now();
    if (now - this.lastNudgeTs < NUDGE_COOLDOWN_MS) return;
    this.lastNudgeTs = now;
    if (reason === 'struggle') this.failStreak = 0; // reset so it doesn't re-fire instantly
    emitSparkEvent(reason === 'idle' ? 'spark.nudge.idle' : 'spark.nudge.struggle');
  }
}

// Singleton — the renderer process has one Spark behavior at a time.
export const sparkBehavior = new SparkBehaviorCoordinator();

if (typeof window !== 'undefined') {
  // Auto-start on first import in the browser. Stop is rarely needed.
  sparkBehavior.start();
}

export type { BehaviorState };
