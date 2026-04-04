'use client';

import { NeonButton } from '@/components/neon-button';

type Props = {
  apiBase: string;
  onChanged: () => void;
};

async function send(apiBase: string, payload: Record<string, unknown>) {
  await fetch(`${apiBase}/api/sim/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function SimControls({ apiBase, onChanged }: Props) {
  const run = async (payload: Record<string, unknown>) => {
    await send(apiBase, payload);
    onChanged();
  };

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <NeonButton onClick={() => run({ camera_online: true, canvas_detected: true, canvas_confidence: 0.92, localization_confidence: 0.91, workflow_state: 'localized_idle', event: 'Localization simulated successfully' })}>Sim localize</NeonButton>
      <NeonButton onClick={() => run({ robot_connected: true, robot_status: 'idle', event: 'Robot link simulated as connected' })}>Sim connect robot</NeonButton>
      <NeonButton onClick={() => run({ workflow_state: 'preflight', event: 'Pre-flight checks started' })}>Sim pre-flight</NeonButton>
      <NeonButton onClick={() => run({ workflow_state: 'executing', pen_down: true, robot_status: 'drawing', event: 'Execution simulated: drawing started' })}>Sim execute</NeonButton>
      <NeonButton onClick={() => run({ robot_x_mm: 180, robot_y_mm: 120, robot_heading_deg: 38, event: 'Robot pose updated in simulation' })}>Move pose</NeonButton>
      <NeonButton variant="danger" onClick={() => run({ workflow_state: 'error', robot_status: 'fault', pen_down: false, event: 'Simulated fault raised for recovery testing' })}>Sim fault</NeonButton>
    </div>
  );
}
