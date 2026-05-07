#pragma once

#include <cstdint>

#include "esp_err.h"

// NVS-backed cloud provisioning state.
//
// Phase 2c.2: when set, these values let the firmware skip the
// compile-time WS_URL (which points at a kid's local Python runtime on
// the LAN) and instead connect directly to the cloud-backend's
// /ws/robot endpoint, authenticating with the per-device JWT issued
// at https://sayspark.ca/account.
//
// The expected provisioning flow is:
//   1. user claims the bot's serial in the admin web (Phase 2b)
//   2. user clicks "Get token" — cloud issues a JWT (Phase 2c.1)
//   3. desktop forwards { ws_url, token } via the existing local-runtime
//      WS using a `set_credentials` command (this commit)
//   4. firmware persists in NVS and re-connects to the cloud URL
//
// Once provisioned, future boots try the cloud URL first; the LAN URL
// is only used in the unprovisioned state (factory-fresh / out-of-box).

constexpr size_t DEVICE_CFG_MAX_URL_LEN   = 192;
constexpr size_t DEVICE_CFG_MAX_TOKEN_LEN = 1024;  // JWT can be long

struct DeviceCloudConfig {
    bool        provisioned = false;  // false ⇒ no NVS values; use compile-time defaults
    char        ws_url[DEVICE_CFG_MAX_URL_LEN]   = {0};
    char        token  [DEVICE_CFG_MAX_TOKEN_LEN] = {0};
};

// Initialise the NVS subsystem. Idempotent — safe to call from main even
// if some other module has already opened NVS.
esp_err_t deviceConfigInit();

// Read the persisted cloud config out of NVS. On a factory-fresh device
// returns ESP_OK with cfg.provisioned == false; the caller should fall
// back to compile-time WS_URL / AUTH_TOKEN in that case.
esp_err_t deviceConfigLoad(DeviceCloudConfig &cfg);

// Persist the cloud config to NVS. Both fields are required and must
// fit within the buffer sizes above. Marks the device as provisioned.
esp_err_t deviceConfigStore(const char *ws_url, const char *token);

// Wipe the persisted cloud config. After this the device returns to
// LAN-only mode. Used by a future "reset" command if the user wants to
// re-pair against a different account.
esp_err_t deviceConfigClear();
