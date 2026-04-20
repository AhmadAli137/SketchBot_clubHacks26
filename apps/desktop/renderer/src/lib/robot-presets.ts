export type RobotPresetId = 'orbit' | 'boxy' | 'pulse' | 'mech' | 'nano' | 'spark';

export type RobotPresetMeta = {
  id: RobotPresetId;
  label: string;
  description: string;
};

export const ROBOT_PRESETS: RobotPresetMeta[] = [
  { id: 'orbit', label: 'Orbit', description: 'Round & friendly' },
  { id: 'boxy', label: 'Boxy', description: 'Sturdy builder' },
  { id: 'pulse', label: 'Pulse', description: 'Tall & expressive' },
  { id: 'mech', label: 'Mech', description: 'Angled plates' },
  { id: 'nano', label: 'Nano', description: 'Compact scout' },
  { id: 'spark', label: 'Spark', description: 'Playful antennas' },
];

export const DEFAULT_ROBOT_PRESET: RobotPresetId = 'orbit';

export function isRobotPresetId(s: string | undefined): s is RobotPresetId {
  return ROBOT_PRESETS.some((p) => p.id === s);
}
