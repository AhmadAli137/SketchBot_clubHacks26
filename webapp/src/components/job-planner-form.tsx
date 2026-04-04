'use client';

import { FormEvent, useState } from 'react';

import { NeonButton } from '@/components/neon-button';

type Props = {
  apiBase: string;
  onPlanned: () => void;
};

export function JobPlannerForm({ apiBase, onPlanned }: Props) {
  const [name, setName] = useState('Hello sketch test');
  const [sourceType, setSourceType] = useState('text');
  const [description, setDescription] = useState('Draw a simple HELLO wordmark with short segments.');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await fetch(`${apiBase}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          source_type: sourceType,
          description,
          canvas_width_mm: 297,
          canvas_height_mm: 210,
          simplification: 'medium',
        }),
      });
      onPlanned();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      <label className="block text-sm">
        <span className="mb-2 block text-[var(--muted)]">Job name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-2xl border border-[rgba(120,140,255,0.16)] bg-[rgba(5,8,22,0.8)] px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-300/40 focus:shadow-[0_0_0_4px_rgba(77,226,255,0.08)]" />
      </label>

      <label className="block text-sm">
        <span className="mb-2 block text-[var(--muted)]">Source type</span>
        <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} className="w-full rounded-2xl border border-[rgba(120,140,255,0.16)] bg-[rgba(5,8,22,0.8)] px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-300/40 focus:shadow-[0_0_0_4px_rgba(77,226,255,0.08)]">
          <option value="text">Text</option>
          <option value="svg">SVG</option>
          <option value="image">Image</option>
          <option value="geometry">Geometry</option>
        </select>
      </label>

      <label className="block text-sm">
        <span className="mb-2 block text-[var(--muted)]">Description</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} className="w-full rounded-2xl border border-[rgba(120,140,255,0.16)] bg-[rgba(5,8,22,0.8)] px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-300/40 focus:shadow-[0_0_0_4px_rgba(77,226,255,0.08)]" />
      </label>

      <div className="flex flex-wrap gap-3">
        <NeonButton variant="primary" type="submit" disabled={submitting}>
          {submitting ? 'Planning…' : 'Create planned job'}
        </NeonButton>
        <NeonButton type="button">Upload later</NeonButton>
      </div>
    </form>
  );
}
