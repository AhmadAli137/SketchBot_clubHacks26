#pragma once

#include "esp_err.h"
#include "esp_event.h"
#include "esp_websocket_client.h"

class RobotHal;
class WsProtocol;

// Tag for the two parallel WebSocket clients the firmware runs once
// it has been bound to an account (Phase 2c.5). Used to:
//   - route per-source events from the C event handler into the right
//     reconnect/hello bookkeeping,
//   - tell the protocol layer which controller (kid's desktop on LAN,
//     or mobile companion via cloud relay) originated each command so
//     it can arbitrate fairly.
enum class WsSource : uint8_t {
    Lan   = 0,  // compile-time WS_URL — user's local-runtime on the LAN
    Cloud = 1,  // NVS-provisioned cloud /ws/robot — mobile / untethered
};

class NetworkHal {
public:
    esp_err_t init();
    esp_err_t connectWifi();
    /** Same as connectWifi() but bails out after `timeout_ms` instead of
     *  blocking forever. Returns ESP_ERR_TIMEOUT if the AP didn't grant
     *  an IP in time — used by the hardware self-test so a missing /
     *  misspelled SSID doesn't hang the rig. */
    esp_err_t connectWifiWithTimeout(uint32_t timeout_ms);

    /** Starts both WebSocket clients in parallel:
     *    - LAN client targets the compile-time WS_URL (local-runtime).
     *      Always started; the IDF auto-reconnect loop just keeps trying
     *      when the laptop's app is offline.
     *    - Cloud client targets the NVS-stored ws_url, only when the
     *      device has been provisioned (Phase 2c.2). Unprovisioned bots
     *      stay LAN-only until set_credentials lands.
     *  Either side can drop and reconnect independently — the firmware
     *  remains controllable through whichever is currently live. */
    esp_err_t connectWebsocket();

    bool lanConnected() const;
    bool cloudConnected() const;
    /** Convenience: true iff at least one side is up. Kept for callers
     *  that just want to know "can we talk to anyone right now?". */
    bool websocketConnected() const;

    esp_websocket_client_handle_t lanWs()   const { return lanWsClient_;   }
    esp_websocket_client_handle_t cloudWs() const { return cloudWsClient_; }

    /** Legacy single-handle accessor; resolves to whichever side is up
     *  (LAN first). Soon-to-be-removed callers (hw_test_app, older
     *  paths) get a sensible default until they're updated to the dual
     *  API. */
    esp_websocket_client_handle_t websocket() const;

    void attachProtocol(WsProtocol *protocol, RobotHal *robot);

    /** Single-shot flags fired by the websocketEventHandler when each
     *  side completes its first ON_CONNECTED. The heartbeat task reads
     *  these to send the initial hello over each WS independently. */
    bool consumeLanConnectedEvent();
    bool consumeCloudConnectedEvent();

    /** Send the same text to whichever sides are connected. Used for
     *  telemetry and heartbeats so both controllers see the same world.
     *  Silently no-ops on any disconnected side — no error to handle. */
    void broadcastText(const char *text, size_t len) const;

private:
    static void wifiEventHandler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data);
    static void lanWsEventHandler  (void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data);
    static void cloudWsEventHandler(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data);
    static void onWsEvent(NetworkHal *self, WsSource source, int32_t event_id, void *event_data);

    esp_websocket_client_handle_t lanWsClient_   = nullptr;
    esp_websocket_client_handle_t cloudWsClient_ = nullptr;
    WsProtocol *protocol_ = nullptr;
    RobotHal   *robot_    = nullptr;
    volatile bool lanJustConnected_   = false;
    volatile bool cloudJustConnected_ = false;
};
