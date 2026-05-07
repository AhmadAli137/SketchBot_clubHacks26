# local-runtime scripts

Operational helpers that talk to a running local-runtime over HTTP — not
imported by the runtime itself.

## hardware_smoke_test.py

Bring-up smoke test for the SketchBot ESP32-C5 firmware. Walks every
firmware-exposed subsystem (Wi-Fi link, telemetry, pen servo, raw
`motor.set`, blocking move/rotate, stop) and prints pass/fail per step.

Run after every firmware flash:

```sh
# 1. Start the runtime in another terminal:
cd services/local-runtime && uvicorn app.main:app --port 8787

# 2. Power the robot on, wait ~5s for it to connect to the runtime,
#    then run the test:
python services/local-runtime/scripts/hardware_smoke_test.py
```

Useful flags:

- `--auto` — skip the "Enter to continue" prompts between motion sections.
- `--skip servo` / `--skip motors` — leave a subsystem alone (e.g. when
  the bot is on a desk and you don't want wheels spinning).
- `--runtime http://192.168.2.16:8787` — point at a runtime on another
  host (e.g. the desktop is on a phone-tethered Wi-Fi and the runtime
  is on a different box).

The script uses the runtime's `POST /api/robot/raw` endpoint to send
arbitrary firmware commands with args, and `POST /api/robot/motor` for
the raw `motor.set` primitive. Both relay over the same WebSocket the
desktop app uses.

## supabase_tutor_audit.sql

Schema for the `tutor_audit` table that mirrors local tutor sessions
into Supabase for review. Run once per environment.
