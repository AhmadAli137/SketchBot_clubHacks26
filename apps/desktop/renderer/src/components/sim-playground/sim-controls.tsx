'use client';

/**
 * SimControls — transport bar for the program executor. Anchored to the
 * bottom-center of the simulator pane so it reads as a video-player
 * control strip: Play / Pause toggle, Stop, Reset.
 *
 * Reset is non-destructive: it stops any running program, snaps the bot
 * back to the Start marker (or world origin if none), and zeroes the
 * bot's chassis Y so a mid-fall doesn't leave the bot stuck mid-air.
 * The program itself is preserved — Reset is "rewind", not "erase".
 *
 * Hides itself when there's no program to operate on so the simulator
 * stays clean for build mode.
 */

import { useEffect, useState } from 'react';
import { Play, Pause, Square, RotateCcw, SkipForward } from 'lucide-react';

import { gridToWorldRendered, type SceneObject } from '@/lib/scene-builder';
import { subscribeProgram, clearProgram } from '@/lib/program-store';
import {
  isProgramPaused, pauseProgram, resumeProgram, onPauseChange,
  setStepMode, advanceStep,
} from '@/lib/program-executor';
import { onSparkEvent } from '@/lib/spark-events';
import { syncPoseToPlacement, stopAllMotors } from './bot-drive';

type Props = {
  /** Returns the currently-running bot's id — used by Reset to snap pose. */
  getActiveBotId?: () => string | null;
  /** Live scene objects — used to find the Start marker for Reset. */
  sceneObjects: SceneObject[];
};

export function SimControls({ getActiveBotId, sceneObjects }: Props) {
  const [hasBlocks, setHasBlocks] = useState(false);
  const [paused, setPaused] = useState(isProgramPaused());
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  // True when the executor is paused BETWEEN blocks waiting for Step
  // to advance. Distinct from `paused` (which is mid-block freeze) —
  // the UI shows them differently because step-paused means "tap Step
  // for the next block" while paused means "tap Pause/Play to resume".
  const [stepPaused, setStepPaused] = useState(false);

  useEffect(() => subscribeProgram((p) => setHasBlocks(p.blocks.length > 0)), []);
  useEffect(() => onPauseChange(setPaused), []);
  useEffect(() => {
    return onSparkEvent((d) => {
      if (d.kind !== 'tutor.program.event') return;
      const ev = d.payload as Record<string, unknown> | undefined;
      if (!ev) return;
      if (ev.kind === 'block.enter' && typeof ev.blockId === 'string') {
        setActiveBlockId(ev.blockId);
        setStepPaused(false);
      } else if (ev.kind === 'block.exit' && typeof ev.blockId === 'string') {
        setActiveBlockId((cur) => (cur === ev.blockId ? null : cur));
      } else if (ev.kind === 'step.paused') {
        setStepPaused(true);
      } else if (ev.kind === 'step.resumed') {
        setStepPaused(false);
      } else if (ev.kind === 'program.done' || ev.kind === 'program.aborted') {
        setActiveBlockId(null);
        setStepPaused(false);
      }
    });
  }, []);

  if (!hasBlocks) return null;

  // "Running" includes the step-pause state — the program isn't truly
  // idle, it's just waiting for the kid to step forward.
  const isRunning = activeBlockId !== null || stepPaused;

  const handlePlayPause = () => {
    // Step-paused → "Play" means "stop stepping, run continuously". Drop
    // step mode and release the between-blocks barrier so the executor
    // motors through the rest without further nudges.
    if (stepPaused) {
      setStepMode(false);
      advanceStep();
      return;
    }
    if (activeBlockId && !paused) { pauseProgram(); return; }
    if (activeBlockId && paused)  { resumeProgram(); return; }
    // Idle → run directly. SparkToolDispatcher listens for this event
    // and skips the mutative-confirmation modal because the kid has
    // explicitly hit Play, which is the consent itself.
    setStepMode(false);
    window.dispatchEvent(new CustomEvent('sketchbot:run-program-now'));
  };

  const handleStep = () => {
    // Step mode: advance ONE block, then pause. If currently step-paused
    // between blocks, advance to the next. If currently mid-block running,
    // turn step mode on so the run pauses after the current block. If idle,
    // start a fresh run with step mode pre-armed so block #1 runs and
    // then we pause before #2.
    setStepMode(true);
    if (stepPaused) {
      advanceStep();
      return;
    }
    if (!activeBlockId) {
      window.dispatchEvent(new CustomEvent('sketchbot:run-program-now'));
    }
    // mid-block running: stepMode is now armed, executor will pause
    // after the current block.exit fires.
  };

  const handleStop = () => {
    // Non-destructive abort — keeps the program but ends the current run.
    resumeProgram();
    clearProgram();
    // (clearProgram zeroes the program; Reset uses syncPoseToPlacement
    // separately so the kid can rewind without losing their work.)
  };

  const handleReset = () => {
    // Stop any running execution, then snap the bot back to the Start
    // marker (or world origin if none placed). Motors zeroed so a mid-
    // run reset doesn't leave the chassis coasting.
    resumeProgram();
    const botId = getActiveBotId?.() ?? null;
    if (!botId) return;
    stopAllMotors();
    const start = sceneObjects.find((o) => o.type === 'start');
    if (start) {
      const { x, z } = gridToWorldRendered(start);
      const heading = start.headingRad ?? ((start.rotY ?? 0) * Math.PI) / 2;
      syncPoseToPlacement(botId, x, z, heading);
    } else {
      syncPoseToPlacement(botId, 0, 0, 0);
    }
    // Tell the 3D overlay to drop its post-run hide so the kid sees the
    // path again from the bot's freshly-reset pose.
    window.dispatchEvent(new CustomEvent('sketchbot:program-reset'));
  };

  // Primary button label depends on state:
  //   idle → Play
  //   running mid-block, not paused → Pause
  //   running mid-block, paused → Play (resume)
  //   step-paused between blocks → Play (resume continuously)
  const showPause = activeBlockId && !paused && !stepPaused;
  const playTitle = stepPaused
    ? 'Play continuously (skip stepping)'
    : activeBlockId
      ? (paused ? 'Resume' : 'Pause')
      : 'Play';

  return (
    <div className="sim-controls" role="toolbar" aria-label="Program transport">
      <button
        type="button"
        className={`sim-controls-btn sim-controls-btn-primary${showPause ? ' is-pause' : ''}`}
        onClick={handlePlayPause}
        title={playTitle}
      >
        {showPause ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <button
        type="button"
        className={`sim-controls-btn${stepPaused ? ' is-step-ready' : ''}`}
        onClick={handleStep}
        title={stepPaused ? 'Next step' : 'Step through one block at a time'}
      >
        <SkipForward size={15} />
      </button>
      <button
        type="button"
        className="sim-controls-btn"
        onClick={handleStop}
        disabled={!isRunning}
        title="Stop"
      >
        <Square size={15} />
      </button>
      <button
        type="button"
        className="sim-controls-btn"
        onClick={handleReset}
        title="Reset bot to Start"
      >
        <RotateCcw size={16} />
      </button>
    </div>
  );
}
