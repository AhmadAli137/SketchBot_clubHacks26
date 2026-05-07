#include "device_id.h"

#include <cstdio>
#include <cstring>

#include "esp_mac.h"

// Cached on first call. The efuse MAC is immutable per chip, so this
// only runs the read + format once per boot.
static char s_serial[20] = {0};

const char *deviceSerial() {
    if (s_serial[0] != '\0') return s_serial;

    uint8_t mac[8] = {0};
    // ESP_MAC_EFUSE_FACTORY is the immutable per-chip identifier — unlike
    // the Wi-Fi STA MAC, it's not overridable at runtime, so it's the
    // right anchor for a stable serial used in account binding.
    if (esp_read_mac(mac, ESP_MAC_EFUSE_FACTORY) != ESP_OK) {
        // Fallback: zeros. The cloud will reject collisions on bind, so
        // we'll see this immediately if it ever happens in practice.
        std::strcpy(s_serial, "SKETCH-0000-0000");
        return s_serial;
    }

    // Use the last 4 bytes — first two are typically the OUI and identical
    // across every Espressif chip, which makes them useless for identity.
    std::snprintf(
        s_serial, sizeof(s_serial),
        "SKETCH-%02X%02X-%02X%02X",
        mac[2], mac[3], mac[4], mac[5]
    );
    return s_serial;
}
