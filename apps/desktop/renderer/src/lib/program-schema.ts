/**
 * Program schema — the structured vocabulary the tutor is allowed to emit
 * when interpreting the kid's voice/text rules into an executable program.
 *
 * Design constraint: every block must be unambiguously executable against
 * a real bot pose. The tutor's LLM tool-call layer validates against this
 * schema before appending to the program state, so the visual sequence
 * the kid sees is always something the bot can run.
 *
 * Speed is normalised 0–100 (kid-friendly). The executor scales to the
 * bot's MAX_FORWARD_SPEED. Negative speeds run the motor in reverse so
 * "left motor at -50" reverses that side without separate primitives.
 *
 * Distances are length+unit so the tutor can preserve the kid's words
 * ("forward 12 inches" stays inches in the visual; conversion happens at
 * execution time).
 */
export type Side = 'left' | 'right' | 'both';

export type LengthUnit = 'cm' | 'in' | 'm';
export type Length = { value: number; unit: LengthUnit };

/** Conditions that gate `motor.until` and `if` blocks. The set is small on
 *  purpose — every entry needs a sensor model in the simulator. */
export type Condition =
  | { kind: 'distance.lt'; sensor: 'ultrasonic'; threshold: Length }
  | { kind: 'distance.gt'; sensor: 'ultrasonic'; threshold: Length }
  | { kind: 'travelled'; distance: Length }
  | { kind: 'elapsed'; seconds: number };

export type ProgramBlock =
  /** Set one or both motor speeds for a fixed duration. Speed is −100..100;
   *  negative reverses. After `seconds` elapse, motors are NOT auto-stopped
   *  — the next block decides what's next, so a chain of motor.set blocks
   *  flows without dropouts between segments. */
  | { id: string; kind: 'motor.set'; side: Side; speed: number; seconds: number }
  /** Run motors at a constant speed until a condition fires. Used for
   *  "forward until ultrasonic < 20cm" rules from the kid. */
  | { id: string; kind: 'motor.until'; side: Side; speed: number; condition: Condition }
  /** Pivot in place by a heading delta. Positive degrees turn left
   *  (CCW around +Y, matching the bot pose convention). */
  | { id: string; kind: 'turn'; degrees: number; speed: number }
  /** Drive forward (or back, with negative distance) until the bot has
   *  travelled the given distance. Tutor produces this for "move forward
   *  X inches" — kid's most natural way to say it. */
  | { id: string; kind: 'drive'; distance: Length; speed: number }
  /** Hold position with motors at zero for `seconds`. */
  | { id: string; kind: 'wait'; seconds: number }
  /** Branch on a condition. else is optional. */
  | { id: string; kind: 'if'; condition: Condition; then: ProgramBlock[]; else?: ProgramBlock[] }
  /** Repeat the body `times` times, OR until a condition fires (one or
   *  the other — never both, the tutor picks based on the kid's phrasing). */
  | { id: string; kind: 'loop'; body: ProgramBlock[]; times?: number; until?: Condition }
  /** Halt the program. Reset motors to zero. */
  | { id: string; kind: 'stop' };

export type Program = {
  /** Stable id for the program — the tutor edits in place rather than
   *  re-emitting the whole tree, so each block has its own id too. */
  id: string;
  blocks: ProgramBlock[];
};

/** Normalise a length to metres for the executor. */
export function lengthToMeters(l: Length): number {
  switch (l.unit) {
    case 'm':  return l.value;
    case 'cm': return l.value / 100;
    case 'in': return l.value * 0.0254;
  }
}

/** Map kid-friendly 0..100 onto the bot's m/s top speed. Sign preserved. */
export function speedToMetersPerSec(speed0to100: number, maxSpeed: number): number {
  const clamped = Math.max(-100, Math.min(100, speed0to100));
  return (clamped / 100) * maxSpeed;
}

// ── Validation ───────────────────────────────────────────────────────
// Cheap structural check used by the tutor tool-call layer + program
// loaders. Throws on the first malformed node so the LLM gets a tight
// error to retry against.

const VALID_KINDS = new Set([
  'motor.set', 'motor.until', 'turn', 'drive', 'wait', 'if', 'loop', 'stop',
]);

const VALID_CONDITION_KINDS = new Set([
  'distance.lt', 'distance.gt', 'travelled', 'elapsed',
]);

function assertLength(l: unknown, ctx: string): asserts l is Length {
  if (!l || typeof l !== 'object') throw new Error(`${ctx}: expected Length object`);
  const obj = l as Record<string, unknown>;
  if (typeof obj.value !== 'number' || !Number.isFinite(obj.value)) {
    throw new Error(`${ctx}: Length.value must be finite number`);
  }
  if (obj.unit !== 'cm' && obj.unit !== 'in' && obj.unit !== 'm') {
    throw new Error(`${ctx}: Length.unit must be cm | in | m`);
  }
}

function assertCondition(c: unknown, ctx: string): asserts c is Condition {
  if (!c || typeof c !== 'object') throw new Error(`${ctx}: expected Condition object`);
  const obj = c as Record<string, unknown>;
  if (typeof obj.kind !== 'string' || !VALID_CONDITION_KINDS.has(obj.kind)) {
    throw new Error(`${ctx}: invalid condition kind ${obj.kind}`);
  }
  switch (obj.kind) {
    case 'distance.lt':
    case 'distance.gt':
      if (obj.sensor !== 'ultrasonic') throw new Error(`${ctx}: only ultrasonic sensor supported`);
      assertLength(obj.threshold, `${ctx}.threshold`);
      break;
    case 'travelled':
      assertLength(obj.distance, `${ctx}.distance`);
      break;
    case 'elapsed':
      if (typeof obj.seconds !== 'number') throw new Error(`${ctx}: elapsed.seconds must be number`);
      break;
  }
}

export function assertProgramBlock(b: unknown, ctx = 'block'): asserts b is ProgramBlock {
  if (!b || typeof b !== 'object') throw new Error(`${ctx}: expected object`);
  const obj = b as Record<string, unknown>;
  if (typeof obj.id !== 'string') throw new Error(`${ctx}: missing id`);
  if (typeof obj.kind !== 'string' || !VALID_KINDS.has(obj.kind)) {
    throw new Error(`${ctx}: invalid kind ${obj.kind}`);
  }
  switch (obj.kind) {
    case 'motor.set':
      if (typeof obj.speed !== 'number')   throw new Error(`${ctx}: motor.set.speed`);
      if (typeof obj.seconds !== 'number') throw new Error(`${ctx}: motor.set.seconds`);
      break;
    case 'motor.until':
      if (typeof obj.speed !== 'number') throw new Error(`${ctx}: motor.until.speed`);
      assertCondition(obj.condition, `${ctx}.condition`);
      break;
    case 'turn':
      if (typeof obj.degrees !== 'number') throw new Error(`${ctx}: turn.degrees`);
      if (typeof obj.speed !== 'number')   throw new Error(`${ctx}: turn.speed`);
      break;
    case 'drive':
      assertLength(obj.distance, `${ctx}.distance`);
      if (typeof obj.speed !== 'number') throw new Error(`${ctx}: drive.speed`);
      break;
    case 'wait':
      if (typeof obj.seconds !== 'number') throw new Error(`${ctx}: wait.seconds`);
      break;
    case 'if': {
      assertCondition(obj.condition, `${ctx}.condition`);
      if (!Array.isArray(obj.then)) throw new Error(`${ctx}: if.then must be array`);
      obj.then.forEach((bb, i) => assertProgramBlock(bb, `${ctx}.then[${i}]`));
      if (obj.else !== undefined) {
        if (!Array.isArray(obj.else)) throw new Error(`${ctx}: if.else must be array`);
        obj.else.forEach((bb, i) => assertProgramBlock(bb, `${ctx}.else[${i}]`));
      }
      break;
    }
    case 'loop': {
      if (!Array.isArray(obj.body)) throw new Error(`${ctx}: loop.body must be array`);
      obj.body.forEach((bb, i) => assertProgramBlock(bb, `${ctx}.body[${i}]`));
      const hasTimes = typeof obj.times === 'number';
      const hasUntil = obj.until !== undefined;
      if (hasTimes === hasUntil) {
        throw new Error(`${ctx}: loop must have exactly one of times | until`);
      }
      if (hasUntil) assertCondition(obj.until, `${ctx}.until`);
      break;
    }
    case 'stop':
      break;
  }
}

export function assertProgram(p: unknown): asserts p is Program {
  if (!p || typeof p !== 'object') throw new Error('program: expected object');
  const obj = p as Record<string, unknown>;
  if (typeof obj.id !== 'string') throw new Error('program: missing id');
  if (!Array.isArray(obj.blocks)) throw new Error('program: blocks must be array');
  obj.blocks.forEach((b, i) => assertProgramBlock(b, `blocks[${i}]`));
}
