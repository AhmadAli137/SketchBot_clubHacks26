/**
 * Spark event bus — typed pub/sub built on window CustomEvents to match the
 * existing `sketchbot:*` pattern (see save-status.tsx, session-storage.ts).
 *
 * Anything the user does that Spark might react to flows through here. The
 * spark-behavior coordinator subscribes; nobody else needs to.
 */

export type SparkEventKind =
  // user actions in sandbox / canvas
  | 'user.place'
  | 'user.delete'
  | 'user.rotate'
  | 'user.code-run'
  // explicit "look at me" — kid rang the bell to summon Spark right now
  | 'user.bell'
  // sim / robot lifecycle
  | 'sim.start'
  | 'sim.complete'
  | 'sim.fail'
  // tutor outcomes
  | 'tutor.evaluation.pass'
  | 'tutor.evaluation.fail'
  | 'tutor.xp'
  | 'tutor.level-up'
  | 'tutor.layer-up'
  | 'tutor.concept-mastered'
  // session lifecycle
  | 'session.open'
  | 'session.return' // user came back after being away
  // ambient activity (driven by use-spark-idle)
  | 'user.idle'
  | 'user.active'
  // proactive nudges (emitted BY coordinator, listened to by tutor-panel)
  | 'spark.nudge.idle'
  | 'spark.nudge.struggle'
  // observation lifecycle (emitted BY useSparkTick, listened to by coordinator)
  // so the visual layer can show a "looking at your work" pose during the
  // network call instead of cycling arbitrary ambient scenes.
  | 'spark.observe.start'
  | 'spark.observe.end'
  // programming-tab activity (emitted BY tool dispatcher, listened to by
  // the visual program-state UI for highlights and run/done indicators).
  | 'tutor.program.appended'
  | 'tutor.program.cleared'
  | 'tutor.program.run'
  | 'tutor.program.event';

export interface SparkEventDetail {
  kind: SparkEventKind;
  // Optional payload for richer reactions (e.g. xp delta, fail count)
  payload?: Record<string, unknown>;
  ts: number;
}

const CHANNEL = 'sketchbot:spark-event';

export function emitSparkEvent(kind: SparkEventKind, payload?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  const detail: SparkEventDetail = { kind, payload, ts: Date.now() };
  window.dispatchEvent(new CustomEvent<SparkEventDetail>(CHANNEL, { detail }));
}

export function onSparkEvent(handler: (detail: SparkEventDetail) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (event: Event) => {
    const ce = event as CustomEvent<SparkEventDetail>;
    if (ce.detail) handler(ce.detail);
  };
  window.addEventListener(CHANNEL, listener);
  return () => window.removeEventListener(CHANNEL, listener);
}
