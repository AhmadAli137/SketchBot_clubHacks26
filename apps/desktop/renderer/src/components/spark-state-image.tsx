'use client';

/**
 * SparkStateImage — renders a polished pre-rendered illustration for the
 * current Spark scene. One image per state, lives at
 * `/assets/spark-states/{slug}.png`. See `docs/spark-state-images.md` for the
 * full image spec + generation prompts.
 *
 * Behaviour:
 *  • Crossfades + scales in when the scene changes (AnimatePresence)
 *  • Subtle idle bob while a state is active
 *  • Falls back to the procedural <SparkRobot> CSS rig when the image is
 *    missing or fails to load — so face mode still works while a designer
 *    or AI image gen is filling in the asset set
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

import { SparkRobot, SPARK_SCENES, type SparkSceneId } from '@/components/spark-robot';

const IMAGE_BASE = '/assets/spark-states';
const IMAGE_EXT  = 'png';

/** Reverse lookup: scene number → name. */
const NAME_BY_SCENE: Record<number, SparkSceneId> = Object.entries(SPARK_SCENES).reduce(
  (acc, [name, num]) => {
    acc[num as number] = name as SparkSceneId;
    return acc;
  },
  {} as Record<number, SparkSceneId>,
);

/** SPARK_SCENES.WAVE → "wave"; SPARK_SCENES.POINT_LEFT → "point-left" */
function sceneSlug(scene: number): string {
  const name = NAME_BY_SCENE[scene] ?? 'IDLE';
  return name.toLowerCase().replace(/_/g, '-');
}

type Props = {
  /** SPARK_SCENES value (0–23) */
  scene: number;
  /** Voice-linked art variant. Mark uses the root image set; Lori uses /lori. */
  variant?: 'mark' | 'lori';
  /** Square render size in CSS pixels. */
  size?: number;
  className?: string;
};

export function SparkStateImage({ scene, variant = 'mark', size = 320, className }: Props) {
  const slug = sceneSlug(scene);
  const [missing, setMissing] = useState<Record<string, boolean>>({});
  const assetPath =
    variant === 'lori'
      ? `${IMAGE_BASE}/lori/${slug}.${IMAGE_EXT}`
      : `${IMAGE_BASE}/${slug}.${IMAGE_EXT}`;
  const missingKey = `${variant}:${slug}`;

  // If we know this image is missing → fall back to the CSS rig.
  if (missing[missingKey]) {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
        }}
      >
        <SparkRobot mode="3d" size="lg" scene={scene} showProp />
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{ width: size, height: size, position: 'relative' }}
      aria-label={`Spark in ${slug.replace(/-/g, ' ')} state`}
      role="img"
    >
      <AnimatePresence mode="wait">
        <motion.img
          key={`${variant}-${slug}`}
          src={assetPath}
          alt=""
          aria-hidden="true"
          onError={() => setMissing((m) => ({ ...m, [missingKey]: true }))}
          loading="eager"
          decoding="async"
          initial={{ opacity: 0, scale: 0.92, y: 14 }}
          animate={{
            opacity: 1,
            scale: 1,
            y: [0, -8, 0],
          }}
          exit={{ opacity: 0, scale: 0.96, y: -10 }}
          transition={{
            opacity: { duration: 0.28 },
            scale:   { duration: 0.34, ease: [0.22, 1, 0.36, 1] },
            // Slow idle bob (overrides the y entrance after first frame)
            y:       { duration: 3.6, repeat: Infinity, ease: 'easeInOut', delay: 0.34 },
          }}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            filter: 'drop-shadow(0 18px 36px rgba(168, 85, 247, 0.22))',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
          draggable={false}
        />
      </AnimatePresence>
    </div>
  );
}
