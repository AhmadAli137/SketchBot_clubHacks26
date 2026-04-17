# Makerspace Program: "Build Your Own Feature"

An 8-week curriculum where students go from users to creators — designing, building, and shipping their own SketchBot features. Students stop being consumers of the platform and become contributors.

**Prerequisites:** Students should have completed at least 3 concepts and reached Level 5 in the gamification system.

**Space Requirements:** Makerspace with 3D printers, soldering stations, laptops with Git installed, and internet access.

**Group Size:** 8-16 students, ideally with 1-2 mentors

---

## Weekly Curriculum

### Week 1: Reverse Engineering

**Theme:** Understand the machine before you change it

**Activities:**
- Carefully disassemble a SketchBot (guided teardown, not destructive)
- Identify and label every component: motors, drivers, microcontroller, power supply, sensors
- Draw a full system diagram on a whiteboard (inputs → processing → outputs)
- Create a Bill of Materials spreadsheet with component costs
- Reassemble and verify it still works

**Skills Learned:**
- Systems thinking
- Technical documentation
- BOM analysis and cost estimation
- Mechanical assembly/disassembly

**Deliverable:** A poster-sized system diagram displayed in the makerspace

---

### Week 2: Tool Head Design

**Theme:** Design a physical modification

**Activities:**
- Survey existing tool heads (pen, marker) and identify the mounting interface
- Brainstorm new tool ideas: chalk adapter, brush mount, stippling pen, engraver, stamp
- CAD the tool head in Onshape (free) or Fusion 360 (free for education)
- 3D print v1, test fit, measure tolerances
- Iterate: identify what failed, redesign, print v2
- Document the design with dimensions and assembly instructions

**Skills Learned:**
- CAD modeling (parametric design)
- Tolerancing and fit (clearance vs interference)
- Iterative prototyping (fail fast, learn fast)
- Technical drawing and documentation

**Deliverable:** A working 3D-printed tool head that mounts to the SketchBot

---

### Week 3: Sensor Add-On

**Theme:** Give the robot new senses

**Activities:**
- Choose a sensor: ultrasonic distance, IR proximity, color sensor, temperature, flex sensor
- Wire the sensor to the SketchBot's microcontroller (breadboard first, then soldered)
- Write firmware to read the sensor and send data over serial/WiFi
- Build a simple data visualization in the desktop app (real-time chart)
- Design an experiment: "How does the robot's drawing change based on sensor input?"

**Skills Learned:**
- Electronics fundamentals (voltage dividers, pull-up resistors, ADC)
- Arduino/ESP32 programming
- Serial communication protocols
- Data visualization
- Experimental design

**Deliverable:** A sensor module that plugs into the SketchBot and displays live data in the app

---

### Week 4: Custom Concept Card

**Theme:** Teach others what you know

**Activities:**
- Choose a STEM concept the student is passionate about (fractals, tessellations, sound waves, orbits)
- Write the concept definition using the existing schema: hook question, 3 layers (intuitive/structural/precise), starter prompts, evaluation rubric
- Create visual examples: what does a successful drawing look like at each layer?
- Test the concept on 2-3 classmates; observe where they get confused
- Revise based on feedback
- Submit for peer review (3 classmates must complete it)

**Skills Learned:**
- Instructional design
- Empathy mapping (understanding your audience)
- Rubric writing and assessment design
- User testing and iterative improvement
- Technical writing

**Deliverable:** A published concept card on the classroom knowledge map

---

### Week 5: AI Prompt Engineering

**Theme:** Shape the AI's personality and teaching style

**Activities:**
- Study the existing tutor personas (Explorer, Builder, Engineer) in `tutor_service.py`
- Create a new persona: define voice, vocabulary level, teaching style, analogies
- Write the system prompt (300-500 words)
- A/B test the persona with 3 students from different age groups
- Measure engagement: response length, follow-up questions asked, time on task
- Iterate the prompt based on qualitative feedback
- Compare to the existing personas: what works better? What's worse?

**Skills Learned:**
- Prompt engineering (system prompts, few-shot examples, output formatting)
- A/B testing methodology
- Qualitative data analysis
- Understanding AI capabilities and limitations
- Technical writing for AI systems

**Deliverable:** A tested persona prompt with an A/B comparison report

---

### Week 6: Feature Coding Sprint

**Theme:** Ship real software

**Activities:**
- Review the project backlog (GitHub Issues or a shared Trello board)
- Pick a feature to implement — or propose a new one and get mentor approval
- Set up the development environment (clone repo, install deps, run locally)
- Pair-program with a mentor: write code, commit, push
- Write a pull request description explaining the change
- Get code review from another student

**Feature Ideas (appropriate for this level):**
- Add a new block type to the block editor
- Create a new drawing export format (e.g., PNG, PDF)
- Build a "drawing of the day" feature on the home screen
- Add keyboard shortcuts to the prompt composer
- Create a dark/light mode toggle animation
- Build a "streak calendar" visualization (GitHub-style)

**Skills Learned:**
- Git workflow (branch, commit, PR, review)
- TypeScript or Python (depending on feature)
- Code review etiquette
- Reading and navigating a real codebase
- Shipping software that others will use

**Deliverable:** A merged pull request in the SketchBot repository

---

### Week 7: Integration & QA

**Theme:** Make it work for everyone

**Activities:**
- Merge all features from Week 6 into a staging branch
- Run user testing sessions with younger students (ages 6-10)
- Document bugs with reproduction steps, screenshots, and severity ratings
- Fix bugs (prioritize critical and major)
- Write user-facing documentation for new features
- Update the changelog

**Skills Learned:**
- Integration testing
- User research with real users
- Bug triage and prioritization
- Technical writing (user docs, not code docs)
- Collaboration under deadline pressure

**Deliverable:** A stable build with all features working and documented

---

### Week 8: Demo Day & Open Source

**Theme:** Share your work with the world

**Activities:**
- Prepare a 5-minute presentation per student/team: problem, solution, demo, learnings
- Set up demo stations in the makerspace for hands-on exploration
- Invite families, school administrators, and community members
- Record presentations for portfolio
- Publish contributions to the SketchBot open-source repository
- Write a "contributor profile" for the project README
- Award Maker Badges in a ceremony

**Skills Learned:**
- Public speaking and presentation design
- Live demo skills (always have a backup plan)
- Portfolio building
- Open-source contribution (licensing, documentation, community norms)
- Celebration and reflection

**Deliverable:** A public presentation, published open-source contributions, and a personal portfolio entry

---

## Maker Badges

Earned throughout the program. These integrate with the existing gamification system.

| Badge | Criteria | XP Reward |
|-------|----------|-----------|
| Hardware Hacker | Ship a physical modification that works reliably for 3+ uses | 200 XP |
| Code Contributor | Get a pull request merged into the main repository | 200 XP |
| Curriculum Designer | Create a concept card that 3+ students complete successfully | 150 XP |
| QA Champion | Find and document 5+ bugs during integration week | 100 XP |
| Demo Star | Present your feature to a live audience on Demo Day | 150 XP |
| Open Source Citizen | Publish documentation that helps another maker build on your work | 100 XP |
| Full Stack Maker | Earn all 6 Maker Badges in a single program run | 500 XP (bonus) |

---

## Student Project Gallery (Inspiration)

Past student projects and ideas that could emerge from this program:

- **Glow-in-the-dark pen adapter** — A UV LED ring that charges phosphorescent paper as the bot draws. The lights go off and the drawing glows.
- **Dance mode** — The bot traces choreography patterns while music plays, synced to BPM. Students define dance moves as parameterized paths.
- **Braille writer** — A solenoid tool head that embosses dots on thick paper, converting text input to tactile output. Accessibility meets robotics.
- **Weather artist** — Pulls live weather API data and generates a drawing that visually represents the forecast (rain = wavy lines, sun = radial burst, wind = directional strokes).
- **Portrait bot** — Phone camera captures a face, edge detection (Canny) generates an SVG contour sketch, and the robot draws a stylized portrait.
- **Maze solver** — Students draw a maze on paper, the camera detects walls via computer vision, and the robot draws the solution path in a different color.
- **Musical score writer** — Students hum a melody, Whisper transcribes it, a pitch detection algorithm maps notes to staff positions, and the robot draws the sheet music.

---

## Logistics & Materials

**Per-student cost estimate:** ~$15 (consumables: filament, wire, markers, paper)

**Shared equipment needed:**
- 2-3 3D printers (any FDM printer works)
- Soldering stations with safety equipment
- Laptops with VS Code, Git, Node.js, Python installed
- Internet access for AI features and GitHub
- Whiteboard and markers for system diagrams
- Presentation screen/projector for Demo Day

**Mentor qualifications:**
- Comfortable with basic electronics (soldering, breadboarding)
- Can navigate a TypeScript/Python codebase
- Doesn't need to be an expert — the curriculum provides enough structure for a motivated volunteer
