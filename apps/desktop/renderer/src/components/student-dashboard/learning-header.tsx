'use client';

import Image from 'next/image';
import { ArrowLeft, Camera, ChevronDown, Map, QrCode } from 'lucide-react';

import { ThemeToggle } from '@/components/theme-toggle';
import { AGE_GROUP_META, type AgeGroup } from '@/lib/concept-types';

import type { LearningHeaderProps } from './types';

export function LearningHeader({
  conceptId,
  conceptTitle,
  ageGroup,
  sysStatus,
  sysLabel,
  topStatus,
  showSimulator,
  showSystemStatus,
  showCameraControls,
  sourceSaving,
  cameraSource,
  browserCameraStatus,
  companionConnectionStatus,
  backendLinkCopied,
  cameraBuddyQrUrl,
  onBackToHome,
  onAgeGroupChange,
  onOpenConceptMap,
  onToggleSystemStatus,
  onToggleCameraControls,
  onCloseCameraControls,
  onActivateCompanionCamera,
  onActivateBrowserCamera,
  onCopyBackendUrl,
}: LearningHeaderProps) {
  return (
    <>
      <header className="learn-header">
        <button
          type="button"
          className="btn-ghost"
          style={{ minHeight: 32, fontSize: '0.72rem', padding: '4px 8px', gap: 4 }}
          onClick={onBackToHome}
          title="Back to main menu"
        >
          <ArrowLeft size={13} />
          Menu
        </button>

        <div className="learn-header-brand">
          <div className="learn-header-logo">✏️</div>
          <span className="learn-header-name">SketchBot</span>
        </div>

        <div className="learn-header-divider" />

        <div className="learn-concept-picker" title={conceptTitle}>
          <span className="learn-concept-emoji">{conceptId ? '🗺️' : '✏️'}</span>
          <span className="learn-concept-name">{conceptTitle}</span>
          <ChevronDown size={12} style={{ opacity: 0.5, flexShrink: 0 }} />
        </div>

        <div className="learn-header-spacer" />

        <div className="learn-age-selector">
          {(Object.entries(AGE_GROUP_META) as [AgeGroup, (typeof AGE_GROUP_META)[AgeGroup]][]).map(([nextAgeGroup, meta]) => (
            <button
              key={nextAgeGroup}
              type="button"
              className={`learn-age-btn ${ageGroup === nextAgeGroup ? 'active' : ''}`}
              onClick={() => onAgeGroupChange(nextAgeGroup)}
              title={meta.description}
            >
              {meta.emoji} {meta.label}
            </button>
          ))}
        </div>

        <div className="learn-header-divider" />

        <button
          type="button"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 8 }}
          onClick={onToggleSystemStatus}
          title={sysLabel}
        >
          <div className={`learn-sys-dot ${sysStatus}`} />
          <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 600 }}>{sysLabel}</span>
        </button>

        <button
          type="button"
          className="btn-ghost"
          style={{ minHeight: 30, fontSize: '0.72rem', padding: '4px 8px', gap: 4 }}
          onClick={onOpenConceptMap}
          title="Knowledge Map"
        >
          <Map size={13} />
          Map
        </button>

        <button
          type="button"
          className="btn-ghost"
          style={{ minHeight: 30, fontSize: '0.72rem', padding: '4px 8px', gap: 4 }}
          onClick={onToggleCameraControls}
        >
          <Camera size={13} />
          Connect camera
        </button>

        <ThemeToggle />
      </header>

      {showSystemStatus && (
        <div
          style={{
            position: 'absolute',
            top: 58,
            right: 14,
            zIndex: 50,
            width: 240,
            borderRadius: 14,
            border: '1px solid var(--border)',
            background: 'var(--panel)',
            backdropFilter: 'blur(20px)',
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
          }}
        >
          {topStatus.map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
              <span style={{ color: 'var(--muted)' }}>{label}</span>
              <span style={{ color: 'var(--text)', fontWeight: 600 }}>{value}</span>
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, fontSize: '0.72rem', color: 'var(--muted)' }}>
            {showSimulator ? 'Hardware offline — using Simulator' : 'Hardware active'}
          </div>
        </div>
      )}

      {showCameraControls && (
        <div
          style={{
            position: 'absolute',
            top: 58,
            right: 14,
            zIndex: 50,
            width: 260,
            borderRadius: 14,
            border: '1px solid var(--border)',
            background: 'var(--panel)',
            backdropFilter: 'blur(20px)',
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
          }}
          onMouseLeave={onCloseCameraControls}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Camera Source
          </div>
          <button className="btn-cta" type="button" disabled={sourceSaving} onClick={onActivateCompanionCamera} style={{ minHeight: 36 }}>
            <QrCode size={14} />
            Camera Buddy (Phone)
          </button>
          <button className="btn-ghost" type="button" disabled={sourceSaving} onClick={onActivateBrowserCamera} style={{ justifyContent: 'center' }}>
            <Camera size={13} />
            This Device
          </button>
          {cameraBuddyQrUrl && (
            <div className="learn-camera-mini-qr">
              <Image src={cameraBuddyQrUrl} alt="Camera Buddy QR code" width={108} height={108} unoptimized />
              <div className="learn-camera-mini-qr-copy">
                <strong>Scan in Camera Buddy</strong>
                <button type="button" className="btn-ghost" style={{ minHeight: 30 }} onClick={onCopyBackendUrl}>
                  {backendLinkCopied ? 'Copied' : 'Copy link'}
                </button>
              </div>
            </div>
          )}
          <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--muted)', lineHeight: 1.5 }}>
            {cameraSource === 'browser-camera' ? browserCameraStatus : companionConnectionStatus}
          </p>
        </div>
      )}
    </>
  );
}
