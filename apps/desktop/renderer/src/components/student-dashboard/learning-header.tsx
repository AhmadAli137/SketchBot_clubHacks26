'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { ArrowLeft, ChevronDown, Map } from 'lucide-react';

import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { AGE_GROUP_META, type AgeGroup } from '@/lib/concept-types';
import { getConceptPreviews } from '@/lib/concept-catalog';

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
  onBackToHome,
  onAgeGroupChange,
  onOpenConceptMap,
  onConceptSelect,
  onToggleSystemStatus,
  onClosePopover,
}: LearningHeaderProps) {
  const systemPanelRef = useRef<HTMLDivElement | null>(null);
  const conceptDropdownRef = useRef<HTMLDivElement | null>(null);
  const ageDropdownRef = useRef<HTMLDivElement | null>(null);
  const [showConceptDropdown, setShowConceptDropdown] = useState(false);
  const [showAgeDropdown, setShowAgeDropdown] = useState(false);

  const conceptPreviews = useMemo(() => getConceptPreviews(), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClosePopover();
        setShowConceptDropdown(false);
        setShowAgeDropdown(false);
      }
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (systemPanelRef.current?.contains(target)) return;
      if (conceptDropdownRef.current?.contains(target)) return;
      if (ageDropdownRef.current?.contains(target)) return;
      onClosePopover();
      setShowConceptDropdown(false);
      setShowAgeDropdown(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [onClosePopover]);

  return (
    <>
      <header className="learn-header">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBackToHome}
          title="Back to main menu"
          className="rounded-[var(--radius-md)]"
        >
          <ArrowLeft size={13} />
          Menu
        </Button>

        <div className="learn-header-brand">
          <div className="learn-header-logo">✏️</div>
          <span className="learn-header-name">SketchBot</span>
        </div>

        <div className="learn-header-divider" />

        <div className="learn-concept-picker-wrapper" ref={conceptDropdownRef}>
          <button
            type="button"
            className="learn-concept-picker"
            title={conceptTitle}
            onClick={() => setShowConceptDropdown((v) => !v)}
          >
            <span className="learn-concept-emoji">{conceptId ? '🗺️' : '✏️'}</span>
            <span className="learn-concept-name">{conceptTitle}</span>
            <ChevronDown size={12} style={{ opacity: 0.5, flexShrink: 0, transition: 'transform 120ms', transform: showConceptDropdown ? 'rotate(180deg)' : undefined }} />
          </button>

          {showConceptDropdown && (
            <div className="concept-dropdown">
              <button
                type="button"
                className={`concept-dropdown-item ${!conceptId ? 'active' : ''}`}
                onClick={() => {
                  onConceptSelect?.('', 'Free Draw');
                  setShowConceptDropdown(false);
                }}
              >
                <span className="concept-dropdown-emoji">✏️</span>
                <div className="concept-dropdown-text">
                  <span className="concept-dropdown-title">Free Draw</span>
                  <span className="concept-dropdown-sub">Open-ended creative drawing</span>
                </div>
              </button>
              {conceptPreviews.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`concept-dropdown-item ${conceptId === c.id ? 'active' : ''}`}
                  onClick={() => {
                    onConceptSelect?.(c.id, c.title);
                    setShowConceptDropdown(false);
                  }}
                >
                  <span className="concept-dropdown-emoji">{c.emoji}</span>
                  <div className="concept-dropdown-text">
                    <span className="concept-dropdown-title">{c.title}</span>
                    <span className="concept-dropdown-sub">{c.subtitle}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="learn-header-spacer" />

        <div className="learn-concept-picker-wrapper" ref={ageDropdownRef}>
          <button
            type="button"
            className="learn-concept-picker"
            title={AGE_GROUP_META[ageGroup].description}
            onClick={() => setShowAgeDropdown((v) => !v)}
          >
            <span className="learn-concept-emoji">{AGE_GROUP_META[ageGroup].emoji}</span>
            <span className="learn-concept-name">{AGE_GROUP_META[ageGroup].label}</span>
            <ChevronDown size={12} style={{ opacity: 0.5, flexShrink: 0, transition: 'transform 120ms', transform: showAgeDropdown ? 'rotate(180deg)' : undefined }} />
          </button>

          {showAgeDropdown && (
            <div className="concept-dropdown">
              {(Object.entries(AGE_GROUP_META) as [AgeGroup, (typeof AGE_GROUP_META)[AgeGroup]][]).map(([nextAgeGroup, meta]) => (
                <button
                  key={nextAgeGroup}
                  type="button"
                  className={`concept-dropdown-item ${ageGroup === nextAgeGroup ? 'active' : ''}`}
                  onClick={() => {
                    onAgeGroupChange(nextAgeGroup);
                    setShowAgeDropdown(false);
                  }}
                >
                  <span className="concept-dropdown-emoji">{meta.emoji}</span>
                  <div className="concept-dropdown-text">
                    <span className="concept-dropdown-title">{meta.label}</span>
                    <span className="concept-dropdown-sub">{meta.description}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="learn-header-divider" />

        <button
          type="button"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 8, flexShrink: 0, whiteSpace: 'nowrap' }}
          onClick={onToggleSystemStatus}
          title={sysLabel}
        >
          <div className={`learn-sys-dot ${sysStatus}`} />
          <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 600 }}>{sysLabel}</span>
        </button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenConceptMap}
          title="Knowledge Map"
          className="rounded-[var(--radius-md)]"
        >
          <Map size={13} />
          Map
        </Button>

        <ThemeToggle />
      </header>

      {showSystemStatus && (
        <div className="learn-popover learn-system-popover" ref={systemPanelRef}>
          {topStatus.map(({ label, value }) => (
            <div key={label} className="learn-popover-row">
              <span className="learn-popover-label">{label}</span>
              <span className="learn-popover-value">{value}</span>
            </div>
          ))}
          <div className="learn-popover-foot">
            {showSimulator ? 'Hardware offline — using Simulator' : 'Hardware active'}
          </div>
        </div>
      )}
    </>
  );
}
