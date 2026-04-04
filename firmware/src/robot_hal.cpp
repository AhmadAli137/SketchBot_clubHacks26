#include "robot_hal.h"

void RobotHal::init() {}

bool RobotHal::home() { return true; }
bool RobotHal::penUp() { return true; }
bool RobotHal::penDown() { return true; }
bool RobotHal::stop() { return true; }

RobotTelemetry RobotHal::telemetry() const {
    return {};
}
