#include "sketchbot_controller.h"

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "app_config.h"

void SketchbotController::init() {
    network_.init();
    network_.connectWifi();
    robot_.init();
    network_.attachProtocol(&protocol_, &robot_);
    network_.connectWebsocket();
}

void SketchbotController::start() {
    xTaskCreate(&SketchbotController::heartbeatTask, "heartbeatTask", 4096, this, 5, nullptr);
    xTaskCreate(&SketchbotController::telemetryTask, "telemetryTask", 4096, this, 5, nullptr);
}

void SketchbotController::heartbeatTask(void *arg) {
    auto *self = static_cast<SketchbotController *>(arg);
    while (true) {
        if (self->network_.websocketConnected()) {
            if (self->network_.consumeConnectedEvent()) {
                self->protocol_.sendHello(self->network_.websocket());
            }
            self->protocol_.sendHeartbeat(self->network_.websocket());
        }
        vTaskDelay(pdMS_TO_TICKS(HEARTBEAT_INTERVAL_MS));
    }
}

void SketchbotController::telemetryTask(void *arg) {
    auto *self = static_cast<SketchbotController *>(arg);
    while (true) {
        if (self->network_.websocketConnected()) {
            self->protocol_.sendTelemetry(self->network_.websocket(), self->robot_.telemetry());
        }
        vTaskDelay(pdMS_TO_TICKS(TELEMETRY_INTERVAL_MS));
    }
}
