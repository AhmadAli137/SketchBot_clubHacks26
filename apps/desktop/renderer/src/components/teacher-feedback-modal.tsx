'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ExternalLink, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { loadClassroomProfile } from '@/lib/classroom-profile';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';

const CATEGORIES = [
  { id: 'bug', label: 'Bug or crash' },
  { id: 'feature', label: 'Feature request' },
  { id: 'classroom', label: 'Classroom / lesson workflow' },
  { id: 'hardware', label: 'Robot / camera / hardware' },
  { id: 'other', label: 'Other' },
] as const;

function buildMailto(to: string, subject: string, body: string): string {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

type TeacherFeedbackModalProps = {
  open: boolean;
  onClose: () => void;
  apiBase: string;
  teacherDisplayName: string;
};

export function TeacherFeedbackModal({ open, onClose, apiBase, teacherDisplayName }: TeacherFeedbackModalProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [developerEmail, setDeveloperEmail] = useState('hello@sketchbot.app');
  const [category, setCategory] = useState<string>('classroom');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'ok' | 'err'>('idle');

  const loadContext = useCallback(() => {
    const p = loadClassroomProfile();
    return {
      classroomName: p.classroomName,
      teacherName: p.teacherName || teacherDisplayName,
    };
  }, [teacherDisplayName]);

  useEffect(() => {
    if (!open || !apiBase) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/teacher-feedback/config`);
        if (!res.ok) return;
        const data = (await res.json()) as { developer_email?: string };
        if (!cancelled && data.developer_email) {
          setDeveloperEmail(data.developer_email);
        }
      } catch {
        /* keep default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, apiBase]);

  useEffect(() => {
    if (!open) {
      setStatus('idle');
      return;
    }
    const ctx = loadClassroomProfile();
    setSubject(`[SketchBot] ${ctx.classroomName ? `${ctx.classroomName} — ` : ''}feedback`);
    setMessage('');
    setCategory('classroom');
    setStatus('idle');
  }, [open]);

  const handleSubmit = async () => {
    const sub = subject.trim();
    const msg = message.trim();
    if (!sub || !msg) {
      window.alert('Please add a subject and a message.');
      return;
    }
    if (!apiBase) {
      window.alert('Backend URL is not set — use “Email developers” below instead.');
      return;
    }
    setSubmitting(true);
    setStatus('idle');
    try {
      const ctx = loadContext();
      const res = await fetch(`${apiBase}/api/teacher-feedback/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          subject: sub,
          message: msg,
          contact_email: contactEmail.trim(),
          teacher_name: ctx.teacherName,
          classroom_name: ctx.classroomName,
          client_hint: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 400) : '',
        }),
      });
      if (!res.ok) throw new Error('submit failed');
      setStatus('ok');
      setMessage('');
    } catch {
      setStatus('err');
    } finally {
      setSubmitting(false);
    }
  };

  const openEmailInquiry = () => {
    const ctx = loadContext();
    const sub = subject.trim() || 'SketchBot teacher inquiry';
    const body = [
      `Teacher: ${ctx.teacherName || '(not set)'}`,
      `Classroom: ${ctx.classroomName || '(not set)'}`,
      contactEmail.trim() ? `Reply-to: ${contactEmail.trim()}` : '',
      '',
      '--- Message ---',
      message.trim() || '(add details above, then click Email developers — or type here after opening)',
      '',
      `Category: ${category}`,
    ]
      .filter(Boolean)
      .join('\n');
    window.location.href = buildMailto(developerEmail, sub, body);
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
      style={{ zIndex: 55 }}
    >
      <motion.div
        className="profile-modal"
        style={{ maxWidth: 520, width: '100%', maxHeight: 'min(92vh, 720px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        initial={reducedMotion ? false : { opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={reducedMotion ? undefined : { opacity: 0, scale: 0.98, y: 8 }}
        transition={{ duration: reducedMotion ? 0 : 0.26, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>Feedback &amp; developer contact</h3>
        <p style={{ fontSize: '0.88rem', color: 'var(--muted)', marginBottom: 14 }}>
          Submit a report to this computer&apos;s hub log, and open your email for direct inquiries to the team.
        </p>

        <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="profile-form-row" style={{ display: 'block' }}>
            <span>Category</span>
            <select
              className="profile-bio-input"
              style={{ cursor: 'pointer' }}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label className="profile-form-row" style={{ display: 'block' }}>
            <span>Subject</span>
            <input className="profile-bio-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary" />
          </label>

          <label className="profile-form-row" style={{ display: 'block' }}>
            <span>Message</span>
            <textarea
              className="profile-bio-input"
              rows={6}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What happened? What would help? Include steps if reporting a bug."
            />
          </label>

          <label className="profile-form-row" style={{ display: 'block' }}>
            <span>Your email (optional — for follow-up)</span>
            <input
              className="profile-bio-input"
              type="email"
              autoComplete="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="you@school.edu"
            />
          </label>

          {status === 'ok' && (
            <div style={{ fontSize: '0.88rem', color: 'var(--green)', padding: '8px 10px', borderRadius: 10, background: 'rgba(34,197,94,0.12)' }}>
              Saved to this machine&apos;s feedback log. You can still email the team using the button below.
            </div>
          )}
          {status === 'err' && (
            <div style={{ fontSize: '0.88rem', color: 'var(--pink)', padding: '8px 10px', borderRadius: 10, background: 'rgba(255,79,216,0.1)' }}>
              Could not reach the hub. Check that the local backend is running, or use email below.
            </div>
          )}

          <div
            style={{
              border: '1px solid rgba(120,140,255,0.2)',
              borderRadius: 12,
              padding: 12,
              background: 'rgba(5,8,22,0.45)',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Email the developers</div>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '0 0 10px' }}>
              Opens your mail app to <strong style={{ color: 'var(--text)' }}>{developerEmail}</strong> with this form prefilled.
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={openEmailInquiry} style={{ gap: 6 }}>
              <ExternalLink size={14} />
              Email developers
            </Button>
          </div>
        </div>

        <div className="profile-modal-actions" style={{ marginTop: 14 }}>
          <Button variant="ghost" size="md" type="button" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" size="md" type="button" disabled={submitting} onClick={() => void handleSubmit()} style={{ gap: 6 }}>
            <Send size={15} />
            {submitting ? 'Sending…' : 'Save to hub log'}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
