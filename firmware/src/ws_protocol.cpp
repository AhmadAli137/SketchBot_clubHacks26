#include "ws_protocol.h"

#include <cstring>

#include "esp_log.h"
#include "esp_timer.h"
#include "cJSON.h"

#include "app_config.h"
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
    cJSON_AddStringToObject(root, "robot_id", SKETCHBOT_DEVICE_ID);
    cJSON_AddStringToObject(root, "firmware_version", SKETCHBOT_FW_VERSION);
    cJSON_AddStringToObject(root, "board", SKETCHBOT_BOARD_NAME);
    cJSON *caps = cJSON_AddArrayToObject(root, "capabilities");
    cJSON_AddItemToArray(caps, cJSON_CreateString("heartbeat"));
    cJSON_AddItemToArray(caps, cJSON_CreateString("telemetry"));
    cJSON_AddItemToArray(caps, cJSON_CreateString("command_result"));
    if (std::strlen(AUTH_TOKEN) > 0) {
        cJSON_AddStringToObject(root, "auth_token", AUTH_TOKEN);
    }
    send_json(ws, root);
}

void WsProtocol::sendHeartbeat(esp_websocket_client_handle_t ws) const {
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "type", "heartbeat");
    cJSON_AddStringToObject(root, "robot_id", SKETCHBOT_DEVICE_ID);
    cJSON_AddNumberToObject(root, "uptime_ms", (double)(esp_timer_get_time() / 1000));
    cJSON_AddNumberToObject(root, "free_heap", (double)esp_get_free_heap_size());
    send_json(ws, root);
}

void WsProtocol::sendTelemetry(esp_websocket_client_handle_t ws, const RobotTelemetry &telemetry) const {
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "type", "telemetry");
    cJSON_AddStringToObject(root, "robot_id", SKETCHBOT_DEVICE_ID);
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
            if (std::strcmp(name->valuestring, "ping") == 0 || std::strcmp(name->valuestring, "status") == 0) {
                ok = true;
                message = "pong";
            } else if (std::strcmp(name->valuestring, "home") == 0) {
                ok = robot.home();
                message = ok ? "home complete" : "home failed";
            } else if (std::strcmp(name->valuestring, "pen_up") == 0) {
                ok = robot.penUp();
                message = ok ? "pen up complete" : "pen up failed";
            } else if (std::strcmp(name->valuestring, "pen_down") == 0) {
                ok = robot.penDown();
                message = ok ? "pen down complete" : "pen down failed";
            } else if (std::strcmp(name->valuestring, "stop") == 0) {
                ok = robot.stop();
                message = ok ? "stop complete" : "stop failed";
            }
        }
        sendCommandResult(ws, cJSON_IsString(commandId) ? commandId->valuestring : "unknown", ok, message);
    }
    cJSON_Delete(root);
}
