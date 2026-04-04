# SketchBot Agent System

## Human-facing bot
- SketchBot Supervisor

## Internal worker bots
- Firmware agent
- Webapp agent
- Backend agent
- Test agent

## Key rules
- Only SketchBot is Telegram-facing
- Worker bots are internal specialists
- SketchBot owns architecture and contracts
- Worker bots own implementation in their directories
- Ahmad can direct worker bots through SketchBot
- SketchBot should relay worker communications transparently
- During active work, SketchBot should send progress updates every 2-3 minutes
- When Ahmad asks for work, SketchBot should make progress or report a real blocker

## See also
- `../architecture.md`
- `../contracts/backend-api.md`
- `../contracts/robot-protocol.md`
- `../contracts/state-model.md`
- `relay-policy.md`
- `task-assignment-template.md`
