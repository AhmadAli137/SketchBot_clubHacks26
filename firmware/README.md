# SketchBot Firmware

## Hotspot / local network operation

When running on a phone hotspot or any changing local network, update:

- `include/secrets.h`
  - `WIFI_SSID`
  - `WIFI_PASS`
  - `WS_URL`

Example:

```c
#define WIFI_SSID "AhmadPhoneHotspot"
#define WIFI_PASS "your-hotspot-password"
#define WS_URL "ws://192.168.50.23:8000/ws/robot"
```

The backend host/IP may change when you reconnect to a hotspot. If it changes, update `WS_URL` and rebuild/flash firmware.

## Build

```bash
idf.py set-target esp32c5
idf.py build
```

## Hardware self-test

For bring-up after wiring or board changes, flash a self-test build that
exercises every wired peripheral and prints a PASS/FAIL summary over
serial. Two ways to enable it:

```bash
# One-shot: pass the flag on the command line
idf.py -DSKETCHBOT_TEST_MODE=1 build flash monitor
```

Or uncomment `#define SKETCHBOT_TEST_MODE 1` in `include/app_config.h`,
then build and flash from the ESP-IDF VS Code extension as usual.

What the self-test does (in order):

1. **Status LED** — cycles R / G / B / W. Confirms the WS2812 strip is
   wired and the colour-channel order in `app_config.h` is correct.
2. **Pen servo** — `up → down → up` with 500 ms holds. Watch the SG90
   lever; it should move twice.
3. **Raw motor.set** — left only, right only, both forward, both
   backward, pivot left, pivot right. 600 ms each, then a `{0,0}` stop.
   *Lift the bot or clear the floor first — wheels will spin.*
4. **Blocking move/rotate** — `move_forward 100mm`, `move_backward
   100mm`, `rotate +90°`, `rotate -90°`. Pose delta logged before /
   after.
5. **Wi-Fi + WebSocket** — associates to the AP from `secrets.h` (10 s
   timeout) and connects to `WS_URL` (8 s timeout for the
   `WEBSOCKET_EVENT_CONNECTED` event).

When the test finishes the status LED holds **solid green** if every
subsystem passed, **solid red** if anything failed, and slowly pulses so
you can tell the board didn't hang. The serial monitor shows a banner
summary with a per-line PASS / FAIL list. Re-comment the define and
re-flash to get the runtime controller back.

If you want to run the self-test without firing the wheels (e.g. testing
LED + servo + Wi-Fi at the bench), comment out the `testMotorsRaw` /
`testMotorsBlocking` calls in `runHardwareSelfTest()` for that flash.
