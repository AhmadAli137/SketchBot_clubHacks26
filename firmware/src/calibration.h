#pragma once

#include "esp_err.h"

/**
 * Per-device runtime calibration. Stored as one NVS blob ("calibration"
 * in the "sketchbot" namespace, alongside the cloud config) so the
 * wizard's measurements survive reboots. Defaults match the legacy
 * compile-time constants from robot_hal.h, so motion behaviour is
 * unchanged on a factory-fresh device — the wizard pushes real values
 * via the new `set_calibration` WS command once it's run.
 *
 * What each field tunes:
 *
 *   wheel_diameter_mm  Affects every linear motion. SPEED_TO_DUTY in
 *                      robot_hal.h was empirically tuned for the
 *                      assumed 65 mm wheel — if the real wheels are
 *                      bigger/smaller, the same duty produces a
 *                      different actual mm/s. moveForward scales its
 *                      time by (65 / wheel_diameter_mm) to compensate.
 *
 *   wheel_base_mm      The track width used in rotate()'s arc-length
 *                      calculation. Wrong here = every turn over/under
 *                      shoots by a constant percentage. Substituted
 *                      directly for the WHEEL_BASE_MM #define when the
 *                      bot is calibrated.
 *
 *   lr_balance         Left/right motor imbalance correction.
 *                        1.0  = perfectly balanced
 *                       > 1.0 = left motor naturally faster
 *                       < 1.0 = right motor naturally faster
 *                      motorDrive() reduces the duty on whichever side
 *                      is naturally faster, so commanded matching
 *                      values produce matched ground speeds.
 *
 *   duty_min           PWM dead-band floor. Below this duty the L298N
 *                      can't break the motor's static friction — the
 *                      wheel just buzzes in place. Anything below
 *                      this snaps to zero. Defaults to SPEED_TO_DUTY's
 *                      original 10 mm/s floor (duty 55).
 */
struct DeviceCalibration {
    bool  provisioned       = false;
    float wheel_diameter_mm = 65.0f;
    float wheel_base_mm     = 140.0f;
    float lr_balance        = 1.0f;
    int   duty_min          = 55;
};

/** Load the persisted calibration. On a fresh device (no NVS entry yet)
 *  returns ESP_OK with cfg = defaults — callers don't have to special-
 *  case first boot. */
esp_err_t calibrationLoad(DeviceCalibration &cfg);

/** Persist the calibration. After this call, the next calibrationLoad
 *  (e.g. on next boot) sees these values. Caller is also expected to
 *  apply the values live by calling RobotHal::setCalibration so the
 *  current session reflects the new values without a reboot. */
esp_err_t calibrationStore(const DeviceCalibration &cfg);

/** Wipe back to defaults. Useful when the kid's bot is moved to a new
 *  surface where the prior cal is wrong — they can clear and re-run the
 *  wizard fresh. */
esp_err_t calibrationClear();
