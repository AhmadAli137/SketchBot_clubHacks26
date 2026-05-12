'use client';

import { motion } from 'motion/react';
import { Clock, Box, MessageCircle, ArrowRight, Sparkles } from 'lucide-react';

import { SparkRobot } from '@/components/spark-robot';
import type { SavedSession } from '@/lib/session-storage';
import { countLines, formatTimeSpent } from '@/lib/scene-builder';
import { useSessionThumbnail } from '@/lib/use-session-thumbnail';

// ── Sandbox theme pieces ───────────────────────────────────────────────────
// Compact versions of the older SandboxHeroScene's signature animations,
// reworked to live in the corner of the live-preview hero instead of
// taking over the whole panel. Keeps the playful "Spark digging in the
// sand" personality on the home screen without competing with the live
// thumbnail for attention.

function MiniShovel() {
  return (
    <svg width="14" height="36" viewBox="0 0 20 50" fill="none" aria-hidden>
      <rect x="8" y="0" width="4" height="30" rx="2" fill="#92400e" />
      <rect x="5.5" y="28" width="9" height="5" rx="2" fill="#6b7280" />
      <path d="M2 33 Q10 29 18 33 L16 47 Q10 50 4 47 Z" fill="#9ca3af" />
    </svg>
  );
}

function SandboxCornerScene() {
  // Each puff arcs up and outward as Spark "digs". Stagger delays so the
  // burst aligns roughly with the shovel's down-stroke.
  const puffs = [
    { dx: -2, upY: -22, sideX: -8,  size: 5, delay: 0.70 },
    { dx:  4, upY: -32, sideX:  10, size: 6, delay: 0.75 },
    { dx: 10, upY: -26, sideX:  18, size: 5, delay: 0.85 },
  ];
  return (
    <div className="sandbox-live-hero-corner" aria-hidden>
      {/* Sand puffs — bottom-anchored so they originate from the mound */}
      {puffs.map((p, i) => (
        <motion.span
          key={i}
          style={{
            position: 'absolute',
            left: `calc(50% + ${p.dx}px)`,
            bottom: 14,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: `hsl(${36 + p.size * 2}, 80%, ${52 + p.size}%)`,
            pointerEvents: 'none',
            zIndex: 2,
          }}
          animate={{
            y: [0, p.upY * 0.6, p.upY, p.upY * 0.7, 0],
            x: [0, p.sideX * 0.4, p.sideX, p.sideX * 1.1, p.sideX * 0.5],
            opacity: [0, 1, 0.7, 0.3, 0],
            scale: [0.2, 1.3, 1, 0.6, 0],
          }}
          transition={{
            duration: 1.6,
            repeat: Infinity,
            ease: [0.2, 0.8, 0.4, 1],
            delay: p.delay,
            times: [0, 0.2, 0.5, 0.75, 1],
          }}
        />
      ))}

      {/* Digging Spark + shovel */}
      <div className="sandbox-live-hero-corner-bot">
        <motion.div
          style={{ transformOrigin: 'bottom center', display: 'inline-block' }}
          animate={{ rotate: [-7, 4, -7], y: [0, 4, 0] }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: [0.4, 0, 0.2, 1],
            times: [0, 0.45, 1],
          }}
        >
          <SparkRobot mode="2d" pose="wave" size="sm" />
        </motion.div>
        <motion.div
          style={{
            position: 'absolute',
            right: -10,
            bottom: 6,
            transformOrigin: '8px 4px',
            zIndex: 3,
          }}
          animate={{ rotate: [-55, -55, 22, 18, -55] }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
            times: [0, 0.12, 0.52, 0.65, 1.0],
          }}
        >
          <MiniShovel />
        </motion.div>
      </div>

      {/* Tiny sand mound under the bot. SVG with the same gradient family
          as the old SandboxHeroScene so the theme reads continuous. */}
      <svg
        className="sandbox-live-hero-corner-mound"
        viewBox="0 0 120 28"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="sbhMound" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="#d4952a" />
            <stop offset="50%" stopColor="#c07820" />
            <stop offset="100%" stopColor="#8b5e1a" />
          </linearGradient>
        </defs>
        <path
          d="M0 14 C20 4, 40 18, 60 8 C80 0, 100 16, 120 10 L120 28 L0 28 Z"
          fill="url(#sbhMound)"
        />
        <path
          d="M0 14 C20 4, 40 18, 60 8 C80 0, 100 16, 120 10"
          stroke="rgba(255,196,70,0.45)"
          strokeWidth="1.2"
          fill="none"
        />
      </svg>
    </div>
  );
}

function AmbientSparkles() {
  // A handful of slow-twinkling specks scattered across the hero so the
  // whole card feels alive, not just the corner. Positions deliberately
  // avoid the thumbnail's bounding box on the left.
  const sparkles = [
    { x: '55%', y: '8%',  s: 3, dur: 2.8, d: 0.2, c: 'var(--cyan)' },
    { x: '92%', y: '12%', s: 3, dur: 3.4, d: 0.7, c: '#a855f7' },
    { x: '70%', y: '34%', s: 2, dur: 2.6, d: 1.1, c: 'var(--cyan)' },
    { x: '46%', y: '48%', s: 2, dur: 3.1, d: 0.4, c: '#fbbf24' },
    { x: '88%', y: '52%', s: 3, dur: 2.3, d: 0.9, c: '#4dffb8' },
    { x: '60%', y: '62%', s: 2, dur: 3.7, d: 1.6, c: '#ff79b0' },
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
        <SandboxCornerScene />
        <div className="sandbox-live-hero-sand-strip" aria-hidden />
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

      {/* Digging-Spark corner scene + sand strip — brings the older
          SandboxHeroScene's personality back without overpowering the
          thumbnail. The corner scene anchors to the bottom-right; the
          strip is a soft amber gradient along the very bottom of the
          card so the bot reads as digging IN the box, not floating in
          front of it. */}
      <SandboxCornerScene />
      <div className="sandbox-live-hero-sand-strip" aria-hidden />
    </motion.div>
  );
}
