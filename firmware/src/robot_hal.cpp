#include "robot_hal.h"

#include <cmath>
#include <cstring>

#include "esp_check.h"
#include "esp_log.h"
#include "esp_rom_sys.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "led_strip.h"

#include "app_config.h"

static const char *TAG = "robot_hal";

// ─── Static ISR trampolines ────────────────────────────────────────────────────

void IRAM_ATTR RobotHal::leftEncoderISR(void *arg) {
    auto *self = static_cast<RobotHal *>(arg);
    self->encLeft_ = self->encLeft_ + 1;
}
void IRAM_ATTR RobotHal::rightEncoderISR(void *arg) {
    auto *self = static_cast<RobotHal *>(arg);
    self->encRight_ = self->encRight_ + 1;
}

// ─── init ──────────────────────────────────────────────────────────────────────

void RobotHal::init() {
    if (initialized_) return;

    // ── Status LED ───────────────────────────────────────────────────────────
    led_strip_config_t strip_cfg = {};
    strip_cfg.strip_gpio_num = static_cast<gpio_num_t>(STATUS_LED_DATA_GPIO);
    strip_cfg.max_leds = 1;
    led_strip_rmt_config_t rmt_cfg = {};
    rmt_cfg.resolution_hz = 10 * 1000 * 1000;
    led_strip_new_rmt_device(&strip_cfg, &rmt_cfg, &statusLed_);
    setStatusLed(false, false, false);

    // ── Motor direction GPIO ─────────────────────────────────────────────────
    gpio_config_t io = {};
    io.mode = GPIO_MODE_OUTPUT;
    io.pin_bit_mask = (1ULL << MOTOR_L_IN1_GPIO) | (1ULL << MOTOR_L_IN2_GPIO)
                    | (1ULL << MOTOR_R_IN1_GPIO) | (1ULL << MOTOR_R_IN2_GPIO);
    gpio_config(&io);
    gpio_set_level(static_cast<gpio_num_t>(MOTOR_L_IN1_GPIO), 0);
    gpio_set_level(static_cast<gpio_num_t>(MOTOR_L_IN2_GPIO), 0);
    gpio_set_level(static_cast<gpio_num_t>(MOTOR_R_IN1_GPIO), 0);
    gpio_set_level(static_cast<gpio_num_t>(MOTOR_R_IN2_GPIO), 0);

    // ── Motor PWM (LEDC) ─────────────────────────────────────────────────────
    ledc_timer_config_t ledc_timer = {};
    ledc_timer.speed_mode       = LEDC_LOW_SPEED_MODE;
    ledc_timer.timer_num        = MOTOR_LEDC_TIMER;
    ledc_timer.duty_resolution  = MOTOR_LEDC_RES;
    ledc_timer.freq_hz          = MOTOR_LEDC_FREQ_HZ;
    ledc_timer.clk_cfg          = LEDC_AUTO_CLK;
    ledc_timer_config(&ledc_timer);

    ledc_channel_config_t lch = {};
    lch.speed_mode = LEDC_LOW_SPEED_MODE;
    lch.timer_sel  = MOTOR_LEDC_TIMER;
    lch.duty       = 0;
    lch.hpoint     = 0;

    lch.channel    = MOTOR_L_LEDC_CH;
    lch.gpio_num   = MOTOR_L_PWM_GPIO;
    ledc_channel_config(&lch);

    lch.channel    = MOTOR_R_LEDC_CH;
    lch.gpio_num   = MOTOR_R_PWM_GPIO;
    ledc_channel_config(&lch);

    // ── Pen servo (MCPWM, 50 Hz) ─────────────────────────────────────────────
    mcpwm_timer_config_t pen_timer_cfg = {};
    pen_timer_cfg.group_id      = 0;
    pen_timer_cfg.clk_src       = MCPWM_TIMER_CLK_SRC_DEFAULT;
    pen_timer_cfg.resolution_hz = 1000000;    // 1 µs tick
    pen_timer_cfg.count_mode    = MCPWM_TIMER_COUNT_MODE_UP;
    pen_timer_cfg.period_ticks  = 20000;      // 20 ms → 50 Hz
    mcpwm_new_timer(&pen_timer_cfg, &penTimer_);

    mcpwm_operator_config_t pen_oper_cfg = {};
    pen_oper_cfg.group_id = 0;
    mcpwm_new_operator(&pen_oper_cfg, &penOper_);
    mcpwm_operator_connect_timer(penOper_, penTimer_);

    mcpwm_comparator_config_t pen_cmpr_cfg = {};
    pen_cmpr_cfg.flags.update_cmp_on_tez = true;
    mcpwm_new_comparator(penOper_, &pen_cmpr_cfg, &penCmpr_);

    mcpwm_generator_config_t pen_gen_cfg = {};
    pen_gen_cfg.gen_gpio_num = PEN_SERVO_GPIO;
    mcpwm_new_generator(penOper_, &pen_gen_cfg, &penGen_);

    mcpwm_generator_set_action_on_timer_event(
        penGen_,
        MCPWM_GEN_TIMER_EVENT_ACTION(MCPWM_TIMER_DIRECTION_UP, MCPWM_TIMER_EVENT_EMPTY, MCPWM_GEN_ACTION_HIGH));
    mcpwm_generator_set_action_on_compare_event(
        penGen_,
        MCPWM_GEN_COMPARE_EVENT_ACTION(MCPWM_TIMER_DIRECTION_UP, penCmpr_, MCPWM_GEN_ACTION_LOW));

    mcpwm_timer_enable(penTimer_);
    mcpwm_timer_start_stop(penTimer_, MCPWM_TIMER_START_NO_STOP);

    setPenPulse(PEN_UP_US);

    // ── HC-SR04 ultrasonic ───────────────────────────────────────────────────
    gpio_config_t trig_io = {};
    trig_io.mode         = GPIO_MODE_OUTPUT;
    trig_io.pin_bit_mask = 1ULL << HCSR04_TRIG_GPIO;
    gpio_config(&trig_io);
    gpio_set_level(static_cast<gpio_num_t>(HCSR04_TRIG_GPIO), 0);

    gpio_config_t echo_io = {};
    echo_io.mode         = GPIO_MODE_INPUT;
    echo_io.pin_bit_mask = 1ULL << HCSR04_ECHO_GPIO;
    gpio_config(&echo_io);

    // ── Encoder interrupts ───────────────────────────────────────────────────
#ifdef SKETCHBOT_USE_ENCODERS
    gpio_config_t enc_io = {};
    enc_io.mode         = GPIO_MODE_INPUT;
    enc_io.pull_up_en   = GPIO_PULLUP_ENABLE;
    enc_io.intr_type    = GPIO_INTR_POSEDGE;
    enc_io.pin_bit_mask = (1ULL << ENC_L_A_GPIO) | (1ULL << ENC_R_A_GPIO);
    gpio_config(&enc_io);

    gpio_install_isr_service(0);
    gpio_isr_handler_add(static_cast<gpio_num_t>(ENC_L_A_GPIO), leftEncoderISR,  this);
    gpio_isr_handler_add(static_cast<gpio_num_t>(ENC_R_A_GPIO), rightEncoderISR, this);
#endif

    // Load persisted per-device calibration. On a freshly-flashed bot
    // the NVS entry is absent and cal_ stays at its defaults (matching
    // the legacy compile-time constants), so motion is unchanged until
    // the desktop wizard pushes real values via set_calibration.
    calibrationLoad(cal_);
    ESP_LOGI(TAG, "calibration loaded — wheel=%.2fmm base=%.2fmm lr=%.3f dmin=%d (%s)",
             cal_.wheel_diameter_mm, cal_.wheel_base_mm, cal_.lr_balance, cal_.duty_min,
             cal_.provisioned ? "from wizard" : "defaults");

    initialized_ = true;
    ESP_LOGI(TAG, "RobotHal initialised");
}

// ─── Calibration accessors ─────────────────────────────────────────────────────

bool RobotHal::setCalibration(const DeviceCalibration& cfg) {
    cal_ = cfg;
    esp_err_t err = calibrationStore(cal_);
    return err == ESP_OK;
}

bool RobotHal::clearCalibration() {
    esp_err_t err = calibrationClear();
    cal_ = DeviceCalibration{};
    return err == ESP_OK;
}

// ─── Internal motor helpers ────────────────────────────────────────────────────

void RobotHal::motorStop() {
    gpio_set_level(static_cast<gpio_num_t>(MOTOR_L_IN1_GPIO), 0);
    gpio_set_level(static_cast<gpio_num_t>(MOTOR_L_IN2_GPIO), 0);
    gpio_set_level(static_cast<gpio_num_t>(MOTOR_R_IN1_GPIO), 0);
    gpio_set_level(static_cast<gpio_num_t>(MOTOR_R_IN2_GPIO), 0);
    ledc_set_duty(LEDC_LOW_SPEED_MODE, MOTOR_L_LEDC_CH, 0);
    ledc_update_duty(LEDC_LOW_SPEED_MODE, MOTOR_L_LEDC_CH);
    ledc_set_duty(LEDC_LOW_SPEED_MODE, MOTOR_R_LEDC_CH, 0);
    ledc_update_duty(LEDC_LOW_SPEED_MODE, MOTOR_R_LEDC_CH);
    isMoving_ = false;
}

// leftDuty / rightDuty: –255..255 (negative = backward, 0 = coast).
// A zero duty pulls both IN pins LOW for that side so the H-bridge
// truly idles (coast mode) even if the L298N's ENA/ENB jumpers are
// still installed — common bench mistake that otherwise keeps a side
// spinning forward whenever IN1=1.
void RobotHal::motorDrive(int leftDuty, int rightDuty) {
    // ─── Calibration corrections ───────────────────────────────────────
    // Applied here so EVERY path that ends in motorDrive — moveForward,
    // rotate, setMotorsRaw, the self-test, future tools — gets the
    // same per-device tuning automatically.
    //
    // 1) L/R balance: slow whichever motor is naturally faster so
    //    equal commanded duty produces equal ground speed. Never
    //    boosts above the input (avoids saturation surprises).
    if (cal_.lr_balance > 1.0f) {
        leftDuty = (int)(leftDuty / cal_.lr_balance);
    } else if (cal_.lr_balance < 1.0f) {
        rightDuty = (int)(rightDuty * cal_.lr_balance);
    }

    // 2) Dead-band floor: tiny duties (after balance) can't break
    //    static friction — they just buzz the motor pointlessly and
    //    eat current. Snap below-threshold to zero. Direction is
    //    preserved by checking magnitude.
    if (leftDuty  != 0 && std::abs(leftDuty)  < cal_.duty_min) leftDuty  = 0;
    if (rightDuty != 0 && std::abs(rightDuty) < cal_.duty_min) rightDuty = 0;

    // Left
    if (leftDuty > 0) {
        gpio_set_level(static_cast<gpio_num_t>(MOTOR_L_IN1_GPIO), 1);
        gpio_set_level(static_cast<gpio_num_t>(MOTOR_L_IN2_GPIO), 0);
    } else if (leftDuty < 0) {
        gpio_set_level(static_cast<gpio_num_t>(MOTOR_L_IN1_GPIO), 0);
        gpio_set_level(static_cast<gpio_num_t>(MOTOR_L_IN2_GPIO), 1);
        leftDuty = -leftDuty;
    } else {
        gpio_set_level(static_cast<gpio_num_t>(MOTOR_L_IN1_GPIO), 0);
        gpio_set_level(static_cast<gpio_num_t>(MOTOR_L_IN2_GPIO), 0);
    }
    ledc_set_duty(LEDC_LOW_SPEED_MODE, MOTOR_L_LEDC_CH, std::min(leftDuty, 255));
    ledc_update_duty(LEDC_LOW_SPEED_MODE, MOTOR_L_LEDC_CH);

    // Right
    if (rightDuty > 0) {
        gpio_set_level(static_cast<gpio_num_t>(MOTOR_R_IN1_GPIO), 1);
        gpio_set_level(static_cast<gpio_num_t>(MOTOR_R_IN2_GPIO), 0);
    } else if (rightDuty < 0) {
        gpio_set_level(static_cast<gpio_num_t>(MOTOR_R_IN1_GPIO), 0);
        gpio_set_level(static_cast<gpio_num_t>(MOTOR_R_IN2_GPIO), 1);
        rightDuty = -rightDuty;
    } else {
        gpio_set_level(static_cast<gpio_num_t>(MOTOR_R_IN1_GPIO), 0);
        gpio_set_level(static_cast<gpio_num_t>(MOTOR_R_IN2_GPIO), 0);
    }
    ledc_set_duty(LEDC_LOW_SPEED_MODE, MOTOR_R_LEDC_CH, std::min(rightDuty, 255));
    ledc_update_duty(LEDC_LOW_SPEED_MODE, MOTOR_R_LEDC_CH);

    isMoving_ = (leftDuty != 0) || (rightDuty != 0);
}

void RobotHal::setPenPulse(uint32_t pulse_us) {
    if (penCmpr_) {
        mcpwm_comparator_set_compare_value(penCmpr_, pulse_us);
    }
}

// ─── Pen ──────────────────────────────────────────────────────────────────────

bool RobotHal::penUp() {
    setPenPulse(PEN_UP_US);
    penIsDown_ = false;
    vTaskDelay(pdMS_TO_TICKS(250));
    ESP_LOGI(TAG, "pen up");
    return true;
}

bool RobotHal::penDown() {
    setPenPulse(PEN_DOWN_US);
    penIsDown_ = true;
    vTaskDelay(pdMS_TO_TICKS(250));
    ESP_LOGI(TAG, "pen down");
    return true;
}

// ─── Stop ─────────────────────────────────────────────────────────────────────

bool RobotHal::stop() {
    motorStop();
    ESP_LOGI(TAG, "stop");
    return true;
}

// ─── Raw motor setpoint ───────────────────────────────────────────────────────
// Translates a continuous (left, right) m/s setpoint to signed PWM duty per
// motor and writes it. Non-blocking. The program executor on the desktop
// calls this at ~30 Hz; in between calls the motors hold whatever was last
// commanded. Either speed exactly zero kills that motor's drive lines (no
// PWM hiss while idle); both zero is functionally the same as stop().

bool RobotHal::setMotorsRaw(float left_mps, float right_mps) {
    auto toSignedDuty = [](float mps) -> int {
        const float mm_s = mps * 1000.0f;
        // Below 5 mm/s the L298N can't really turn the wheel — treat as stop.
        if (mm_s > -5.0f && mm_s < 5.0f) return 0;
        const float mag = mm_s < 0.0f ? -mm_s : mm_s;
        // SPEED_TO_DUTY is calibrated for 10..200 mm/s; clamp magnitude
        // before mapping so very fast setpoints saturate at duty 255 and
        // very slow ones still turn the wheel at the start of its useful
        // band.
        const float clamped = mag < 10.0f ? 10.0f : (mag > 200.0f ? 200.0f : mag);
        const int duty = static_cast<int>(SPEED_TO_DUTY(clamped));
        return mm_s < 0.0f ? -duty : duty;
    };

    const int leftDuty  = toSignedDuty(left_mps);
    const int rightDuty = toSignedDuty(right_mps);
    if (leftDuty == 0 && rightDuty == 0) {
        motorStop();
    } else {
        motorDrive(leftDuty, rightDuty);
    }
    return true;
}

// ─── HC-SR04 ultrasonic ───────────────────────────────────────────────────────
// Send a 10 µs trigger pulse, then time the ECHO pin's high duration.
// Distance = (echo_us * speed_of_sound_cm/us) / 2.  Speed of sound at
// 20 °C ≈ 0.0343 cm/µs, so distance_cm ≈ echo_us / 58.3.  Returns -1.0f
// if no echo arrives within HCSR04_TIMEOUT_US (out of range, missing
// sensor, or ECHO wiring fault).

float RobotHal::readDistanceCm() {
    const auto trig = static_cast<gpio_num_t>(HCSR04_TRIG_GPIO);
    const auto echo = static_cast<gpio_num_t>(HCSR04_ECHO_GPIO);

    // 10 µs trigger pulse — datasheet minimum is 10 µs.
    gpio_set_level(trig, 0);
    esp_rom_delay_us(2);
    gpio_set_level(trig, 1);
    esp_rom_delay_us(10);
    gpio_set_level(trig, 0);

    // Wait for ECHO to rise (sensor sends out its 8-cycle 40 kHz burst
    // first; ECHO goes high once the burst is complete).
    const int64_t waitStart = esp_timer_get_time();
    while (gpio_get_level(echo) == 0) {
        if (esp_timer_get_time() - waitStart > HCSR04_TIMEOUT_US) return -1.0f;
    }

    // Time ECHO high — proportional to round-trip distance.
    const int64_t echoStart = esp_timer_get_time();
    while (gpio_get_level(echo) == 1) {
        if (esp_timer_get_time() - echoStart > HCSR04_TIMEOUT_US) return -1.0f;
    }
    const int64_t echoUs = esp_timer_get_time() - echoStart;
    return echoUs / 58.3f;
}

// ─── Home ─────────────────────────────────────────────────────────────────────
// Stub: drive backward at low speed for 2 s to reach a physical stop, then zero pose.
// Replace with AprilTag-based homing once the camera pipeline is integrated.

bool RobotHal::home() {
    ESP_LOGI(TAG, "homing...");
    penUp();
    int duty = SPEED_TO_DUTY(40.0f);
    motorDrive(-duty, -duty);
    vTaskDelay(pdMS_TO_TICKS(2000));
    motorStop();
    posX_mm_    = 0.0f;
    posY_mm_    = 0.0f;
    headingDeg_ = 0.0f;
    homed_      = true;
    ESP_LOGI(TAG, "homed — pose zeroed");
    return true;
}

// ─── Move forward ─────────────────────────────────────────────────────────────

bool RobotHal::moveForward(float mm, float speed_mm_s) {
    if (!initialized_) return false;
    speed_mm_s = std::max(10.0f, std::min(speed_mm_s, 200.0f));
    int duty = (int)SPEED_TO_DUTY(speed_mm_s);
    int lDuty = (mm > 0) ? duty : -duty;
    int rDuty = (mm > 0) ? duty : -duty;

    isMoving_ = true;

#ifdef SKETCHBOT_USE_ENCODERS
    int32_t targetCounts = (int32_t)(std::abs(mm) / MM_PER_COUNT);
    encLeft_ = 0; encRight_ = 0;
    motorDrive(lDuty, rDuty);
    int64_t deadlineUs = esp_timer_get_time() + 10000000LL; // 10 s safety
    while ((encLeft_ + encRight_) / 2 < targetCounts) {
        if (esp_timer_get_time() > deadlineUs) break;
        vTaskDelay(1);
    }
#else
    // Timed fallback. SPEED_TO_DUTY was empirically tuned for the
    // ASSUMED wheel diameter (65 mm). If the calibrated wheel diameter
    // differs, the same duty produces a proportionally different
    // mm/s — so drive for less/more time to land at the commanded
    // distance. dia_scale > 1 means smaller wheels → need more time
    // for the same mm.
    const float dia_scale = 65.0f / cal_.wheel_diameter_mm;
    uint32_t ms = (uint32_t)(std::abs(mm) / speed_mm_s * 1000.0f * dia_scale);
    motorDrive(lDuty, rDuty);
    vTaskDelay(pdMS_TO_TICKS(ms));
#endif

    motorStop();

    // Update dead-reckoning pose
    float rad = headingDeg_ * (float)M_PI / 180.0f;
    posX_mm_ += mm * std::cos(rad);
    posY_mm_ += mm * std::sin(rad);

    ESP_LOGI(TAG, "moveForward %.1f mm → pose (%.1f, %.1f) hdg %.1f", mm, posX_mm_, posY_mm_, headingDeg_);
    return true;
}

bool RobotHal::moveBackward(float mm, float speed_mm_s) {
    return moveForward(-mm, speed_mm_s);
}

// ─── Rotate ───────────────────────────────────────────────────────────────────

bool RobotHal::rotate(float degrees, float speed_dps) {
    if (!initialized_) return false;
    speed_dps = std::max(10.0f, std::min(speed_dps, 360.0f));

    // Arc length each wheel travels for this rotation. Uses the
    // *calibrated* wheel base (via cal_.wheel_base_mm), so a robot
    // whose actual track differs from the assumed 140 mm rotates
    // exactly the commanded angle. Same for the speed-to-time math.
    const float base = cal_.wheel_base_mm;
    float arcMm     = std::abs(degrees) / 360.0f * (float)M_PI * base;
    float speed_mm_s = (base / 2.0f) * speed_dps * (float)M_PI / 180.0f;
    int duty = (int)SPEED_TO_DUTY(speed_mm_s);

    // CW (positive): left fwd, right bwd
    int lDuty = (degrees > 0) ?  duty : -duty;
    int rDuty = (degrees > 0) ? -duty :  duty;

    isMoving_ = true;

#ifdef SKETCHBOT_USE_ENCODERS
    int32_t targetCounts = (int32_t)(arcMm / MM_PER_COUNT);
    encLeft_ = 0; encRight_ = 0;
    motorDrive(lDuty, rDuty);
    int64_t deadlineUs = esp_timer_get_time() + 8000000LL; // 8 s safety
    while ((encLeft_ + encRight_) / 2 < targetCounts) {
        if (esp_timer_get_time() > deadlineUs) break;
        vTaskDelay(1);
    }
#else
    // Wheel-diameter calibration matters for rotate too — the wheels
    // are rolling along their own arc, so the same duty under
    // smaller-than-assumed wheels takes longer to cover arcMm.
    const float dia_scale_rot = 65.0f / cal_.wheel_diameter_mm;
    uint32_t ms = (uint32_t)(arcMm / speed_mm_s * 1000.0f * dia_scale_rot);
    motorDrive(lDuty, rDuty);
    vTaskDelay(pdMS_TO_TICKS(ms));
#endif

    motorStop();
    headingDeg_ = std::fmod(headingDeg_ + degrees + 360.0f, 360.0f);
    ESP_LOGI(TAG, "rotate %.1f° → heading %.1f°", degrees, headingDeg_);
    return true;
}

// ─── Go-to ────────────────────────────────────────────────────────────────────

bool RobotHal::goTo(float x_mm, float y_mm, float speed_mm_s) {
    float dx = x_mm - posX_mm_;
    float dy = y_mm - posY_mm_;
    float dist = std::sqrt(dx * dx + dy * dy);
    if (dist < 1.0f) return true;  // already there

    float targetHeading = std::atan2(dy, dx) * 180.0f / (float)M_PI;
    float turn = targetHeading - headingDeg_;
    while (turn >  180.0f) turn -= 360.0f;
    while (turn < -180.0f) turn += 360.0f;

    if (std::abs(turn) > 1.0f) {
        if (!rotate(turn)) return false;
    }
    return moveForward(dist, speed_mm_s);
}

// ─── Telemetry ────────────────────────────────────────────────────────────────

RobotTelemetry RobotHal::telemetry() const {
    RobotTelemetry t;
    t.x_mm        = posX_mm_;
    t.y_mm        = posY_mm_;
    t.heading_deg = headingDeg_;
    t.pen_down    = penIsDown_;
    t.moving      = isMoving_;
    t.homed       = homed_;
    return t;
}

// ─── Status LED ───────────────────────────────────────────────────────────────

void RobotHal::setStatusConnected(bool connected) {
    connected_ = connected;
    setStatusLed(false, connected, false);
}

void RobotHal::setStatusRgb(bool red, bool green, bool blue) const {
    setStatusLed(red, green, blue);
}

void RobotHal::setStatusLed(bool red, bool green, bool blue) const {
    if (!initialized_ || statusLed_ == nullptr) return;
    const uint8_t inp[3] = {
        static_cast<uint8_t>(red   ? 255 : 0),
        static_cast<uint8_t>(green ? 255 : 0),
        static_cast<uint8_t>(blue  ? 255 : 0),
    };
    esp_err_t err = led_strip_set_pixel(statusLed_, 0,
        inp[STATUS_LED_R_ORDER_INDEX],
        inp[STATUS_LED_G_ORDER_INDEX],
        inp[STATUS_LED_B_ORDER_INDEX]);
    if (err == ESP_OK) led_strip_refresh(statusLed_);
}
