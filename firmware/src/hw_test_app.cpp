#include "hw_test_app.h"

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs_flash.h"

#include "app_config.h"
#include "network_hal.h"
#include "robot_hal.h"

static const char *TAG = "hw_test";

// ─── Result tracking ──────────────────────────────────────────────────────────

struct TestResult {
    const char *name;
    bool        ok;
    const char *detail;
};

static constexpr int  MAX_RESULTS = 16;
static TestResult     g_results[MAX_RESULTS];
static int            g_result_count = 0;

static void recordResult(const char *name, bool ok, const char *detail) {
    if (g_result_count < MAX_RESULTS) {
        g_results[g_result_count++] = {name, ok, detail};
    }
    if (ok) {
        ESP_LOGI(TAG, "PASS  %s  (%s)", name, detail ? detail : "");
    } else {
        ESP_LOGE(TAG, "FAIL  %s  (%s)", name, detail ? detail : "");
    }
}

static void delayMs(uint32_t ms) { vTaskDelay(pdMS_TO_TICKS(ms)); }

// ─── Per-subsystem checks ─────────────────────────────────────────────────────

// Cycle the on-board RGB LED through R / G / B / W to confirm the strip is
// wired and the colour-channel order in app_config.h is correct.
static void testStatusLed(RobotHal &robot) {
    ESP_LOGI(TAG, "── status LED");
    const struct { const char *name; bool r; bool g; bool b; } steps[] = {
        {"red",   true,  false, false},
        {"green", false, true,  false},
        {"blue",  false, false, true},
        {"white", true,  true,  true},
    };
    for (const auto &s : steps) {
        ESP_LOGI(TAG, "   %s", s.name);
        robot.setStatusRgb(s.r, s.g, s.b);
        delayMs(400);
    }
    robot.setStatusRgb(false, false, false);
    recordResult("status LED cycle", true, "watch the dot for R/G/B/W");
}

// Continuous bring-up mode for the pen servo on GPIO1. Swings 0° ↔ 90°
// forever with a 700 ms dwell at each end so the operator can watch the
// SG90 lever and verify travel, end-stops, and absence of jitter. This
// function never returns — flash with this enabled when you're bringing
// up the servo, then re-flash without it for full system bring-up.
//
// Status LED tracks the position so you can verify timing without
// looking at the servo: blue at 0°, magenta at 90°.
[[maybe_unused]] static void testPenServoContinuous(RobotHal &robot) {
    ESP_LOGI(TAG, "── pen servo continuous swing (GPIO1, 0° ↔ 90°)");
    ESP_LOGI(TAG, "   this loop never returns; reset the board to stop");
    while (true) {
        robot.penUp();                          // pulse 1000µs ≈ 0°
        robot.setStatusRgb(false, false, true); // blue at 0°
        delayMs(700);
        robot.penDown();                        // pulse 2000µs ≈ 90°
        robot.setStatusRgb(true, false, true);  // magenta at 90°
        delayMs(700);
    }
}

// Map a distance reading to a status-LED colour band so the operator
// can see range at a glance without watching the serial monitor.
//   red     <10 cm   (very close / obstacle)
//   yellow  10–30 cm (close)
//   green   30–80 cm (medium)
//   blue    ≥80 cm   (clear)
//   off     no echo  (out of range or sensor missing)
static void setLedForDistance(RobotHal &robot, float distCm) {
    if (distCm < 0.0f)        robot.setStatusRgb(false, false, false);
    else if (distCm < 10.0f)  robot.setStatusRgb(true,  false, false);
    else if (distCm < 30.0f)  robot.setStatusRgb(true,  true,  false);
    else if (distCm < 80.0f)  robot.setStatusRgb(false, true,  false);
    else                      robot.setStatusRgb(false, false, true );
}

// Continuous bring-up for the L298N + drive motors. Runs at full PWM
// (duty 255) so the wheels actually break static friction on a battery-
// boosted 5 V rail where the L298N eats a few volts of headroom. The
// sequence isolates each direction pin so wiring of IN1/IN2/IN3/IN4 can
// be verified without the symmetry of a "both fwd" step hiding a
// swapped side. 1 s motion + 500 ms settle per step. The status LED
// now reflects HC-SR04 distance (see setLedForDistance) so direction
// verification uses the serial log + the wheels themselves; the LED
// is reserved for the more-useful real-time range readout.
//
// Lift the bot or clear floor space — motors run flat-out. Never
// returns; reset the board to stop. Re-comment its call site to drop
// back to the single-pass testMotorsRaw sweep.
static void testMotorsContinuous(RobotHal &robot) {
    ESP_LOGI(TAG, "── motor continuous bring-up — FULL PWM (LIFT THE BOT)");
    ESP_LOGI(TAG, "   L fwd → L rev → R fwd → R rev → both fwd → both rev");
    ESP_LOGI(TAG, "   LED tracks HC-SR04 distance: R<10 Y<30 G<80 B≥80 off=no echo");
    ESP_LOGI(TAG, "   this loop never returns; reset the board to stop");
    constexpr int kFull = 255;
    const struct { const char *label; int l; int r; } seq[] = {
        {"L fwd  (IN1)",  +kFull,  0     },
        {"L rev  (IN2)",  -kFull,  0     },
        {"R fwd  (IN3)",   0,     +kFull },
        {"R rev  (IN4)",   0,     -kFull },
        {"both fwd",      +kFull, +kFull },
        {"both rev",      -kFull, -kFull },
    };
    bool penDown = false;
    while (true) {
        for (const auto &s : seq) {
            ESP_LOGI(TAG, "   %-14s  L=%+4d  R=%+4d", s.label, s.l, s.r);
            robot.motorDrive(s.l, s.r);
            // Toggle the pen each motor step. penUp/penDown block 250 ms
            // each (servo settle).
            if (penDown) robot.penUp(); else robot.penDown();
            penDown = !penDown;
            // Drive window: 750 ms, polled every ~100 ms so the LED
            // tracks distance in (near) real time and the serial log
            // records the range alongside the step label.
            for (int i = 0; i < 7; ++i) {
                const float distCm = robot.readDistanceCm();
                setLedForDistance(robot, distCm);
                if (distCm < 0.0f) ESP_LOGI(TAG, "      dist=NO ECHO");
                else               ESP_LOGI(TAG, "      dist=%5.1f cm", distCm);
                delayMs(100);
            }
            robot.motorDrive(0, 0);
            delayMs(500);
        }
    }
}

// Run each wheel's two directions independently, then both together
// forward / backward, then both pivots. 600 ms per step + a 300 ms
// settle so each motion is clearly distinct on the bench.
static void testMotorsRaw(RobotHal &robot) {
    ESP_LOGI(TAG, "── raw motor.set primitive (lift the bot or clear the floor!)");
    robot.setStatusRgb(true, true, false);
    const struct { const char *label; float l; float r; } seq[] = {
        {"left wheel forward",   0.20f,  0.00f},
        {"right wheel forward",  0.00f,  0.20f},
        {"both forward",         0.15f,  0.15f},
        {"both backward",       -0.15f, -0.15f},
        {"pivot left",          -0.18f,  0.18f},
        {"pivot right",          0.18f, -0.18f},
    };
    bool ok = true;
    for (const auto &s : seq) {
        ESP_LOGI(TAG, "   %s  L=%+.2f m/s  R=%+.2f m/s", s.label, s.l, s.r);
        ok &= robot.setMotorsRaw(s.l, s.r);
        delayMs(600);
        robot.setMotorsRaw(0.0f, 0.0f);
        delayMs(300);
    }
    robot.setStatusRgb(false, ok, !ok);
    recordResult("motor.set raw setpoints", ok, "6 wheel patterns");
}

// Verify the blocking moveForward / moveBackward / rotate primitives
// return ok. Pose readouts confirm odometry is at least counting.
static void testMotorsBlocking(RobotHal &robot) {
    ESP_LOGI(TAG, "── blocking move/rotate (place bot on the floor with clearance)");
    robot.setStatusRgb(true, true, false);

    auto pose = robot.telemetry();
    const float x0 = pose.x_mm, y0 = pose.y_mm, h0 = pose.heading_deg;

    bool ok = true;
    ESP_LOGI(TAG, "   move_forward 100mm @ 60mm/s");
    ok &= robot.moveForward(100.0f, 60.0f);
    delayMs(200);

    ESP_LOGI(TAG, "   move_backward 100mm @ 60mm/s");
    ok &= robot.moveBackward(100.0f, 60.0f);
    delayMs(200);

    ESP_LOGI(TAG, "   rotate +90 deg");
    ok &= robot.rotate(90.0f, 90.0f);
    delayMs(200);

    ESP_LOGI(TAG, "   rotate -90 deg");
    ok &= robot.rotate(-90.0f, 90.0f);
    delayMs(200);

    pose = robot.telemetry();
    ESP_LOGI(TAG, "   pose delta:  x=%+.1fmm  y=%+.1fmm  hdg=%+.1f deg",
             pose.x_mm - x0, pose.y_mm - y0, pose.heading_deg - h0);

    robot.setStatusRgb(false, ok, !ok);
    recordResult("blocking move/rotate", ok, "fwd/back/+90/-90");
}

// Bring up Wi-Fi and the runtime WebSocket. Each step has its own
// timeout so a missing AP doesn't hang the test forever.
static void testNetwork(NetworkHal &net) {
    ESP_LOGI(TAG, "── Wi-Fi + WebSocket");

    // 10s window — enough for a healthy AP to grant DHCP. Bails out if
    // creds are wrong rather than hanging the entire test.
    esp_err_t err = net.connectWifiWithTimeout(10000);
    if (err != ESP_OK) {
        recordResult("Wi-Fi associate", false, esp_err_to_name(err));
        recordResult("WebSocket connect", false, "skipped (no Wi-Fi)");
        return;
    }
    recordResult("Wi-Fi associate", true, "got IP");

    err = net.connectWebsocket();
    if (err != ESP_OK) {
        recordResult("WebSocket connect", false, esp_err_to_name(err));
        return;
    }
    // Poll briefly for the websocketJustConnected_ flag — gives the
    // event loop time to fire ON_CONNECTED.
    bool gotConnect = false;
    for (int i = 0; i < 40; ++i) {  // 40 × 200ms = 8s max
        if (net.websocketConnected()) { gotConnect = true; break; }
        delayMs(200);
    }
    recordResult("WebSocket connect",
                 gotConnect,
                 gotConnect ? "client up" : "no ON_CONNECTED in 8s");
}

// ─── Entry point ──────────────────────────────────────────────────────────────

static void printSummary(const RobotHal &robot) {
    int pass = 0;
    for (int i = 0; i < g_result_count; ++i) if (g_results[i].ok) ++pass;
    ESP_LOGI(TAG, "════════════════════════════════════════════");
    ESP_LOGI(TAG, "  Hardware self-test summary  %d/%d passed",
             pass, g_result_count);
    for (int i = 0; i < g_result_count; ++i) {
        ESP_LOGI(TAG, "  %s  %-28s  %s",
                 g_results[i].ok ? "PASS" : "FAIL",
                 g_results[i].name,
                 g_results[i].detail ? g_results[i].detail : "");
    }
    ESP_LOGI(TAG, "════════════════════════════════════════════");
    // Solid green if everything passed; red if anything failed.
    robot.setStatusRgb(pass != g_result_count, pass == g_result_count, false);
}

void runHardwareSelfTest() {
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    ESP_LOGI(TAG, "════════════════════════════════════════════");
    ESP_LOGI(TAG, "  SketchBot hardware self-test  fw v%s  board %s",
             SKETCHBOT_FW_VERSION, SKETCHBOT_BOARD_NAME);
    ESP_LOGI(TAG, "════════════════════════════════════════════");

    static RobotHal robot;
    robot.init();

    static NetworkHal net;
    net.init();   // initialises NVS + Wi-Fi + event loops, no actual connect yet

    // Servo bring-up: swing 0° ↔ 90° forever. Verified — keep commented.
    // testPenServoContinuous(robot);

    // Motor bring-up: cycles L/R/both at full PWM forever. Comment out
    // once IN1/IN2/IN3/IN4 wiring + L298N output are verified.
    testMotorsContinuous(robot);

    // Full subsystem sweep — each function appends to g_results so the
    // summary at the end captures everything regardless of partial fails.
    // Unreachable while testPenServoContinuous is enabled above.
    testStatusLed(robot);
    testMotorsRaw(robot);
    testMotorsBlocking(robot);
    testNetwork(net);

    printSummary(robot);

    // Idle loop — pulse the status LED slowly so the user can tell the
    // test finished and the board didn't crash.
    bool pulse = false;
    while (true) {
        pulse = !pulse;
        // Re-pick green/red from the summary by counting again.
        int pass = 0;
        for (int i = 0; i < g_result_count; ++i) if (g_results[i].ok) ++pass;
        const bool allOk = (pass == g_result_count);
        if (pulse) robot.setStatusRgb(!allOk, allOk, false);
        else       robot.setStatusRgb(false, false, false);
        delayMs(900);
    }
}
