'use client';

/**
 * SparkToolDispatcher — sits inside the student session and handles tool
 * requests that come back from the agentic tutor. Annotative tools run
 * immediately; mutative ones surface a small confirmation modal ("Spark
 * wants to drop a demo wall here — OK?"). Mounted from student-dashboard.
 *
 * Hybrid agency model — see lib/spark-tools.ts.
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Check, X } from 'lucide-react';

import {
  onToolRequest,
  isMutativeTool,
  getToolSchema,
  type SparkToolRequest,
  type SparkToolResult,
} from '@/lib/spark-tools';
import { type SceneObject, GRID_SIZE, gridToWorldRendered, newSceneObjectId } from '@/lib/scene-builder';
import { syncPoseToPlacement } from '@/components/sim-playground/bot-drive';
import { awardXP } from '@/lib/progress-store';
import { emitSparkEvent } from '@/lib/spark-events';
import { recordInterjection, markInterjectionOutcome } from '@/lib/spark-memory';
import { appendBlock, clearProgram, getProgram } from '@/lib/program-store';
import { assertProgramBlock } from '@/lib/program-schema';
import { runProgram } from '@/lib/program-executor';
import { makeSimSensor } from '@/components/sim-playground/sensors';

interface Props {
  /** Active SceneObjects — needed to validate object_id targets. */
  sceneObjects: SceneObject[];
  /** Used by add_demo_object to insert into the scene. */
  onSceneObjectsChange: (next: SceneObject[]) => void;
  /** Used to flag a brief on-canvas highlight; renderer passes through to scene-3d. */
  onHighlightObject?: (id: string | null) => void;
  /** Active student name — for award_xp. */
  studentName: string;
  /** Surface a one-line note to the student (shown above tutor chat). */
  onAgentNote?: (note: string) => void;
  /** Returns the bot id the kid's program should run against — null if
   *  no bot is placed/selected. Resolved fresh per call so program_run
   *  picks up the latest selection. */
  getActiveBotId?: () => string | null;
}

interface PendingRequest {
  request: SparkToolRequest;
  schema: ReturnType<typeof getToolSchema>;
}

function mapToolToInterjectionType(toolId: string): 'highlight' | 'demo' | 'xp' | 'speak' {
  if (toolId === 'highlight_object') return 'highlight';
  if (toolId === 'add_demo_object') return 'demo';
  if (toolId === 'award_xp') return 'xp';
  return 'speak';
}

export function SparkToolDispatcher({
  sceneObjects,
  onSceneObjectsChange,
  onHighlightObject,
  studentName,
  onAgentNote,
  getActiveBotId,
}: Props) {
  const [pending, setPending] = useState<PendingRequest | null>(null);
  // Live ref so the sim sensor (created once) always sees the latest scene.
  const sceneRef = useRef<SceneObject[]>(sceneObjects);
  useEffect(() => { sceneRef.current = sceneObjects; }, [sceneObjects]);
  // Same pattern for getActiveBotId — the prop is recreated each render
  // (it's an inline arrow in student-dashboard), so the window-event
  // listener's first-render closure captures a stale version that can
  // return null even after the kid placed a bot. Always read via the ref
  // so program_run sees the current scene.
  const getActiveBotIdRef = useRef(getActiveBotId);
  useEffect(() => { getActiveBotIdRef.current = getActiveBotId; }, [getActiveBotId]);
  // Track the currently-running program so a second run request can stop
  // the first instead of stacking.
  const runningRef = useRef<{ abort: AbortController } | null>(null);

  useEffect(() => {
    return onToolRequest(async (request) => {
      const schema = getToolSchema(request.id);
      if (!schema) return;

      // Annotative → run immediately.
      if (schema.kind === 'annotative') {
        await runTool(request);
        return;
      }
      // Mutative → queue for confirmation. If something is already pending,
      // drop the new request to avoid stacking modals (the agent will retry
      // on the next tick if it really wanted to act).
      setPending((cur) => (cur ? cur : { request, schema }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Direct-run channel — bypasses the mutative confirmation modal for
  // user-initiated runs. The kid pressing the SimControls Play button
  // has already consented, so demanding a Yes/No on top is friction.
  // The AI's program_run path stays mutative because the AI hasn't
  // necessarily confirmed with the kid first.
  useEffect(() => {
    const handler = () => { void runTool({ id: 'program_run', input: {}, reason: 'You hit Play' }); };
    window.addEventListener('sketchbot:run-program-now', handler as EventListener);
    return () => window.removeEventListener('sketchbot:run-program-now', handler as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Tool execution ──────────────────────────────────────────────────────

  async function runTool(request: SparkToolRequest): Promise<SparkToolResult> {
    switch (request.id) {
      case 'highlight_object': {
        const id = String(request.input.object_id ?? '');
        if (!id || !sceneObjects.some((o) => o.id === id)) {
          return { ok: false, message: 'object not found' };
        }
        onHighlightObject?.(id);
        if (request.reason) onAgentNote?.(request.reason);
        // Auto-clear the highlight after a moment.
        setTimeout(() => onHighlightObject?.(null), 4_000);
        return { ok: true, data: { highlighted: id } };
      }
      case 'award_xp': {
        const amountRaw = request.input.amount;
        const reason = String(request.input.reason ?? '');
        const amount = typeof amountRaw === 'number'
          ? Math.max(0, Math.min(50, Math.floor(amountRaw)))
          : 0;
        if (!amount || !reason || !studentName) {
          return { ok: false, message: 'missing fields' };
        }
        const result = awardXP(studentName, amount);
        emitSparkEvent('tutor.xp', { amount, reason });
        onAgentNote?.(`+${amount} XP — ${reason}`);
        return { ok: true, data: { xp_awarded: amount, level_up: result?.leveledUp ?? false } };
      }
      case 'program_append_block': {
        const blockRaw = request.input.block;
        try {
          assertProgramBlock(blockRaw);
        } catch (err) {
          return { ok: false, message: `invalid block: ${(err as Error).message}` };
        }
        appendBlock(blockRaw);
        emitSparkEvent('tutor.program.appended', { kind: blockRaw.kind, id: blockRaw.id });
        if (request.reason) onAgentNote?.(request.reason);
        return { ok: true, data: { appended_id: blockRaw.id } };
      }
      case 'program_clear': {
        clearProgram();
        emitSparkEvent('tutor.program.cleared', {});
        if (request.reason) onAgentNote?.(`Cleared the program: ${request.reason}`);
        return { ok: true };
      }
      case 'program_run': {
        const botId = getActiveBotIdRef.current?.() ?? null;
        if (!botId) return { ok: false, message: 'no active bot to run the program' };
        const program = getProgram();
        if (program.blocks.length === 0) return { ok: false, message: 'program is empty' };
        // Snap the bot to the placed Start marker (if any) BEFORE the
        // executor begins, so each run launches from the same anchored
        // pose. Without this, repeated runs would chain off the bot's
        // previous final position and the visual preview would lie about
        // where the bot actually goes.
        const start = sceneRef.current.find((o) => o.type === 'start');
        if (start) {
          const { x, z } = gridToWorldRendered(start);
          const heading = start.headingRad ?? ((start.rotY ?? 0) * Math.PI) / 2;
          syncPoseToPlacement(botId, x, z, heading);
        }
        // Stop any currently-running program before starting a new one.
        runningRef.current?.abort.abort();
        const abort = new AbortController();
        runningRef.current = { abort };
        const sensor = makeSimSensor(() => sceneRef.current);
        emitSparkEvent('tutor.program.run', { blocks: program.blocks.length });
        if (request.reason) onAgentNote?.(request.reason);
        runProgram(botId, program, {
          sensor,
          abortSignal: abort.signal,
          onEvent: (e) => emitSparkEvent('tutor.program.event', e as unknown as Record<string, unknown>),
        }).finally(() => {
          if (runningRef.current?.abort === abort) runningRef.current = null;
        });
        return { ok: true, data: { running: true, bot_id: botId } };
      }
      case 'add_demo_object': {
        const type = String(request.input.type ?? '');
        const x = Number(request.input.x ?? 0);
        const z = Number(request.input.z ?? 0);
        const allowed = ['wall', 'cone', 'block', 'sphere', 'cylinder', 'waypoint'];
        if (!allowed.includes(type)) return { ok: false, message: 'unsupported type' };
        // World metres → grid cells.
        const gx = Math.round(x / GRID_SIZE);
        const gz = Math.round(z / GRID_SIZE);
        const next: SceneObject = {
          id: newSceneObjectId(),
          type: type as SceneObject['type'],
          gx,
          gz,
          gy: 0,
        };
        onSceneObjectsChange([...sceneObjects, next]);
        if (request.reason) onAgentNote?.(`Spark added a demo ${type}: ${request.reason}`);
        // Treat as a place event for the behavior coordinator so mood updates.
        emitSparkEvent('user.place', { tool: type, byAgent: true });
        return { ok: true, data: { placed_id: next.id } };
      }
      default:
        return { ok: false, message: 'unknown tool' };
    }
  }

  async function approve() {
    if (!pending) return;
    const req = pending.request;
    setPending(null);
    // Track this as an interjection that the kid engaged with — they tapped
    // Yes, which is an explicit positive signal.
    if (studentName) {
      const id = recordInterjection(studentName, mapToolToInterjectionType(req.id), req.reason || req.id);
      if (id) markInterjectionOutcome(studentName, id, 'engaged');
    }
    await runTool(req);
  }

  function reject() {
    if (!pending) return;
    onAgentNote?.(`(declined: ${pending.schema?.label ?? 'Spark suggestion'})`);
    // Explicit negative signal — Spark suggested, kid said no.
    if (studentName) {
      const id = recordInterjection(studentName, mapToolToInterjectionType(pending.request.id), pending.request.reason || pending.request.id);
      if (id) markInterjectionOutcome(studentName, id, 'declined');
    }
    setPending(null);
  }

  // ─── Confirmation modal ──────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {pending && (
        <motion.div
          key="spark-tool-confirm"
          className="spark-tool-confirm"
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.97 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-live="polite"
        >
          <div className="spark-tool-confirm-icon"><Sparkles size={16} /></div>
          <div className="spark-tool-confirm-body">
            <div className="spark-tool-confirm-title">Spark wants to {pending.schema?.label.toLowerCase()}</div>
            {pending.request.reason && (
              <div className="spark-tool-confirm-reason">{pending.request.reason}</div>
            )}
          </div>
          <div className="spark-tool-confirm-actions">
            <button type="button" className="spark-tool-confirm-no" onClick={reject} title="No thanks">
              <X size={14} />
            </button>
            <button type="button" className="spark-tool-confirm-yes" onClick={approve} title="Sure">
              <Check size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
