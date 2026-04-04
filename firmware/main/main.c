#include <stdio.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"

#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "nvs_flash.h"
#include "esp_websocket_client.h"
#include "cJSON.h"

#define WIFI_CONNECTED_BIT BIT0

static const char *TAG = "sketchbot-fw";
static EventGroupHandle_t wifi_event_group;
static esp_websocket_client_handle_t ws_client = NULL;

#ifndef SKETCHBOT_WIFI_SSID
#define SKETCHBOT_WIFI_SSID "YOUR_WIFI_SSID"
#endif

#ifndef SKETCHBOT_WIFI_PASSWORD
#define SKETCHBOT_WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#endif

#ifndef SKETCHBOT_WS_URL
#define SKETCHBOT_WS_URL "ws://192.168.2.212:8000/ws/robot"
#endif

#ifndef SKETCHBOT_ROBOT_ID
#define SKETCHBOT_ROBOT_ID "sketchbot-esp32c5"
#endif

static void send_json(cJSON *root)
{
    char *text = cJSON_PrintUnformatted(root);
    if (text && ws_client) {
        esp_websocket_client_send_text(ws_client, text, strlen(text), portMAX_DELAY);
    }
    if (text) {
        cJSON_free(text);
    }
    cJSON_Delete(root);
}

static void send_hello(void)
{
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "type", "hello");
    cJSON_AddStringToObject(root, "robot_id", SKETCHBOT_ROBOT_ID);
    cJSON_AddStringToObject(root, "firmware_version", "0.1.0");
    cJSON_AddStringToObject(root, "board", "esp32c5");
    cJSON *caps = cJSON_AddArrayToObject(root, "capabilities");
    cJSON_AddItemToArray(caps, cJSON_CreateString("heartbeat"));
    cJSON_AddItemToArray(caps, cJSON_CreateString("telemetry"));
    cJSON_AddItemToArray(caps, cJSON_CreateString("command_result"));
    send_json(root);
}

static void send_heartbeat(void)
{
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "type", "heartbeat");
    cJSON_AddStringToObject(root, "robot_id", SKETCHBOT_ROBOT_ID);
    cJSON_AddNumberToObject(root, "uptime_ms", (double)(esp_log_timestamp()));
    cJSON_AddNumberToObject(root, "free_heap", (double)esp_get_free_heap_size());
    send_json(root);
}

static void send_command_result(const char *command_id, bool ok, const char *message)
{
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "type", "command_result");
    cJSON_AddStringToObject(root, "command_id", command_id ? command_id : "unknown");
    cJSON_AddBoolToObject(root, "ok", ok);
    cJSON_AddStringToObject(root, "message", message ? message : (ok ? "ok" : "error"));
    send_json(root);
}

static void handle_ws_message(const char *payload, int len)
{
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

    if (strcmp(type->valuestring, "hello_ack") == 0) {
        ESP_LOGI(TAG, "Received hello_ack");
        cJSON_Delete(root);
        return;
    }

    if (strcmp(type->valuestring, "command") == 0) {
        cJSON *command_id = cJSON_GetObjectItem(root, "command_id");
        cJSON *name = cJSON_GetObjectItem(root, "name");
        if (cJSON_IsString(name)) {
            ESP_LOGI(TAG, "Received command: %s", name->valuestring);
            if (strcmp(name->valuestring, "ping") == 0 || strcmp(name->valuestring, "status") == 0) {
                send_command_result(cJSON_IsString(command_id) ? command_id->valuestring : "unknown", true, "pong");
            } else if (strcmp(name->valuestring, "pen_up") == 0) {
                send_command_result(cJSON_IsString(command_id) ? command_id->valuestring : "unknown", true, "pen up complete");
            } else if (strcmp(name->valuestring, "pen_down") == 0) {
                send_command_result(cJSON_IsString(command_id) ? command_id->valuestring : "unknown", true, "pen down complete");
            } else if (strcmp(name->valuestring, "home") == 0) {
                send_command_result(cJSON_IsString(command_id) ? command_id->valuestring : "unknown", true, "home complete");
            } else if (strcmp(name->valuestring, "stop") == 0) {
                send_command_result(cJSON_IsString(command_id) ? command_id->valuestring : "unknown", true, "stop complete");
            } else {
                send_command_result(cJSON_IsString(command_id) ? command_id->valuestring : "unknown", false, "unsupported command");
            }
        }
    }

    cJSON_Delete(root);
}

static void websocket_event_handler(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data)
{
    esp_websocket_event_data_t *data = (esp_websocket_event_data_t *)event_data;
    switch (event_id) {
        case WEBSOCKET_EVENT_CONNECTED:
            ESP_LOGI(TAG, "WebSocket connected");
            send_hello();
            break;
        case WEBSOCKET_EVENT_DISCONNECTED:
            ESP_LOGW(TAG, "WebSocket disconnected");
            break;
        case WEBSOCKET_EVENT_DATA:
            if (data->op_code == 0x1 && data->data_ptr) {
                handle_ws_message(data->data_ptr, data->data_len);
            }
            break;
        default:
            break;
    }
}

static void heartbeat_task(void *arg)
{
    while (1) {
        if (ws_client && esp_websocket_client_is_connected(ws_client)) {
            send_heartbeat();
        }
        vTaskDelay(pdMS_TO_TICKS(3000));
    }
}

static void wifi_event_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        ESP_LOGW(TAG, "Wi-Fi disconnected, retrying");
        esp_wifi_connect();
        xEventGroupClearBits(wifi_event_group, WIFI_CONNECTED_BIT);
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        xEventGroupSetBits(wifi_event_group, WIFI_CONNECTED_BIT);
    }
}

static void wifi_init_sta(void)
{
    wifi_event_group = xEventGroupCreate();
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL));

    wifi_config_t wifi_config = {
        .sta = {
            .threshold.authmode = WIFI_AUTH_WPA2_PSK,
        },
    };
    strncpy((char *)wifi_config.sta.ssid, SKETCHBOT_WIFI_SSID, sizeof(wifi_config.sta.ssid));
    strncpy((char *)wifi_config.sta.password, SKETCHBOT_WIFI_PASSWORD, sizeof(wifi_config.sta.password));

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());

    xEventGroupWaitBits(wifi_event_group, WIFI_CONNECTED_BIT, pdFALSE, pdTRUE, portMAX_DELAY);
    ESP_LOGI(TAG, "Wi-Fi connected");
}

static void websocket_start(void)
{
    esp_websocket_client_config_t websocket_cfg = {
        .uri = SKETCHBOT_WS_URL,
    };
    ws_client = esp_websocket_client_init(&websocket_cfg);
    esp_websocket_register_events(ws_client, WEBSOCKET_EVENT_ANY, websocket_event_handler, NULL);
    esp_websocket_client_start(ws_client);
}

void app_main(void)
{
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    wifi_init_sta();
    websocket_start();
    xTaskCreate(heartbeat_task, "heartbeat_task", 4096, NULL, 5, NULL);
}
