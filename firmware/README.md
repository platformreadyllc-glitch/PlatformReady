# PlatformReady Firmware

ESP32 firmware for hardware referee remotes. PlatformIO project (`platformio.ini`), flat `src/` layout.

## OTA updates

Devices are expected to be assembled and deployed without reliable physical/USB access, so firmware updates are delivered over the air (OTA) instead of by reflashing over serial.

### How it works

1. Once connected and registered with the backend, and then every `OTA_CHECK_INTERVAL_MS` (6 hours, see [ota.h](src/ota.h)), the device calls `GET /firmware/latest?type=side|chief` on its configured backend and compares the returned version against its own `FIRMWARE_VERSION` ([version.h](src/version.h)).
2. If a newer version exists, the device only **applies** it (downloads + flashes + reboots) once it's been idle — no button pressed — for `OTA_IDLE_THRESHOLD_MS` (2 minutes). The check itself always happens on schedule; only the apply step is deferred, so an update never interrupts an in-progress competition action.
3. The download/flash is done with the ESP32 Arduino core's `HTTPUpdate` library, writing to the inactive OTA partition.
4. On success, the device reboots into the new firmware. On the next boot, it's treated as "pending validation" until the device successfully registers with the backend again — at that point the pending state is cleared and the update is considered good.
5. If the new firmware crashes or resets before ever reaching that "registered" milestone, the boot-attempt counter (also in NVS) increments on each reset. After 3 failed boots, the device automatically reverts to the previous firmware and reboots into it — no manual intervention needed.

### On-screen status

The OLED shows the current OTA phase: "Checking for updates", "Update in progress" (during flashing — do not power off), "Update failed" (with the error, then reverts to the normal screen after ~2s), and "Update success" (before rebooting). No progress percentage is shown — the bundled `HTTPUpdate` library doesn't expose a reliable progress callback across core versions; could be added later if needed.

### Two-layer fallback safety

- **Layer A — bad download**: if the check or download fails for any reason (network error, bad JSON, flash write failure), the device logs it and keeps running its current firmware untouched. Nothing is written to the boot partition unless the download completes successfully.
- **Layer B — bad flash**: if a new image flashes successfully but is itself broken (crashes, hangs, resets), a hand-rolled NVS boot-attempt counter — not esp-idf's Kconfig-gated automatic rollback-on-crash-loop feature, which isn't guaranteed enabled in the precompiled arduino-esp32 core PlatformIO uses — reverts the device to the last-known-good firmware within a few reboots via `esp_ota_mark_app_invalid_rollback_and_reboot()`. This is a direct partition-table operation and works regardless of sdkconfig settings.

**Test the very first OTA update on a bench unit before relying on rollback for it** — the initial factory image is typically flashed via serial, not OTA, so it's worth confirming rollback behaves as expected in that specific case before deploying to the field.

### Known limitation: WiFi-only OTA transport

The arduino-esp32 core version bundled by `platform = espressif32@6.5.0` only accepts `WiFiClient` in `HTTPUpdate`/`HTTPClient` — not the generic `Client` interface the rest of this codebase uses for dual Ethernet/WiFi support (see [network.h](src/network.h)). This has no practical effect today since Ethernet support is compiled out (`-DSKIP_ETHERNET` in `platformio.ini`) and not physically wired. Before enabling Ethernet, revisit this: either bump the `espressif32` platform to a core version with generic-`Client` `HTTPUpdate` support, or hand-roll the download/flash loop directly against `Update.h`, streaming from `ArduinoHttpClient`'s response body (the same NVS bookkeeping/rollback logic wraps around either approach).

### Partition table

`platformio.ini` sets `board_build.partitions = min_spiffs.csv`, giving two ~1.9MB OTA app slots (`ota_0`/`ota_1`) plus `otadata`. **This assumes standard 4MB flash.** If your boards have a different flash size, this partition table won't fit as-is and needs to be swapped for one sized accordingly — check your board's actual flash size (e.g. via `esptool.py flash_id` or the board's datasheet) before flashing.

### Cutting a release

1. Bump `FIRMWARE_VERSION` in [version.h](src/version.h).
2. Build: `pio run` (from `firmware/`). The binary is at `.pio/build/esp32dev/firmware.bin`.
3. Copy it into `backend/firmware-releases/` as `<type>-<version>.bin` (e.g. `side-1.0.1.bin`).
4. Update `backend/firmware-releases/manifest.json` with the new version + filename for that `type`.
5. Devices pick it up on their next check (or immediately after their next reboot/registration).

There's no CI/CD automation for this process — it's manual by design for now. Not in scope currently, but worth automating later if release frequency picks up.
