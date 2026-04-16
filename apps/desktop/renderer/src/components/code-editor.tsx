'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, Copy, Loader2, Play, RotateCcw, Wand2 } from 'lucide-react';

import { getConceptCodeStarter } from '@/lib/concept-catalog';

type Example = {
  name: string;
  concept: string;
  code: string;
};

const FALLBACK_EXAMPLES: Example[] = [
  {
    name: 'Circle',
    concept: 'Trigonometry',
    code: `import math
import sketchbot

cx, cy = 148.5, 105
radius = 60
points = []

for i in range(121):
    t = (i / 120) * 2 * math.pi
    x = cx + radius * math.cos(t)
    y = cy + radius * math.sin(t)
    points.append((x, y))

sketchbot.draw_path(points)
`,
  },
  {
    name: 'Spiral',
    concept: 'Kinematics',
    code: `import math
import sketchbot

cx, cy = 148.5, 105
points = []
turns = 5
steps = turns * 60

for i in range(steps + 1):
    t = (i / steps) * turns * 2 * math.pi
    r = (t / (turns * 2 * math.pi)) * 80
    x = cx + r * math.cos(t)
    y = cy + r * math.sin(t)
    points.append((x, y))

sketchbot.draw_path(points)
`,
  },
  {
    name: 'Grid',
    concept: 'Coordinates',
    code: `import sketchbot

cols = 5
rows = 5
spacing = 40

start_x = 148.5 - (cols - 1) * spacing / 2
start_y = 105 - (rows - 1) * spacing / 2

for row in range(rows):
    for col in range(cols):
        x = start_x + col * spacing
        y = start_y + row * spacing
        sketchbot.draw_path([(x - 3, y), (x + 3, y)])
        sketchbot.draw_path([(x, y - 3), (x, y + 3)])
`,
  },
];

type CodeEditorProps = {
  apiBase: string;
  onSvgResult?: (svg: string) => void;
  conceptId?: string | null;
};

type RunResult = {
  ok: boolean;
  message: string;
  svg?: string;
  path_count?: number;
  task_name?: string;
};

function buildConceptExample(conceptId: string | null | undefined): Example | null {
  const starter = getConceptCodeStarter(conceptId);
  if (!starter?.codeScaffold) {
    return null;
  }

  return {
    name: starter.title,
    concept: starter.mathNotation ?? 'Concept starter',
    code: starter.codeScaffold,
  };
}

export function CodeEditor({ apiBase, onSvgResult, conceptId }: CodeEditorProps) {
  const conceptStarter = useMemo(() => getConceptCodeStarter(conceptId), [conceptId]);
  const conceptExample = useMemo(() => buildConceptExample(conceptId), [conceptId]);
  const examples = useMemo(
    () => (conceptExample ? [conceptExample, ...FALLBACK_EXAMPLES] : FALLBACK_EXAMPLES),
    [conceptExample],
  );

  const [code, setCode] = useState(examples[0]?.code ?? '');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (examples[0]?.code) {
      setCode(examples[0].code);
      setResult(null);
    }
  }, [examples]);

  const handleRun = async () => {
    if (!code.trim() || running) {
      return;
    }

    setRunning(true);
    setResult(null);

    try {
      const res = await fetch(`${apiBase}/api/code-runner/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          concept_id: conceptId ?? null,
        }),
      });

      const data = (await res.json()) as RunResult;
      setResult(data);

      if (data.ok && data.svg && onSvgResult) {
        onSvgResult(data.svg);
      }
    } catch {
      setResult({ ok: false, message: 'Could not connect to runtime. Is the backend running?' });
    } finally {
      setRunning(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const handleTabKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const next = `${code.substring(0, start)}    ${code.substring(end)}`;
      setCode(next);

      requestAnimationFrame(() => {
        textarea.selectionStart = start + 4;
        textarea.selectionEnd = start + 4;
      });
    }

    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void handleRun();
    }
  };

  return (
    <div className="code-editor-root">
      <div className="code-editor-header">
        <div className="code-editor-header-copy">
          <strong>{conceptStarter?.title ?? 'Precise mode'}</strong>
          <span>
            {conceptStarter?.tutorIntro ??
              'Write Python with the sketchbot SDK to produce exact robot paths and mathematical drawings.'}
          </span>
        </div>
        {conceptExample && (
          <button
            type="button"
            className="code-starter-btn"
            onClick={() => {
              setCode(conceptExample.code);
              setResult(null);
            }}
          >
            <Wand2 size={13} />
            Use concept scaffold
          </button>
        )}
      </div>

      {conceptStarter?.starterPrompt && (
        <div className="code-concept-hint">
          <span className="code-concept-hint-label">Challenge</span>
          <span>{conceptStarter.starterPrompt}</span>
        </div>
      )}

      <div className="code-editor-toolbar">
        <div className="code-editor-toolbar-meta">
          <div className="code-editor-lang-badge">Python</div>
          <span className="code-editor-sdk-label">sketchbot SDK</span>
          {conceptStarter?.mathNotation && (
            <code className="code-editor-math">{conceptStarter.mathNotation}</code>
          )}
        </div>

        <div className="code-editor-toolbar-actions">
          <button
            type="button"
            className="code-toolbar-btn"
            onClick={() => setShowExamples((open) => !open)}
            title="Examples"
          >
            <BookOpen size={12} />
            Examples
          </button>
          <button type="button" className="code-toolbar-btn" onClick={handleCopy} title="Copy code">
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
          <button
            type="button"
            className="code-toolbar-btn"
            onClick={() => {
              setCode(examples[0]?.code ?? '');
              setResult(null);
            }}
            title="Reset to starter"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {showExamples && (
        <div className="code-examples-panel">
          <div className="code-examples-title">Starter programs</div>
          <div className="code-examples-grid">
            {examples.map((example) => (
              <button
                key={`${example.name}-${example.concept}`}
                type="button"
                className="code-example-chip"
                onClick={() => {
                  setCode(example.code);
                  setResult(null);
                  setShowExamples(false);
                }}
              >
                <span className="code-example-name">{example.name}</span>
                <span className="code-example-concept">{example.concept}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="code-editor-area">
        <div className="code-line-numbers" aria-hidden="true">
          {code.split('\n').map((_, index) => (
            <div key={`${index + 1}`} className="code-line-num">
              {index + 1}
            </div>
          ))}
        </div>

        <textarea
          ref={textareaRef}
          className="code-textarea"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={handleTabKey}
          spellCheck={false}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          placeholder="# Write your SketchBot Python code here..."
        />
      </div>

      <div className="code-editor-footer">
        <span className="code-run-hint">Ctrl+Enter to run</span>
        <button
          type="button"
          className="code-run-btn"
          onClick={handleRun}
          disabled={running || !code.trim()}
        >
          {running ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Play size={13} />}
          {running ? 'Running…' : 'Run Code'}
        </button>
      </div>

      {result && (
        <div className={`code-result ${result.ok ? 'ok' : 'error'}`}>
          <span className="code-result-icon">{result.ok ? 'OK' : 'ERR'}</span>
          <span className="code-result-msg">{result.message}</span>
        </div>
      )}

      <div className="code-sdk-hint">
        <strong>sketchbot API:</strong> <code>draw_path([(x, y), ...])</code> ·{' '}
        <code>move_to(x, y)</code> · <code>pen_up()</code> / <code>pen_down()</code> ·{' '}
        <code>plot(lambda t: (...))</code>
        <br />
        <strong>Canvas:</strong> 297 × 210 mm (A4) · Origin at bottom-left · X→right Y→up
      </div>
    </div>
  );
}
