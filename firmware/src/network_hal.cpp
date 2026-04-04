#include "network_hal.h"

#include <cstring>

#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_wifi.h"

#include "app_config.h"
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
    wifi_config_t wifi_config = {};
    std::strncpy(reinterpret_cast<char *>(wifi_config.sta.ssid), WIFI_SSID, sizeof(wifi_config.sta.ssid));
    std::strncpy(reinterpret_cast<char *>(wifi_config.sta.password), WIFI_PASS, sizeof(wifi_config.sta.password));
    wifi_config.sta.threshold.authmode = WIFI_AUTH_WPA2_PSK;

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());
    xEventGroupWaitBits(s_wifi_event_group, WIFI_CONNECTED_BIT, pdFALSE, pdTRUE, portMAX_DELAY);
    return ESP_OK;
}

esp_err_t NetworkHal::connectWebsocket() {
    esp_websocket_client_config_t cfg = {};
    cfg.uri = WS_URL;
    wsClient_ = esp_websocket_client_init(&cfg);
    esp_websocket_register_events(wsClient_, WEBSOCKET_EVENT_ANY, &NetworkHal::websocketEventHandler, this);
    esp_websocket_client_start(wsClient_);
    return ESP_OK;
}

bool NetworkHal::websocketConnected() const {
    return wsClient_ && esp_websocket_client_is_connected(wsClient_);
}

esp_websocket_client_handle_t NetworkHal::websocket() const {
    return wsClient_;
}

void NetworkHal::attachProtocol(WsProtocol *protocol, RobotHal *robot) {
    protocol_ = protocol;
    robot_ = robot;
}

bool NetworkHal::consumeConnectedEvent() {
    if (websocketJustConnected_) {
        websocketJustConnected_ = false;
        return true;
    }
    return false;
}

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
}

void NetworkHal::websocketEventHandler(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data) {
    auto *self = static_cast<NetworkHal *>(handler_args);
    auto *data = static_cast<esp_websocket_event_data_t *>(event_data);
    if (event_id == WEBSOCKET_EVENT_CONNECTED) {
        ESP_LOGI(TAG, "WebSocket connected");
        if (self) {
            self->websocketJustConnected_ = true;
        }
    } else if (event_id == WEBSOCKET_EVENT_DISCONNECTED) {
        ESP_LOGW(TAG, "WebSocket disconnected");
    } else if (event_id == WEBSOCKET_EVENT_DATA) {
        ESP_LOGI(TAG, "WebSocket data len=%d", data->data_len);
        if (self && self->protocol_ && self->robot_ && data && data->data_ptr && data->data_len > 0) {
            self->protocol_->handleInbound(data->data_ptr, data->data_len, self->wsClient_, *self->robot_);
        }
    }
    (void)base;
}
