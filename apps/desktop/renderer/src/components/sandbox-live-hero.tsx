'use client';

import { motion } from 'motion/react';
import { Clock, Box, MessageCircle, ArrowRight, Sparkles } from 'lucide-react';

import { SparkRobot } from '@/components/spark-robot';
import {
  ConeGlyph, WallBlockGlyph, RampGlyph, WaypointOrbGlyph,
  SumoPlowGlyph, BezierPathGlyph, ShovelSvg,
} from '@/components/sandbox-scene';
import type { SavedSession } from '@/lib/session-storage';
import { countLines, formatTimeSpent } from '@/lib/scene-builder';
import { useSessionThumbnail } from '@/lib/use-session-thumbnail';

// ── Sandbox theme — full floor strip ───────────────────────────────────────
// Brings back the original SandboxHeroScene's personality: ramp + cone +
// orb + wall + buried Sparks on the left, digging Spark in the middle,
// bezier path + orb + sumo plow + buried Spark + wall on the right.
// All anchored along a horizontal sand strip at the bottom of the hero
// card so the kid sees the whole "robotics sandbox" cast every time.
//
// The dig cycle is choreographed so it actually reads as digging:
//   t=0.00–0.20  shovel raised, ready
//   t=0.20–0.45  shovel plunges down + into the sand (mound dips)
//   t=0.45–0.55  shovel rotates with sand load visible on the blade
//   t=0.55–0.70  shovel tips → puffs eject, sand load disappears
//   t=0.70–1.00  shovel returns to ready; mound rebuilds
// Sand pile height + a small "blob on the blade" element track t so
// the displacement reads even without showing actual particle physics.

const DIG_DURATION = 1.6;

// Where puffs originate (relative to the digging Spark's centre).
// Burst phase ~0.55 of the cycle = 0.88 s into a 1.6 s loop.
const PUFFS = [
  { dx: 14, upY: -32, sideX:  -8, size: 6, hue: 38, delay: 0.88 },
  { dx: 22, upY: -52, sideX:  16, size: 8, hue: 40, delay: 0.90 },
  { dx: 30, upY: -40, sideX:  26, size: 6, hue: 36, delay: 0.96 },
  { dx:  8, upY: -22, sideX: -18, size: 5, hue: 34, delay: 0.92 },
  { dx: 36, upY: -28, sideX:  32, size: 5, hue: 42, delay: 1.02 },
];

function SandPuff(p: typeof PUFFS[number]) {
  return (
    <motion.span
      style={{
        position: 'absolute',
        left: `calc(50% + ${p.dx}px)`,
        bottom: 18,
        width: p.size,
        height: p.size,
        borderRadius: '50%',
        background: `hsl(${p.hue}, 80%, ${52 + p.size}%)`,
        pointerEvents: 'none',
        zIndex: 4,
      }}
      animate={{
        y: [0, p.upY * 0.6, p.upY, p.upY * 0.7, 0],
        x: [0, p.sideX * 0.4, p.sideX, p.sideX * 1.1, p.sideX * 0.5],
        opacity: [0, 1, 0.7, 0.3, 0],
        scale: [0.2, 1.3, 1, 0.6, 0],
      }}
      transition={{
        duration: DIG_DURATION,
        repeat: Infinity,
        ease: [0.2, 0.8, 0.4, 1],
        delay: p.delay,
        times: [0, 0.2, 0.5, 0.75, 1],
      }}
    />
  );
}

// Static sand mound under the digging Spark. Earlier we tried morphing
// the top edge to simulate displacement on the dig frame — kid-shaped
// hindsight: at this size the morph just reads as a cartoon line moving
// around, not as sand giving way. The puffs + body lean carry the
// "something is happening" cue; the mound is just a base. */
function DigSandMound() {
  return (
    <svg
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 0,
        width: 160,
        height: 30,
        transform: 'translateX(-50%)',
        zIndex: 2,
        pointerEvents: 'none',
      }}
      viewBox="0 0 160 30"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="sbhDigMound" x1="0" y1="0" x2="0" y2="1">
          {/* Slightly warmer than the floor sand so the bot's mound
              reads as a fresh pile sitting on top of the floor. */}
          <stop offset="0%"  stopColor="#856a36" />
          <stop offset="50%" stopColor="#5d4a25" />
          <stop offset="100%" stopColor="#382b18" />
        </linearGradient>
      </defs>
      <path
        d="M0 18 C26 6, 54 20, 80 8 C106 -2, 134 18, 160 12 L160 30 L0 30 Z"
        fill="url(#sbhDigMound)"
      />
    </svg>
  );
}

// Wraps a child in a "buried in sand" clip — the bottom ~55% is hidden
// by the sand line so the mini-Spark reads as half-submerged.
function BuriedClip({ children }: { children: React.ReactNode }) {
  return <div className="sandbox-buried-clip">{children}</div>;
}

function SandboxFloorStrip() {
  return (
    <div className="sandbox-live-hero-floor" aria-hidden>
      {/* ── Obstacle field along the sand line, left → right ─────────── */}

      {/* Ramp — half-buried far left */}
      <motion.div
        className="sandbox-live-hero-floor-item"
        style={{ left: '4%', bottom: 20 }}
        animate={{ y: [0, -3, 0], rotate: [-2, 2, -2] }}
        transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
      >
        <RampGlyph />
      </motion.div>

      {/* Mini Spark — surprised, half-buried */}
      <motion.div
        className="sandbox-live-hero-floor-item"
        style={{ left: '14%', bottom: 22 }}
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 2.7, repeat: Infinity, ease: [0.4, 0, 0.6, 1], delay: 0.5 }}
      >
        <BuriedClip>
          <SparkRobot mode="2d" pose="surprised" size="xs" />
        </BuriedClip>
      </motion.div>

      {/* Cone */}
      <motion.div
        className="sandbox-live-hero-floor-item"
        style={{ left: '24%', bottom: 24 }}
        animate={{ rotate: [-10, 8, -10], y: [0, -2, 0] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.9 }}
      >
        <ConeGlyph />
      </motion.div>

      {/* Glowing waypoint orb */}
      <motion.div
        className="sandbox-live-hero-floor-item"
        style={{ left: '32%', bottom: 24, filter: 'drop-shadow(0 0 8px rgba(93,228,255,0.7))' }}
        animate={{ y: [0, -4, 0], opacity: [0.75, 1, 0.75] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: 1.4 }}
      >
        <WaypointOrbGlyph />
      </motion.div>

      {/* Wall block */}
      <motion.div
        className="sandbox-live-hero-floor-item"
        style={{ left: '40%', bottom: 24 }}
        animate={{ y: [0, -3, 0], rotate: [-3, 3, -3] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut', delay: 1.9 }}
      >
        <WallBlockGlyph />
      </motion.div>

      {/* ── MAIN: digging Spark — slightly right of centre ────────────── */}
      <div className="sandbox-live-hero-floor-dig">
        <DigSandMound />

        {/* Bot wrapper — bobs and leans slightly so the kid reads
            the dig as ongoing work rather than a still illustration.
            The shovel sits BEHIND the bot (z-index below the SparkRobot)
            so the bot's own pre-drawn arms appear to be in front of
            and gripping the handle. This avoids the "extra floating
            arm" effect from trying to draw our own forearm overlay on
            top of a fully-illustrated 2D Spark that already has arms. */}
        <motion.div
          className="sandbox-live-hero-floor-bot"
          style={{ transformOrigin: 'bottom center' }}
          animate={{
            // Gentle dig cycle — body lean + small bob. Times match
            // the puff bursts so the visual cue lines up.
            rotate: [-2, -8, -2],
            y:      [0, 3, 0],
          }}
          transition={{
            duration: DIG_DURATION,
            repeat: Infinity,
            ease: [0.4, 0, 0.6, 1],
            times: [0, 0.5, 1],
          }}
        >
          {/* Shovel — static, planted in the mound, slightly tucked
              to the bot's right. The bot's body shifts over it during
              the lean so it visually reads as gripped. z-index 1 keeps
              it behind the SparkRobot (which is z-index 2 by default
              in its own stacking context). */}
          <div
            style={{
              position: 'absolute',
              right: -2,
              bottom: -4,
              transform: 'rotate(-25deg)',
              transformOrigin: 'bottom center',
              zIndex: 1,
            }}
            aria-hidden
          >
            <ShovelSvg />
          </div>

          <SparkRobot mode="2d" pose="wave" size="md" />
        </motion.div>

        {/* Puff burst at the moment the shovel tips */}
        {PUFFS.map((p, i) => (
          <SandPuff key={i} {...p} />
        ))}
      </div>

      {/* ── Right side: path + orb + sumo + buried Spark + wall ──────── */}

      <motion.div
        className="sandbox-live-hero-floor-item"
        style={{ left: '70%', bottom: 36 }}
        animate={{ scaleX: [1, 1.1, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2.7, repeat: Infinity, ease: 'easeInOut', delay: 0.7 }}
      >
        <BezierPathGlyph />
      </motion.div>

      <motion.div
        className="sandbox-live-hero-floor-item"
        style={{ left: '76%', bottom: 24, filter: 'drop-shadow(0 0 8px rgba(168,85,247,0.7))' }}
        animate={{ y: [0, -4, 0], opacity: [0.75, 1, 0.75] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
      >
        <WaypointOrbGlyph />
      </motion.div>

      <motion.div
        className="sandbox-live-hero-floor-item"
        style={{ left: '83%', bottom: 24 }}
        animate={{ rotate: [4, -4, 4], y: [0, -3, 0] }}
        transition={{ duration: 2.3, repeat: Infinity, ease: 'easeInOut', delay: 1.0 }}
      >
        <SumoPlowGlyph />
      </motion.div>

      <motion.div
        className="sandbox-live-hero-floor-item"
        style={{ left: '88%', bottom: 22 }}
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: [0.4, 0, 0.6, 1], delay: 1.4 }}
      >
        <BuriedClip>
          <SparkRobot mode="2d" pose="think" size="xs" />
        </BuriedClip>
      </motion.div>

      <motion.div
        className="sandbox-live-hero-floor-item"
        style={{ left: '94%', bottom: 22 }}
        animate={{ rotate: [3, -2, 3], y: [0, -2, 0] }}
        transition={{ duration: 2.9, repeat: Infinity, ease: 'easeInOut', delay: 1.3 }}
      >
        <WallBlockGlyph />
      </motion.div>

      {/* ── Sandy ground SVG — same gradient family + texture as the
          original SandboxHeroScene so the strip reads as the same
          floor across the whole platform. */}
      <svg
        className="sandbox-live-hero-floor-sand"
        viewBox="0 0 720 60"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          {/* Muted amber to fit the dark hero card. The original
              SandboxHeroScene used bright amber (#d4952a → #8b5e1a)
              because it sat on a coloured sky background; this card
              is near-black, so we pull saturation way down and
              darken. Reads as "warm sand at dusk" — sits inside the
              dark theme instead of fighting it. */}
          {/* Mid-range muted amber — earlier pass went too dark
              (read as wet dirt). Lifted toward warm dusk sand while
              keeping saturation low enough to sit inside the dark
              card theme. */}
          <linearGradient id="sbhFloorSand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="#8a6a36" />
            <stop offset="40%" stopColor="#5f4925" />
            <stop offset="100%" stopColor="#3a2c16" />
          </linearGradient>
          <radialGradient id="sbhFloorShine" cx="50%" cy="0%" r="80%">
            <stop offset="0%"   stopColor="#c89548" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#8a6a36" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path
          d="M0,18 C14,10 32,24 58,14 C80,5 102,20 130,10 C156,3 178,16 208,8 C234,0 258,14 286,5 C310,-2 336,12 362,4 C386,-3 410,12 438,3 C464,-4 488,10 516,2 C542,-4 566,8 594,1 C620,-4 646,10 672,2 C696,-3 712,8 720,5 L720,60 L0,60 Z"
          fill="url(#sbhFloorSand)"
        />
        <path
          d="M0,18 C14,10 32,24 58,14 C80,5 102,20 130,10 C156,3 178,16 208,8 C234,0 258,14 286,5 C310,-2 336,12 362,4 C386,-3 410,12 438,3 C464,-4 488,10 516,2 C542,-4 566,8 594,1 C620,-4 646,10 672,2 C696,-3 712,8 720,5 L720,60 L0,60 Z"
          fill="url(#sbhFloorShine)"
        />
        {/* Pebbles scattered along the sand */}
        {[60, 175, 295, 405, 520, 615].map((cx, i) => (
          <ellipse
            key={cx}
            cx={cx}
            cy={36 + (i % 3) * 6}
            rx={2.2 + (i % 2) * 0.6}
            ry={1.3}
            fill="rgba(100, 52, 8, 0.28)"
          />
        ))}
        {/* Grain dots */}
        {Array.from({ length: 40 }, (_, i) => (
          <circle
            key={i}
            cx={10 + ((i * 29 + i * i * 2) % 700)}
            cy={22 + (i % 5) * 6 + (i % 7) * 2}
            r={0.5 + (i % 3) * 0.4}
            fill={`rgba(120,65,10,${0.12 + (i % 4) * 0.04})`}
          />
        ))}
      </svg>
    </div>
  );
}

function AmbientSparkles() {
  // A handful of slow-twinkling specks scattered across the hero so the
  // whole card feels alive, not just the floor. Positions deliberately
  // avoid the thumbnail's bounding box on the left.
  const sparkles = [
    { x: '55%', y: '8%',  s: 3, dur: 2.8, d: 0.2, c: 'var(--cyan)' },
    { x: '92%', y: '12%', s: 3, dur: 3.4, d: 0.7, c: '#a855f7' },
    { x: '70%', y: '24%', s: 2, dur: 2.6, d: 1.1, c: 'var(--cyan)' },
    { x: '46%', y: '38%', s: 2, dur: 3.1, d: 0.4, c: '#fbbf24' },
    { x: '88%', y: '42%', s: 3, dur: 2.3, d: 0.9, c: '#4dffb8' },
    { x: '60%', y: '52%', s: 2, dur: 3.7, d: 1.6, c: '#ff79b0' },
  ] as const;
  return (
    <div className="sandbox-live-hero-sparkles" aria-hidden>
      {sparkles.map((p, i) => (
        <motion.span
          key={i}
          style={{
            position: 'absolute',
            left: p.x,
            top: p.y,
            width: p.s,
            height: p.s,
            borderRadius: '50%',
            background: p.c,
            pointerEvents: 'none',
          }}
          animate={{
            y: [0, -8, 0],
            opacity: [0.15, 0.9, 0.15],
            scale: [1, 1.6, 1],
          }}
          transition={{ duration: p.dur, repeat: Infinity, ease: 'easeInOut', delay: p.d }}
        />
      ))}
    </div>
  );
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000)     return 'just now';
  if (diff < 3_600_000)  return Math.floor(diff / 60_000) + 'm ago';
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + 'h ago';
  const days = Math.floor(diff / 86_400_000);
  if (days === 1) return 'yesterday';
  if (days < 7)   return days + 'd ago';
  return new Date(ts).toLocaleDateString();
}

type Props = {
  session: SavedSession | null;
  userName: string;
  onResume: (id: string) => void;
  onStartNew: () => void;
};

// Live-preview hero: replaces the generic sandbox-scene illustration.
// When the user has a session to continue, shows that session's actual
// canvas thumbnail, the most recent thing they (or Spark) said, and a
// big Resume CTA. When there's no prior session, shows a calmer
// "Start your first session" entry point. Small Spark avatar lives in
// the corner either way so the page keeps personality without eating
// half the screen.
export function SandboxLiveHero({ session, onResume, onStartNew }: Props) {
  // Resolve the IDB-backed thumbnail before the early return so the
  // hook is called unconditionally on every render.
  const thumbnailUrl = useSessionThumbnail(session?.id ?? null, session?.thumbnailDataUrl ?? null);

  if (!session) {
    return (
      <motion.div
        className="sandbox-live-hero sandbox-live-hero--empty sandbox-live-hero--themed"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        <AmbientSparkles />
        <div className="sandbox-live-hero-empty-body">
          <span className="sandbox-live-hero-eyebrow">
            <Sparkles size={12} /> Sandbox
          </span>
          <h2 className="sandbox-live-hero-title">Start a fresh session</h2>
          <p className="sandbox-live-hero-empty-copy">
            Free-draw mode — open prompt, no lessons. Tell Spark what to make.
          </p>
          <button
            type="button"
            className="sandbox-live-hero-cta sandbox-live-hero-cta--primary"
            onClick={onStartNew}
          >
            New session <ArrowRight size={16} />
          </button>
        </div>
        <SandboxFloorStrip />
      </motion.div>
    );
  }

  // Pick the most recent chat message (user or Spark) to show as a
  // teaser. Fall back to the session name if there's no chat yet.
  const lastChat = session.chat?.length ? session.chat[session.chat.length - 1] : null;
  const teaser =
    lastChat?.text?.trim()
      ? lastChat.text.trim().slice(0, 140)
      : session.name;

  const objectCount = session.sceneObjects?.length ?? 0;
  const chatCount   = session.chat?.length ?? 0;
  const codeLines   = countLines(session.code);
  const timeSpent   = session.totalTimeMs && session.totalTimeMs > 1000
    ? formatTimeSpent(session.totalTimeMs)
    : null;

  return (
    <motion.div
      className="sandbox-live-hero sandbox-live-hero--themed"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <AmbientSparkles />

      {/* Live thumbnail of the actual canvas */}
      <motion.button
        type="button"
        className="sandbox-live-hero-preview"
        onClick={() => onResume(session.id)}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.995 }}
        aria-label={`Resume ${session.name}`}
      >
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="sandbox-live-hero-preview-image"
            src={thumbnailUrl}
            alt=""
            draggable={false}
          />
        ) : session.thumbnailSvg ? (
          <div
            className="sandbox-live-hero-preview-svg"
            dangerouslySetInnerHTML={{ __html: session.thumbnailSvg }}
          />
        ) : (
          <div className="sandbox-live-hero-preview-empty">
            <span>🎨</span>
            <span className="sandbox-live-hero-preview-empty-label">Empty canvas</span>
          </div>
        )}
        <span className="sandbox-live-hero-pulse" />
      </motion.button>

      {/* Body: prompt teaser + metadata + CTA */}
      <div className="sandbox-live-hero-body">
        <span className="sandbox-live-hero-eyebrow">
          <Sparkles size={12} /> Continue session
        </span>
        <h2 className="sandbox-live-hero-title">{session.name}</h2>
        <p className="sandbox-live-hero-teaser" title={lastChat?.text ?? undefined}>
          {lastChat ? `“${teaser}${lastChat.text && lastChat.text.length > 140 ? '…' : ''}”` : teaser}
        </p>
        <div className="sandbox-live-hero-meta">
          <span className="sandbox-live-hero-meta-pill">
            <Clock size={12} /> {relativeTime(session.lastOpenedAt)}
            {timeSpent ? ` · ${timeSpent}` : ''}
          </span>
          {objectCount > 0 && (
            <span className="sandbox-live-hero-meta-pill">
              <Box size={12} /> {objectCount} {objectCount === 1 ? 'object' : 'objects'}
            </span>
          )}
          {chatCount > 0 && (
            <span className="sandbox-live-hero-meta-pill">
              <MessageCircle size={12} /> {chatCount}
            </span>
          )}
          {codeLines > 0 && (
            <span className="sandbox-live-hero-meta-pill">
              {codeLines} lines
            </span>
          )}
        </div>
        <div className="sandbox-live-hero-actions">
          <button
            type="button"
            className="sandbox-live-hero-cta sandbox-live-hero-cta--primary"
            onClick={() => onResume(session.id)}
          >
            Resume session <ArrowRight size={16} />
          </button>
          <button
            type="button"
            className="sandbox-live-hero-cta sandbox-live-hero-cta--ghost"
            onClick={onStartNew}
          >
            New session
          </button>
        </div>
      </div>

      {/* Full sandbox floor strip — see SandboxFloorStrip for layout.
          Obstacles + buried Sparks line the sandy ground; the digging
          Spark with shovel scoop/lift/dump anchors the centre. */}
      <SandboxFloorStrip />
    </motion.div>
  );
}
