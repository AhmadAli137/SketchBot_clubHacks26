#pragma once

#include "esp_err.h"
#include "esp_event.h"
#include "esp_websocket_client.h"

class RobotHal;
class WsProtocol;

class NetworkHal {
public:
    esp_err_t init();
    esp_err_t connectWifi();
    /** Same as connectWifi() but bails out after `timeout_ms` instead of
     *  blocking forever. Returns ESP_ERR_TIMEOUT if the AP didn't grant
     *  an IP in time — used by the hardware self-test so a missing /
     *  misspelled SSID doesn't hang the rig. */
    esp_err_t connectWifiWithTimeout(uint32_t timeout_ms);
    esp_err_t connectWebsocket();
    bool websocketConnected() const;
    esp_websocket_client_handle_t websocket() const;
    void attachProtocol(WsProtocol *protocol, RobotHal *robot);
    bool consumeConnectedEvent();

private:
    static void wifiEventHandler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data);
    static void websocketEventHandler(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data);

    esp_websocket_client_handle_t wsClient_ = nullptr;
    WsProtocol *protocol_ = nullptr;
    RobotHal *robot_ = nullptr;
    volatile bool websocketJustConnected_ = false;
};
