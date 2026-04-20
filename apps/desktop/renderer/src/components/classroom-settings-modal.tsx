'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';

import { Button } from '@/components/ui/button';
import { getConceptPreviews, type ConceptPreview } from '@/lib/concept-catalog';
import {
  loadClassroomProfile,
  saveClassroomProfile,
  saveLessonDraft,
  type LessonDraft,
} from '@/lib/classroom-profile';
import type { ClassroomProfile, ClassroomRestrictions } from '@/lib/platform-types';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';

const CONCEPTS: ConceptPreview[] = getConceptPreviews();

type Tab = 'roster' | 'policies' | 'lessons';

type ClassroomSettingsModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved: (profile: ClassroomProfile) => void;
  onStartLessonPlanning: (conceptId: string, title: string, starterPrompt: string) => void;
};

function normalizeProfile(p: ClassroomProfile): ClassroomProfile {
  return {
    ...p,
    students: [...new Set(p.students.map((s) => s.trim()).filter(Boolean))],
    bots: [...new Set(p.bots.map((s) => s.trim()).filter(Boolean))],
    restrictions: {
      allowedConceptIds: p.restrictions?.allowedConceptIds ?? null,
      disableFreeDraw: Boolean(p.restrictions?.disableFreeDraw),
      disableUpload: Boolean(p.restrictions?.disableUpload),
      maxTutorHintsPerSession: p.restrictions?.maxTutorHintsPerSession,
    },
  };
}

export function ClassroomSettingsModal({
  open,
  onClose,
  onSaved,
  onStartLessonPlanning,
}: ClassroomSettingsModalProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [tab, setTab] = useState<Tab>('roster');
  const [classroomName, setClassroomName] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [rosterInput, setRosterInput] = useState('');
  const [students, setStudents] = useState<string[]>([]);
  const [limitTopics, setLimitTopics] = useState(false);
  const [allowedSet, setAllowedSet] = useState<Set<string>>(new Set());
  const [disableFreeDraw, setDisableFreeDraw] = useState(false);
  const [disableUpload, setDisableUpload] = useState(false);
  const [maxHints, setMaxHints] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    const p = loadClassroomProfile();
    setClassroomName(p.classroomName);
    setTeacherName(p.teacherName);
    setStudents(p.students);
    const ids = p.restrictions?.allowedConceptIds;
    setLimitTopics(Boolean(ids && ids.length > 0));
    setAllowedSet(new Set(ids ?? []));
    setDisableFreeDraw(Boolean(p.restrictions?.disableFreeDraw));
    setDisableUpload(Boolean(p.restrictions?.disableUpload));
    const mh = p.restrictions?.maxTutorHintsPerSession;
    setMaxHints(mh !== undefined && mh > 0 ? String(mh) : '');
  }, [open]);

  const restrictionsPayload = useMemo((): ClassroomRestrictions => {
    const max = parseInt(maxHints, 10);
    return {
      allowedConceptIds: limitTopics ? [...allowedSet] : null,
      disableFreeDraw,
      disableUpload,
      maxTutorHintsPerSession: Number.isFinite(max) && max > 0 ? max : undefined,
    };
  }, [limitTopics, allowedSet, disableFreeDraw, disableUpload, maxHints]);

  const handleSave = () => {
    const profile = normalizeProfile({
      classroomName: classroomName.trim(),
      teacherName: teacherName.trim(),
      students,
      bots: loadClassroomProfile().bots,
      restrictions: restrictionsPayload,
    });
    saveClassroomProfile(profile);
    onSaved(profile);
    onClose();
  };

  const addStudent = () => {
    const name = rosterInput.trim();
    if (!name) return;
    setStudents((prev) => [...new Set([...prev, name])]);
    setRosterInput('');
  };

  const removeStudent = (name: string) => {
    setStudents((prev) => prev.filter((s) => s !== name));
  };

  const toggleAllowed = (id: string) => {
    setAllowedSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startLesson = (c: ConceptPreview) => {
    const draft: LessonDraft = {
      templateConceptId: c.id,
      templateTitle: c.title,
      notes: '',
      updatedAt: new Date().toISOString(),
    };
    saveLessonDraft(draft);
    onStartLessonPlanning(c.id, c.title, c.starterPrompt);
    onClose();
  };

  if (!open) return null;

  return (
    <motion.div
      className="profile-modal-overlay"
      initial={{ opacity: reducedMotion ? 1 : 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: reducedMotion ? 1 : 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.2 }}
      onClick={onClose}
      style={{ zIndex: 50 }}
    >
      <motion.div
        className="profile-modal"
        style={{ maxWidth: 560, width: '100%', maxHeight: 'min(90vh, 720px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        initial={reducedMotion ? false : { opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={reducedMotion ? undefined : { opacity: 0, scale: 0.98, y: 8 }}
        transition={{ duration: reducedMotion ? 0 : 0.26, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>Classroom</h3>
        <p style={{ fontSize: '0.88rem', color: 'var(--muted)', marginBottom: 12 }}>
          Roster and policies are stored on this device for sign-in chips and student restrictions.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {(['roster', 'policies', 'lessons'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`profile-look-opt ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}
              style={{ textTransform: 'capitalize' }}
            >
              {t === 'lessons' ? 'Lesson templates' : t}
            </button>
          ))}
        </div>

        <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
          {tab === 'roster' && (
            <div className="space-y-4">
              <label className="profile-form-row" style={{ display: 'block' }}>
                <span>Classroom display name</span>
                <input
                  className="profile-bio-input"
                  value={classroomName}
                  onChange={(e) => setClassroomName(e.target.value)}
                  placeholder="e.g. Period 3 Robotics"
                />
              </label>
              <label className="profile-form-row" style={{ display: 'block' }}>
                <span>Teacher name (shown in companion / exports)</span>
                <input
                  className="profile-bio-input"
                  value={teacherName}
                  onChange={(e) => setTeacherName(e.target.value)}
                  placeholder="Your name"
                />
              </label>
              <div>
                <span style={{ display: 'block', marginBottom: 8 }}>Students on this device</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    className="profile-bio-input"
                    style={{ flex: 1, minWidth: 160 }}
                    value={rosterInput}
                    onChange={(e) => setRosterInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addStudent();
                      }
                    }}
                    placeholder="Add student name"
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={addStudent}>
                    Add
                  </Button>
                </div>
                {students.length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: 8 }}>No students yet — they can still type any name at sign-in.</p>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {students.map((name) => (
                      <li
                        key={name}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 10px',
                          borderRadius: 10,
                          border: '1px solid rgba(120,140,255,0.2)',
                          background: 'rgba(5,8,22,0.5)',
                        }}
                      >
                        <span>{name}</span>
                        <button
                          type="button"
                          className="btn-ghost"
                          style={{ padding: '2px 8px', fontSize: '0.85rem' }}
                          onClick={() => removeStudent(name)}
                          aria-label={`Remove ${name}`}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {tab === 'policies' && (
            <div className="space-y-4">
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={limitTopics}
                  onChange={(e) => setLimitTopics(e.target.checked)}
                />
                <span>Limit which lesson topics students can open</span>
              </label>
              {limitTopics && (
                <div
                  style={{
                    maxHeight: 220,
                    overflowY: 'auto',
                    border: '1px solid rgba(120,140,255,0.16)',
                    borderRadius: 12,
                    padding: 10,
                  }}
                >
                  <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={allowedSet.has('free-draw')}
                      onChange={() => toggleAllowed('free-draw')}
                    />
                    <span>Free Draw (open prompt)</span>
                  </label>
                  {CONCEPTS.map((c) => (
                    <label key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={allowedSet.has(c.id)} onChange={() => toggleAllowed(c.id)} />
                      <span>
                        {c.emoji} {c.title}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={disableFreeDraw} onChange={(e) => setDisableFreeDraw(e.target.checked)} />
                <span>Disable Free Draw for students</span>
              </label>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={disableUpload} onChange={(e) => setDisableUpload(e.target.checked)} />
                <span>Disable image / SVG upload in the prompt bar</span>
              </label>
              <label className="profile-form-row" style={{ display: 'block' }}>
                <span>Max tutor “hint” taps per session (empty = unlimited)</span>
                <input
                  className="profile-bio-input"
                  inputMode="numeric"
                  value={maxHints}
                  onChange={(e) => setMaxHints(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 5"
                />
              </label>
            </div>
          )}

          {tab === 'lessons' && (
            <div>
              <p style={{ fontSize: '0.88rem', color: 'var(--muted)', marginBottom: 12 }}>
                Start from a topic template, then launch a session and use the tutor as your co-planner. Chat is logged with your teacher role for review in Supabase audit tables when enabled.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {CONCEPTS.slice(0, 24).map((c) => (
                  <div
                    key={c.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: '1px solid rgba(120,140,255,0.16)',
                      background: 'rgba(5,8,22,0.45)',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>
                        {c.emoji} {c.title}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{c.subtitle}</div>
                    </div>
                    <Button type="button" variant="primary" size="sm" onClick={() => startLesson(c)}>
                      Co-plan
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="profile-modal-actions" style={{ marginTop: 16 }}>
          <Button variant="ghost" size="md" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="md" type="button" onClick={handleSave}>
            Save classroom
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
