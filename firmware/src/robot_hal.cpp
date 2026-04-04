#include "robot_hal.h"

#include "esp_check.h"
#include "esp_log.h"
#include "led_strip.h"

#include "app_config.h"

namespace {
static const char *TAG = "robot_hal";

static_assert(STATUS_LED_R_ORDER_INDEX < 3, "STATUS_LED_R_ORDER_INDEX must be 0..2");
static_assert(STATUS_LED_G_ORDER_INDEX < 3, "STATUS_LED_G_ORDER_INDEX must be 0..2");
static_assert(STATUS_LED_B_ORDER_INDEX < 3, "STATUS_LED_B_ORDER_INDEX must be 0..2");
}  // namespace

void RobotHal::init() {
    if (initialized_) {
        return;
    }

    led_strip_config_t strip_config = {};
    strip_config.strip_gpio_num = static_cast<gpio_num_t>(STATUS_LED_DATA_GPIO);
    strip_config.max_leds = 1;

    led_strip_rmt_config_t rmt_config = {};
    rmt_config.resolution_hz = 10 * 1000 * 1000;
    rmt_config.flags.with_dma = false;

    esp_err_t err = led_strip_new_rmt_device(&strip_config, &rmt_config, &statusLed_);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Status LED init failed: %s", esp_err_to_name(err));
        return;
    }

    initialized_ = true;
    setStatusLed(false, false, false);
}

bool RobotHal::home() { return true; }
bool RobotHal::penUp() { return true; }
bool RobotHal::penDown() { return true; }
bool RobotHal::stop() { return true; }

RobotTelemetry RobotHal::telemetry() const {
    return {};
}

void RobotHal::setStatusConnected(bool connected) {
    connected_ = connected;
    if (connected_) {
        setStatusLed(false, true, false);
    } else {
        setStatusLed(false, false, false);
    }
}

void RobotHal::setStatusLed(bool red, bool green, bool blue) const {
    if (!initialized_ || statusLed_ == nullptr) {
        return;
    }

    const uint8_t input[3] = {
        static_cast<uint8_t>(red ? 255 : 0),
        static_cast<uint8_t>(green ? 255 : 0),
        static_cast<uint8_t>(blue ? 255 : 0),
    };
    const uint8_t phys_r = input[STATUS_LED_R_ORDER_INDEX];
    const uint8_t phys_g = input[STATUS_LED_G_ORDER_INDEX];
    const uint8_t phys_b = input[STATUS_LED_B_ORDER_INDEX];

    esp_err_t err = led_strip_set_pixel(statusLed_, 0, phys_r, phys_g, phys_b);
    if (err == ESP_OK) {
        err = led_strip_refresh(statusLed_);
    }
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "Status LED update failed: %s", esp_err_to_name(err));
    }
}
