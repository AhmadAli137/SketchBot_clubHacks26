#pragma once

#include <string>

#include "esp_websocket_client.h"
#include "network_hal.h"   // for WsSource
#include "robot_hal.h"

class WsProtocol {
public:
    /** Hello on a specific WS — sent once per side as each connects. */
    void sendHello(esp_websocket_client_handle_t ws) const;

    /** Heartbeat sent to all live WSes via NetworkHal::broadcastText. */
    void broadcastHeartbeat(const NetworkHal &net) const;

    /** Telemetry broadcast — same world to every subscribed controller. */
    void broadcastTelemetry(const NetworkHal &net, const RobotTelemetry &telemetry) const;

    /** command_result is the issuer's ack — only goes back on the WS the
     *  command came in on. */
    void sendCommandResult(esp_websocket_client_handle_t ws, const char *commandId, bool ok, const char *message) const;

    /** Dispatch one inbound command frame. The `source` tag drives the
     *  arbitration core in the .cpp — see arbitrate() there. */
    void handleInbound(const char *payload, int len,
                       esp_websocket_client_handle_t ws,
                       RobotHal &robot,
                       WsSource source);
};
