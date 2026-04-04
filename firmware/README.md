# SketchBot Firmware

## Hotspot / local network operation

When running on a phone hotspot or any changing local network, update:

- `include/secrets.h`
  - `WIFI_SSID`
  - `WIFI_PASS`
  - `WS_URL`

Example:

```c
#define WIFI_SSID "AhmadPhoneHotspot"
#define WIFI_PASS "your-hotspot-password"
#define WS_URL "ws://192.168.50.23:8000/ws/robot"
```

The backend host/IP may change when you reconnect to a hotspot. If it changes, update `WS_URL` and rebuild/flash firmware.

## Build

```bash
idf.py set-target esp32c5
idf.py build
```
