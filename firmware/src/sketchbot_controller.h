#pragma once

#include "network_hal.h"
#include "robot_hal.h"
#include "ws_protocol.h"

class SketchbotController {
public:
    void init();
    void start();

private:
    static void heartbeatTask(void *arg);
    static void telemetryTask(void *arg);

    NetworkHal network_;
    RobotHal robot_;
    WsProtocol protocol_;
};
