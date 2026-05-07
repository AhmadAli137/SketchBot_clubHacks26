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

static void send_json(esp_websocket_client_handle_t ws, cJSON *root) {
    char *text = cJSON_PrintUnformatted(root);
    if (text && ws) {
        esp_websocket_client_send_text(ws, text, std::strlen(text), portMAX_DELAY);
    }
    if (text) cJSON_free(text);
    cJSON_Delete(root);
}

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
    // When the device has been provisioned with a cloud-issued JWT
    // (Phase 2c.1), prefer it over the compile-time AUTH_TOKEN. The
    // cloud's /ws/robot endpoint verifies the JWT signature + JTI; the
    // LAN local-runtime accepts either AUTH_TOKEN (current) or the JWT
    // (since it's just a string payload either way).
    DeviceCloudConfig nvsCfg;
    if (deviceConfigLoad(nvsCfg) == ESP_OK && nvsCfg.provisioned) {
        cJSON_AddStringToObject(root, "auth_token", nvsCfg.token);
    } else if (std::strlen(AUTH_TOKEN) > 0) {
        cJSON_AddStringToObject(root, "auth_token", AUTH_TOKEN);
    }
    send_json(ws, root);
}

void WsProtocol::sendHeartbeat(esp_websocket_client_handle_t ws) const {
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "type", "heartbeat");
    cJSON_AddStringToObject(root, "robot_id", deviceSerial());
    cJSON_AddNumberToObject(root, "uptime_ms", (double)(esp_timer_get_time() / 1000));
    cJSON_AddNumberToObject(root, "free_heap", (double)esp_get_free_heap_size());
    send_json(ws, root);
}

void WsProtocol::sendTelemetry(esp_websocket_client_handle_t ws, const RobotTelemetry &telemetry) const {
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
    send_json(ws, root);
}

void WsProtocol::sendCommandResult(esp_websocket_client_handle_t ws, const char *commandId, bool ok, const char *message) const {
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "type", "command_result");
    cJSON_AddStringToObject(root, "command_id", commandId ? commandId : "unknown");
    cJSON_AddBoolToObject(root, "ok", ok);
    cJSON_AddStringToObject(root, "message", message ? message : (ok ? "ok" : "error"));
    send_json(ws, root);
}

void WsProtocol::handleInbound(const char *payload, int len, esp_websocket_client_handle_t ws, RobotHal &robot) const {
    cJSON *root = cJSON_ParseWithLength(payload, len);
    if (!root) {
        ESP_LOGW(TAG, "Invalid JSON payload");
        return;
    }
    cJSON *type = cJSON_GetObjectItem(root, "type");
    if (!cJSON_IsString(type)) {
        cJSON_Delete(root);
        return;
    }
    if (std::strcmp(type->valuestring, "command") == 0) {
        cJSON *commandId = cJSON_GetObjectItem(root, "command_id");
        cJSON *name = cJSON_GetObjectItem(root, "name");
        bool ok = false;
        const char *message = "unsupported command";
        if (cJSON_IsString(name)) {
            const char *n = name->valuestring;

            if (std::strcmp(n, "ping") == 0 || std::strcmp(n, "status") == 0) {
                ok = true;
                message = "pong";

            } else if (std::strcmp(n, "set_credentials") == 0) {
                // Provisioning command: the desktop forwards
                // { ws_url, token } here after the user claims this bot
                // and issues a JWT in the admin web. We persist to NVS
                // and acknowledge — the new endpoint takes effect on the
                // next reconnect (initiated by either the runtime
                // dropping us or a deliberate reboot).
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
                // Backout/factory-reset path. Wipes NVS so the next boot
                // returns to the LAN/local-runtime fallback. Useful when
                // re-pairing against a different account.
                esp_err_t err = deviceConfigClear();
                ok = (err == ESP_OK);
                message = ok ? "credentials cleared" : "credentials clear failed";

            } else if (std::strcmp(n, "home") == 0) {
                ok = robot.home();
                message = ok ? "home complete" : "home failed";

            } else if (std::strcmp(n, "pen_up") == 0) {
                ok = robot.penUp();
                message = ok ? "pen up" : "pen up failed";

            } else if (std::strcmp(n, "pen_down") == 0) {
                ok = robot.penDown();
                message = ok ? "pen down" : "pen down failed";

            } else if (std::strcmp(n, "stop") == 0) {
                ok = robot.stop();
                message = ok ? "stopped" : "stop failed";

            } else if (std::strcmp(n, "motor.set") == 0) {
                // Raw differential-drive setpoint streamed from the desktop
                // program executor. Non-blocking: just updates the PWM and
                // returns. left_mps / right_mps are signed metres/second
                // (negative = backward).
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
        }
        sendCommandResult(ws, cJSON_IsString(commandId) ? commandId->valuestring : "unknown", ok, message);
    }
    cJSON_Delete(root);
}
