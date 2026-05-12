'use client';

/**
 * ProgramView — visual surface for the kid's tutor-built program. Mounts
 * in the Programming tab. Subscribes to the module-level program store
 * (which the tutor's tool-call dispatcher writes into) so every rule the
 * kid speaks shows up here as a block in the running sequence.
 *
 * Two responsibilities:
 *   1. Render the program tree as ordered visual cards (sequence, with
 *      nested children for if/loop bodies).
 *   2. Highlight the running block during execution by listening for
 *      `tutor.program.event` block.enter/block.exit emissions.
 *
 * No editing surface here yet — the kid talks to Spark, Spark builds the
 * blocks. A future "tap to tweak" affordance can layer in once the voice
 * loop is solid.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, Square, Trash2, Mic, Activity, Cpu } from 'lucide-react';

import {
  subscribeProgram,
  clearProgram,
} from '@/lib/program-store';
import {
  type Program,
  type ProgramBlock,
  type Condition,
  type Length,
} from '@/lib/program-schema';
import { onSparkEvent } from '@/lib/spark-events';
import { emitToolRequest } from '@/lib/spark-tools';
import {
  isProgramPaused, pauseProgram, resumeProgram, onPauseChange,
} from '@/lib/program-executor';
// Importing this module also registers a setMotors hook that mirrors
// program-driven motor commands to the physical robot when "Robot" is on.
import {
  isRobotMode, setRobotMode, onRobotModeChange, setBridgeApiBase,
} from '@/lib/program-robot-bridge';
import { useRuntimeConfig } from '@/lib/config';

type Props = {
  /** When true, hide the empty-state hero and show only the active program
   *  (e.g., embedded in a side rail). Defaults to false (full surface). */
  compact?: boolean;
  /** Per-unit firmware serial. When null the "Run on Robot" toggle is
   *  disabled and shows a tooltip prompting the user to pair a bot —
   *  flipping it on with no paired chassis would silently drop every
   *  motor command at the local-runtime. */
  robotSerial?: string | null;
};

export function ProgramView({ compact = false, robotSerial = null }: Props) {
  const [program, setProgram] = useState<Program>({ id: 'p-default', blocks: [] });
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [paused, setPaused] = useState(isProgramPaused());
  const [robotMode, setRobotModeState] = useState(isRobotMode());

  // Subscribe to the program store. Snapshot is delivered immediately on
  // mount so we don't render an empty flash before first paint.
  useEffect(() => subscribeProgram((p) => setProgram(p)), []);
  // Mirror the executor's pause flag so the play/pause button reflects state.
  useEffect(() => onPauseChange(setPaused), []);
  // Mirror robot-mode flag (and seed the bridge with the actual runtime
  // URL — port can differ from the 8787 default on some setups).
  useEffect(() => onRobotModeChange(setRobotModeState), []);
  const runtimeConfig = useRuntimeConfig();
  useEffect(() => { setBridgeApiBase(runtimeConfig.apiBase); }, [runtimeConfig.apiBase]);

  // If the robot disconnects (or we never had one) while Robot mode was
  // on, force it back off. Otherwise the executor would keep firing
  // setpoints into the void and the user would think their program is
  // running on hardware when it isn't.
  useEffect(() => {
    if (!robotSerial && robotMode) setRobotMode(false);
  }, [robotSerial, robotMode]);

  // Highlight the running block via the tutor.program.event bus. block.enter
  // sets the active id; block.exit clears it (so an idle program shows no
  // highlight). program.done / program.aborted both clear the highlight too.
  useEffect(() => {
    return onSparkEvent((detail) => {
      if (detail.kind !== 'tutor.program.event') return;
      const ev = detail.payload as Record<string, unknown> | undefined;
      if (!ev) return;
      if (ev.kind === 'block.enter' && typeof ev.blockId === 'string') {
        setActiveBlockId(ev.blockId);
      } else if (ev.kind === 'block.exit' && typeof ev.blockId === 'string') {
        // Only clear if the exiting block is the one we're highlighting —
        // for if/loop the parent .exit fires after the child's .enter→.exit
        // so we don't want a child's exit to leave the parent highlighted
        // (already handled because each enter overwrites the previous id).
        setActiveBlockId((cur) => (cur === ev.blockId ? null : cur));
      } else if (ev.kind === 'program.done' || ev.kind === 'program.aborted') {
        setActiveBlockId(null);
      }
    });
  }, []);

  const isEmpty = program.blocks.length === 0;

  // In compact (floating-strip) mode with an empty program, render a
  // tiny one-line hint so the kid knows the panel exists — bigger
  // empty-state hero is reserved for the full Programming-tab view.
  if (compact && isEmpty) {
    return (
      <div className="program-view program-view-hint">
        <Mic size={12} />
        <span>Tell Spark to build a program</span>
      </div>
    );
  }

  const isRunning = activeBlockId !== null;

  const handleRun = () => {
    // Already running and paused → resume in place; otherwise dispatch
    // a fresh run via the tool-confirmation flow.
    if (isRunning && paused) {
      resumeProgram();
      return;
    }
    emitToolRequest({
      id: 'program_run',
      input: {},
      reason: 'You asked to run it',
    });
  };

  const handlePause = () => { pauseProgram(); };

  const handleStop = () => {
    // Stop = abort + reset. We resume first so the delay loop's pause
    // gate doesn't keep the executor frozen mid-await; then clearProgram
    // signals via the dispatcher's runningRef abort path.
    if (window.confirm('Stop the running program?')) {
      resumeProgram();
      clearProgram();
    }
  };

  const handleClear = () => {
    if (program.blocks.length === 0) return;
    if (window.confirm(`Clear all ${program.blocks.length} step${program.blocks.length === 1 ? '' : 's'}?`)) {
      clearProgram();
    }
  };

  return (
    <div className={`program-view${compact ? ' compact' : ''}`}>
      <div className="program-view-header">
        <div className="program-view-title">
          <Activity size={14} />
          <span>Your program</span>
          {program.blocks.length > 0 && (
            <span className="program-view-count">{program.blocks.length} step{program.blocks.length === 1 ? '' : 's'}</span>
          )}
        </div>
        <div className="program-view-actions">
          {/* In compact (floating-strip) mode, transport controls live
              in the dedicated SimControls bar — keep only the Clear
              affordance here so the strip header stays uncluttered. */}
          {!compact && (
            isRunning && !paused ? (
              <button
                type="button"
                className="program-view-btn program-view-btn-pause"
                onClick={handlePause}
                title="Pause"
              >
                <Pause size={12} /> Pause
              </button>
            ) : (
              <button
                type="button"
                className="program-view-btn"
                onClick={handleRun}
                disabled={isEmpty}
                title={isEmpty ? 'Tell Spark what to do first' : isRunning ? 'Resume' : 'Run the program'}
              >
                <Play size={12} /> {isRunning ? 'Resume' : 'Run'}
              </button>
            )
          )}
          {!compact && (
            <button
              type="button"
              className="program-view-btn program-view-btn-stop"
              onClick={handleStop}
              disabled={!isRunning}
              title="Stop"
            >
              <Square size={11} /> Stop
            </button>
          )}
          <button
            type="button"
            className="program-view-btn program-view-btn-ghost"
            onClick={handleClear}
            disabled={isEmpty}
            title="Clear all steps"
          >
            <Trash2 size={12} />
          </button>
          {/* "Run on robot" toggle. When ON, the program executor's
              motor writes are mirrored to the local-runtime, which
              forwards them to the firmware over the existing WebSocket.
              When OFF, the executor still drives the simulator chassis
              for preview. Hidden in the compact strip header — the
              compact mode lives next to the dedicated SimControls bar. */}
          <button
            type="button"
            className={`program-view-btn program-view-btn-robot${robotMode ? ' on' : ''}${!robotSerial ? ' disabled' : ''}`}
            onClick={() => {
              if (!robotSerial) return;
              setRobotMode(!robotMode);
            }}
            disabled={!robotSerial}
            title={!robotSerial
              ? 'Pair a robot from the home screen to enable Run on Robot'
              : robotMode
                ? `Stop streaming motor commands to ${robotSerial}`
                : `Mirror this program's motor commands to ${robotSerial}`}
          >
            <Cpu size={12} /> {!robotSerial
              ? 'No robot'
              : robotMode
                ? (compact ? 'Robot ON' : `On · ${robotSerial}`)
                : 'Run on Robot'}
          </button>
        </div>
      </div>

      {isEmpty ? (
        <div className="program-view-empty">
          <Mic size={28} className="program-view-empty-icon" />
          <div className="program-view-empty-title">Tell Spark what to do</div>
          <div className="program-view-empty-hint">
            Try saying: <em>“drive forward 12 inches, then turn right 90 degrees”</em><br />
            or <em>“keep going until the ultrasonic reads less than 20 cm”</em>
          </div>
        </div>
      ) : (
        <div className="program-view-blocks">
          <AnimatePresence initial={false}>
            {program.blocks.map((block: ProgramBlock, i: number) => (
              <BlockCard
                key={block.id}
                block={block}
                index={i}
                activeBlockId={activeBlockId}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// ─── Block rendering ─────────────────────────────────────────────────────

function BlockCard({
  block, index, activeBlockId, depth = 0,
}: {
  block: ProgramBlock;
  index: number;
  activeBlockId: string | null;
  depth?: number;
}) {
  const isActive = activeBlockId === block.id;
  const meta = useMemo(() => describeBlock(block), [block]);

  return (
    <motion.div
      className={`program-block program-block-${block.kind.replace('.', '-')}${isActive ? ' is-active' : ''}`}
      style={{ marginLeft: depth * 14 }}
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: -8, scale: 0.96 }}
      transition={{ duration: 0.18 }}
      layout
    >
      <div className="program-block-stripe" aria-hidden style={{ background: meta.color }} />
      <div className="program-block-body">
        <div className="program-block-row">
          <span className="program-block-index">{index + 1}</span>
          <span className="program-block-icon">{meta.icon}</span>
          <span className="program-block-label">{meta.label}</span>
        </div>
        {meta.detail && <div className="program-block-detail">{meta.detail}</div>}
        {/* Nested bodies for if / loop. Rendered with deeper indent. */}
        {block.kind === 'if' && (
          <NestedList title="Then" blocks={block.then} activeBlockId={activeBlockId} depth={depth + 1} />
        )}
        {block.kind === 'if' && block.else && block.else.length > 0 && (
          <NestedList title="Otherwise" blocks={block.else} activeBlockId={activeBlockId} depth={depth + 1} />
        )}
        {block.kind === 'loop' && (
          <NestedList title="Repeat" blocks={block.body} activeBlockId={activeBlockId} depth={depth + 1} />
        )}
      </div>
    </motion.div>
  );
}

function NestedList({
  title, blocks, activeBlockId, depth,
}: {
  title: string;
  blocks: ProgramBlock[];
  activeBlockId: string | null;
  depth: number;
}) {
  return (
    <div className="program-block-nested">
      <div className="program-block-nested-title">{title}</div>
      <div className="program-block-nested-body">
        {blocks.map((b, i) => (
          <BlockCard key={b.id} block={b} index={i} activeBlockId={activeBlockId} depth={depth} />
        ))}
      </div>
    </div>
  );
}

// ─── Block presentation ──────────────────────────────────────────────────
// Translate a ProgramBlock into a compact visual: icon + label + detail
// line. Kept out of the renderer so it's easy to keep parallel with the
// schema as new block kinds are added.

type BlockMeta = { icon: string; label: string; detail: string | null; color: string };

function fmtLength(l: Length): string {
  return `${l.value}${l.unit === 'in' ? '"' : ` ${l.unit}`}`;
}

function fmtCondition(c: Condition): string {
  switch (c.kind) {
    case 'distance.lt': return `ultrasonic < ${fmtLength(c.threshold)}`;
    case 'distance.gt': return `ultrasonic > ${fmtLength(c.threshold)}`;
    case 'travelled':   return `travelled ${fmtLength(c.distance)}`;
    case 'elapsed':     return `${c.seconds}s elapsed`;
  }
}

function describeBlock(block: ProgramBlock): BlockMeta {
  switch (block.kind) {
    case 'motor.set':
      return {
        icon: '⚙',
        label: block.side === 'both' ? 'Run motors' : `${block.side[0].toUpperCase()}${block.side.slice(1)} motor`,
        detail: `${block.speed > 0 ? '+' : ''}${block.speed} for ${block.seconds}s`,
        color: '#3b82f6',
      };
    case 'motor.until':
      return {
        icon: '⚡',
        label: block.side === 'both' ? 'Drive until' : `${block.side[0].toUpperCase()}${block.side.slice(1)} until`,
        detail: `at ${block.speed} until ${fmtCondition(block.condition)}`,
        color: '#a855f7',
      };
    case 'turn':
      return {
        icon: '↻',
        label: block.degrees > 0 ? 'Turn left' : 'Turn right',
        detail: `${Math.abs(block.degrees)}° at speed ${block.speed}`,
        color: '#f59e0b',
      };
    case 'drive':
      return {
        icon: '→',
        label: 'Drive',
        detail: `${fmtLength(block.distance)} at speed ${block.speed}`,
        color: '#22c55e',
      };
    case 'wait':
      return {
        icon: '⏱',
        label: 'Wait',
        detail: `${block.seconds}s`,
        color: '#94a3b8',
      };
    case 'if':
      return {
        icon: '◇',
        label: 'If',
        detail: fmtCondition(block.condition),
        color: '#06b6d4',
      };
    case 'loop':
      return {
        icon: '↺',
        label: typeof block.times === 'number' ? `Repeat ${block.times}×` : 'Loop',
        detail: block.until ? `until ${fmtCondition(block.until)}` : null,
        color: '#ec4899',
      };
    case 'stop':
      return {
        icon: '■',
        label: 'Stop',
        detail: null,
        color: '#ef4444',
      };
  }
}
