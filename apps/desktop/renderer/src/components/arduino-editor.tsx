'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Check, ChevronDown, Copy, Loader2, RefreshCw, RotateCcw, Zap } from 'lucide-react';

// ─── Starter sketches ─────────────────────────────────────────────────────────

type Sketch = { name: string; concept: string; code: string };

const SKETCHES: Sketch[] = [
  {
    name: 'Square',
    concept: 'Loops + Geometry',
    code: `// SketchBot — Square Pattern
// Draws a 4-sided square using the motor HAL.
// Target: ESP32-C5 (arduino-esp32 framework)

#include <ESP32Servo.h>

// ── Pin map (matches robot_hal.h) ─────────────────────────────────────────
#define MOTOR_L_IN1  4
#define MOTOR_L_IN2  5
#define MOTOR_R_IN1  6
#define MOTOR_R_IN2  7
#define MOTOR_L_PWM  8
#define MOTOR_R_PWM  9
#define PEN_PIN     10

// ── Constants ─────────────────────────────────────────────────────────────
#define PEN_UP_US   1000
#define PEN_DOWN_US 2000
#define SPEED        160   // PWM duty 0–255
#define SIDE_MS      900   // ms to drive one side (~200 mm)
#define TURN_MS      480   // ms for a 90° turn

Servo penServo;

void motorDrive(int leftDuty, int rightDuty) {
  digitalWrite(MOTOR_L_IN1, leftDuty  > 0 ? HIGH : LOW);
  digitalWrite(MOTOR_L_IN2, leftDuty  > 0 ? LOW  : HIGH);
  digitalWrite(MOTOR_R_IN1, rightDuty > 0 ? HIGH : LOW);
  digitalWrite(MOTOR_R_IN2, rightDuty > 0 ? LOW  : HIGH);
  analogWrite(MOTOR_L_PWM, abs(leftDuty));
  analogWrite(MOTOR_R_PWM, abs(rightDuty));
}

void motorStop() { analogWrite(MOTOR_L_PWM, 0); analogWrite(MOTOR_R_PWM, 0); }
void penUp()     { penServo.writeMicroseconds(PEN_UP_US);   delay(200); }
void penDown()   { penServo.writeMicroseconds(PEN_DOWN_US); delay(200); }

void forward(int ms) { motorDrive(SPEED, SPEED);    delay(ms); motorStop(); }
void turnRight(int ms){ motorDrive(SPEED, -SPEED);  delay(ms); motorStop(); }

void setup() {
  for (int p : {MOTOR_L_IN1, MOTOR_L_IN2, MOTOR_R_IN1, MOTOR_R_IN2,
                MOTOR_L_PWM, MOTOR_R_PWM}) {
    pinMode(p, OUTPUT);
  }
  penServo.attach(PEN_PIN);
  delay(500);
  penDown();

  // Draw 4 sides
  for (int i = 0; i < 4; i++) {
    forward(SIDE_MS);
    delay(80);
    turnRight(TURN_MS);
    delay(80);
  }
  penUp();
}

void loop() { /* pattern complete — nothing to repeat */ }
`,
  },
  {
    name: 'Star',
    concept: 'Exterior Angles',
    code: `// SketchBot — 5-Pointed Star
// A star uses 5 sides each separated by a 144° exterior angle.

#include <ESP32Servo.h>

#define MOTOR_L_IN1  4
#define MOTOR_L_IN2  5
#define MOTOR_R_IN1  6
#define MOTOR_R_IN2  7
#define MOTOR_L_PWM  8
#define MOTOR_R_PWM  9
#define PEN_PIN     10

#define PEN_UP_US   1000
#define PEN_DOWN_US 2000
#define SPEED        155
// Tune these for your robot:
#define SIDE_MS      700   // ~160 mm per arm
#define TURN_1DEG_MS   5  // ms per degree of rotation

Servo penServo;

void motorDrive(int l, int r) {
  digitalWrite(MOTOR_L_IN1, l > 0); digitalWrite(MOTOR_L_IN2, l < 0);
  digitalWrite(MOTOR_R_IN1, r > 0); digitalWrite(MOTOR_R_IN2, r < 0);
  analogWrite(MOTOR_L_PWM, abs(l)); analogWrite(MOTOR_R_PWM, abs(r));
}
void motorStop()  { analogWrite(MOTOR_L_PWM, 0); analogWrite(MOTOR_R_PWM, 0); }
void penUp()      { penServo.writeMicroseconds(PEN_UP_US);   delay(200); }
void penDown()    { penServo.writeMicroseconds(PEN_DOWN_US); delay(200); }
void forward(int ms)     { motorDrive(SPEED, SPEED);   delay(ms); motorStop(); }
void turnRight(int deg)  { motorDrive(SPEED, -SPEED);  delay(deg * TURN_1DEG_MS); motorStop(); }

void setup() {
  for (int p : {MOTOR_L_IN1, MOTOR_L_IN2, MOTOR_R_IN1, MOTOR_R_IN2,
                MOTOR_L_PWM, MOTOR_R_PWM}) {
    pinMode(p, OUTPUT);
  }
  penServo.attach(PEN_PIN);
  delay(500);
  penDown();

  // 5 arms, each followed by a 144° right turn
  for (int i = 0; i < 5; i++) {
    forward(SIDE_MS);
    delay(60);
    turnRight(144);
    delay(60);
  }
  penUp();
}

void loop() {}
`,
  },
  {
    name: 'Spiral',
    concept: 'Recursion + Growth',
    code: `// SketchBot — Expanding Spiral
// Each side is longer than the previous, creating an Archimedean-like spiral.

#include <ESP32Servo.h>

#define MOTOR_L_IN1  4
#define MOTOR_L_IN2  5
#define MOTOR_R_IN1  6
#define MOTOR_R_IN2  7
#define MOTOR_L_PWM  8
#define MOTOR_R_PWM  9
#define PEN_PIN     10

#define PEN_UP_US   1000
#define PEN_DOWN_US 2000
#define SPEED        160
#define TURN_MS      490  // ~90° turn

Servo penServo;

void motorDrive(int l, int r) {
  digitalWrite(MOTOR_L_IN1, l > 0); digitalWrite(MOTOR_L_IN2, l < 0);
  digitalWrite(MOTOR_R_IN1, r > 0); digitalWrite(MOTOR_R_IN2, r < 0);
  analogWrite(MOTOR_L_PWM, abs(l)); analogWrite(MOTOR_R_PWM, abs(r));
}
void motorStop() { analogWrite(MOTOR_L_PWM, 0); analogWrite(MOTOR_R_PWM, 0); }
void penUp()     { penServo.writeMicroseconds(PEN_UP_US);   delay(200); }
void penDown()   { penServo.writeMicroseconds(PEN_DOWN_US); delay(200); }
void forward(int ms) { motorDrive(SPEED, SPEED);   delay(ms); motorStop(); }
void turnLeft(int ms){ motorDrive(-SPEED, SPEED);  delay(ms); motorStop(); }

void setup() {
  for (int p : {MOTOR_L_IN1, MOTOR_L_IN2, MOTOR_R_IN1, MOTOR_R_IN2,
                MOTOR_L_PWM, MOTOR_R_PWM}) {
    pinMode(p, OUTPUT);
  }
  penServo.attach(PEN_PIN);
  delay(500);
  penDown();

  // 20 segments, each 30 ms longer than the last
  int sideMs = 200;
  for (int i = 0; i < 20; i++) {
    forward(sideMs);
    delay(60);
    turnLeft(TURN_MS);
    delay(60);
    sideMs += 30;
  }
  penUp();
}

void loop() {}
`,
  },
  {
    name: 'Zigzag',
    concept: 'Alternating Logic',
    code: `// SketchBot — Zigzag Pattern
// Alternates between left and right turns to produce a zigzag.

#include <ESP32Servo.h>

#define MOTOR_L_IN1  4
#define MOTOR_L_IN2  5
#define MOTOR_R_IN1  6
#define MOTOR_R_IN2  7
#define MOTOR_L_PWM  8
#define MOTOR_R_PWM  9
#define PEN_PIN     10

#define PEN_UP_US   1000
#define PEN_DOWN_US 2000
#define SPEED        160
#define SIDE_MS      600
#define TURN_MS      340  // ~60° turn

Servo penServo;

void motorDrive(int l, int r) {
  digitalWrite(MOTOR_L_IN1, l > 0); digitalWrite(MOTOR_L_IN2, l < 0);
  digitalWrite(MOTOR_R_IN1, r > 0); digitalWrite(MOTOR_R_IN2, r < 0);
  analogWrite(MOTOR_L_PWM, abs(l)); analogWrite(MOTOR_R_PWM, abs(r));
}
void motorStop() { analogWrite(MOTOR_L_PWM, 0); analogWrite(MOTOR_R_PWM, 0); }
void penUp()     { penServo.writeMicroseconds(PEN_UP_US);   delay(200); }
void penDown()   { penServo.writeMicroseconds(PEN_DOWN_US); delay(200); }
void forward(int ms)    { motorDrive(SPEED, SPEED);    delay(ms); motorStop(); }
void turnRight(int ms)  { motorDrive(SPEED, -SPEED);   delay(ms); motorStop(); }
void turnLeft(int ms)   { motorDrive(-SPEED, SPEED);   delay(ms); motorStop(); }

void setup() {
  for (int p : {MOTOR_L_IN1, MOTOR_L_IN2, MOTOR_R_IN1, MOTOR_R_IN2,
                MOTOR_L_PWM, MOTOR_R_PWM}) {
    pinMode(p, OUTPUT);
  }
  penServo.attach(PEN_PIN);
  delay(500);
  penDown();

  for (int i = 0; i < 8; i++) {
    forward(SIDE_MS);
    delay(60);
    if (i % 2 == 0) turnRight(TURN_MS);
    else             turnLeft(TURN_MS);
    delay(60);
  }
  penUp();
}

void loop() {}
`,
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type PortInfo = { port: string; description: string; hwid: string };
type BoardInfo = { fqbn: string; label: string };

type FlashResult = {
  ok: boolean;
  message: string;
  output?: string;
  port_used?: string | null;
};

type ArduinoEditorProps = {
  apiBase: string;
  conceptId?: string | null;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ArduinoEditor({ apiBase }: ArduinoEditorProps) {
  const [code, setCode] = useState(SKETCHES[0].code);
  const [selectedSketch, setSelectedSketch] = useState(0);
  const [showSketches, setShowSketches] = useState(false);
  const [copied, setCopied] = useState(false);

  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [boards, setBoards] = useState<BoardInfo[]>([]);
  const [selectedPort, setSelectedPort] = useState('');
  const [selectedFqbn, setSelectedFqbn] = useState('esp32:esp32:esp32c5');
  const [portsLoading, setPortsLoading] = useState(false);

  const [flashing, setFlashing] = useState(false);
  const [flashResult, setFlashResult] = useState<FlashResult | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchPorts = useCallback(async () => {
    setPortsLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/arduino/ports`);
      const data = (await res.json()) as { ports: PortInfo[] };
      setPorts(data.ports ?? []);
      if (data.ports?.length && !selectedPort) {
        setSelectedPort(data.ports[0].port);
      }
    } catch {
      // backend not reachable — leave empty
    } finally {
      setPortsLoading(false);
    }
  }, [apiBase, selectedPort]);

  useEffect(() => {
    // Fetch boards list once
    fetch(`${apiBase}/api/arduino/boards`)
      .then((r) => r.json())
      .then((d: { boards: BoardInfo[] }) => setBoards(d.boards ?? []))
      .catch(() => {});

    fetchPorts();
  }, [apiBase, fetchPorts]);

  const handleSketchSelect = (index: number) => {
    setSelectedSketch(index);
    setCode(SKETCHES[index].code);
    setFlashResult(null);
    setShowSketches(false);
  };

  const handleReset = () => {
    setCode(SKETCHES[selectedSketch].code);
    setFlashResult(null);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const handleTabKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = `${code.substring(0, start)}  ${code.substring(end)}`;
      setCode(next);
      requestAnimationFrame(() => {
        ta.selectionStart = start + 2;
        ta.selectionEnd = start + 2;
      });
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void handleFlash();
    }
  };

  const handleFlash = async () => {
    if (flashing || !code.trim()) return;
    setFlashing(true);
    setFlashResult(null);
    try {
      const res = await fetch(`${apiBase}/api/arduino/flash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          port: selectedPort || null,
          fqbn: selectedFqbn,
        }),
      });
      const data = (await res.json()) as FlashResult;
      setFlashResult(data);
    } catch {
      setFlashResult({ ok: false, message: 'Cannot reach local runtime. Is the backend running?' });
    } finally {
      setFlashing(false);
    }
  };

  const lineCount = code.split('\n').length;

  return (
    <div className="ard-root">
      {/* ── Header ── */}
      <div className="ard-header">
        <div className="ard-header-copy">
          <strong>Engineer Mode — C++ / Arduino</strong>
          <span>
            Write C++ sketches using the arduino-esp32 framework. Flash directly to your SketchBot (ESP32-C5)
            or prototype on an Arduino Uno with a standard motor shield.
          </span>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="ard-toolbar">
        <div className="ard-toolbar-left">
          <span className="ard-lang-badge">C++ / Arduino</span>
          <select
            className="ard-board-select"
            value={selectedFqbn}
            onChange={(e) => setSelectedFqbn(e.target.value)}
            title="Target board"
          >
            {boards.length > 0
              ? boards.map((b) => (
                  <option key={b.fqbn} value={b.fqbn}>{b.label}</option>
                ))
              : <option value={selectedFqbn}>{selectedFqbn}</option>}
          </select>
        </div>

        <div className="ard-toolbar-right">
          <button
            type="button"
            className="code-toolbar-btn"
            onClick={() => setShowSketches((v) => !v)}
            title="Starter sketches"
          >
            <BookOpen size={12} />
            Sketches
            <ChevronDown size={10} style={{ opacity: 0.6, transform: showSketches ? 'rotate(180deg)' : undefined, transition: 'transform 120ms' }} />
          </button>
          <button type="button" className="code-toolbar-btn" onClick={handleCopy} title="Copy code">
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
          <button type="button" className="code-toolbar-btn" onClick={handleReset} title="Reset sketch">
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {/* ── Sketches panel ── */}
      {showSketches && (
        <div className="code-examples-panel">
          <div className="code-examples-title">Starter sketches</div>
          <div className="code-examples-grid">
            {SKETCHES.map((s, i) => (
              <button
                key={s.name}
                type="button"
                className={`code-example-chip ${selectedSketch === i ? 'active' : ''}`}
                onClick={() => handleSketchSelect(i)}
              >
                <span className="code-example-name">{s.name}</span>
                <span className="code-example-concept">{s.concept}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Code area ── */}
      <div className="code-editor-area">
        <div className="code-line-numbers" aria-hidden="true">
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i + 1} className="code-line-num">{i + 1}</div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          className="code-textarea"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={handleTabKey}
          spellCheck={false}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          placeholder="// Write your SketchBot C++ sketch here…"
        />
      </div>

      {/* ── Port row + Flash button ── */}
      <div className="ard-footer">
        <div className="ard-port-row">
          <select
            className="ard-port-select"
            value={selectedPort}
            onChange={(e) => setSelectedPort(e.target.value)}
            disabled={portsLoading}
          >
            {ports.length === 0
              ? <option value="">No ports detected</option>
              : ports.map((p) => (
                  <option key={p.port} value={p.port}>
                    {p.port} — {p.description}
                  </option>
                ))}
          </select>
          <button
            type="button"
            className="ard-refresh-btn"
            onClick={fetchPorts}
            disabled={portsLoading}
            title="Refresh ports"
          >
            <RefreshCw size={12} style={portsLoading ? { animation: 'spin 0.8s linear infinite' } : undefined} />
          </button>
        </div>

        <div className="ard-footer-right">
          <span className="code-run-hint">Ctrl+Enter to flash</span>
          <button
            type="button"
            className="ard-flash-btn"
            onClick={handleFlash}
            disabled={flashing || !code.trim()}
          >
            {flashing
              ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
              : <Zap size={13} />}
            {flashing ? 'Flashing…' : 'Compile & Flash'}
          </button>
        </div>
      </div>

      {/* ── Flash result ── */}
      {flashResult && (
        <div className={`code-result ${flashResult.ok ? 'ok' : 'error'}`}>
          <span className="code-result-icon">{flashResult.ok ? 'OK' : 'ERR'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="code-result-msg">{flashResult.message}</div>
            {flashResult.output && (
              <pre className="ard-output">{flashResult.output}</pre>
            )}
          </div>
        </div>
      )}

      {/* ── SDK hint ── */}
      <div className="code-sdk-hint">
        <strong>Pin map:</strong> L-IN1/IN2 → GPIO 4/5 · R-IN1/IN2 → GPIO 6/7 ·
        L-PWM → GPIO 8 · R-PWM → GPIO 9 · Pen servo → GPIO 10
        <br />
        <strong>Framework:</strong> arduino-esp32 · Library: <code>ESP32Servo</code> ·
        Board: <code>esp32:esp32:esp32c5</code>
      </div>
    </div>
  );
}
