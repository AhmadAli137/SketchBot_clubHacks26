'use client';

import type { FormEvent } from 'react';
import { RefreshCw, Sparkles, Upload } from 'lucide-react';

import { BlockEditor } from '@/components/block-editor';
import { CodeEditor } from '@/components/code-editor';

import type { PromptComposerProps } from './types';

export function PromptComposer({
  interactionMode,
  prompt,
  composing,
  uploading,
  featuredTasks,
  conceptId,
  apiBase,
  showCodeFocus,
  onPromptChange,
  onSubmitPrompt,
  onUploadFile,
  onLoadTask,
  onInteractionModeChange,
  onBlockRun,
  onBlockPreviewSvgChange,
  onCodeSvgResult,
  onToggleCodeFocus,
}: PromptComposerProps) {
  const handlePromptSubmit = (event: FormEvent) => {
    onSubmitPrompt(event);
  };

  return (
    <div className="learn-prompt-bar">
      {/* Blocks / Code editor mode switcher — only shown when not in language mode */}
      {interactionMode !== 'language' && (
        <div className="learn-mode-row">
          <button
            type="button"
            className="learn-mode-tab"
            onClick={() => onInteractionModeChange('language')}
          >
            ← Prompt
          </button>
          <button
            type="button"
            className={`learn-mode-tab ${interactionMode === 'blocks' ? 'active' : ''}`}
            onClick={() => onInteractionModeChange('blocks')}
          >
            Blocks
          </button>
          <button
            type="button"
            className={`learn-mode-tab ${interactionMode === 'code' ? 'active' : ''}`}
            onClick={() => onInteractionModeChange('code')}
          >
            Code
          </button>
          {(interactionMode === 'blocks' || interactionMode === 'code') && (
            <button
              type="button"
              className={`learn-mode-tab ${showCodeFocus ? 'active' : ''}`}
              style={{ marginLeft: 'auto' }}
              onClick={onToggleCodeFocus}
            >
              {showCodeFocus ? 'Compact' : 'Expand'}
            </button>
          )}
        </div>
      )}

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
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                <button type="button" className="learn-recent-chip" onClick={() => onInteractionModeChange('blocks')} title="Switch to block programming">Blocks</button>
                <button type="button" className="learn-recent-chip" onClick={() => onInteractionModeChange('code')} title="Switch to code editor">Code</button>
              </div>
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
