'use client';

import { motion, AnimatePresence } from 'framer-motion';

export type SparkPose = 'idle' | 'wave' | 'celebrate' | 'think' | 'point' | 'thumbsup' | 'surprised' | 'sad';
export type SparkSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

type Spark3DProps = { mode: '3d'; size?: SparkSize; showSpeech?: string | null; speechKey?: string | number; scene?: number };
type Spark2DProps = { mode: '2d'; pose?: SparkPose; size?: SparkSize; className?: string };
type SparkProps = Spark3DProps | Spark2DProps;

const SIZE_PX: Record<SparkSize, number> = { xs: 48, sm: 72, md: 100, lg: 140, xl: 200 };

type SceneConfig = {
  bgKey: string; propEmoji: string; propLeft: string; propTop: number; propScale: number; glowColor: string;
  lUpperR: number[]; lUpperDur: number; lLowerR: number[]; lLowerDur: number;
  rUpperR: number[]; rUpperDur: number; rLowerR: number[]; rLowerDur: number;
  bodyY: number[]; bodyDur: number; bodyRotateZ?: number[];
  headRotateZ?: number[]; headRotateY?: number[]; headDur: number;
  eyeHappy: boolean; chestBg: string; particleA: string; particleB: string;
  floaters: { emoji: string; x: number; y: number; delay: number; dur?: number }[];
};

const SCENES: SceneConfig[] = [
  {
    bgKey: 'welcome', propEmoji: '✨', propLeft: 'calc(50% + 88px)', propTop: 60, propScale: 1.8, glowColor: '#5de4ff',
    lUpperR: [0, -62, -70, -62, -70, -62, 0], lUpperDur: 0.92, lLowerR: [0, -28, -40, -28, -40, -28, 0], lLowerDur: 0.92,
    rUpperR: [8, 4, 8], rUpperDur: 3.8, rLowerR: [-8, -4, -8], rLowerDur: 3.8,
    bodyY: [0, -14, 0], bodyDur: 3.6, bodyRotateZ: [0, 2, -1, 0], headRotateZ: [0, 6, -4, 2, 0], headDur: 3.6,
    eyeHappy: false, chestBg: 'linear-gradient(135deg,#3b82f6,#5de4ff)', particleA: '#5de4ff', particleB: '#a855f7',
    floaters: [{ emoji: '✨', x: 9, y: 15, delay: 0.2, dur: 2.8 }, { emoji: '💫', x: 80, y: 28, delay: 0.6, dur: 3.2 }, { emoji: '⭐', x: 56, y: 6, delay: 1.0, dur: 3.6 }, { emoji: '🌟', x: 18, y: 72, delay: 0.4, dur: 2.6 }, { emoji: '💙', x: 72, y: 70, delay: 0.8, dur: 3.0 }],
  },
  {
    bgKey: 'guide', propEmoji: '🗺️', propLeft: 'calc(50% - 138px)', propTop: 130, propScale: 2.2, glowColor: '#6b7cff',
    lUpperR: [5, 8, 5], lUpperDur: 3.6, lLowerR: [-10, -6, -10], lLowerDur: 3.6,
    rUpperR: [-28, -25, -28], rUpperDur: 2.4, rLowerR: [-18, -14, -18], rLowerDur: 2.4,
    bodyY: [0, -12, 0], bodyDur: 4.2, headRotateY: [0, 10, 2, -4, 0], headDur: 4.8,
    eyeHappy: false, chestBg: 'linear-gradient(135deg,#6b7cff,#a855f7)', particleA: '#6b7cff', particleB: '#5de4ff',
    floaters: [{ emoji: '🔵', x: 8, y: 36, delay: 0.1, dur: 3.4 }, { emoji: '🟣', x: 82, y: 20, delay: 0.5, dur: 2.9 }, { emoji: '📡', x: 70, y: 65, delay: 0.9, dur: 3.1 }, { emoji: '⚙️', x: 16, y: 74, delay: 0.3, dur: 3.6 }],
  },
  {
    bgKey: 'celebrate', propEmoji: '🏆', propLeft: 'calc(50% - 22px)', propTop: 28, propScale: 2.6, glowColor: '#ffc96b',
    lUpperR: [-68, -75, -68, -75, -68], lUpperDur: 0.48, lLowerR: [-30, -42, -30, -42, -30], lLowerDur: 0.48,
    rUpperR: [-68, -75, -68, -75, -68], rUpperDur: 0.48, rLowerR: [-30, -42, -30, -42, -30], rLowerDur: 0.48,
    bodyY: [0, -24, -8, -24, 0], bodyDur: 0.96, bodyRotateZ: [0, -4, 4, -2, 0], headRotateZ: [0, -10, 10, -6, 0], headDur: 0.96,
    eyeHappy: true, chestBg: 'linear-gradient(135deg,#ffc96b,#ff9f40)', particleA: '#ffc96b', particleB: '#ff4fd8',
    floaters: [{ emoji: '🎉', x: 5, y: 10, delay: 0, dur: 2.4 }, { emoji: '⭐', x: 80, y: 8, delay: 0.25, dur: 2.8 }, { emoji: '🎊', x: 12, y: 64, delay: 0.5, dur: 2.6 }, { emoji: '✨', x: 74, y: 60, delay: 0.75, dur: 3.0 }, { emoji: '🎈', x: 42, y: 3, delay: 0.4, dur: 3.2 }, { emoji: '🏅', x: 62, y: 14, delay: 0.6, dur: 2.5 }],
  },
  {
    bgKey: 'adapt', propEmoji: '⚡', propLeft: 'calc(50% + 82px)', propTop: 155, propScale: 2.0, glowColor: '#4dffb8',
    lUpperR: [5, 8, 5], lUpperDur: 3.2, lLowerR: [-8, -4, -8], lLowerDur: 3.2,
    rUpperR: [-52, -50, -52], rUpperDur: 2.6, rLowerR: [22, 26, 22], rLowerDur: 2.6,
    bodyY: [0, -14, 0], bodyDur: 3.8, headRotateZ: [0, 4, -3, 0], headDur: 4.2,
    eyeHappy: true, chestBg: 'linear-gradient(135deg,#4dffb8,#1bb7d2)', particleA: '#4dffb8', particleB: '#6b7cff',
    floaters: [{ emoji: '💡', x: 10, y: 26, delay: 0.1, dur: 3.0 }, { emoji: '🚀', x: 80, y: 16, delay: 0.45, dur: 2.8 }, { emoji: '⚙️', x: 64, y: 68, delay: 0.8, dur: 3.4 }, { emoji: '🌈', x: 20, y: 72, delay: 0.35, dur: 2.6 }],
  },
];

export function SparkSceneBackground({ scene }: { scene: number }) {
  const cfg = SCENES[scene % SCENES.length] ?? SCENES[0];
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={cfg.bgKey}
        className={`spark3d-scene-bg spark3d-bg--${cfg.bgKey}`}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.65 }} aria-hidden
      />
    </AnimatePresence>
  );
}

function KinematicArm({ side, upperR, upperDur, lowerR, lowerDur }: {
  side: 'left' | 'right'; upperR: number[]; upperDur: number; lowerR: number[]; lowerDur: number;
}) {
  const isLeft = side === 'left';
  return (
    <div className={`spark3d-arm-mount spark3d-arm-mount--${side}`}>
      <motion.div
        className={`spark3d-upper-arm spark3d-upper-arm--${side}`}
        animate={{ rotate: upperR }}
        transition={{ duration: upperDur, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformOrigin: isLeft ? 'right center' : 'left center' }}
      >
        <div className="spark3d-arm-seg spark3d-arm-seg--upper" />
        <div className={`spark3d-shoulder-ball spark3d-shoulder-ball--${side}`} />
        <motion.div
          className={`spark3d-lower-arm spark3d-lower-arm--${side}`}
          animate={{ rotate: lowerR }}
          transition={{ duration: lowerDur, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: isLeft ? 'right center' : 'left center' }}
        >
          <div className="spark3d-arm-seg spark3d-arm-seg--lower" />
          <div className={`spark3d-elbow-ball spark3d-elbow-ball--${side}`} />
          <div className={`spark3d-hand spark3d-hand--${side}`}>
            <div className="spark3d-hand-knuckle" />
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

function Spark3D({ showSpeech, speechKey, size = 'xl', scene = 0 }: Omit<Spark3DProps, 'mode'>) {
  const px = SIZE_PX[size];
  const scale = px / 200;
  const cfg = SCENES[scene % SCENES.length] ?? SCENES[0];
  const blinkTimes = cfg.eyeHappy ? [0, 0.75, 0.78, 1] : [0, 0.84, 0.88, 1];

  return (
    <div className="spark3d-wrap" style={{ transform: `scale(${scale})`, transformOrigin: 'bottom center' }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={`prop-${cfg.bgKey}`}
          className="spark3d-prop"
          style={{ left: cfg.propLeft, top: cfg.propTop, fontSize: `${cfg.propScale}rem` }}
          initial={{ opacity: 0, scale: 0.2, rotate: -30, y: 20 }}
          animate={{ opacity: 1, scale: 1, rotate: [0, -8, 5, -3, 0], y: [0, -12, 0] }}
          exit={{ opacity: 0, scale: 0.3, rotate: 20, y: -12 }}
          transition={{
            opacity: { duration: 0.35 },
            scale: { type: 'spring', damping: 10, stiffness: 220, delay: 0.1 },
            rotate: { duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: 0.6 },
            y: { duration: 2.6, repeat: Infinity, ease: 'easeInOut', delay: 0.4 },
          }}
          aria-hidden
        >
          {cfg.propEmoji}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {showSpeech && (
          <motion.div
            key={speechKey}
            className="spark3d-speech"
            initial={{ opacity: 0, y: 10, scale: 0.88 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.94 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            {showSpeech}
            <span className="spark3d-speech-tail" />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="spark3d-character"
        animate={{ y: cfg.bodyY, rotateZ: cfg.bodyRotateZ ?? [0, 0] }}
        transition={{ duration: cfg.bodyDur, repeat: Infinity, ease: 'easeInOut' }}
      >
        <KinematicArm side="left" upperR={cfg.lUpperR} upperDur={cfg.lUpperDur} lowerR={cfg.lLowerR} lowerDur={cfg.lLowerDur} />
        <KinematicArm side="right" upperR={cfg.rUpperR} upperDur={cfg.rUpperDur} lowerR={cfg.rLowerR} lowerDur={cfg.rLowerDur} />

        <motion.div
          className="spark3d-head"
          animate={cfg.headRotateZ ? { rotateZ: cfg.headRotateZ } : { rotateY: cfg.headRotateY ?? [0, 6, 0, -6, 0] }}
          transition={{ duration: cfg.headDur, repeat: Infinity, ease: 'easeInOut' }}
          style={{ perspective: 700 }}
        >
          <div className="spark3d-head-shell">
            <div className="spark3d-head-spec" />
            <div className="spark3d-head-shine" />
            <div className="spark3d-head-seam" />
            <div className="spark3d-ear spark3d-ear--left"><div className="spark3d-ear-dot" /></div>
            <div className="spark3d-ear spark3d-ear--right"><div className="spark3d-ear-dot" /></div>
            <div className="spark3d-visor">
              <div className="spark3d-visor-sheen" />
              <div className="spark3d-visor-reflect" />
              {cfg.eyeHappy ? (
                <>
                  <div className="spark3d-eye-arc" />
                  <div className="spark3d-eye-arc" />
                </>
              ) : (
                <>
                  <motion.div
                    className="spark3d-eye spark3d-eye--left"
                    animate={{ scaleY: [1, 1, 0.06, 1], scaleX: [1, 1, 1.35, 1] }}
                    transition={{ duration: 4.5, repeat: Infinity, times: blinkTimes }}
                  >
                    <div className="spark3d-eye-iris" />
                    <div className="spark3d-eye-pupil" />
                    <div className="spark3d-eye-spec" />
                  </motion.div>
                  <motion.div
                    className="spark3d-eye spark3d-eye--right"
                    animate={{ scaleY: [1, 1, 0.06, 1], scaleX: [1, 1, 1.35, 1] }}
                    transition={{ duration: 4.5, repeat: Infinity, times: blinkTimes, delay: 0.07 }}
                  >
                    <div className="spark3d-eye-iris" />
                    <div className="spark3d-eye-pupil" />
                    <div className="spark3d-eye-spec" />
                  </motion.div>
                </>
              )}
            </div>
            <div className="spark3d-head-chin" />
          </div>
          <div className="spark3d-neck" />
        </motion.div>

        <motion.div
          className="spark3d-body"
          animate={{ scaleX: [1, 1.022, 1], scaleY: [1, 0.978, 1] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="spark3d-body-spec" />
          <div className="spark3d-body-shine" />
          <div className="spark3d-body-seam" />
          <AnimatePresence mode="wait">
            <motion.div
              key={`chest-${cfg.bgKey}`}
              className="spark3d-chest-core"
              style={{ background: cfg.chestBg }}
              animate={{ scale: [1, 1.12, 1], opacity: [0.88, 1, 0.88] }}
              transition={{ duration: 1.8, repeat: Infinity }}
            >
              <div className="spark3d-chest-inner" />
              <div className="spark3d-chest-ring" />
            </motion.div>
          </AnimatePresence>
          <div className="spark3d-body-rim-l" />
          <div className="spark3d-body-rim-r" />
          <div className="spark3d-shoulder-socket spark3d-shoulder-socket--l" />
          <div className="spark3d-shoulder-socket spark3d-shoulder-socket--r" />
        </motion.div>

        {[
          { s: 5, x: -62, y: 38, dur: 2.6, d: 0.0 },
          { s: 4, x: 70,  y: 28, dur: 3.1, d: 0.5 },
          { s: 6, x: -50, y: 90, dur: 2.2, d: 0.9 },
          { s: 3, x: 64,  y: 86, dur: 3.4, d: 0.3 },
          { s: 5, x: 4,   y: 18, dur: 2.8, d: 1.1 },
          { s: 4, x: -30, y: 132, dur: 3.0, d: 0.7 },
        ].map((p, i) => (
          <motion.div
            key={i}
            className="spark3d-particle"
            style={{
              width: p.s, height: p.s,
              left: `calc(50% + ${p.x}px)`, top: p.y,
              background: `radial-gradient(circle, ${i % 2 === 0 ? cfg.particleA : cfg.particleB}, transparent)`,
              boxShadow: `0 0 6px ${i % 2 === 0 ? cfg.particleA : cfg.particleB}88`,
            }}
            animate={{ y: [0, -(20 + i * 5), 0], opacity: [0.1, 0.88, 0.1], scale: [1, 1.7, 1] }}
            transition={{ duration: p.dur, repeat: Infinity, ease: 'easeInOut', delay: p.d }}
          />
        ))}

        <motion.div
          className="spark3d-shadow"
          animate={{ scaleX: [1, 0.72, 1], opacity: [0.28, 0.1, 0.28] }}
          transition={{ duration: cfg.bodyDur, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>
    </div>
  );
}

function SparkSVG({ pose = 'idle', size = 'md' }: { pose: SparkPose; size: SparkSize }) {
  const px = SIZE_PX[size];
  const leftArm: Record<SparkPose, string> = {
    idle: 'M30,90 Q18,85 14,95', wave: 'M30,85 Q10,65 14,50', celebrate: 'M30,85 Q12,68 8,52',
    think: 'M30,90 Q20,88 22,78', point: 'M30,90 Q18,85 14,95', thumbsup: 'M30,90 Q18,85 14,95',
    surprised: 'M30,85 Q14,72 10,60', sad: 'M30,95 Q18,98 12,102',
  };
  const rightArm: Record<SparkPose, string> = {
    idle: 'M90,90 Q102,85 106,95', wave: 'M90,90 Q102,85 106,95', celebrate: 'M90,85 Q108,68 112,52',
    think: 'M90,90 Q102,85 106,95', point: 'M90,85 Q108,75 115,68', thumbsup: 'M90,85 Q105,72 108,58',
    surprised: 'M90,85 Q106,72 110,60', sad: 'M90,95 Q102,98 108,102',
  };
  const fill = '#e8f0ff'; const accent = '#5de4ff'; const body = '#3b82f6'; const visor = '#0a1628';
  return (
    <svg viewBox="0 0 120 150" width={px} height={Math.round(px * 1.25)} fill="none">
      <defs>
        <radialGradient id={`hg-${pose}`} cx="38%" cy="28%" r="65%">
          <stop offset="0%" stopColor="#ffffff" /><stop offset="55%" stopColor="#d8e8ff" /><stop offset="100%" stopColor="#b0c8f0" />
        </radialGradient>
        <radialGradient id={`bg-${pose}`} cx="35%" cy="25%" r="70%">
          <stop offset="0%" stopColor="#ddeeff" /><stop offset="60%" stopColor="#b8d4f8" /><stop offset="100%" stopColor="#7aaae8" />
        </radialGradient>
        <filter id={`eg-${pose}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id={`ds-${pose}`} x="-20%" y="-10%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#1a3a6a" floodOpacity="0.25" />
        </filter>
      </defs>
      <ellipse cx="60" cy="148" rx="28" ry="5" fill="#1a3a6a" fillOpacity="0.18" />
      <ellipse cx="60" cy="110" rx="28" ry="22" fill={`url(#bg-${pose})`} stroke="#90b8e8" strokeWidth="1" filter={`url(#ds-${pose})`} />
      <ellipse cx="52" cy="100" rx="10" ry="6" fill="white" fillOpacity="0.35" />
      <circle cx="60" cy="112" r="6" fill={body} fillOpacity="0.9" />
      <circle cx="60" cy="112" r="4" fill={accent} />
      <circle cx="60" cy="112" r="3" fill="white" fillOpacity="0.6" />
      <path d={leftArm[pose]} stroke={fill} strokeWidth="8" strokeLinecap="round" />
      <path d={leftArm[pose]} stroke="#90b8e8" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d={rightArm[pose]} stroke={fill} strokeWidth="8" strokeLinecap="round" />
      <path d={rightArm[pose]} stroke="#90b8e8" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <ellipse cx="60" cy="52" rx="32" ry="36" fill={`url(#hg-${pose})`} stroke="#c0d8f5" strokeWidth="1" filter={`url(#ds-${pose})`} />
      <ellipse cx="48" cy="36" rx="14" ry="10" fill="white" fillOpacity="0.5" transform="rotate(-20 48 36)" />
      <rect x="22" y="46" width="5" height="14" rx="2.5" fill={fill} stroke="#90b8e8" strokeWidth="0.8" />
      <rect x="93" y="46" width="5" height="14" rx="2.5" fill={fill} stroke="#90b8e8" strokeWidth="0.8" />
      <rect x="32" y="44" width="56" height="22" rx="6" fill={visor} />
      <rect x="33" y="45" width="54" height="5" rx="3" fill="white" fillOpacity="0.06" />
      {(pose === 'celebrate' || pose === 'thumbsup') ? (
        <>
          <path d="M38,55 Q45,46 52,55" stroke={accent} strokeWidth="4" strokeLinecap="round" filter={`url(#eg-${pose})`} />
          <path d="M68,55 Q75,46 82,55" stroke={accent} strokeWidth="4" strokeLinecap="round" filter={`url(#eg-${pose})`} />
        </>
      ) : pose === 'sad' ? (
        <>
          <path d="M38,53 Q45,58 52,53" stroke={accent} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M68,53 Q75,58 82,53" stroke={accent} strokeWidth="3.5" strokeLinecap="round" />
        </>
      ) : pose === 'think' ? (
        <>
          <circle cx="45" cy="53" r="7" fill={accent} fillOpacity="0.9" filter={`url(#eg-${pose})`} />
          <path d="M68,53 Q75,49 82,53" stroke={accent} strokeWidth="3.5" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="45" cy="53" r="7.5" fill={accent} fillOpacity="0.15" />
          <circle cx="45" cy="53" r="6" fill={accent} fillOpacity="0.9" filter={`url(#eg-${pose})`} />
          <circle cx="43" cy="51" r="2" fill="white" fillOpacity="0.7" />
          <circle cx="75" cy="53" r="7.5" fill={accent} fillOpacity="0.15" />
          <circle cx="75" cy="53" r="6" fill={accent} fillOpacity="0.9" filter={`url(#eg-${pose})`} />
          <circle cx="73" cy="51" r="2" fill="white" fillOpacity="0.7" />
        </>
      )}
    </svg>
  );
}

export function SparkRobot(props: SparkProps) {
  if (props.mode === '3d') {
    const { mode: _m, ...rest } = props;
    return <Spark3D {...rest} />;
  }
  const { mode: _m, pose = 'idle', size = 'md', className } = props;
  return (
    <div className={`spark2d-wrap${className ? ` ${className}` : ''}`}>
      <SparkSVG pose={pose} size={size} />
    </div>
  );
}
