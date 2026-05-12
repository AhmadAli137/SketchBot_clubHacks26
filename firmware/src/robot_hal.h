#pragma once

#include <string>

#include <driver/gpio.h>
#include <driver/ledc.h>
#include <driver/mcpwm_prelude.h>
#include <led_strip.h>
#include <esp_attr.h>

#include "calibration.h"

// ─── Telemetry struct ─────────────────────────────────────────────────────────

struct RobotTelemetry {
    float x_mm        = 0.0f;
    float y_mm        = 0.0f;
    float heading_deg = 0.0f;
    bool  pen_down    = false;
    bool  moving      = false;
    bool  homed       = false;
    int   queue_depth = 0;
    // HC-SR04 round-trip distance to the nearest object ahead, in cm.
    // -1 means "no echo" — out of range, sensor missing, or wiring fault.
    // Populated by the controller's telemetry task each tick; not read
    // inside RobotHal::telemetry() because the sensor blocks ~30 ms.
    float distance_cm = -1.0f;
};

// ─── Motor pin config — edit to match your wiring ─────────────────────────────
//
//  Left motor  → L298N IN1/IN2 + ENA (PWM)
//  Right motor → L298N IN3/IN4 + ENB (PWM)
//  Pen servo   → SG90 signal wire
//
//  If using a different driver, only robot_hal.cpp needs to change.

#define MOTOR_L_IN1_GPIO   GPIO_NUM_5
#define MOTOR_L_IN2_GPIO   GPIO_NUM_4
#define MOTOR_R_IN1_GPIO   GPIO_NUM_6
#define MOTOR_R_IN2_GPIO   GPIO_NUM_7

// LEDC channels for PWM speed control
#define MOTOR_L_PWM_GPIO   GPIO_NUM_8
#define MOTOR_R_PWM_GPIO   GPIO_NUM_9
#define MOTOR_L_LEDC_CH    LEDC_CHANNEL_0
#define MOTOR_R_LEDC_CH    LEDC_CHANNEL_1
#define MOTOR_LEDC_TIMER   LEDC_TIMER_0
#define MOTOR_LEDC_FREQ_HZ 1000
#define MOTOR_LEDC_RES     LEDC_TIMER_8_BIT   // 0–255

// Pen servo
// On the Waveshare ESP32-C5-DevKitC-1, the console UART runs on
// GPIO11 (U0TXD) / GPIO12 (U0RXD) — confirmed by the boot log line
// "GPIO 12 and 11 are used as console UART I/O pins". GPIO1 is a plain
// IO on this board (its only alt-functions are LP_UART_DSRN, XTAL_32K_N,
// LP_GPIO1, ADC1_CH0 — none of which are in use), so it's a clean
// choice for the servo signal.
#define PEN_SERVO_GPIO     GPIO_NUM_1
#define PEN_UP_US          1000    // pulse width µs for pen up (≈ 0°)
#define PEN_DOWN_US        2000    // pulse width µs for pen down (≈ 90°)

// Left/right encoders (optional — define SKETCHBOT_USE_ENCODERS in app_config.h).
// GPIO11/12 are reserved for the USB-Serial console on this board, so the
// encoder inputs live on GPIO23/24 (both plain GPIOs, adjacent on the
// right header for clean wiring).
#define ENC_L_A_GPIO       GPIO_NUM_23
#define ENC_R_A_GPIO       GPIO_NUM_24

// HC-SR04 ultrasonic rangefinder. TRIG is a plain 3V3 output pulse;
// ECHO is the sensor's 5V output and must be brought to ~3.3V with a
// 1k/2k divider before reaching the GPIO (1k from ECHO to GPIO, 2k
// from GPIO to GND). Range ~2–400 cm, ~40 ms max round-trip.
//
// IMPORTANT: GPIO28 (and GPIO27) are ESP32-C5 boot strapping pins —
// holding them low at reset puts the chip into download mode. The
// HC-SR04 idles ECHO low between pings, so wiring ECHO to GPIO28
// bricks every reset. ECHO lives on GPIO25 (plain IO, left header)
// for that reason; TRIG on GPIO15 is fine because we drive it.
#define HCSR04_TRIG_GPIO   GPIO_NUM_15
#define HCSR04_ECHO_GPIO   GPIO_NUM_25
#define HCSR04_TIMEOUT_US  30000   // ~5 m round-trip — anything over = no echo

// ─── Odometry constants — tune for your robot ─────────────────────────────────

#define WHEEL_DIAMETER_MM  65.0f    // outer diameter of drive wheel
#define WHEEL_BASE_MM     140.0f    // centre-to-centre track width
#define ENCODER_CPR        20       // encoder pulses per full wheel revolution
// mm per encoder count
#define MM_PER_COUNT  ((float)M_PI * WHEEL_DIAMETER_MM / ENCODER_CPR)

// ─── Speed mappings — tune so the robot moves at roughly the requested speed ──

#define DEFAULT_TRAVEL_SPEED_MM_S   60.0f
#define DEFAULT_ROTATE_SPEED_DPS    90.0f
// Linear map: 10 mm/s → duty 55,  200 mm/s → duty 220
#define SPEED_TO_DUTY(s)  ((uint32_t)((55) + ((s) - 10.0f) * (220 - 55) / (200.0f - 10.0f)))


// ─── RobotHal ─────────────────────────────────────────────────────────────────

class RobotHal {
public:
    // Lifecycle
    void init();

    // High-level commands (blocking, return true on success)
    bool home();
    bool penUp();
    bool penDown();
    bool stop();
    bool moveForward(float mm, float speed_mm_s = DEFAULT_TRAVEL_SPEED_MM_S);
    bool moveBackward(float mm, float speed_mm_s = DEFAULT_TRAVEL_SPEED_MM_S);
    bool rotate(float degrees, float speed_dps = DEFAULT_ROTATE_SPEED_DPS);
    bool goTo(float x_mm, float y_mm, float speed_mm_s = DEFAULT_TRAVEL_SPEED_MM_S);

    /** Non-blocking raw differential-drive setpoint. The desktop program
     *  executor streams these at ~30 Hz: each call just updates the PWM
     *  duty and returns immediately. Caller owns timing — `motor.set`
     *  with both speeds = 0 is the canonical "stop". This is the
     *  primitive Spark / the simulator both produce, so the same AST
     *  drives the simulated bot and the real chassis. */
    bool setMotorsRaw(float left_mps, float right_mps);

    /** Raw signed-duty motor write, –255..+255 per side. Bypasses
     *  SPEED_TO_DUTY and the 200 mm/s ceiling — used by the hardware
     *  self-test to drive at full PWM and to exercise IN1/2/3/4 in each
     *  direction. Runtime code should prefer setMotorsRaw(). */
    void motorDrive(int leftDuty, int rightDuty);

    /** Trigger the HC-SR04 and return distance in centimetres. Blocks
     *  for up to ~30 ms while waiting for the echo. Returns -1.0f on
     *  timeout (no echo received — out of range, sensor missing, or
     *  ECHO wiring fault). */
    float readDistanceCm();

    // State
    RobotTelemetry telemetry() const;
    void setStatusConnected(bool connected);
    /** Drive the on-board status LED to an arbitrary R/G/B colour. Used
     *  by the hardware self-test (hw_test_app.cpp) to flag phase
     *  transitions: yellow during a test, green on pass, red on fail. */
    void setStatusRgb(bool red, bool green, bool blue) const;

    // ─── Calibration ──────────────────────────────────────────────────
    /** Read-only view of the calibration currently in use. Wizard fetches
     *  this via the get_calibration WS command to seed its starting
     *  values. */
    const DeviceCalibration& calibration() const { return cal_; }
    /** Update calibration in-memory AND persist to NVS. Applied to
     *  every subsequent motor command without a reboot. */
    bool setCalibration(const DeviceCalibration& cfg);
    /** Wipe persisted calibration and revert in-memory values to
     *  defaults. */
    bool clearCalibration();

    // Encoder ISR callbacks (call from IRAM-safe ISRs)
    static void IRAM_ATTR leftEncoderISR(void *arg);
    static void IRAM_ATTR rightEncoderISR(void *arg);

private:
    // Internal motor helpers
    void motorStop();
    void setPenPulse(uint32_t pulse_us);

    void setStatusLed(bool red, bool green, bool blue) const;

    // Pose (updated after each move/rotate)
    float posX_mm_      = 0.0f;
    float posY_mm_      = 0.0f;
    float headingDeg_   = 0.0f;
    bool  penIsDown_    = false;
    bool  isMoving_     = false;
    bool  homed_        = false;

    // Volatile encoder counts (written from ISR)
    volatile int32_t encLeft_  = 0;
    volatile int32_t encRight_ = 0;

    bool initialized_ = false;
    bool connected_   = false;

    // Live calibration loaded from NVS at init() and updated via
    // setCalibration(). All motion commands read from this struct
    // rather than the compile-time constants in this header — those
    // constants now only serve as the defaults.
    DeviceCalibration cal_;

    led_strip_handle_t         statusLed_    = nullptr;
    mcpwm_cmpr_handle_t        penCmpr_      = nullptr;
    mcpwm_gen_handle_t         penGen_       = nullptr;
    mcpwm_timer_handle_t       penTimer_     = nullptr;
    mcpwm_oper_handle_t        penOper_      = nullptr;
};
