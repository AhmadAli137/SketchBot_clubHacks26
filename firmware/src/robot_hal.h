#pragma once

#include <string>

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
};
