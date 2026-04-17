# Long-Term Vision (2-3 Year Horizon)

SketchBot starts as a drawing robot but grows into a platform for physical computing education. The progression: draw with language, draw with code, draw with math, then build your own drawing machine. Every abstraction layer the student climbs is a real engineering skill.

---

## Platform Evolution

### Year 1: Classroom Product

**Focus:** Polish the core experience, prove it works in 10-20 classrooms

**Milestones:**
- Stable Classroom Edition kit shipping to early-adopter schools
- Curriculum aligned to NGSS and Common Core Math
- Teacher dashboard with progress reporting
- 5+ concept cards with full 3-layer curriculum
- Gamification system driving daily engagement (streaks, XP, levels)
- First cohort of Makerspace Program graduates

### Year 2: Cloud Platform & Community

**Focus:** Scale beyond the single classroom, build a creator ecosystem

**Milestones:**
- Cloud backend for persistent student profiles across devices and schools
- Cross-school leaderboards and inter-classroom challenges ("Robot Art Battle")
- Student-created concept marketplace (creators earn XP when peers complete their concepts)
- Teacher marketplace for lesson packs (free and paid tiers)
- Parent portal with weekly progress digests and portfolio downloads
- Mobile app parity: full progress tracking, offline concept exploration, AR overlay mode
- API for third-party integrations (LMS, Google Classroom, Clever)

### Year 3: Platform & Hardware Ecosystem

**Focus:** Become the go-to physical computing education platform

**Milestones:**
- Robot fleet management: multi-bot orchestration for swarm programming
- Sim-to-real pipeline: design in VR/AR, simulate physics, fabricate with the real bot
- SketchBot Pro (DIY kit) available for retail
- Additional robot modules (laser, CNC, arm, 3D print head) as expansion packs
- Student-run marketplace: advanced students sell custom tool heads, concept packs, or lesson plans
- Research partnerships with universities studying spatial reasoning and STEM learning
- Grant funding from NSF, DARPA education initiatives, or similar

---

## Key Strategic Bets

### Bet 1: AI-native education wins

The tutor isn't a chatbot bolted on — it's the core teaching engine. As foundation models improve, the tutor gets better at personalizing pace, detecting confusion, and generating age-appropriate explanations. This compounds: every model upgrade improves the product without new code.

### Bet 2: Physical + digital is more engaging than either alone

Pure software (Scratch, Code.org) teaches logic but lacks the visceral feedback of a physical machine drawing on real paper. Pure hardware (LEGO Mindstorms) is engaging but expensive and limited in scope. SketchBot bridges both: the AI generates, the student guides, the robot makes it real.

### Bet 3: Creators, not consumers

The endgame isn't students using SketchBot — it's students building on SketchBot. The Makerspace Program, Student-Created Concepts, and DIY Pro kit all serve this thesis. The platform succeeds when students outgrow the guided experience and start inventing their own.

### Bet 4: Teacher adoption requires zero friction

Teachers won't use a tool that requires robotics expertise. The product must work for a 3rd-grade teacher who has never programmed. This means: pre-built lessons, one-click setup, curriculum alignment documentation, and a dashboard that speaks in educational outcomes, not technical metrics.

---

## Revenue Model Options

| Model | How It Works | Margin Profile |
|-------|-------------|----------------|
| Hardware kits | One-time sale of Starter Kit, Classroom Edition, Pro Kit | Medium (hardware margins ~40-50%) |
| Expansion modules | Pen v2, laser, arm, 3D print head sold as add-ons | High (smaller, higher-margin accessories) |
| Classroom subscription | Annual per-classroom license for cloud features, teacher dashboard, lesson packs | High (SaaS recurring) |
| Concept marketplace | Platform fee (15-20%) on student/teacher-created content | Very high (marketplace economics) |
| Camp licensing | Seasonal license for summer camps and libraries to run the program | Medium (bundled with hardware) |
| Professional development | Paid teacher training workshops and certification | High (services margin) |

---

## Competitive Differentiation

| Competitor | What They Do | SketchBot's Edge |
|-----------|-------------|------------------|
| LEGO Education (Spike, Mindstorms) | Pre-built kits, block programming | SketchBot is AI-native — prompt-to-action, not just block-to-action |
| Scratch / Code.org | Software-only coding education | SketchBot adds physical output — the robot draws on real paper |
| Makeblock (mBot) | Affordable classroom robots | SketchBot's AI tutor personalizes learning; mBot is self-guided |
| iRobot Education (Root) | Drawing robot for classrooms | SketchBot has deeper curriculum (3-layer system), AI evaluation, and gamification |
| Turtle graphics (Logo) | Classic CS education paradigm | SketchBot modernizes this: natural language input, AI generation, physical output |

The unique positioning: **SketchBot is the only platform where a student can describe an idea in plain language, watch an AI translate it to math, see a robot physically draw it, and then get personalized teaching about the STEM concepts involved — all in one session.**

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Hardware reliability in classrooms | Students lose trust, teachers abandon the product | Extensive QA, modular design for easy repair, loaner units |
| AI generates inappropriate content | Safety concern for schools | Content filtering layer, teacher approval queue for new prompts, age-gated vocabulary |
| Foundation model API costs at scale | Unsustainable unit economics | Caching (lesson plans are cacheable), model distillation for common interactions, batch generation at build time |
| Teacher resistance to AI in classrooms | Slow adoption | Position as "AI teaches the student, not replaces the teacher"; teacher controls all AI behavior |
| Competition from large ed-tech companies | Market pressure | Move fast on the creator ecosystem — user-generated content creates a moat that large companies can't replicate quickly |
