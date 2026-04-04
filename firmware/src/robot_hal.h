#pragma once

#include <string>

#include "led_strip.h"

struct RobotTelemetry {
    float x_mm = 0.0f;
    float y_mm = 0.0f;
    float heading_deg = 0.0f;
    bool pen_down = false;
    bool moving = false;
    bool homed = false;
    int queue_depth = 0;
};

class RobotHal {
public:
    void init();
    bool home();
    bool penUp();
    bool penDown();
    bool stop();
    RobotTelemetry telemetry() const;
    void setStatusConnected(bool connected);

private:
    void setStatusLed(bool red, bool green, bool blue) const;
    bool connected_ = false;
    bool initialized_ = false;
    led_strip_handle_t statusLed_ = nullptr;
};
