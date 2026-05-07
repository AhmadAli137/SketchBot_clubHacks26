#pragma once

#define SKETCHBOT_FW_VERSION "0.1.0"
#define SKETCHBOT_BOARD_NAME "esp32c5"
#define SKETCHBOT_DEVICE_ID "sketchbot-esp32c5"

#define HEARTBEAT_INTERVAL_MS 3000
#define TELEMETRY_INTERVAL_MS 1000
#define WS_RECONNECT_DELAY_MS 2000

#define STATUS_LED_DATA_GPIO 27
#define STATUS_LED_R_ORDER_INDEX 1
#define STATUS_LED_G_ORDER_INDEX 0
#define STATUS_LED_B_ORDER_INDEX 2

// ─── Hardware self-test mode ─────────────────────────────────────────────────
// Uncomment this line (or pass `-DSKETCHBOT_TEST_MODE=1` to idf.py) to
// flash the bring-up self-test in src/hw_test_app.cpp instead of the
// normal controller. The self-test cycles the status LED, actuates the
// pen servo, runs every motor pattern, exercises the blocking
// move/rotate primitives, and finally tries to associate to Wi-Fi and
// reach the runtime WebSocket. Final summary lands on the serial
// monitor and the status LED holds solid green if everything passed,
// red if any subsystem failed. Re-comment and re-flash to get the
// real firmware back.
// #define SKETCHBOT_TEST_MODE 1
