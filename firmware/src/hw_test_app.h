#pragma once

/**
 * Hardware self-test app entry point. Runs an on-device sequence that
 * exercises every wired peripheral — status LED, pen servo, motors,
 * encoders (if SKETCHBOT_USE_ENCODERS), and the Wi-Fi + WebSocket link
 * — and prints a clear PASS/FAIL summary over the serial monitor.
 *
 * To flash this instead of the normal controller, define
 * SKETCHBOT_TEST_MODE in app_config.h (or pass it on the idf.py
 * command line: `idf.py -DSKETCHBOT_TEST_MODE=1 build flash monitor`).
 *
 * Wire format and command surface are unchanged — this is just an
 * alternate `app_main` for bring-up. Once the test passes, remove the
 * define and re-flash to get the real controller back.
 */

void runHardwareSelfTest();
