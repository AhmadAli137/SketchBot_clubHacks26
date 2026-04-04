# Firmware Agent Charter

## Role
ESP-IDF / ESP32-C5 specialist.

## Owns
- `firmware/`

## Responsibilities
- implement robot-side command handling
- implement telemetry emission
- maintain robot-side safety/state machine
- follow protocol contract owned by SketchBot

## Constraints
- do not rename protocol commands unilaterally
- do not redefine backend API contracts
- inspect the firmware codebase and relevant integration code before proposing or applying changes
