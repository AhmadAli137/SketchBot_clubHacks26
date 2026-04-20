'use client';

import { motion, AnimatePresence } from 'framer-motion';

export type SparkPose =
  | 'idle' | 'wave' | 'celebrate' | 'think'
  | 'point' | 'thumbsup' | 'surprised' | 'sad';

export type SparkSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_PX: Record<SparkSize, number> = { xs: 48, sm: 72, md: 100, lg: 140, xl: 200 };

type EmotionConfig = { emoji: string; bg: string; glow: string; bounce: boolean };

const POSE_CONFIG: Record<SparkPose, EmotionConfig> = {
  idle:      { emoji: '🤖', bg: 'rgba(93,228,255,0.12)',  glow: 'rgba(93,228,255,0.25)',  bounce: false },
  wave:      { emoji: '🤩', bg: 'rgba(255,184,77,0.12)',  glow: 'rgba(255,184,77,0.3)',   bounce: true  },
  celebrate: { emoji: '🎉', bg: 'rgba(77,255,184,0.14)',  glow: 'rgba(77,255,184,0.35)',  bounce: true  },
  think:     { emoji: '💭', bg: 'rgba(107,124,255,0.12)', glow: 'rgba(107,124,255,0.2)',  bounce: false },
  point:     { emoji: '💪', bg: 'rgba(93,228,255,0.12)',  glow: 'rgba(93,228,255,0.25)',  bounce: false },
  thumbsup:  { emoji: '💪', bg: 'rgba(77,255,184,0.12)',  glow: 'rgba(77,255,184,0.3)',   bounce: false },
  surprised: { emoji: '🤔', bg: 'rgba(107,124,255,0.12)', glow: 'rgba(107,124,255,0.3)',  bounce: false },
  sad:       { emoji: '😔', bg: 'rgba(93,228,255,0.08)',  glow: 'rgba(93,228,255,0.12)',  bounce: false },
};

type Spark3DProps = {
  mode: '3d';
  size?: SparkSize;
  showSpeech?: string | null;
  speechKey?: string | number;
  scene?: number;
};

type Spark2DProps = { mode: '2d'; pose?: SparkPose; size?: SparkSize; className?: string };
type SparkProps = Spark3DProps | Spark2DProps;

const SCENE_POSES: SparkPose[] = ['wave', 'think', 'celebrate', 'point'];

function SparkAvatar({ pose, size = 'md' }: { pose: SparkPose; size?: SparkSize }) {
  const px = SIZE_PX[size];
  const cfg = POSE_CONFIG[pose] ?? POSE_CONFIG.idle;
  const radius = Math.round(px * 0.3);

  return (
    <div
      className="spark-avatar-shell"
      style={{
        width: px,
        height: px,
        borderRadius: radius,
        background: cfg.bg,
        boxShadow: `0 0 ${px * 0.45}px ${cfg.glow}`,
      }}
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={pose}
          className="spark-avatar-emoji"
          style={{ fontSize: px * 0.48 }}
          initial={{ scale: 0.4, opacity: 0, rotate: -15 }}
          animate={{
            scale: 1,
            opacity: 1,
            rotate: 0,
            y: cfg.bounce ? [0, -Math.round(px * 0.06), 0] : 0,
          }}
          exit={{ scale: 0.4, opacity: 0, rotate: 15 }}
          transition={{
            duration: 0.3,
            y: cfg.bounce
              ? { repeat: Infinity, repeatType: 'loop', duration: 0.8, ease: 'easeInOut' }
              : undefined,
          }}
        >
          {cfg.emoji}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

export function SparkSceneBackground({ scene }: { scene: number }) {
  const colors = [
    'rgba(79,142,255,0.15)',
    'rgba(139,92,246,0.15)',
    'rgba(34,211,238,0.15)',
    'rgba(245,158,11,0.15)',
  ];
  const color = colors[scene % colors.length];
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={scene}
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at center, ${color} 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.65 }}
        aria-hidden
      />
    </AnimatePresence>
  );
}

export function SparkRobot(props: SparkProps) {
  if (props.mode === '3d') {
    const pose: SparkPose = SCENE_POSES[(props.scene ?? 0) % SCENE_POSES.length];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        {props.showSpeech && (
          <AnimatePresence mode="wait">
            <motion.div
              key={props.speechKey}
              className="spark3d-speech"
              initial={{ opacity: 0, y: 10, scale: 0.88 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.94 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] as never }}
            >
              {props.showSpeech}
              <span className="spark3d-speech-tail" />
            </motion.div>
          </AnimatePresence>
        )}
        <SparkAvatar pose={pose} size={props.size ?? 'xl'} />
      </div>
    );
  }

  const { pose = 'idle', size = 'md', className } = props;
  return (
    <div className={`spark2d-wrap${className ? ` ${className}` : ''}`}>
      <SparkAvatar pose={pose} size={size} />
    </div>
  );
}
