'use client';

import { useEffect, useRef, useState } from 'react';
import { Settings, User } from 'lucide-react';

import { Button } from '@/components/ui/button';

export type AuthRole = 'teacher' | 'student' | 'guest';

type AuthStep = 'name' | 'teacher-pin';

type AuthScreenProps = {
  onAuthenticated: (role: AuthRole, name: string) => void;
};

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [step, setStep] = useState<AuthStep>('name');
  const [customName, setCustomName] = useState('');
  const [selectedName, setSelectedName] = useState('');
  const [selectedRole, setSelectedRole] = useState<AuthRole>('student');
  const [roster, setRoster] = useState<string[]>([]);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [savedPin, setSavedPin] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const authRaw = localStorage.getItem('sketchbot-auth-v1');
      if (authRaw) {
        const parsed = JSON.parse(authRaw) as { pin?: string };
        if (parsed.pin) setSavedPin(parsed.pin);
      }
      const profileRaw = localStorage.getItem('sketchbot-classroom-profile');
      if (profileRaw) {
        const parsed = JSON.parse(profileRaw) as { students?: string[] };
        setRoster(parsed.students ?? []);
      }
    } catch { /* ignore */ }

    // Auto-focus name input
    setTimeout(() => inputRef.current?.focus(), 120);
  }, []);

  const handleNameSubmit = () => {
    const name = (selectedName || customName).trim();
    if (!name) return;
    onAuthenticated(selectedRole === 'teacher' ? 'teacher' : 'student', name);
  };

  const handlePinKey = (k: string) => {
    if (k === '⌫') {
      setPin((p) => p.slice(0, -1));
    } else if (pin.length < 4) {
      const next = pin + k;
      setPin(next);
      if (next.length === 4) {
        setTimeout(() => submitPin(next), 100);
      }
    }
  };

  const submitPin = (value: string) => {
    if (!savedPin) {
      localStorage.setItem('sketchbot-auth-v1', JSON.stringify({ pin: value }));
      onAuthenticated('teacher', 'Teacher');
    } else if (value === savedPin) {
      onAuthenticated('teacher', 'Teacher');
    } else {
      setPinError(true);
      setPin('');
      setTimeout(() => setPinError(false), 700);
    }
  };

  const activeName = selectedName || customName.trim();

  return (
    <div className="auth-screen-shell">
      {/* Ambient orbs */}
      <div className="auth-bg-orb auth-bg-orb-a" />
      <div className="auth-bg-orb auth-bg-orb-b" />
      <div className="auth-bg-orb auth-bg-orb-c" />

      {/* Teacher access gear — top right, unobtrusive */}
      <button
        type="button"
        className="auth-teacher-gear"
        onClick={() => setStep(step === 'teacher-pin' ? 'name' : 'teacher-pin')}
        title="Teacher access"
      >
        <Settings size={15} />
      </button>

      <div className="auth-inner">
        {/* Brand */}
        <div className="auth-logo-row">
          <div className="auth-logo-icon">✏️</div>
          <div>
            <div className="auth-logo-name">SketchBot</div>
            <div className="auth-logo-tag">AI Robotics Platform</div>
          </div>
        </div>

        {/* ─── Name step (default, student flow) ─── */}
        {step === 'name' && (
          <div className="auth-step">
            <div className="auth-role-grid">
              <button
                type="button"
                className={`auth-role-btn ${selectedRole === 'student' ? 'active' : ''}`}
                onClick={() => { setSelectedRole('student'); setStep('name'); }}
              >
                <div className="auth-role-label">Student</div>
                <div className="auth-role-desc">Sign in with your name and open your learning dashboard.</div>
              </button>
              <button
                type="button"
                className={`auth-role-btn ${selectedRole === 'teacher' ? 'active' : ''}`}
                onClick={() => { setSelectedRole('teacher'); setStep('teacher-pin'); }}
              >
                <div className="auth-role-label">Teacher</div>
                <div className="auth-role-desc">Enter a secure PIN to manage the classroom experience.</div>
              </button>
            </div>

            <h2 className="auth-heading">What&apos;s your name?</h2>
            <p className="auth-subheading">
              {roster.length > 0 ? 'Pick your name or type it in below' : 'Type your name to get started'}
            </p>

            {roster.length > 0 && (
              <div className="auth-name-roster">
                {roster.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={`auth-name-chip ${selectedName === name ? 'active' : ''}`}
                    onClick={() => { setSelectedName(name); setCustomName(''); }}
                  >
                    <User size={12} />
                    {name}
                  </button>
                ))}
              </div>
            )}

            <input
              ref={inputRef}
              className="auth-name-input"
              placeholder={roster.length > 0 ? 'Or type a different name…' : 'Type your name…'}
              value={customName}
              onChange={(e) => { setCustomName(e.target.value); setSelectedName(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleNameSubmit(); }}
            />

            <Button
              variant="primary"
              size="lg"
              disabled={!activeName}
              onClick={handleNameSubmit}
              className="w-full"
              style={{ marginTop: 8 } as React.CSSProperties}
            >
              {activeName ? `Let's go, ${activeName} →` : "Let's go →"}
            </Button>
          </div>
        )}

        {/* ─── Teacher PIN step ─── */}
        {step === 'teacher-pin' && (
          <div className="auth-step">
            <button
              type="button"
              className="auth-back-btn"
              onClick={() => { setStep('name'); setPin(''); setPinError(false); }}
            >
              ← Back
            </button>
            <h2 className="auth-heading">
              {savedPin ? 'Teacher Access' : 'Create Teacher PIN'}
            </h2>
            <p className="auth-subheading">
              {savedPin ? 'Enter your 4-digit PIN' : 'Set a PIN to protect teacher controls'}
            </p>

            <div className={`auth-pin-row ${pinError ? 'error' : ''}`}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={`auth-pin-dot ${pin.length > i ? 'filled' : ''}`} />
              ))}
            </div>

            <div className="auth-numpad">
              {(['1','2','3','4','5','6','7','8','9','','0','⌫'] as const).map((k, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`auth-numpad-key ${k === '' ? 'empty' : ''}`}
                  disabled={k === ''}
                  onClick={() => { if (k !== '') handlePinKey(k); }}
                >
                  {k}
                </button>
              ))}
            </div>

            <Button variant="primary" size="lg" disabled={pin.length < 4} onClick={() => submitPin(pin)} className="w-full">
              {savedPin ? 'Unlock Teacher Mode' : 'Set PIN & Enter'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
