'use client';

/**
 * BotController — floating arrow-pad for driving bots placed in the sandbox.
 *
 * Appears whenever the scene contains at least one bot. If multiple bots exist
 * a small selector lets the kid choose which one is "active". Buttons support
 * both single-tap (one step) and press-and-hold (continuous drive at 10 Hz).
 *
 * Movement is applied directly to the SceneObject's gx / gz / rotY fields,
 * so bot motion persists through saves and re-renders. Rotation snaps to 90°
 * since rotY is a discrete 0|1|2|3.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Square, Gamepad2 } from 'lucide-react';

import { GRID_SIZE, type SceneObject } from '@/lib/scene-builder';

type BotControllerProps = {
  sceneObjects: SceneObject[];
  onUpdateObjects: (next: SceneObject[]) => void;
};

const STEP_WORLD_M = 0.10;             // 10 cm per single press
const STEP_GRID    = STEP_WORLD_M / GRID_SIZE;
const HOLD_INTERVAL_MS = 110;          // ~9 Hz repeat while held
const ARENA_LIMIT = 8;                 // rough soft-clamp so bots can't drive forever

function botLabel(o: SceneObject, idx: number): string {
  const base = o.botVariant === 'sumo' ? 'Sumo Bot' : 'Spark Mini';
  return `${base} #${idx + 1}`;
}

export function BotController({ sceneObjects, onUpdateObjects }: BotControllerProps) {
  // Pull every bot in the scene, in placement order (stable for the dropdown).
  const bots = useMemo(
    () => sceneObjects.filter((o) => o.type === 'bot'),
    [sceneObjects],
  );

  const [activeBotId, setActiveBotId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Keep activeBotId valid as bots come and go: prefer the previously-active
  // one if it still exists, otherwise pick the first available.
  useEffect(() => {
    if (bots.length === 0) {
      if (activeBotId !== null) setActiveBotId(null);
      return;
    }
    if (!activeBotId || !bots.find((b) => b.id === activeBotId)) {
      setActiveBotId(bots[0].id);
    }
  }, [bots, activeBotId]);

  // Keep a live ref to the current scene so the hold-interval callback always
  // reads the latest position (not the stale closure value at press time).
  const objectsRef = useRef(sceneObjects);
  useEffect(() => { objectsRef.current = sceneObjects; }, [sceneObjects]);

  const moveActive = (action: 'forward' | 'back' | 'left' | 'right') => {
    if (!activeBotId) return;
    const list = objectsRef.current;
    const target = list.find((o) => o.id === activeBotId);
    if (!target) return;

    let next = { ...target };
    if (action === 'left' || action === 'right') {
      const cur = (target.rotY ?? 0);
      const delta = action === 'left' ? 3 : 1; // -1 mod 4 = +3
      next = { ...target, rotY: ((cur + delta) % 4) as 0 | 1 | 2 | 3 };
    } else {
      // Forward direction in world: (cos θ, -sin θ) where θ = rotY * π/2.
      // Bot's local +X is "forward" and the parent group rotates CCW around Y.
      const angle = (target.rotY ?? 0) * (Math.PI / 2);
      const sign = action === 'forward' ? 1 : -1;
      const dgx = sign * STEP_GRID * Math.cos(angle);
      const dgz = sign * STEP_GRID * (-Math.sin(angle));
      next = {
        ...target,
        gx: Math.max(-ARENA_LIMIT, Math.min(ARENA_LIMIT, target.gx + dgx)),
        gz: Math.max(-ARENA_LIMIT, Math.min(ARENA_LIMIT, target.gz + dgz)),
      };
    }
    onUpdateObjects(list.map((o) => (o.id === target.id ? next : o)));
  };

  // Press-and-hold drive: tick once immediately, then repeat at HOLD_INTERVAL_MS.
  const intervalRef = useRef<number | null>(null);
  const startHold = (action: 'forward' | 'back' | 'left' | 'right') => {
    moveActive(action);
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(() => moveActive(action), HOLD_INTERVAL_MS);
  };
  const stopHold = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };
  // Belt-and-suspenders cleanup so an unmount mid-hold doesn't strand a timer.
  useEffect(() => () => stopHold(), []);

  if (bots.length === 0) return null;

  const padBtnProps = (action: 'forward' | 'back' | 'left' | 'right') => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); startHold(action); },
    onPointerUp: stopHold,
    onPointerLeave: stopHold,
    onPointerCancel: stopHold,
  });

  return (
    <motion.div
      className="bot-controller"
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
    >
      <button
        type="button"
        className="bot-controller-header"
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? 'Expand bot controller' : 'Collapse bot controller'}
      >
        <Gamepad2 size={14} />
        <span className="bot-controller-title">Bot Controller</span>
        <span className="bot-controller-collapse">{collapsed ? '▴' : '▾'}</span>
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            className="bot-controller-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {bots.length > 1 && (
              <select
                className="bot-controller-select"
                value={activeBotId ?? ''}
                onChange={(e) => setActiveBotId(e.target.value)}
              >
                {bots.map((b, i) => (
                  <option key={b.id} value={b.id}>{botLabel(b, i)}</option>
                ))}
              </select>
            )}

            <div className="bot-controller-pad">
              <button
                type="button"
                className="bot-controller-btn bot-controller-btn--up"
                title="Drive forward (hold)"
                {...padBtnProps('forward')}
              >
                <ChevronUp size={18} />
              </button>
              <button
                type="button"
                className="bot-controller-btn bot-controller-btn--left"
                title="Turn left (hold)"
                {...padBtnProps('left')}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                className="bot-controller-btn bot-controller-btn--stop"
                title="Stop"
                onClick={stopHold}
              >
                <Square size={12} />
              </button>
              <button
                type="button"
                className="bot-controller-btn bot-controller-btn--right"
                title="Turn right (hold)"
                {...padBtnProps('right')}
              >
                <ChevronRight size={18} />
              </button>
              <button
                type="button"
                className="bot-controller-btn bot-controller-btn--down"
                title="Drive back (hold)"
                {...padBtnProps('back')}
              >
                <ChevronDown size={18} />
              </button>
            </div>

            <div className="bot-controller-hint">
              Tap to step · Hold to drive
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
