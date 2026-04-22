'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Props = { initialName: string };

export function EditProfileClient({ initialName }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [draft, setDraft] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const trimmed = draft.trim();
    if (!trimmed) { setError('Name cannot be empty.'); return; }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ data: { full_name: trimmed } });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setName(trimmed);
    setEditing(false);
    router.refresh();
  };

  const handleCancel = () => {
    setDraft(name);
    setEditing(false);
    setError(null);
  };

  if (!editing) {
    return (
      <div className="account-profile-row">
        <div>
          <span className="account-usage-label">Display name</span>
          <div className="account-profile-name">{name || <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Not set</span>}</div>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => { setDraft(name); setEditing(true); }}>
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="account-profile-edit">
      <input
        className="account-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Your display name"
        maxLength={60}
        autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter') void handleSave(); if (e.key === 'Escape') handleCancel(); }}
      />
      {error && <p className="account-field-error">{error}</p>}
      <div className="account-profile-edit-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={handleCancel} disabled={saving}>Cancel</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
