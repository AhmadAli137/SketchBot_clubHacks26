#include "nvs_flash.h"

#ifdef SKETCHBOT_TEST_MODE
#  include "hw_test_app.h"
#else
#  include "sketchbot_controller.h"
#endif

// Two app_main paths share one binary so the IDE workflow stays single-
// project: define SKETCHBOT_TEST_MODE in app_config.h (or pass
// `-DSKETCHBOT_TEST_MODE=1` to idf.py) to flash the bring-up self-test
// instead of the runtime controller. Remove the define and re-flash to
// get the real firmware back. NVS init is shared because the self-test
// uses Wi-Fi which lives in NVS too.
extern "C" void app_main(void) {
#ifdef SKETCHBOT_TEST_MODE
    runHardwareSelfTest();
#else
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    static SketchbotController controller;
    controller.init();
    controller.start();
#endif
}
