# SketchBot Blender Component Inventory

This file is the source of truth for the physical SketchBot parts represented in Blender.

Update this file whenever:
- a part is identified from a purchase link
- a part is added to the Blender scene
- a proxy part is replaced with a more accurate model
- a dimension is measured or corrected
- a component is removed or renamed in the scene

## Current Modeling Strategy

We are building the robot in this order:
1. Confirm the real-world bill of materials
2. Match the static assembly to photos and measurements
3. Replace rough proxies with exact or better CAD where available
4. Add animation controls only after the assembly is credible

The current Blender scene should prioritize:
- correct chassis orientation
- correct wheel / motor placement
- correct battery, board, servo, marker, caster, and tag plate placement
- simple readable materials

It should not prioritize:
- complex wiring
- advanced rigging
- full rigid-body physics

## Confirmed / Likely Parts

## Core Robot Structure

| Part | Status | Blender Status | Notes |
|---|---|---|---|
| 3D printed chassis | Confirmed | Imported | Present as `SketchBot_Chassis` / `SketchBot_Chassis_Root` |
| Tag holder (3D-printed square base) | Confirmed — `tag_holder.glb` imported | Imported GLB | 80×92×1.5mm flat plate at chassis front; tag face UP; `AprilTag_Holder` in scene |
| Front ball caster | Confirmed — large steel ball in oval silver housing | Proxy (Caster_Housing + Caster_Ball) | Mounts THROUGH tag holder from below; ball protrudes ~25mm under chassis |

## Drive System

| Part | Status | Blender Status | Notes |
|---|---|---|---|
| 2x yellow smart-car wheels | Confirmed from STEP file | **Real STEP geometry** | `Wheel.STEP` → `wheel.stl`; 68.9mm dia × 30mm wide; `Left_Wheel` / `Right_Wheel` in scene |
| 2x TT geared DC motors | Confirmed from STEP file | **Real STEP geometry** | `Gear Motor.STEP` → `gear_motor.stl`; STEP: shaft=Y (+19.55mm), can=Z (70.7mm), width=X (±11.25mm); **FLAT under chassis**: STEP Z→world Y (can horizontal front-to-back), STEP Y→world ±X (shaft through side wall), STEP X→world -Z (body below chassis); Left rot=(0,π/2,+π/2); Right rot=(0,π/2,-π/2); origin Z=-11.25mm (body spans -22.5 to 0mm); `Left_Motor` / `Right_Motor` |
| 2x motor mount blocks / printed holders | Confirmed from photos | Not modeled separately | Yellow 3D-printed bracket visible in photos; motor hangs below chassis with gearbox at Z<0, can inside chassis height |

## Electronics

| Part | Status | Blender Status | Notes |
|---|---|---|---|
| Dual 18650 battery holder/module | Confirmed | Proxy only | Rear top placement |
| 2x 18650 Li-ion cells | Confirmed | Proxy only | Green cylindrical cells visible in photos |
| L298N motor driver board | Confirmed | Proxy only | Center top board |
| Controller / dev board | Confirmed from photos | Proxy only | Right-side top board; exact model still to verify |
| USB power / battery board hardware | Visible in photos | Not modeled | Add later if needed |

## Actuation / Tooling

| Part | Status | Blender Status | Notes |
|---|---|---|---|
| Micro servo (SG90-style) | Confirmed | Proxy only | Mounted on front-left area |
| Marker tube / holder | Confirmed | Proxy only | Blue Expo marker in current build |

## Fasteners / Inserts / Secondary Hardware

| Part | Status | Blender Status | Notes |
|---|---|---|---|
| Screw assortment | Confirmed purchase | Not modeled | Only add if needed for close-up renders |
| Heat-set inserts / threaded inserts | Confirmed purchase | Not modeled | Only relevant if visible on printed parts |

## Purchase Link Mapping

These are the links provided so far, with our current best understanding.

| Link / ASIN | Current Identification | Confidence | Notes |
|---|---|---|---|
| `B07ZT619TD` | KeeYees L298N smart-car kit family | Medium | Likely source of L298N board, TT motors, and yellow wheels |
| `B07SZKNST4` | Dual 18650 battery holder / battery shield | Medium | Rear battery pack candidate |
| `B0DSB8JY8Q` | Micro servo motor | High | Servo title explicitly visible in URL |
| `L298N Motor Driver PDF` | L298N driver datasheet | High | Use for board dimensions |
| `B0C3926M1B` | Screw assortment kit | Medium | Not a primary visible part |
| `B0D41PW4GC` | Threaded / heat-set inserts | Medium | Not a primary visible part |
| `B07YYSW494` | Unknown / not yet confirmed | Low | Need product title or screenshot |
| `B0G3PTQ7FR` | Unknown / not yet confirmed | Low | Need product title or screenshot |
| `B0FJXFZL38` | Unknown / not yet confirmed | Low | Need product title or screenshot |
| `B0D7PDYSMS` | Unknown / not yet confirmed | Low | Need product title or screenshot |

## Known Dimensions

## Confirmed

| Part | Dimension |
|---|---|
| L298N motor driver board | `34 mm x 43 mm x 27 mm` from datasheet |

## Estimated For Current Proxy Modeling

These are placeholders and should be replaced with measured values.

| Part | Current Estimate |
|---|---|
| Wheel diameter | `68.9 mm` (from STEP — supersedes ~65mm estimate) |
| Wheel thickness | `30 mm` (from STEP — supersedes ~26mm estimate) |
| TT motor body | `22.5 × 29 × 70.7 mm` (axle along 70.7mm axis) — from STEP |
| 18650 cell | standard 18650 proportions |
| SG90 servo | standard micro-servo proportions |
| Tag plate | rough photo-matched proxy only |

## Scene Naming Conventions

When possible, use these names in Blender:

- `SketchBot_Chassis`
- `SketchBot_Chassis_Root`
- `Left_Wheel`
- `Right_Wheel`
- `Left_Motor`
- `Right_Motor`
- `Left_Motor_Block`
- `Right_Motor_Block`
- `Battery_Holder`
- `Battery_Cell_L`
- `Battery_Cell_R`
- `Motor_Driver`
- `Controller_Board`
- `Servo_Body`
- `Servo_Horn`
- `Marker_Tube`
- `Front_Caster`
- `AprilTag_Plate`

## Next Required Inputs

To improve the Blender model accurately, we still need:
- reference photos saved into `blender/references/`
- exact wheel diameter and thickness
- exact axle spacing
- exact servo model if not standard SG90
- exact controller board model
- tag plate dimensions
- caster dimensions
- battery holder dimensions

## Change Log

## 2026-04-19

- Motors now INSIDE chassis, sitting in side-wall cradle slots (confirmed good by user)
- LEFT motor: euler=(0,−π/2,+π/2); RIGHT motor: euler=(0,+π/2,−π/2)
- Both motors: can (STEP Z) → world −Y (forward inside chassis); shaft (STEP Y) → world ±X (exits side hole)
- Motor origin Z=14.25mm: body fills cradle Z[3, 25.5]mm (inner floor to main flat deck) ✓
- Motor origin Y=42mm: gearbox at Y[42, 66]mm (3.5mm past chassis rear), can at Y[−4.7, 42]mm inside chassis
- World bboxes: Left_Motor X[-71.4,-42.4] Y[-4.7,66.0] Z[3.0,25.5]mm; Right_Motor X[19.6,48.6] Y[-4.7,66.0] Z[3.0,25.5]mm
- Wheels FLIPPED: hub (STEP Z=−30mm face) now faces inward toward chassis to receive motor shaft
- LEFT wheel: Ry(−π/2), origin X=−101.4mm; RIGHT wheel: Ry(+π/2), origin X=+78.6mm
- Wheel bboxes: Left X[-101.4,-71.4]mm; Right X[48.6,78.6]mm (hub at chassis wall, tread outward)
- Saved scene to `blender/scenes/sketchbot_current.blend`

## 2026-04-18

- Imported `Gear Motor.STEP` and `Wheel.STEP` from `blender/assets/import/`
- Converted STEP → STL via cadquery (Python 3.12) for Blender import
- Confirmed motor dims: 22.5mm (X) × 29mm (Y, shaft depth) × 70.7mm (Z, can height); wheel: 68.9mm dia × 30mm thick
- STEP orientation confirmed from side-view: shaft exits at STEP Y=+19.55mm, can top at STEP Z=+46.7mm
- Left motor: rot=(0,0,+π/2) → shaft points -X (left); origin.x=-51.85mm, shaft tip at X=-71.4mm (chassis outer wall)
- Right motor: rot=(0,0,-π/2) → shaft points +X (right); origin.x=+29.05mm, shaft tip at X=+48.6mm
- Motor Z placement: shaft at world Z=0 (chassis floor level); gearbox hangs to Z=-24mm, can extends to Z=+46.7mm (mostly inside chassis height of 42.4mm)
- Wheel rot=(0,±π/2,0); hub face at chassis outer wall, tire extends outward 30mm
- Corrected wrong earlier placement (was Ry rotation = motor lying flat; correct is Rz = motor standing upright with can up)
- Removed old proxy hub/spoke/axle/motor-block objects; replaced with real STEP geometry
- Saved scene to `blender/scenes/sketchbot_current.blend`

## 2026-04-17

- Created this inventory file as the Blender hardware source of truth
- Recorded identified parts from the provided links and photos
- Marked several Amazon links as still unconfirmed pending exact product titles or screenshots
- Added a `Current Scene Status` section so the file tracks what is actually modeled in Blender
- Normalized the imported chassis root in Blender so scene placement now happens in true world space
- Rebuilt the major visible hardware as cleaner world-space proxy models instead of the earlier broken floating layout
- Saved the working Blender scene to `blender/scenes/sketchbot_current.blend`
- Added a first proper-subpart pass for the battery pack, L298N board details, controller board details, servo details, marker details, tag plate inset, and minimal visible wiring
- Rebuilt the drive subsystem with more realistic wheel, spoke, axle, motor, and mount geometry and saved the scene again

## Current Scene Status

This section should be updated whenever the Blender scene changes materially.

## Scene Coordinate State

- `SketchBot_Chassis_Root` has been normalized so the robot now sits in a sane world-space orientation
- Major proxy components are now positioned in world space instead of under a rotated helper frame
- The current scene is still a proxy assembly, not an exact CAD-accurate replica

## Currently Modeled In Blender

| Blender Object | Status | Fidelity |
|---|---|---|
| `SketchBot_Chassis` | Present | Imported real chassis geometry |
| `Left_Wheel`, `Right_Wheel` | Present | **Real STEP geometry** — 68.9mm dia, 30mm wide, spoked rim + tread |
| `Left_Motor`, `Right_Motor` | Present | **Real STEP geometry** — full TT gearmotor body; gearbox at chassis inner wall, shaft exits through side hole |
| `Battery_Holder` | Present | Proxy holder block |
| `Battery_Rail_L`, `Battery_Rail_R` | Present | Simple holder rail details |
| `Battery_Holder_End_Front`, `Battery_Holder_End_Back` | Present | Simple holder end-block details |
| `Battery_Clip_L`, `Battery_Clip_R` | Present | Simple battery contact details |
| `Battery_Cell_L`, `Battery_Cell_R` | Present | Standard 18650 proxies |
| `Motor_Driver` | Present | Improved proxy board base |
| `Motor_Driver_Heatsink` | Present | Simple heatsink detail |
| `Motor_Driver_Cap_1`, `Motor_Driver_Cap_2` | Present | Capacitor details |
| `Motor_Driver_Terminal_1`, `Motor_Driver_Terminal_2` | Present | Terminal block details |
| `Motor_Driver_Header_L`, `Motor_Driver_Header_R` | Present | Header strip details |
| `Controller_Board` | Present | Proxy board body |
| `Controller_USB` | Present | USB stub proxy |
| `Controller_Chip` | Present | Simple chip detail |
| `Controller_Header_L`, `Controller_Header_R` | Present | Header strip details |
| `Servo_Body` | Present | Proxy SG90-style body |
| `Servo_Ear_L`, `Servo_Ear_R` | Present | Simple mounting ear proxies |
| `Servo_Horn` | Present | Simple horn proxy |
| `Servo_Shaft` | Present | Simple servo shaft detail |
| `Servo_Label` | Present | Simple label placeholder |
| `Servo_Mount_Block` | Present | Simple black mount detail |
| `Marker_Tube` | Present | Proxy marker body |
| `Marker_Cap` | Present | Marker cap detail |
| `Marker_Band` | Present | Marker label band detail |
| `Front_Caster` | Present | Proxy ball caster |
| `Caster_Bracket` | Present | Proxy caster bracket |
| `AprilTag_Holder` | Present | Real GLB geometry, tag4 texture (tag36h11_id_4) on top face, horizontal at front |
| `Caster_Housing` | Present | Silver oval proxy under tag holder |
| `Caster_Ball` | Present | Steel ball sphere proxy |
| `Wire_Red`, `Wire_Black`, `Wire_Blue`, `Wire_Green`, `Wire_Yellow` | Present | Minimal visible wiring proxies |

## Scene Quality Notes

- The chassis orientation issue that caused parts to appear upside-down or below the robot has been corrected
- The current model is still best understood as a disciplined blockout, not a final engineering twin
- The next improvement should be replacing proxy dimensions with measured or vendor-confirmed dimensions, not adding more freehand detail

## Immediate Next Modeling Priorities

1. Confirm exact wheel dimensions from the smart car kit
2. Confirm exact TT motor size and axle offset
3. Confirm exact battery holder footprint
4. Confirm the controller board model and dimensions
5. Refine servo mount and marker position from measurements
6. Add a visible AprilTag texture to the tag plate
