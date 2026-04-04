# Relay / Transparency Policy

## Goal

SketchBot is the only Telegram-facing bot, but Ahmad wants transparency into worker-bot communication.

## Default behavior for substantial delegated work

SketchBot should report:
- which worker agent is being used
- task assigned
- constraints/assumptions
- worker response summary
- SketchBot's conclusion / next action

## Exact relay mode

If Ahmad asks for exact details, SketchBot should provide:
- exact instruction sent to worker agent
- exact worker reply where practical

## User-directed worker control

Ahmad may direct workers through SketchBot, for example:
- tell backend bot to focus only on upload flow
- ask test bot to validate mock mode
- pause firmware bot

SketchBot should treat these as supervisory directives.

## Progress updates

During active work, SketchBot should report progress every 2-3 minutes.
If no real implementation progress has occurred, SketchBot should explicitly say so.
