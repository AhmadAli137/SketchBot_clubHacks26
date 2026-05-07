#include "device_config.h"

#include <cstring>

#include "esp_log.h"
#include "nvs.h"
#include "nvs_flash.h"

static const char *TAG = "device_cfg";

// All keys live inside the same dedicated namespace so we can wipe the
// device's cloud provisioning without touching anything else NVS-resident
// (e.g. Wi-Fi credentials managed by the IDF).
static constexpr const char *NS_NAME       = "sketchbot";
static constexpr const char *KEY_WS_URL    = "cloud_ws_url";
static constexpr const char *KEY_TOKEN     = "cloud_token";
static constexpr const char *KEY_PROVISIONED = "provisioned";


esp_err_t deviceConfigInit() {
    // main.cpp already calls nvs_flash_init() before any subsystem; this
    // is here so the self-test app and other entry points that need to
    // touch device config can call us standalone without ordering risk.
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_LOGW(TAG, "NVS partition out of pages or version-mismatched, erasing");
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    return err;
}


esp_err_t deviceConfigLoad(DeviceCloudConfig &cfg) {
    cfg = DeviceCloudConfig{};

    nvs_handle_t handle = 0;
    esp_err_t err = nvs_open(NS_NAME, NVS_READONLY, &handle);
    if (err == ESP_ERR_NVS_NOT_FOUND) {
        // Namespace doesn't exist yet — first boot, before any
        // provisioning. That's normal.
        return ESP_OK;
    }
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_open(read) failed: %s", esp_err_to_name(err));
        return err;
    }

    uint8_t provisioned = 0;
    err = nvs_get_u8(handle, KEY_PROVISIONED, &provisioned);
    if (err == ESP_ERR_NVS_NOT_FOUND || provisioned == 0) {
        nvs_close(handle);
        return ESP_OK;  // unprovisioned — caller falls back
    }
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_get_u8(provisioned) failed: %s", esp_err_to_name(err));
        nvs_close(handle);
        return err;
    }

    size_t len = sizeof(cfg.ws_url);
    err = nvs_get_str(handle, KEY_WS_URL, cfg.ws_url, &len);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_get_str(ws_url) failed: %s", esp_err_to_name(err));
        nvs_close(handle);
        return err;
    }

    len = sizeof(cfg.token);
    err = nvs_get_str(handle, KEY_TOKEN, cfg.token, &len);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_get_str(token) failed: %s", esp_err_to_name(err));
        nvs_close(handle);
        return err;
    }

    cfg.provisioned = true;
    nvs_close(handle);
    return ESP_OK;
}


esp_err_t deviceConfigStore(const char *ws_url, const char *token) {
    if (!ws_url || !token) return ESP_ERR_INVALID_ARG;
    if (std::strlen(ws_url) >= DEVICE_CFG_MAX_URL_LEN)   return ESP_ERR_INVALID_SIZE;
    if (std::strlen(token)  >= DEVICE_CFG_MAX_TOKEN_LEN) return ESP_ERR_INVALID_SIZE;

    nvs_handle_t handle = 0;
    esp_err_t err = nvs_open(NS_NAME, NVS_READWRITE, &handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_open(rw) failed: %s", esp_err_to_name(err));
        return err;
    }

    err = nvs_set_str(handle, KEY_WS_URL, ws_url);
    if (err != ESP_OK) goto fail;
    err = nvs_set_str(handle, KEY_TOKEN, token);
    if (err != ESP_OK) goto fail;
    err = nvs_set_u8(handle, KEY_PROVISIONED, 1);
    if (err != ESP_OK) goto fail;
    err = nvs_commit(handle);
    if (err != ESP_OK) goto fail;

    nvs_close(handle);
    ESP_LOGI(TAG, "cloud credentials persisted (url=%s)", ws_url);
    return ESP_OK;

fail:
    ESP_LOGE(TAG, "deviceConfigStore failed: %s", esp_err_to_name(err));
    nvs_close(handle);
    return err;
}


esp_err_t deviceConfigClear() {
    nvs_handle_t handle = 0;
    esp_err_t err = nvs_open(NS_NAME, NVS_READWRITE, &handle);
    if (err != ESP_OK) return err;

    // Erase keys one at a time rather than nuking the namespace so that
    // future fields (e.g. user_id, last_observed_program_id) co-located
    // here aren't dropped by accident.
    nvs_erase_key(handle, KEY_WS_URL);
    nvs_erase_key(handle, KEY_TOKEN);
    nvs_erase_key(handle, KEY_PROVISIONED);

    err = nvs_commit(handle);
    nvs_close(handle);
    if (err == ESP_OK) ESP_LOGI(TAG, "cloud credentials wiped");
    return err;
}
