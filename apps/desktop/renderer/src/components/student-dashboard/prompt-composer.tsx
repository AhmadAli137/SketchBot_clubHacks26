'use client';

import type { FormEvent } from 'react';
import { RefreshCw, Sparkles, Upload } from 'lucide-react';

import { BlockEditor } from '@/components/block-editor';
import { CodeEditor } from '@/components/code-editor';
import { LAYER_META, type ConceptLayer } from '@/lib/concept-types';

import type { PromptComposerProps } from './types';

export function PromptComposer({
  interactionMode,
  activeLayer,
  prompt,
  composing,
  uploading,
  featuredTasks,
  conceptId,
  apiBase,
  onPromptChange,
  onSubmitPrompt,
  onUploadFile,
  onLoadTask,
  onInteractionModeChange,
  onBlockRun,
  onBlockPreviewSvgChange,
  onCodeSvgResult,
}: PromptComposerProps) {
  const handlePromptSubmit = (event: FormEvent) => {
    onSubmitPrompt(event);
  };

  return (
    <div className="learn-prompt-bar">
      <div className="learn-mode-row">
        <span style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 600, marginRight: 2 }}>Mode:</span>
        {(['language', 'blocks', 'code'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className={`learn-mode-tab ${interactionMode === mode ? 'active' : ''}`}
            onClick={() => onInteractionModeChange(mode)}
          >
            {mode === 'language' ? 'Language' : mode === 'blocks' ? 'Blocks' : 'Code'}
          </button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {(['intuitive', 'structural', 'precise'] as ConceptLayer[]).map((layer) => (
            <div
              key={layer}
              style={{
                fontSize: '0.62rem',
                padding: '2px 7px',
                borderRadius: 999,
                border: `1px solid ${activeLayer === layer ? 'rgba(93,228,255,0.35)' : 'var(--border)'}`,
                color: activeLayer === layer ? 'var(--cyan)' : 'var(--muted)',
                fontWeight: 700,
                letterSpacing: '0.04em',
              }}
            >
              {LAYER_META[layer].label}
            </div>
          ))}
        </div>
      </div>

      {interactionMode === 'language' && (
        <>
          <form className="learn-prompt-form" onSubmit={handlePromptSubmit}>
            <textarea
              className="learn-prompt-input"
              rows={1}
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              placeholder={composing ? 'Generating…' : 'Describe what to draw…'}
              disabled={composing}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  handlePromptSubmit(event as unknown as FormEvent);
                }
              }}
            />
            <label style={{ cursor: uploading ? 'progress' : 'pointer' }} title="Upload image">
              <span className="btn-ghost" style={{ minHeight: 42, padding: '0 10px', pointerEvents: 'none' }}>
                <Upload size={14} />
              </span>
              <input type="file" accept=".svg,image/*" onChange={onUploadFile} style={{ display: 'none' }} />
            </label>
            <button type="submit" className="learn-draw-btn" disabled={composing || uploading || !prompt.trim()}>
              {composing ? (
                <>
                  <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Thinking…
                </>
              ) : (
                <>
                  <Sparkles size={14} /> Generate & Draw
                </>
              )}
            </button>
          </form>

          {featuredTasks.length > 0 && (
            <div className="learn-recent-row">
              <span className="learn-recent-label">Recent:</span>
              {featuredTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className="learn-recent-chip"
                  onClick={() => onLoadTask(task)}
                  title={task.prompt ?? task.name ?? undefined}
                >
                  {task.name ?? task.prompt?.slice(0, 24) ?? 'Drawing'}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {interactionMode === 'blocks' && (
        <BlockEditor
          conceptId={conceptId}
          onRunProgram={onBlockRun}
          isRunning={composing}
          onPreviewSvgChange={onBlockPreviewSvgChange}
        />
      )}

      {interactionMode === 'code' && (
        <CodeEditor apiBase={apiBase} conceptId={conceptId} onSvgResult={onCodeSvgResult} />
      )}
    </div>
  );
}
