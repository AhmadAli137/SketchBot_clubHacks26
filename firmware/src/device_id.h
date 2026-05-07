#pragma once

// Per-unit serial number derived from the ESP32-C5's efuse MAC.
// Format: "SKETCH-XXXX-XXXX" (uppercase hex of the last 4 MAC bytes).
//
// Used in the WebSocket hello, account-binding flow, and printed at boot
// so an operator can read the serial off the serial monitor when claiming
// the device against an account in the admin web UI.
//
// The result is cached after the first call — the efuse never changes
// across reboots, so this is a stable per-board identity that needs no
// flashing customisation.

const char *deviceSerial();
