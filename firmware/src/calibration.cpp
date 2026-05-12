#include "calibration.h"

#include <cstring>

#include "esp_log.h"
#include "nvs.h"

static const char *TAG = "calib";

// Same NVS namespace as device_config so a future "factory reset" path
// can wipe both with one nvs_erase_namespace. The key is distinct.
static constexpr const char *NS_NAME = "sketchbot";
static constexpr const char *KEY     = "calibration";


esp_err_t calibrationLoad(DeviceCalibration &cfg) {
    cfg = DeviceCalibration{};

    nvs_handle_t handle = 0;
    esp_err_t err = nvs_open(NS_NAME, NVS_READONLY, &handle);
    if (err == ESP_ERR_NVS_NOT_FOUND) {
        // Namespace doesn't exist yet — first boot before any provisioning.
        return ESP_OK;
    }
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_open(read) failed: %s", esp_err_to_name(err));
        return err;
    }

    size_t expected = sizeof(DeviceCalibration);
    size_t actual   = expected;
    err = nvs_get_blob(handle, KEY, &cfg, &actual);
    nvs_close(handle);

    if (err == ESP_ERR_NVS_NOT_FOUND) {
        // No calibration stored yet — caller falls back to defaults
        // (which we've already assigned above).
        return ESP_OK;
    }
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_get_blob failed: %s", esp_err_to_name(err));
        cfg = DeviceCalibration{};
        return err;
    }
    if (actual != expected) {
        // Schema changed since last write (new field added). Discard
        // the old blob and start from defaults — safer than reading
        // truncated/wrong data and applying it to motors.
        ESP_LOGW(TAG, "calibration blob size %u != %u — using defaults",
                 (unsigned)actual, (unsigned)expected);
        cfg = DeviceCalibration{};
        return ESP_OK;
    }
    return ESP_OK;
}


esp_err_t calibrationStore(const DeviceCalibration &cfg) {
    nvs_handle_t handle = 0;
    esp_err_t err = nvs_open(NS_NAME, NVS_READWRITE, &handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_open(rw) failed: %s", esp_err_to_name(err));
        return err;
    }
    err = nvs_set_blob(handle, KEY, &cfg, sizeof(cfg));
    if (err == ESP_OK) {
        err = nvs_commit(handle);
    }
    nvs_close(handle);
    if (err == ESP_OK) {
        ESP_LOGI(TAG, "calibration saved (wheel=%.2fmm base=%.2fmm lr=%.3f dmin=%d)",
                 cfg.wheel_diameter_mm, cfg.wheel_base_mm, cfg.lr_balance, cfg.duty_min);
    } else {
        ESP_LOGE(TAG, "calibration save failed: %s", esp_err_to_name(err));
    }
    return err;
}


esp_err_t calibrationClear() {
    nvs_handle_t handle = 0;
    esp_err_t err = nvs_open(NS_NAME, NVS_READWRITE, &handle);
    if (err != ESP_OK) return err;
    nvs_erase_key(handle, KEY);
    err = nvs_commit(handle);
    nvs_close(handle);
    if (err == ESP_OK) {
        ESP_LOGI(TAG, "calibration cleared — defaults restored on next load");
    }
    return err;
}
