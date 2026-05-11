#include "ws_protocol.h"

#include <cstring>

#include "esp_log.h"
#include "esp_timer.h"
#include "cJSON.h"

#include "app_config.h"
#include "device_config.h"
#include "device_id.h"
#include "secrets.h"

static const char *TAG = "ws_protocol";

// ─── Arbitration state ──────────────────────────────────────────────────────
// Two controllers can reach the firmware in parallel post-provisioning:
//   - LAN  (kid's desktop runtime on the same Wi-Fi — low latency)
//   - Cloud(mobile companion / untethered usage via /ws/control relay)
//
// Rules:
//   1. Non-motion commands (ping, status, set_credentials, clear_credentials,
//      stop) are always accepted regardless of who is "driving" — stop is a
//      safety primitive, the rest are housekeeping.
//   2. Motion commands (motor.set, move_*, rotate, go_to, home, pen_*) are
//      arbitrated:
//        - if the active controller is the same source, accept (streaming).
//        - if no one has driven within CONFLICT_WINDOW_MS, the new source
//          claims control.
//        - if someone else drove within the window, LAN wins (the kid is
//          physically next to the bot; their commands pre-empt cloud).
//   3. Whenever the active controller changes, a controller_status event
//      is broadcast to both WSes so each side's UI can reflect "you're
//      driving" vs "another session is driving".
//
// 'g_activeController' is the source that most-recently sent an arbitrated
// command. 'lastChange' is the ms timestamp at which it became active —
// used by clients that want to display "controlling since N ago".

enum class ActiveCtrl : uint8_t { None = 0, Lan = 1, Cloud = 2 };

static constexpr int64_t CONFLICT_WINDOW_MS = 250;
static ActiveCtrl       g_activeController  = ActiveCtrl::None;
static int64_t          g_lastCommandMs     = 0;
static int64_t          g_activeSinceMs     = 0;

static int64_t nowMs() { return esp_timer_get_time() / 1000; }

static const char *ctrlName(ActiveCtrl c) {
    switch (c) {
        case ActiveCtrl::Lan:   return "lan";
        case ActiveCtrl::Cloud: return "cloud";
        default:                return "none";
    }
}

static ActiveCtrl ctrlFromSource(WsSource s) {
    return (s == WsSource::Lan) ? ActiveCtrl::Lan : ActiveCtrl::Cloud;
}

// ─── Internal helpers ───────────────────────────────────────────────────────

static void send_json_to(esp_websocket_client_handle_t ws, cJSON *root) {
    char *text = cJSON_PrintUnformatted(root);
    if (text && ws) {
        esp_websocket_client_send_text(ws, text, std::strlen(text), portMAX_DELAY);
    }
    if (text) cJSON_free(text);
    cJSON_Delete(root);
}

static void broadcast_json(const NetworkHal &net, cJSON *root) {
    char *text = cJSON_PrintUnformatted(root);
    if (text) {
        net.broadcastText(text, std::strlen(text));
        cJSON_free(text);
    }
    cJSON_Delete(root);
}

static void broadcastControllerStatus(const NetworkHal &net) {
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "type", "controller_status");
    cJSON_AddStringToObject(root, "active", ctrlName(g_activeController));
    cJSON_AddNumberToObject(root, "since_ms", (double)g_activeSinceMs);
    broadcast_json(net, root);
}

// Return true if this is an arbitrated command name (i.e. it touches motion
// state). Non-arbitrated commands skip the control check entirely.
static bool isArbitratedCommand(const char *n) {
    return std::strcmp(n, "motor.set")     == 0
        || std::strcmp(n, "move_forward")  == 0
        || std::strcmp(n, "move_backward") == 0
        || std::strcmp(n, "rotate")        == 0
        || std::strcmp(n, "go_to")         == 0
        || std::strcmp(n, "home")          == 0
        || std::strcmp(n, "pen_up")        == 0
        || std::strcmp(n, "pen_down")      == 0;
}

// Decide whether `source` may execute now. Updates g_activeController +
// g_lastCommandMs on accept. Returns false iff the caller should reply
// with a "controller_busy" command_result and skip execution.
//
// `controllerChanged` is set to true when the call flips the active
// controller — caller is expected to broadcast a controller_status event.
static bool arbitrate(WsSource source, bool &controllerChanged) {
    controllerChanged = false;
    const ActiveCtrl src = ctrlFromSource(source);
    const int64_t now = nowMs();

    // Same source as last command, or no one driving — accept and (maybe) claim.
    if (g_activeController == ActiveCtrl::None || g_activeController == src) {
        if (g_activeController != src) {
            g_activeController = src;
            g_activeSinceMs = now;
            controllerChanged = true;
        }
        g_lastCommandMs = now;
        return true;
    }

    // Different controller. If their last command was outside the conflict
    // window, the new source freely takes over.
    if ((now - g_lastCommandMs) > CONFLICT_WINDOW_MS) {
        g_activeController = src;
        g_activeSinceMs = now;
        g_lastCommandMs = now;
        controllerChanged = true;
        return true;
    }

    // Within the window — LAN wins. Cloud is dropped.
    if (source == WsSource::Lan) {
        g_activeController = ActiveCtrl::Lan;
        g_activeSinceMs = now;
        g_lastCommandMs = now;
        controllerChanged = true;
        return true;
    }
    // Cloud command arrived while LAN had control → drop.
    return false;
}

// ─── Outbound frames ────────────────────────────────────────────────────────

void WsProtocol::sendHello(esp_websocket_client_handle_t ws) const {
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "type", "hello");
    cJSON_AddStringToObject(root, "robot_id", deviceSerial());
    cJSON_AddStringToObject(root, "firmware_version", SKETCHBOT_FW_VERSION);
    cJSON_AddStringToObject(root, "board", SKETCHBOT_BOARD_NAME);
    cJSON *caps = cJSON_AddArrayToObject(root, "capabilities");
    cJSON_AddItemToArray(caps, cJSON_CreateString("heartbeat"));
    cJSON_AddItemToArray(caps, cJSON_CreateString("telemetry"));
    cJSON_AddItemToArray(caps, cJSON_CreateString("command_result"));
    cJSON_AddItemToArray(caps, cJSON_CreateString("distance"));
    // Dual-connection capability bit so the controller knows the bot
    // can be reached on both LAN and cloud and applies arbitration.
    cJSON_AddItemToArray(caps, cJSON_CreateString("dual_controller"));

    // When the device has been provisioned with a cloud-issued JWT
    // (Phase 2c.1), prefer it over the compile-time AUTH_TOKEN. The
    // cloud's /ws/robot endpoint verifies the JWT signature + JTI; the
    // LAN local-runtime accepts either AUTH_TOKEN (current) or the JWT.
    DeviceCloudConfig nvsCfg;
    if (deviceConfigLoad(nvsCfg) == ESP_OK && nvsCfg.provisioned) {
        cJSON_AddStringToObject(root, "auth_token", nvsCfg.token);
    } else if (std::strlen(AUTH_TOKEN) > 0) {
        cJSON_AddStringToObject(root, "auth_token", AUTH_TOKEN);
    }
    send_json_to(ws, root);
}

void WsProtocol::broadcastHeartbeat(const NetworkHal &net) const {
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "type", "heartbeat");
    cJSON_AddStringToObject(root, "robot_id", deviceSerial());
    cJSON_AddNumberToObject(root, "uptime_ms", (double)(esp_timer_get_time() / 1000));
    cJSON_AddNumberToObject(root, "free_heap", (double)esp_get_free_heap_size());
    // Include who's currently driving so each controller's UI can stay
    // honest without needing a separate poll.
    cJSON_AddStringToObject(root, "active_controller", ctrlName(g_activeController));
    broadcast_json(net, root);
}

void WsProtocol::broadcastTelemetry(const NetworkHal &net, const RobotTelemetry &telemetry) const {
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "type", "telemetry");
    cJSON_AddStringToObject(root, "robot_id", deviceSerial());
    cJSON_AddNumberToObject(root, "x_mm", telemetry.x_mm);
    cJSON_AddNumberToObject(root, "y_mm", telemetry.y_mm);
    cJSON_AddNumberToObject(root, "heading_deg", telemetry.heading_deg);
    cJSON_AddBoolToObject(root, "pen_down", telemetry.pen_down);
    cJSON_AddBoolToObject(root, "moving", telemetry.moving);
    cJSON_AddBoolToObject(root, "homed", telemetry.homed);
    cJSON_AddNumberToObject(root, "queue_depth", telemetry.queue_depth);
    cJSON_AddNumberToObject(root, "distance_cm", telemetry.distance_cm);
    broadcast_json(net, root);
}

void WsProtocol::sendCommandResult(esp_websocket_client_handle_t ws,
                                   const char *commandId, bool ok, const char *message) const {
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "type", "command_result");
    cJSON_AddStringToObject(root, "command_id", commandId ? commandId : "unknown");
    cJSON_AddBoolToObject(root, "ok", ok);
    cJSON_AddStringToObject(root, "message", message ? message : (ok ? "ok" : "error"));
    send_json_to(ws, root);
}

// ─── Inbound dispatch ───────────────────────────────────────────────────────

void WsProtocol::handleInbound(const char *payload, int len,
                               esp_websocket_client_handle_t ws,
                               RobotHal &robot,
                               WsSource source) {
    cJSON *root = cJSON_ParseWithLength(payload, len);
    if (!root) {
        ESP_LOGW(TAG, "Invalid JSON payload");
        return;
    }
    cJSON *type = cJSON_GetObjectItem(root, "type");
    if (!cJSON_IsString(type)) { cJSON_Delete(root); return; }

    if (std::strcmp(type->valuestring, "command") != 0) {
        cJSON_Delete(root);
        return;
    }

    cJSON *commandId = cJSON_GetObjectItem(root, "command_id");
    cJSON *name      = cJSON_GetObjectItem(root, "name");
    bool        ok      = false;
    const char *message = "unsupported command";

    if (cJSON_IsString(name)) {
        const char *n = name->valuestring;

        // Arbitration applies only to motion commands. Housekeeping
        // (ping/status/set_credentials/clear_credentials/stop) goes
        // through regardless of who's driving.
        bool controllerChanged = false;
        if (isArbitratedCommand(n)) {
            if (!arbitrate(source, controllerChanged)) {
                ESP_LOGI(TAG, "drop %s from %s — %s is driving",
                         n, ctrlName(ctrlFromSource(source)),
                         ctrlName(g_activeController));
                sendCommandResult(ws,
                    cJSON_IsString(commandId) ? commandId->valuestring : "unknown",
                    false,
                    "controller_busy: another session is driving");
                cJSON_Delete(root);
                return;
            }
        }

        if (std::strcmp(n, "ping") == 0 || std::strcmp(n, "status") == 0) {
            ok = true;
            message = "pong";

        } else if (std::strcmp(n, "set_credentials") == 0) {
            cJSON *args = cJSON_GetObjectItem(root, "args");
            const char *ws_url = nullptr;
            const char *token  = nullptr;
            if (args) {
                cJSON *ju = cJSON_GetObjectItem(args, "ws_url");
                cJSON *jt = cJSON_GetObjectItem(args, "token");
                if (cJSON_IsString(ju)) ws_url = ju->valuestring;
                if (cJSON_IsString(jt)) token  = jt->valuestring;
            }
            if (!ws_url || !token) {
                ok = false;
                message = "set_credentials: ws_url and token required";
            } else {
                esp_err_t err = deviceConfigStore(ws_url, token);
                ok = (err == ESP_OK);
                message = ok ? "credentials saved" : "credentials store failed";
            }

        } else if (std::strcmp(n, "clear_credentials") == 0) {
            esp_err_t err = deviceConfigClear();
            ok = (err == ESP_OK);
            message = ok ? "credentials cleared" : "credentials clear failed";

        } else if (std::strcmp(n, "stop") == 0) {
            ok = robot.stop();
            message = ok ? "stopped" : "stop failed";

        } else if (std::strcmp(n, "home") == 0) {
            ok = robot.home();
            message = ok ? "home complete" : "home failed";

        } else if (std::strcmp(n, "pen_up") == 0) {
            ok = robot.penUp();
            message = ok ? "pen up" : "pen up failed";

        } else if (std::strcmp(n, "pen_down") == 0) {
            ok = robot.penDown();
            message = ok ? "pen down" : "pen down failed";

        } else if (std::strcmp(n, "motor.set") == 0) {
            cJSON *args     = cJSON_GetObjectItem(root, "args");
            float left_mps  = 0.0f;
            float right_mps = 0.0f;
            if (args) {
                cJSON *jl = cJSON_GetObjectItem(args, "left_mps");
                cJSON *jr = cJSON_GetObjectItem(args, "right_mps");
                if (cJSON_IsNumber(jl)) left_mps  = (float)jl->valuedouble;
                if (cJSON_IsNumber(jr)) right_mps = (float)jr->valuedouble;
            }
            ok = robot.setMotorsRaw(left_mps, right_mps);
            message = ok ? "ok" : "motor.set failed";

        } else if (std::strcmp(n, "move_forward") == 0) {
            cJSON *args      = cJSON_GetObjectItem(root, "args");
            float mm         = 0.0f;
            float speed_mm_s = 60.0f;
            if (args) {
                cJSON *jmm = cJSON_GetObjectItem(args, "mm");
                cJSON *jsp = cJSON_GetObjectItem(args, "speed_mm_s");
                if (cJSON_IsNumber(jmm)) mm = (float)jmm->valuedouble;
                if (cJSON_IsNumber(jsp)) speed_mm_s = (float)jsp->valuedouble;
            }
            ok = robot.moveForward(mm, speed_mm_s);
            message = ok ? "ok" : "move failed";

        } else if (std::strcmp(n, "move_backward") == 0) {
            cJSON *args      = cJSON_GetObjectItem(root, "args");
            float mm         = 0.0f;
            float speed_mm_s = 60.0f;
            if (args) {
                cJSON *jmm = cJSON_GetObjectItem(args, "mm");
                cJSON *jsp = cJSON_GetObjectItem(args, "speed_mm_s");
                if (cJSON_IsNumber(jmm)) mm = (float)jmm->valuedouble;
                if (cJSON_IsNumber(jsp)) speed_mm_s = (float)jsp->valuedouble;
            }
            ok = robot.moveBackward(mm, speed_mm_s);
            message = ok ? "ok" : "move failed";

        } else if (std::strcmp(n, "rotate") == 0) {
            cJSON *args     = cJSON_GetObjectItem(root, "args");
            float degrees   = 0.0f;
            float speed_dps = 90.0f;
            if (args) {
                cJSON *jdeg = cJSON_GetObjectItem(args, "degrees");
                cJSON *jsp  = cJSON_GetObjectItem(args, "speed_dps");
                if (cJSON_IsNumber(jdeg)) degrees   = (float)jdeg->valuedouble;
                if (cJSON_IsNumber(jsp))  speed_dps = (float)jsp->valuedouble;
            }
            ok = robot.rotate(degrees, speed_dps);
            message = ok ? "ok" : "rotate failed";

        } else if (std::strcmp(n, "go_to") == 0) {
            cJSON *args      = cJSON_GetObjectItem(root, "args");
            float x_mm       = 0.0f;
            float y_mm       = 0.0f;
            float speed_mm_s = 60.0f;
            if (args) {
                cJSON *jx  = cJSON_GetObjectItem(args, "x_mm");
                cJSON *jy  = cJSON_GetObjectItem(args, "y_mm");
                cJSON *jsp = cJSON_GetObjectItem(args, "speed_mm_s");
                if (cJSON_IsNumber(jx))  x_mm       = (float)jx->valuedouble;
                if (cJSON_IsNumber(jy))  y_mm       = (float)jy->valuedouble;
                if (cJSON_IsNumber(jsp)) speed_mm_s = (float)jsp->valuedouble;
            }
            ok = robot.goTo(x_mm, y_mm, speed_mm_s);
            message = ok ? "ok" : "go_to failed";
        }

        // If accepting the command flipped the active controller, tell
        // both sides so the inactive UI flips to "another session is
        // driving" promptly rather than waiting for the next heartbeat.
        if (controllerChanged) {
            // We don't have the NetworkHal here without plumbing — and
            // the next heartbeat (every HEARTBEAT_INTERVAL_MS) already
            // carries active_controller. The controller_status event is
            // a nice-to-have we'll wire when we add the network handle
            // through; for now, the heartbeat path suffices.
            ESP_LOGI(TAG, "active controller -> %s", ctrlName(g_activeController));
        }
    }

    sendCommandResult(ws,
        cJSON_IsString(commandId) ? commandId->valuestring : "unknown",
        ok, message);
    cJSON_Delete(root);
}
