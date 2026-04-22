'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, CheckCircle, Clock } from 'lucide-react';

type Props = { exeUrl: string; yamlUrl: string };

type Platform = 'windows' | 'mac' | 'linux' | 'unknown';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'mac';
  if (ua.includes('linux')) return 'linux';
  return 'unknown';
}

const PLATFORM_TABS: { id: Platform; label: string; available: boolean }[] = [
  { id: 'windows', label: '🪟 Windows',         available: true  },
  { id: 'mac',     label: '🍎 macOS',           available: false },
  { id: 'linux',   label: '🐧 Linux',           available: false },
];

export function DownloadPageClient({ exeUrl }: Props) {
  const [platform, setPlatform] = useState<Platform>('windows');
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    const detected = detectPlatform();
    // Only switch tab if the detected platform has a real build; otherwise stay on windows
    if (detected === 'windows' || detected === 'mac' || detected === 'linux') {
      setPlatform(detected);
    }
  }, []);

  const handleDownload = () => {
    setDownloaded(true);
    window.open(exeUrl, '_blank', 'noopener');
    // Reset the button state after 5 s
    setTimeout(() => setDownloaded(false), 5000);
  };

  const activePlatform = PLATFORM_TABS.find((p) => p.id === platform)!;

  return (
    <div className="dl-hero-actions">
      {/* Platform selector tabs */}
      <div className="dl-platform-tabs">
        {PLATFORM_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`dl-platform-tab${platform === tab.id ? ' active' : ''}${!tab.available ? ' disabled' : ''}`}
            onClick={() => setPlatform(tab.id)}
          >
            {tab.label}
            {!tab.available && <span className="dl-platform-soon">soon</span>}
          </button>
        ))}
      </div>

      {/* Main download button */}
      {activePlatform.available ? (
        <motion.button
          type="button"
          className={`dl-btn-primary${downloaded ? ' downloaded' : ''}`}
          onClick={handleDownload}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 24 }}
        >
          {downloaded ? (
            <>
              <CheckCircle size={20} />
              Download started!
            </>
          ) : (
            <>
              <Download size={20} />
              Download for Windows
              <span className="dl-btn-size">~580 MB</span>
            </>
          )}
        </motion.button>
      ) : (
        <div className="dl-coming-soon-box">
          <Clock size={18} />
          <span>
            <strong>{activePlatform.label} build coming soon.</strong>{' '}
            In the meantime the simulator runs great on Windows.
          </span>
        </div>
      )}

      <p className="dl-meta">
        Version 1.0 · Free to download · Updates automatically
      </p>
    </div>
  );
}
