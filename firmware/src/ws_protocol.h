#pragma once

#include <string>

#include "esp_websocket_client.h"
#include "robot_hal.h"

class WsProtocol {
public:
    void sendHello(esp_websocket_client_handle_t ws) const;
    void sendHeartbeat(esp_websocket_client_handle_t ws) const;
    void sendTelemetry(esp_websocket_client_handle_t ws, const RobotTelemetry &telemetry) const;
    void sendCommandResult(esp_websocket_client_handle_t ws, const char *commandId, bool ok, const char *message) const;
    void handleInbound(const char *payload, int len, esp_websocket_client_handle_t ws, RobotHal &robot) const;
};
