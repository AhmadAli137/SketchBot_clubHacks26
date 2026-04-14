'use client';

import { useState } from 'react';

import { useDesktopShell } from '@/lib/desktop-shell';

export function DesktopRuntimeBanner() {
  const { available, launchState, pairingTargets, retryLaunch } = useDesktopShell();
  const [retrying, setRetrying] = useState(false);

  if (!available || launchState.phase === 'ready') {
    return null;
  }

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await retryLaunch();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <section className={`desktop-runtime-banner ${launchState.phase === 'error' ? 'error' : 'starting'}`}>
      <div className="desktop-runtime-copy">
        <p className="desktop-runtime-eyebrow">Desktop runtime</p>
        <strong>{launchState.message}</strong>
        {launchState.detail ? <span>{launchState.detail}</span> : null}
        {pairingTargets.length ? (
          <div className="desktop-runtime-targets">
            {pairingTargets.slice(0, 2).map((target) => (
              <code key={target}>{target}</code>
            ))}
          </div>
        ) : null}
      </div>
      {launchState.phase === 'error' ? (
        <button className="btn" type="button" onClick={() => void handleRetry()} disabled={retrying}>
          {retrying ? 'Retrying...' : 'Retry startup'}
        </button>
      ) : (
        <div className="desktop-runtime-pulse" aria-hidden="true" />
      )}
    </section>
  );
}
