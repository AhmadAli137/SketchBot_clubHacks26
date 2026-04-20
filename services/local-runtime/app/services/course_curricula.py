"""
Static course curricula for Robot Lab concept IDs.

Written for 8th grade (~13-14 year olds): hands-on intuition first, light math,
each challenge is achievable in a single class period, but the concepts ladder
into real robotics and CS topics they'll encounter in high school and beyond.
"""
from __future__ import annotations

ROBOT_LAB_CONCEPT_IDS = {"maze-marathon", "sumo-arena", "cone-ring-gauntlet"}


def get_static_curriculum(concept_id: str, age_group: str = "builder") -> dict | None:
    """Return a static LessonPlan dict or None if concept_id is not a Robot Lab concept."""
    if concept_id == "maze-marathon":
        return _maze_marathon(age_group)
    if concept_id == "sumo-arena":
        return _sumo_arena(age_group)
    if concept_id == "cone-ring-gauntlet":
        return _cone_ring_gauntlet(age_group)
    return None


# ─── Maze Marathon ────────────────────────────────────────────────────────────
#
# Learning arc: keeping track of where you are → finding walls → following walls
#               → remembering intersections → finding the exit
# 8th grade hook: "this is how a Roomba decides where it's been"

def _maze_marathon(age_group: str) -> dict:
    steps = [
        {
            "id": "step-1",
            "type": "narration",
            "phase": "Welcome",
            "duration_s": 16,
            "narration": {
                "text": "Welcome to the Maze Marathon! 🧭 The robot can't see the whole maze — it only knows what its sensors tell it right now. Your job: write code that helps it find the exit using just those clues.",
                "voice_style": "energetic",
            },
            "bot_emotion": "excited",
            "transitions": {"enter": "slide-up", "exit": "fade"},
        },
        {
            "id": "step-2",
            "type": "narration",
            "phase": "Keep Track",
            "duration_s": 18,
            "narration": {
                "text": "Imagine walking a maze blindfolded. You'd count your steps and turns to remember where you are. Robots do the same thing — each wheel rotation is like a footstep. This is called dead reckoning, and it's how submarines and spacecraft navigate too.",
                "voice_style": "calm",
            },
            "bot_emotion": "thinking",
            "transitions": {"enter": "fade", "exit": "fade"},
        },
        {
            "id": "step-3",
            "type": "quiz",
            "phase": "Position Quiz",
            "duration_s": 20,
            "quiz": {
                "question": "SketchBot drives 30 cm forward, turns left 90°, then drives 30 cm. Where is it compared to where it started?",
                "options": [
                    "Back at the start — it went in a circle",
                    "30 cm ahead and 30 cm to the left — like the corner of a square",
                    "60 cm straight ahead",
                    "It's impossible to know without GPS",
                ],
                "correct_index": 1,
                "explanation": "Each move stacks onto the last. Forward 30 cm + turn left + forward 30 cm = the corner of a square. Robots keep a running tally of every move to estimate their position.",
            },
            "bot_emotion": "thinking",
            "transitions": {"enter": "slide-up", "exit": "fade"},
            "xp_reward": 15,
        },
        {
            "id": "step-4",
            "type": "drawing",
            "phase": "Drift Demo",
            "duration_s": 24,
            "drawing": {"prompt": "a dotted path showing where the robot thinks it went vs where it actually went"},
            "narration": {
                "text": "Here's the catch: wheels slip. One tiny wobble per step adds up fast. After 10 moves, the robot thinks it's here — but it's really over there. That's why touching walls is actually helpful information.",
                "voice_style": "calm",
            },
            "bot_emotion": "curious",
            "transitions": {"enter": "slide-left", "exit": "fade"},
        },
        {
            "id": "step-5",
            "type": "challenge",
            "phase": "Square Drive",
            "duration_s": 45,
            "challenge": {
                "instruction": "Program SketchBot to drive a square: forward, turn left, forward, turn left, forward, turn left, forward. Does it end up where it started? Try it 3 times and see if the error is always the same.",
                "hints": [
                    "Use your block editor: set speed, set distance, turn 90° left",
                    "If the square drifts to the right each time, that's your wheel friction being slightly unequal — totally normal!",
                    "Consistent drift = systematic error. Random drift = noise. Which does yours look like?",
                ],
                "success_criteria": "Robot completes the square and returns within about 5 cm of start",
                "input_mode": "blocks",
            },
            "bot_emotion": "encouraging",
            "transitions": {"enter": "scale", "exit": "fade"},
            "xp_reward": 20,
        },
        {
            "id": "step-6",
            "type": "reveal",
            "phase": "Walls Help!",
            "duration_s": 16,
            "narration": {
                "text": "💡 Walls aren't obstacles — they're landmarks! When SketchBot bumps a wall, it knows exactly where one surface is. That resets its uncertainty. Real robots use landmarks the same way: GPS satellites, painted lines on a warehouse floor, AprilTag markers.",
                "voice_style": "dramatic",
            },
            "bot_emotion": "curious",
            "transitions": {"enter": "fade", "exit": "fade"},
        },
        {
            "id": "step-7",
            "type": "narration",
            "phase": "Follow the Wall",
            "duration_s": 18,
            "narration": {
                "text": "There's a trick that works in almost any maze: always keep the left wall next to you. Turn left when you can, go straight when you can't, turn right when you're stuck. Follow this rule and you will eventually find the exit — guaranteed.",
                "voice_style": "calm",
            },
            "bot_emotion": "thinking",
            "transitions": {"enter": "fade", "exit": "fade"},
        },
        {
            "id": "step-8",
            "type": "challenge",
            "phase": "Wall Follow",
            "duration_s": 55,
            "challenge": {
                "instruction": "Program SketchBot to follow the left wall down a hallway. It should stay roughly 8 cm away. If it gets too close, nudge right. If the wall disappears on the left, turn left to find it again.",
                "hints": [
                    "Read the left distance sensor. If it reads less than 7 cm → steer right. If it reads more than 10 cm → steer left.",
                    "You don't need exact numbers — just a nudge. Try 'slight left' or 'slight right' in your blocks.",
                    "Test in a straight hallway first. Once that works, add a corner.",
                ],
                "success_criteria": "Robot follows the wall down a straight hallway without touching it",
                "input_mode": "blocks",
            },
            "bot_emotion": "encouraging",
            "transitions": {"enter": "scale", "exit": "fade"},
            "xp_reward": 25,
        },
        {
            "id": "step-9",
            "type": "quiz",
            "phase": "Fork in the Road",
            "duration_s": 20,
            "quiz": {
                "question": "SketchBot is following the left wall. It reaches a fork: the left side opens up (no wall) and the path ahead continues. What should it do?",
                "options": [
                    "Stop — it doesn't know which way to go",
                    "Always go straight — left-wall rule only applies to walls, not open spaces",
                    "Turn left into the opening — left-wall rule says prefer left turns when available",
                    "Turn right — always take the less obvious path",
                ],
                "correct_index": 2,
                "explanation": "Left-wall rule: take every left turn you can. This explores the maze systematically and guarantees you'll find the exit in a simple maze. It's the same idea behind many search algorithms in computer science.",
            },
            "bot_emotion": "thinking",
            "transitions": {"enter": "slide-up", "exit": "fade"},
            "xp_reward": 15,
        },
        {
            "id": "step-10",
            "type": "reveal",
            "phase": "It's a Graph!",
            "duration_s": 18,
            "narration": {
                "text": "💡 Here's something mind-blowing: every maze is secretly a graph. Each intersection is a dot (node). Each corridor is a line (edge). Google Maps, GPS, even social networks all use the same math underneath. Once you see mazes as graphs, you can use algorithms to solve them fast.",
                "voice_style": "dramatic",
            },
            "bot_emotion": "curious",
            "transitions": {"enter": "fade", "exit": "fade"},
        },
        {
            "id": "step-11",
            "type": "challenge",
            "phase": "Remember & Return",
            "duration_s": 50,
            "challenge": {
                "instruction": "Add memory to your wall-follower: every time SketchBot reaches an intersection (a spot where it could go multiple ways), save a note. When it finds the exit, can it use those notes to drive back to the start faster?",
                "hints": [
                    "Keep a list of turns: [Left, Right, Left, Straight, Left…]",
                    "To return home: read the list backwards and do the opposite of each turn",
                    "This trick is called backtracking — it's how Theseus beat the Minotaur's maze in Greek mythology!",
                ],
                "success_criteria": "Robot reaches the exit and can navigate back to start using saved turn history",
                "input_mode": "blocks",
            },
            "bot_emotion": "encouraging",
            "transitions": {"enter": "scale", "exit": "fade"},
            "xp_reward": 25,
        },
        {
            "id": "step-12",
            "type": "challenge",
            "phase": "Final Run",
            "duration_s": 80,
            "challenge": {
                "instruction": "🏁 FINAL MAZE RUN! SketchBot enters a maze it has never seen. Use everything: wall-following to explore, memory to avoid dead ends, and backtracking to find the fastest path out. You get two practice runs, then one scored attempt.",
                "hints": [
                    "First run: explore and build your memory. Second run: optimize your path based on what you learned.",
                    "Dead end = back up and mark that corridor as 'visited'",
                    "Scoring: exit the maze + time bonus if you finish under 60 seconds",
                ],
                "success_criteria": "Robot exits the maze successfully",
                "input_mode": "blocks",
            },
            "bot_emotion": "excited",
            "transitions": {"enter": "slide-up", "exit": "fade"},
            "xp_reward": 50,
        },
        {
            "id": "step-13",
            "type": "celebrate",
            "phase": "Done!",
            "duration_s": 14,
            "narration": {
                "text": "🎉 Maze Marathoner! You used dead reckoning, wall-following, and memory — the same ideas inside every robot vacuum, delivery drone, and self-driving car. Next stop: computer science class where you'll see these as search algorithms.",
                "voice_style": "energetic",
            },
            "bot_emotion": "celebrating",
            "transitions": {"enter": "scale", "exit": "fade"},
            "xp_reward": 40,
        },
    ]

    estimated = sum(s["duration_s"] for s in steps)
    return {
        "title": "Maze Marathon: Find Your Way Out",
        "concept_id": "maze-marathon",
        "age_group": age_group,
        "layer": "applied",
        "estimated_duration_s": estimated,
        "steps": steps,
    }


# ─── Sumo Arena ───────────────────────────────────────────────────────────────
#
# Learning arc: pushing = force + grip → find the opponent → don't fall off
#               → state machines → strategy
# 8th grade hook: "you're basically programming a wrestler's instincts"

def _sumo_arena(age_group: str) -> dict:
    steps = [
        {
            "id": "step-1",
            "type": "narration",
            "phase": "Welcome",
            "duration_s": 16,
            "narration": {
                "text": "Welcome to the Sumo Arena! ⚔️ Two robots, one ring, last one standing wins. You don't need the fastest or heaviest robot — you need the smartest code. Let's build a champion.",
                "voice_style": "dramatic",
            },
            "bot_emotion": "excited",
            "transitions": {"enter": "slide-up", "exit": "fade"},
        },
        {
            "id": "step-2",
            "type": "narration",
            "phase": "Push Science",
            "duration_s": 18,
            "narration": {
                "text": "Pushing someone is really about friction. If your wheels grip the ground and theirs don't, you win — even if they're heavier. Rubber tires on a foam ring grip much better than plastic. That's why real sumo robots have special rubber wheels. It's physics, not magic.",
                "voice_style": "calm",
            },
            "bot_emotion": "thinking",
            "transitions": {"enter": "fade", "exit": "fade"},
        },
        {
            "id": "step-3",
            "type": "quiz",
            "phase": "Grip Quiz",
            "duration_s": 20,
            "quiz": {
                "question": "Two robots weigh the same. One has rubber wheels, one has smooth plastic wheels. On a foam ring, which pushes harder?",
                "options": [
                    "The plastic wheels — smoother surface means less resistance",
                    "They're equal — grip only matters on slippery surfaces",
                    "The rubber wheels — more grip means the motor force actually moves the robot instead of just spinning the wheels",
                    "Whichever one has the faster motor",
                ],
                "correct_index": 2,
                "explanation": "Grip is the link between motor power and ground. Without grip, a powerful motor just spins the wheels in place. Rubber grips the foam ring, so the same motor force pushes the whole robot — that's traction.",
            },
            "bot_emotion": "thinking",
            "transitions": {"enter": "slide-up", "exit": "fade"},
            "xp_reward": 15,
        },
        {
            "id": "step-4",
            "type": "reveal",
            "phase": "Find the Enemy",
            "duration_s": 18,
            "narration": {
                "text": "💡 SketchBot has an infrared (IR) sensor on the front — the same technology as your TV remote. It bounces invisible light off objects and measures how much comes back. More light back = object is closer. That's how the robot knows where the opponent is.",
                "voice_style": "dramatic",
            },
            "bot_emotion": "curious",
            "transitions": {"enter": "fade", "exit": "fade"},
        },
        {
            "id": "step-5",
            "type": "challenge",
            "phase": "Search & Charge",
            "duration_s": 50,
            "challenge": {
                "instruction": "Program the Search & Charge move: SketchBot slowly spins in place. When the IR sensor detects something within 40 cm, it charges forward at full speed. When it loses the target, it goes back to spinning.",
                "hints": [
                    "Spin speed: slow (so it doesn't overshoot the target)",
                    "Charge trigger: IR sensor reading below 40 cm",
                    "After charging for 1 second, go back to search mode even if it still sees the target — prevents getting stuck",
                ],
                "success_criteria": "Robot finds and charges toward a stationary box within 5 seconds of starting",
                "input_mode": "blocks",
            },
            "bot_emotion": "encouraging",
            "transitions": {"enter": "scale", "exit": "fade"},
            "xp_reward": 25,
        },
        {
            "id": "step-6",
            "type": "quiz",
            "phase": "Balance Quiz",
            "duration_s": 20,
            "quiz": {
                "question": "You can add weight to your robot. Where's the best place to put it to make it hardest to tip over?",
                "options": [
                    "On top, as high as possible — more height = more stability",
                    "Low and centered over the wheels — low center of mass means harder to tip",
                    "At the very front — more weight at the attack point",
                    "It doesn't matter, weight is weight",
                ],
                "correct_index": 1,
                "explanation": "Low center of mass is the secret. Try balancing a tall glass vs a short wide mug — the short one is harder to knock over. Robots work the same way. Low + centered = stable.",
            },
            "bot_emotion": "thinking",
            "transitions": {"enter": "slide-up", "exit": "fade"},
            "xp_reward": 15,
        },
        {
            "id": "step-7",
            "type": "narration",
            "phase": "Robot Brain States",
            "duration_s": 20,
            "narration": {
                "text": "Right now your robot does one thing. A real fighter needs to switch between behaviors: searching, charging, pushing, and escaping the edge. This is called a state machine — like a flowchart your code follows. It's one of the most important ideas in all of programming.",
                "voice_style": "calm",
            },
            "bot_emotion": "thinking",
            "transitions": {"enter": "fade", "exit": "fade"},
        },
        {
            "id": "step-8",
            "type": "challenge",
            "phase": "Build the Brain",
            "duration_s": 55,
            "challenge": {
                "instruction": "Build a 4-state robot brain: SEARCH (spin looking for target), CHARGE (full speed at target), PUSH (maintain contact, keep driving), ESCAPE (back up if edge sensor sees white). Each state switches to the next based on sensor readings.",
                "hints": [
                    "SEARCH → CHARGE: IR sensor sees something within 40 cm",
                    "CHARGE → PUSH: bump sensor triggers (you made contact!)",
                    "PUSH → ESCAPE: line sensor sees white (you're near the edge!)",
                    "ESCAPE → SEARCH: after backing up 15 cm and turning around",
                ],
                "success_criteria": "Robot cycles through all 4 states correctly when triggered",
                "input_mode": "blocks",
            },
            "bot_emotion": "encouraging",
            "transitions": {"enter": "scale", "exit": "fade"},
            "xp_reward": 30,
        },
        {
            "id": "step-9",
            "type": "quiz",
            "phase": "Edge Rule Quiz",
            "duration_s": 20,
            "quiz": {
                "question": "Your robot is pushing the opponent really hard. Suddenly the edge sensor sees white. What should it do?",
                "options": [
                    "Keep pushing — you're winning and stopping now might let them recover",
                    "Pause for 1 second to reconsider",
                    "Immediately escape — a robot that falls off loses no matter what",
                    "Turn sideways to push from a different angle",
                ],
                "correct_index": 2,
                "explanation": "Edge detection always wins. It doesn't matter how well you're pushing — falling off the ring is instant loss. The ESCAPE state should interrupt everything else, no exceptions.",
            },
            "bot_emotion": "thinking",
            "transitions": {"enter": "slide-up", "exit": "fade"},
            "xp_reward": 15,
        },
        {
            "id": "step-10",
            "type": "narration",
            "phase": "Think Ahead",
            "duration_s": 18,
            "narration": {
                "text": "Advanced sumo is about prediction. Instead of always charging head-on, try approaching from the side — it's harder to resist. If your opponent always charges straight, spin out of the way and let them run off the edge themselves. Anticipation beats reaction speed.",
                "voice_style": "dramatic",
            },
            "bot_emotion": "curious",
            "transitions": {"enter": "fade", "exit": "fade"},
        },
        {
            "id": "step-11",
            "type": "challenge",
            "phase": "Final Match",
            "duration_s": 80,
            "challenge": {
                "instruction": "⚔️ FINAL MATCH! Best of 3. Your programmed robot faces the arena opponent. Before round 1, you have 2 minutes to finalize your code. Watch round 1, then you get 1 minute to adjust before rounds 2 and 3.",
                "hints": [
                    "Watch where your robot loses — is it the edge escape not triggering fast enough? Is the search spin too fast to detect the opponent?",
                    "A small tweak to one threshold can change everything",
                    "If you keep losing head-on, try adding a 'side approach' — charge at an angle instead of straight",
                ],
                "success_criteria": "Win at least 1 of 3 bouts",
                "input_mode": "blocks",
            },
            "bot_emotion": "excited",
            "transitions": {"enter": "slide-up", "exit": "fade"},
            "xp_reward": 50,
        },
        {
            "id": "step-12",
            "type": "celebrate",
            "phase": "Done!",
            "duration_s": 14,
            "narration": {
                "text": "🎉 Sumo Champion! You used physics (traction), sensors (IR + edge), and state machines (the same concept behind every app, game, and traffic light) to build a competitive robot. Every video game character uses state machines too.",
                "voice_style": "energetic",
            },
            "bot_emotion": "celebrating",
            "transitions": {"enter": "scale", "exit": "fade"},
            "xp_reward": 40,
        },
    ]

    estimated = sum(s["duration_s"] for s in steps)
    return {
        "title": "Sumo Arena: Code the Champion",
        "concept_id": "sumo-arena",
        "age_group": age_group,
        "layer": "applied",
        "estimated_duration_s": estimated,
        "steps": steps,
    }


# ─── Cone Ring Gauntlet ───────────────────────────────────────────────────────
#
# Learning arc: measuring distance with sound → staying centered → detecting lines
#               → controlling a servo arm → timing everything together
# 8th grade hook: "precision is its own skill — accuracy beats speed here"

def _cone_ring_gauntlet(age_group: str) -> dict:
    steps = [
        {
            "id": "step-1",
            "type": "narration",
            "phase": "Welcome",
            "duration_s": 16,
            "narration": {
                "text": "Welcome to the Cone Ring Gauntlet! 🎯 Drive through cone gates, stop over ring pegs, and drop rings with your arm. Speed matters — but one knocked cone or dropped ring costs you more time than slowing down would have.",
                "voice_style": "energetic",
            },
            "bot_emotion": "excited",
            "transitions": {"enter": "slide-up", "exit": "fade"},
        },
        {
            "id": "step-2",
            "type": "narration",
            "phase": "Sonar Ranging",
            "duration_s": 18,
            "narration": {
                "text": "SketchBot uses an ultrasonic sensor to measure distance — the exact same idea as a bat's echolocation. It sends out a sound pulse, waits for the echo, and measures the time. Sound travels at about 343 meters per second, so a short wait = close object.",
                "voice_style": "calm",
            },
            "bot_emotion": "thinking",
            "transitions": {"enter": "fade", "exit": "fade"},
        },
        {
            "id": "step-3",
            "type": "quiz",
            "phase": "Distance Quiz",
            "duration_s": 20,
            "quiz": {
                "question": "SketchBot's sensor sends a pulse and gets the echo back after 0.00058 seconds (580 microseconds). Sound travels 343 m/s. How far away is the cone? Remember: the sound went there AND back.",
                "options": [
                    "About 20 cm away",
                    "About 10 cm away",
                    "About 40 cm away",
                    "About 5 cm away",
                ],
                "correct_index": 1,
                "explanation": "Distance = (time × speed) ÷ 2 = (0.00058 × 343) ÷ 2 ≈ 0.099 m ≈ 10 cm. You divide by 2 because the sound made a round trip. Your sensor does this math 40 times per second automatically!",
            },
            "bot_emotion": "thinking",
            "transitions": {"enter": "slide-up", "exit": "fade"},
            "xp_reward": 15,
        },
        {
            "id": "step-4",
            "type": "challenge",
            "phase": "Center Up",
            "duration_s": 50,
            "challenge": {
                "instruction": "Program SketchBot to center itself between two cones. It has left and right distance sensors. When left reads more than right, nudge left. When right reads more than left, nudge right. Stop when both sides are roughly equal.",
                "hints": [
                    "You don't need exact centimeters — just 'is left bigger than right?' or 'is right bigger than left?'",
                    "Make the nudge small so it doesn't overshoot. Think of it like steering a car into a parking spot slowly.",
                    "Repeat the check in a loop: read → compare → nudge → read → compare → nudge",
                ],
                "success_criteria": "Robot stops roughly centered between two cones placed 25 cm apart",
                "input_mode": "blocks",
            },
            "bot_emotion": "encouraging",
            "transitions": {"enter": "scale", "exit": "fade"},
            "xp_reward": 25,
        },
        {
            "id": "step-5",
            "type": "reveal",
            "phase": "Line Sensors",
            "duration_s": 18,
            "narration": {
                "text": "💡 The ring pegs sit on colored markers on the floor. SketchBot has sensors underneath that can tell dark from light — they shine invisible infrared light down and measure the reflection. Dark surfaces absorb it, light surfaces bounce it back. That's how the robot knows it's over a peg.",
                "voice_style": "dramatic",
            },
            "bot_emotion": "curious",
            "transitions": {"enter": "fade", "exit": "fade"},
        },
        {
            "id": "step-6",
            "type": "challenge",
            "phase": "Find the Peg",
            "duration_s": 50,
            "challenge": {
                "instruction": "Drive SketchBot slowly across the peg field. When the center floor sensor sees a dark marker, stop. The ring holder is a little bit in front of the sensor — after detecting the marker, creep forward just 4 cm more so the ring is directly over the peg.",
                "hints": [
                    "Slow speed matters here — at full speed you'll overshoot by a lot",
                    "Detection: sensor value drops suddenly when it crosses the dark marker",
                    "The extra 4 cm: count wheel rotations (or use a short timed drive at slow speed)",
                ],
                "success_criteria": "Ring holder stops within about 1 cm of the peg center",
                "input_mode": "blocks",
            },
            "bot_emotion": "encouraging",
            "transitions": {"enter": "scale", "exit": "fade"},
            "xp_reward": 25,
        },
        {
            "id": "step-7",
            "type": "reveal",
            "phase": "Servo Arms",
            "duration_s": 18,
            "narration": {
                "text": "💡 Servo motors are precision angle motors — you tell them exactly what angle to hold, and they hold it. Unlike regular motors that just spin, a servo locks into position. SketchBot's ring arm uses a servo: send the command, it moves to that angle and stays there.",
                "voice_style": "dramatic",
            },
            "bot_emotion": "curious",
            "transitions": {"enter": "fade", "exit": "fade"},
        },
        {
            "id": "step-8",
            "type": "challenge",
            "phase": "Arm Calibration",
            "duration_s": 50,
            "challenge": {
                "instruction": "Find the three key servo angles for the ring arm: HOLD (ring is gripped, arm up), LOWER (arm down near the peg), RELEASE (arm opens to drop the ring). Then sequence them: lower → brief pause → release → raise back to hold.",
                "hints": [
                    "Start at angle 90° (middle) and adjust up or down by 10° increments until it looks right",
                    "The pause at LOWER is important — if you release immediately, the ring misses the peg",
                    "Run the full sequence 3 times to make sure it's reliable before moving on",
                ],
                "success_criteria": "Arm deposits the ring cleanly onto the peg 3 times in a row",
                "input_mode": "blocks",
            },
            "bot_emotion": "encouraging",
            "transitions": {"enter": "scale", "exit": "fade"},
            "xp_reward": 25,
        },
        {
            "id": "step-9",
            "type": "quiz",
            "phase": "Time It Out",
            "duration_s": 20,
            "quiz": {
                "question": "You need to deposit 4 rings. Each approach takes 5 s, centering takes 3 s, and dropping the ring takes 2 s. You have 60 seconds. Do you have enough time?",
                "options": [
                    "No — (5+3+2) × 4 = 40 s, but travel between pegs isn't counted",
                    "Yes — (5+3+2) × 4 = 40 s which is under 60 s, leaving 20 s for travel between pegs",
                    "Exactly enough — no room for error",
                    "You need to calculate travel time first before knowing",
                ],
                "correct_index": 1,
                "explanation": "40 seconds for 4 rings leaves 20 seconds to move between pegs — about 5 seconds each, which is plenty. Doing this math before you run helps you decide whether to rush or take it carefully.",
            },
            "bot_emotion": "thinking",
            "transitions": {"enter": "slide-up", "exit": "fade"},
            "xp_reward": 15,
        },
        {
            "id": "step-10",
            "type": "challenge",
            "phase": "Final Gauntlet",
            "duration_s": 80,
            "challenge": {
                "instruction": "🎯 FINAL GAUNTLET! Drive the full course: 2 cone gates, 4 ring pegs, 60-second time limit. Combine your centering, peg detection, and arm control. A knocked cone = 5 second penalty. A missed ring = 10 second penalty.",
                "hints": [
                    "Plan your route before you start: which peg first? Don't zigzag.",
                    "Cone gates: use your centering code. Don't rush them — the penalty isn't worth it.",
                    "If you miss a ring alignment, back up a little and try again. One retry costs 4 s; a missed ring costs 10 s.",
                ],
                "success_criteria": "Complete at least 3 of 4 rings without knocking any cones",
                "input_mode": "blocks",
            },
            "bot_emotion": "excited",
            "transitions": {"enter": "slide-up", "exit": "fade"},
            "xp_reward": 50,
        },
        {
            "id": "step-11",
            "type": "celebrate",
            "phase": "Done!",
            "duration_s": 14,
            "narration": {
                "text": "🎉 Gauntlet Complete! Ultrasonic ranging, centering algorithms, line detection, servo calibration — you just built the skill stack used in real warehouse robots that sort packages and place parts all day long. That's not just robotics, that's automation engineering.",
                "voice_style": "energetic",
            },
            "bot_emotion": "celebrating",
            "transitions": {"enter": "scale", "exit": "fade"},
            "xp_reward": 40,
        },
    ]

    estimated = sum(s["duration_s"] for s in steps)
    return {
        "title": "Cone Ring Gauntlet: Precision Run",
        "concept_id": "cone-ring-gauntlet",
        "age_group": age_group,
        "layer": "applied",
        "estimated_duration_s": estimated,
        "steps": steps,
    }
