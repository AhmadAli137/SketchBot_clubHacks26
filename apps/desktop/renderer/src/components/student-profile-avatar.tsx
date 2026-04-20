'use client';

import type { ProfileAvatarKind } from '@/lib/concept-types';
import { DEFAULT_ROBOT_PRESET, isRobotPresetId } from '@/lib/robot-presets';
import { RobotAvatarPreset } from '@/components/robot-avatar-preset';

type StudentProfileAvatarProps = {
  kind: ProfileAvatarKind | undefined;
  emoji: string;
  robotPresetId: string | undefined;
  accent: string;
  size?: number;
  className?: string;
};

export function StudentProfileAvatar({
  kind,
  emoji,
  robotPresetId,
  accent,
  size = 36,
  className,
}: StudentProfileAvatarProps) {
  const preset = isRobotPresetId(robotPresetId) ? robotPresetId : DEFAULT_ROBOT_PRESET;

  if (kind === 'robot') {
    return (
      <span
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          borderRadius: 999,
          background: `color-mix(in srgb, ${accent} 22%, transparent)`,
          flexShrink: 0,
        }}
      >
        <RobotAvatarPreset preset={preset} accent={accent} size={Math.round(size * 0.78)} />
      </span>
    );
  }

  return (
    <span
      className={className}
      style={{
        fontSize: Math.round(size * 0.62),
        lineHeight: 1,
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 999,
        background: `color-mix(in srgb, ${accent} 35%, transparent)`,
        flexShrink: 0,
      }}
    >
      {emoji || '🤖'}
    </span>
  );
}
