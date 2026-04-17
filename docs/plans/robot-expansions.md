# Robot Expansions

Physical platform expansions that unlock new STEM domains. All new robots share the same AprilTag vision system, companion app camera connection, and AI prompt-to-action pipeline.

## Modular Expansion Philosophy

The gantry chassis is the foundation — new tools attach to the pen mount via a quick-release magnetic coupler. Students swap tools mid-session without recalibrating. The software auto-detects which tool head is mounted via a small NFC tag on each module.

---

## 1. Pen Plotter v2

**Key Addition:** Dual-pen holder + servo lift

**Unlocks:**
- Multi-color drawing, shading, layered art
- Color theory (primary/secondary/complementary)
- Layer ordering and registration (print concepts)

**Complexity:** Low — mechanical add-on, minimal firmware changes

**Implementation Notes:**
- Servo controls pen-up/pen-down per color channel
- Software: add a "color selector" to the prompt composer and SVG generator
- SVG output uses `<g>` layers per color, serialized for pen swaps

---

## 2. Laser Engraver Bot

**Key Addition:** Low-power diode laser module (< 1W, Class 1 eye-safe with enclosure)

**Unlocks:**
- Material science — engraving on wood, acrylic, leather
- Raster vs vector processing
- Safety protocols and PPE education
- DPI/resolution concepts

**Complexity:** Medium — requires enclosure, interlock switch, ventilation considerations

**Implementation Notes:**
- Laser PWM control maps to SVG stroke opacity (grayscale engraving)
- New firmware mode: raster scan (line-by-line) vs vector trace (existing path following)
- Mandatory safety module in curriculum before laser is enabled

---

## 3. CNC Mill Mini

**Key Addition:** 3-axis spindle on existing gantry (Z-axis retrofit)

**Unlocks:**
- Subtractive manufacturing
- Toolpath generation (climb vs conventional milling)
- G-code reading and writing
- Material properties (feed rate, depth per pass)

**Complexity:** High — mechanical Z-axis, spindle control, dust management

**Implementation Notes:**
- Software: add a 2.5D CAM module that converts SVG outlines to G-code toolpaths
- Depth parameter added to drawing prompts ("carve this 2mm deep in foam board")
- Simulator gets a Z-axis visualization (cross-section view)

---

## 4. 3D Print Head

**Key Addition:** Paste/clay extruder attachment (syringe-based)

**Unlocks:**
- Additive manufacturing principles
- Slicing and layer adhesion
- Material behavior (viscosity, curing, support structures)
- Food-safe printing (frosting, chocolate) for engagement

**Complexity:** Medium — syringe pump mechanics, flow rate calibration

**Implementation Notes:**
- Reuse existing XY gantry, add a stepper-driven syringe push
- Software: SVG paths become layer-by-layer extrusion paths
- New "material" selector in UI: clay, frosting, silicone, PVA

---

## 5. Arm Bot (3-DOF)

**Key Addition:** Servo-driven articulated arm (shoulder, elbow, wrist)

**Unlocks:**
- Forward and inverse kinematics
- Workspace planning and reachability
- Pick-and-place automation
- Jacobian matrices (for engineer-level students)

**Complexity:** High — servo coordination, IK solver, new coordinate system

**Implementation Notes:**
- Separate from gantry — standalone unit that sits on the paper surface
- Software: new "Arm" simulation mode in Three.js with DH parameter visualization
- Prompt-to-action: "pick up the red block and place it on the blue circle"
- Tutor introduces joint angles vs Cartesian space

---

## 6. Swarm Bots

**Key Addition:** 4x mini differential-drive robots (ESP32-based, ~5cm diameter)

**Unlocks:**
- Multi-agent coordination
- Flocking algorithms (Reynolds rules: separation, alignment, cohesion)
- Formation control and consensus
- Distributed systems concepts
- Communication protocols (leader-follower, peer-to-peer)

**Complexity:** Very High — multi-robot firmware, collision avoidance, shared state

**Implementation Notes:**
- Each bot has two DC motors, an IMU, and an IR beacon for relative positioning
- AprilTag on each bot for overhead camera tracking
- Software: new "Swarm" tab in workspace with per-bot and fleet-level programming
- Block editor gets "for each bot" and "broadcast" blocks
- Simulator shows all 4 bots on the 2D canvas simultaneously

---

## Hardware Roadmap Priority

| Phase | Robot | Reasoning |
|-------|-------|-----------|
| Phase 1 (Now) | Pen Plotter v2 | Low-cost, high-engagement, minimal software changes |
| Phase 2 (3-6 mo) | 3D Print Head | Dramatic visual output, ties into maker culture |
| Phase 2 (3-6 mo) | Arm Bot | Unlocks kinematics curriculum, high educational value |
| Phase 3 (6-12 mo) | Laser Engraver | Requires safety engineering, but high wow factor |
| Phase 3 (6-12 mo) | CNC Mill Mini | Natural evolution from 2D to 2.5D fabrication |
| Phase 4 (12+ mo) | Swarm Bots | Most complex, but most differentiated offering |
