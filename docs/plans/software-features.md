# Software Feature Roadmap

Platform capabilities that deepen learning and creative expression. These features build on the existing AI pipeline, gamification system, and lesson player.

---

## 1. Collaborative Canvas

**What:** Real-time multi-student drawing on a shared SVG canvas. Students see each other's cursors and paths live. The robot draws the composite result.

**Tech Stack:**
- WebSocket sync (existing `ws` router in the backend can be extended)
- CRDT or OT-based conflict resolution for concurrent edits
- Color-coded cursors per student
- "Merge and draw" button that composites all contributions

**Educational Value:** Teamwork, spatial negotiation, understanding merge conflicts (soft intro to version control)

**Priority:** Medium — high engagement, requires WebSocket infrastructure

---

## 2. AI Design Critic

**What:** After each drawing, a separate AI persona ("The Critic") evaluates composition, balance, use of negative space, rhythm, and visual weight — distinct from the tutor's STEM-focused evaluation.

**Implementation:**
- New Claude prompt persona focused on visual design principles
- Returns structured feedback: `{ composition: 0-100, balance: 0-100, use_of_space: 0-100, critique: string }`
- Displayed as a second tab in the evaluation card alongside the STEM score
- Optional: student can toggle between "Tutor" and "Critic" feedback

**Educational Value:** Design thinking, art criticism vocabulary, compositional awareness

**Priority:** Low — nice-to-have, can reuse existing evaluation infrastructure

---

## 3. Generative Music Layer

**What:** Map drawing parameters to musical notes in real-time. As the robot draws, parameters like pen speed, curvature, direction, and position translate into pitch, volume, timbre, and rhythm.

**Tech Stack:**
- Web Audio API + Tone.js for synthesis
- Mapping engine: curvature → pitch (high curvature = high notes), speed → tempo, X position → stereo pan, Y position → filter frequency
- MIDI export for further composition in a DAW

**Educational Value:** Math-music connection (frequency ratios, harmonics, Fourier series), synesthesia-style cross-modal thinking

**Priority:** Medium — unique differentiator, moderate implementation effort

---

## 4. Version Control for Drawings

**What:** A visual "git" for student work. Students can branch off a drawing, try variations, diff two versions side-by-side, and merge the best parts.

**Implementation:**
- SVG tree structure: each save creates a node with parent reference
- Diff view: overlay two SVGs with color-coded additions/deletions
- Branch: "try a variation" creates a fork from the current drawing
- Merge: student selects paths from two versions to combine
- Timeline UI: horizontal commit graph, click any node to restore

**Educational Value:** Version control concepts through art (branching, diffing, merging), experimental mindset (low cost of trying variations)

**Priority:** Medium — high conceptual value, builds on existing drawing save system

---

## 5. Physics Simulation Mode

**What:** Add gravity, friction, and collision to the 2D simulator. Students describe a physical scenario ("a ball rolling down a ramp"), the physics engine simulates it, and the robot draws the resulting trajectory.

**Tech Stack:**
- Matter.js for 2D physics
- Simulation-to-SVG converter: sample body positions at fixed intervals, export as polyline
- New simulator tab: "Physics" alongside existing 2D/3D views

**Educational Value:** Kinematics, Newtonian mechanics, trajectory prediction vs actual outcome

**Priority:** High — directly extends the existing simulator, strong STEM connection

---

## 6. Student-Created Concepts

**What:** Level 10+ students unlock the "Concept Creator" — a guided wizard where they define their own concept with hooks, challenges, layers, and evaluation criteria. Their concept gets published to the classroom knowledge map for peers to try.

**Implementation:**
- Wizard UI: step-by-step form (title, domain, hook question, 3 layers with activities, evaluation rubric)
- AI assist: Claude helps refine their concept description and suggests challenge ideas
- Peer review: 3 classmates must complete the concept before it goes "live" on the map
- Creator gets XP when peers complete their concept

**Educational Value:** Instructional design, empathy (teaching others), mastery demonstration (you truly understand something when you can teach it)

**Priority:** High — ties directly into gamification (Lv.10 unlock), builds community

---

## 7. AR Overlay Mode

**What:** Phone camera shows the physical paper with AR annotations overlaid in real-time — path predictions, measurement rulers, angle guides, and coordinate grid.

**Tech Stack:**
- Existing phone-to-desktop camera stream
- AR.js or custom canvas overlay on the phone side
- AprilTag provides the reference frame for overlay alignment
- Annotations rendered as semi-transparent SVG overlaid on the camera feed

**Educational Value:** Spatial reasoning, measurement skills, connecting digital simulation to physical reality

**Priority:** Medium — leverages existing camera infrastructure, high wow factor

---

## 8. Export to Fabrication

**What:** One-click export of any drawing into fabrication-ready formats.

**Supported Formats:**
- **DXF** — for laser cutters and CNC routers
- **STL** — extrude SVG outline into a 3D printable border/cookie cutter
- **Embroidery DST/PES** — convert paths to stitch patterns
- **Plotter HPGL** — for vinyl cutters and large-format plotters
- **PDF** — print-ready with crop marks and metadata

**Implementation:**
- Backend conversion endpoints using existing Python SVG data
- `svg2dxf`, `svg2stl` (OpenSCAD linear_extrude), embroidery via `pyembroidery`

**Educational Value:** Bridging digital to physical, understanding format constraints, manufacturing awareness

**Priority:** High — immediate practical value, enables cross-tool workflows

---

## 9. Parent/Teacher Dashboard

**What:** A web dashboard (extends existing admin-web app) showing:
- Weekly progress digest per student
- Concept heat map (which concepts are popular/struggling)
- Streak calendar (GitHub-style contribution grid)
- Downloadable portfolio of student work as a formatted PDF
- Class-wide analytics: average level, most common badges, engagement trends

**Implementation:**
- Extend `apps/admin-web` with new dashboard pages
- Backend: aggregate endpoint `GET /api/progress/class-summary`
- PDF generation: Puppeteer or `@react-pdf/renderer` for portfolio export
- Email digest: optional weekly email via SendGrid or similar

**Educational Value:** Metacognition (students see their own patterns), parent engagement, teacher planning support

**Priority:** High — key for school adoption and parent buy-in
