#include "sketchbot_controller.h"

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "app_config.h"

void SketchbotController::init() {
    network_.init();
    network_.connectWifi();
    robot_.init();
    network_.attachProtocol(&protocol_, &robot_);
    network_.connectWebsocket();  // starts both LAN + cloud clients
}

void SketchbotController::start() {
    xTaskCreate(&SketchbotController::heartbeatTask, "heartbeatTask", 4096, this, 5, nullptr);
    xTaskCreate(&SketchbotController::telemetryTask, "telemetryTask", 4096, this, 5, nullptr);
}

void SketchbotController::heartbeatTask(void *arg) {
    auto *self = static_cast<SketchbotController *>(arg);
    while (true) {
        // Send hello on each side once, as soon as that side completes
        // its first ON_CONNECTED. Each WS has its own connected-event
        // latch so cloud and LAN announce themselves independently.
        if (self->network_.consumeLanConnectedEvent()) {
            self->protocol_.sendHello(self->network_.lanWs());
        }
        if (self->network_.consumeCloudConnectedEvent()) {
            self->protocol_.sendHello(self->network_.cloudWs());
        }
        // Heartbeat broadcast — every live side gets a copy so both
        // controllers know the bot is alive without polling.
        if (self->network_.websocketConnected()) {
            self->protocol_.broadcastHeartbeat(self->network_);
        }
        vTaskDelay(pdMS_TO_TICKS(HEARTBEAT_INTERVAL_MS));
    }
}

void SketchbotController::telemetryTask(void *arg) {
    auto *self = static_cast<SketchbotController *>(arg);
    while (true) {
        if (self->network_.websocketConnected()) {
            // Take a pose snapshot, then run the HC-SR04 read (blocks up
            // to ~30 ms on timeout). Done here rather than inside
            // RobotHal::telemetry() so the const, non-blocking accessor
            // stays cheap and the only caller paying the latency is the
            // 1 Hz telemetry path.
            RobotTelemetry t = self->robot_.telemetry();
            t.distance_cm = self->robot_.readDistanceCm();
            // Same telemetry to both sides — desktop and mobile see
            // identical world. (No bandwidth concerns at 1 Hz × ~120 B.)
            self->protocol_.broadcastTelemetry(self->network_, t);
        }
        vTaskDelay(pdMS_TO_TICKS(TELEMETRY_INTERVAL_MS));
    }
}
