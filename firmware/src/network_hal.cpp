#include "network_hal.h"

#include <cstring>

#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_wifi.h"

#include "app_config.h"
#include "device_config.h"
#include "robot_hal.h"
#include "secrets.h"
#include "ws_protocol.h"

static const char *TAG = "network_hal";
static EventGroupHandle_t s_wifi_event_group;
static constexpr int WIFI_CONNECTED_BIT = BIT0;

esp_err_t NetworkHal::init() {
    s_wifi_event_group = xEventGroupCreate();
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &NetworkHal::wifiEventHandler, nullptr));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &NetworkHal::wifiEventHandler, nullptr));
    return ESP_OK;
}

esp_err_t NetworkHal::connectWifi() {
    return connectWifiWithTimeout(UINT32_MAX);
}

esp_err_t NetworkHal::connectWifiWithTimeout(uint32_t timeout_ms) {
    wifi_config_t wifi_config = {};
    std::strncpy(reinterpret_cast<char *>(wifi_config.sta.ssid), WIFI_SSID, sizeof(wifi_config.sta.ssid));
    std::strncpy(reinterpret_cast<char *>(wifi_config.sta.password), WIFI_PASS, sizeof(wifi_config.sta.password));
    wifi_config.sta.threshold.authmode = WIFI_AUTH_WPA2_PSK;

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());
    const TickType_t ticks = (timeout_ms == UINT32_MAX) ? portMAX_DELAY : pdMS_TO_TICKS(timeout_ms);
    EventBits_t bits = xEventGroupWaitBits(s_wifi_event_group, WIFI_CONNECTED_BIT, pdFALSE, pdTRUE, ticks);
    if (!(bits & WIFI_CONNECTED_BIT)) return ESP_ERR_TIMEOUT;
    return ESP_OK;
}

esp_err_t NetworkHal::connectWebsocket() {
    // ── LAN client ─────────────────────────────────────────────────────────
    // Always started, regardless of provisioning. When the desktop app is
    // running on the same Wi-Fi this is the low-latency control path; when
    // the desktop is off the IDF's auto-reconnect loop just keeps trying
    // quietly. There's no downside to having it live — it's a single
    // outbound TCP connection that idles cheaply.
    {
        esp_websocket_client_config_t cfg = {};
        cfg.uri = WS_URL;
        lanWsClient_ = esp_websocket_client_init(&cfg);
        esp_websocket_register_events(lanWsClient_, WEBSOCKET_EVENT_ANY, &NetworkHal::lanWsEventHandler, this);
        esp_websocket_client_start(lanWsClient_);
        ESP_LOGI(TAG, "LAN ws starting (uri=%s)", WS_URL);
    }

    // ── Cloud client ───────────────────────────────────────────────────────
    // Only started post-provisioning. Out of the box, the bot doesn't have
    // a token, so we skip it entirely — adding a parallel client that's
    // guaranteed to fail handshake every retry would just spam the logs.
    DeviceCloudConfig nvsCfg;
    esp_err_t cfgErr = deviceConfigLoad(nvsCfg);
    if (cfgErr != ESP_OK) {
        ESP_LOGW(TAG, "deviceConfigLoad failed (%s) — cloud ws skipped", esp_err_to_name(cfgErr));
        return ESP_OK;
    }
    if (nvsCfg.provisioned) {
        esp_websocket_client_config_t cfg = {};
        cfg.uri = nvsCfg.ws_url;
        cloudWsClient_ = esp_websocket_client_init(&cfg);
        esp_websocket_register_events(cloudWsClient_, WEBSOCKET_EVENT_ANY, &NetworkHal::cloudWsEventHandler, this);
        esp_websocket_client_start(cloudWsClient_);
        ESP_LOGI(TAG, "Cloud ws starting (uri=%s)", nvsCfg.ws_url);
    } else {
        ESP_LOGI(TAG, "Cloud ws skipped — device not provisioned");
    }
    return ESP_OK;
}

bool NetworkHal::lanConnected() const {
    return lanWsClient_ && esp_websocket_client_is_connected(lanWsClient_);
}
bool NetworkHal::cloudConnected() const {
    return cloudWsClient_ && esp_websocket_client_is_connected(cloudWsClient_);
}
bool NetworkHal::websocketConnected() const {
    return lanConnected() || cloudConnected();
}

esp_websocket_client_handle_t NetworkHal::websocket() const {
    // Back-compat for legacy single-WS callers: prefer LAN, fall back to
    // cloud. New code should target lanWs()/cloudWs() explicitly.
    if (lanConnected())   return lanWsClient_;
    if (cloudConnected()) return cloudWsClient_;
    return lanWsClient_ ? lanWsClient_ : cloudWsClient_;
}

void NetworkHal::attachProtocol(WsProtocol *protocol, RobotHal *robot) {
    protocol_ = protocol;
    robot_ = robot;
}

bool NetworkHal::consumeLanConnectedEvent() {
    if (lanJustConnected_) { lanJustConnected_ = false; return true; }
    return false;
}
bool NetworkHal::consumeCloudConnectedEvent() {
    if (cloudJustConnected_) { cloudJustConnected_ = false; return true; }
    return false;
}

void NetworkHal::broadcastText(const char *text, size_t len) const {
    if (!text || len == 0) return;
    if (lanConnected()) {
        esp_websocket_client_send_text(lanWsClient_, text, len, portMAX_DELAY);
    }
    if (cloudConnected()) {
        esp_websocket_client_send_text(cloudWsClient_, text, len, portMAX_DELAY);
    }
}

// ─── Wi-Fi event handler ────────────────────────────────────────────────────

void NetworkHal::wifiEventHandler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data) {
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        ESP_LOGW(TAG, "Wi-Fi disconnected, retrying");
        esp_wifi_connect();
        xEventGroupClearBits(s_wifi_event_group, WIFI_CONNECTED_BIT);
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        xEventGroupSetBits(s_wifi_event_group, WIFI_CONNECTED_BIT);
        ESP_LOGI(TAG, "Wi-Fi connected");
    }
    (void)arg; (void)event_data;
}

// ─── WebSocket event handlers — one per source so we can route ─────────────

void NetworkHal::lanWsEventHandler(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data) {
    auto *self = static_cast<NetworkHal *>(handler_args);
    onWsEvent(self, WsSource::Lan, event_id, event_data);
    (void)base;
}
void NetworkHal::cloudWsEventHandler(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data) {
    auto *self = static_cast<NetworkHal *>(handler_args);
    onWsEvent(self, WsSource::Cloud, event_id, event_data);
    (void)base;
}

void NetworkHal::onWsEvent(NetworkHal *self, WsSource source, int32_t event_id, void *event_data) {
    if (!self) return;
    auto *data = static_cast<esp_websocket_event_data_t *>(event_data);
    const char *tagSrc = (source == WsSource::Lan) ? "LAN" : "Cloud";

    if (event_id == WEBSOCKET_EVENT_CONNECTED) {
        ESP_LOGI(TAG, "%s ws connected", tagSrc);
        if (source == WsSource::Lan) self->lanJustConnected_ = true;
        else                          self->cloudJustConnected_ = true;
        if (self->robot_) self->robot_->setStatusConnected(true);
    } else if (event_id == WEBSOCKET_EVENT_DISCONNECTED) {
        ESP_LOGW(TAG, "%s ws disconnected", tagSrc);
        // Only drop the status LED to "disconnected" when BOTH sides are
        // down — otherwise the kid sees a red dot every time one of two
        // independent connections blips.
        if (self->robot_ && !self->websocketConnected()) {
            self->robot_->setStatusConnected(false);
        }
    } else if (event_id == WEBSOCKET_EVENT_DATA) {
        // Only text frames (op_code 0x01) carry our JSON protocol. Skip
        // empty keepalives, binary pings/pongs, and continuation frames
        // so we don't spam the log or feed garbage to the JSON parser.
        if (!data || data->op_code != 0x01 || data->data_len <= 0 || !data->data_ptr) {
            return;
        }
        ESP_LOGI(TAG, "%s ws data len=%d payload=%.*s", tagSrc, data->data_len, data->data_len, data->data_ptr);
        if (self->protocol_ && self->robot_) {
            // Hand the source-specific WS handle to the protocol so
            // command_result goes back where the command came from.
            esp_websocket_client_handle_t srcWs = (source == WsSource::Lan)
                ? self->lanWsClient_
                : self->cloudWsClient_;
            self->protocol_->handleInbound(data->data_ptr, data->data_len, srcWs, *self->robot_, source);
        }
    }
}
