# PlatformReady Firmware

ESP32 firmware for hardware referee remotes. PlatformIO project (`platformio.ini`), flat `src/` layout.

## OTA updates

Devices are expected to be assembled and deployed without reliable physical/USB access, so firmware updates are delivered over the air (OTA) instead of by reflashing over serial.

### How it works

1. Once connected and registered with the backend, and then every `OTA_CHECK_INTERVAL_MS` (6 hours, see [ota.h](src/ota.h)), the device calls `GET /firmware/latest?type=side|chief` on its configured backend and compares the returned version against its own `FIRMWARE_VERSION` ([version.h](src/version.h)).
2. If a newer version exists, the device only **applies** it (downloads + flashes + reboots) once it's been idle — no button pressed — for `OTA_IDLE_THRESHOLD_MS` (2 minutes). The check itself always happens on schedule; only the apply step is deferred, so an update never interrupts an in-progress competition action.
3. The download/flash is done by streaming the response body from `ArduinoHttpClient` (the same library `api.cpp` uses, via `networkNewClient()`) straight into `Update.write()`, writing to the inactive OTA partition. This works over both the WiFi and Ethernet paths, same as the rest of the app.
4. On success, the device reboots into the new firmware. On the next boot, it's treated as "pending validation" until the device successfully registers with the backend again — at that point the pending state is cleared and the update is considered good.
5. If the new firmware crashes or resets before ever reaching that "registered" milestone, the boot-attempt counter (also in NVS) increments on each reset. After 3 failed boots, the device automatically reverts to the previous firmware and reboots into it — no manual intervention needed.

### On-screen status

The OLED shows the current OTA phase: "Checking for updates", "Update in progress" (during flashing — do not power off), "Update failed" (with the error, then reverts to the normal screen after ~2s), and "Update success" (before rebooting). No progress percentage is shown — the bundled `HTTPUpdate` library doesn't expose a reliable progress callback across core versions; could be added later if needed.

### Two-layer fallback safety

- **Layer A — bad download**: if the check or download fails for any reason (network error, bad JSON, flash write failure), the device logs it and keeps running its current firmware untouched. Nothing is written to the boot partition unless the download completes successfully.
- **Layer B — bad flash**: if a new image flashes successfully but is itself broken (crashes, hangs, resets), a hand-rolled NVS boot-attempt counter — not esp-idf's Kconfig-gated automatic rollback-on-crash-loop feature, which isn't guaranteed enabled in the precompiled arduino-esp32 core PlatformIO uses — reverts the device to the last-known-good firmware within a few reboots via `esp_ota_mark_app_invalid_rollback_and_reboot()`. This is a direct partition-table operation and works regardless of sdkconfig settings.

**Test the very first OTA update on a bench unit before relying on rollback for it** — the initial factory image is typically flashed via serial, not OTA, so it's worth confirming rollback behaves as expected in that specific case before deploying to the field.

### Why not the ESP32 core's `HTTPUpdate` library?

`HTTPUpdate.h` (from `HTTPUpdate` in the ESP32 Arduino core) would have been the obvious choice, but its header expects `HTTPClient.h` to already be included and doesn't include it itself. On a case-insensitive filesystem (Windows), that collides with `ArduinoHttpClient`'s own identically-named-but-differently-cased `HttpClient.h` — the wrong file silently wins the include and `HTTPClient` never gets declared, breaking the build. Streaming into `Update.h` directly (see [ota.cpp](src/ota.cpp)) sidesteps the collision entirely, and as a bonus works over both WiFi and Ethernet rather than being tied to `WiFiClient` specifically.

### Partition table

`platformio.ini` sets `board_build.partitions = min_spiffs.csv`, giving two ~1.9MB OTA app slots (`ota_0`/`ota_1`) plus `otadata`. **This assumes standard 4MB flash.** If your boards have a different flash size, this partition table won't fit as-is and needs to be swapped for one sized accordingly — check your board's actual flash size (e.g. via `esptool.py flash_id` or the board's datasheet) before flashing.

### Cutting a release

1. Bump `FIRMWARE_VERSION` in [version.h](src/version.h).
2. Build: `pio run` (from `firmware/`). The binary is at `.pio/build/esp32dev/firmware.bin`.
3. Copy it into `backend/firmware-releases/` as `<type>-<version>.bin` (e.g. `side-1.0.1.bin`).
4. Update `backend/firmware-releases/manifest.json` with the new version + filename for that `type`.
5. Devices pick it up on their next check (or immediately after their next reboot/registration).

There's no CI/CD automation for this process — it's manual by design for now. Not in scope currently, but worth automating later if release frequency picks up.

## Live connection (WebSocket)

Once registered, the device opens a persistent WebSocket connection to the backend (`/esp32-ws?remoteId=...`, see [ws_client.cpp](src/ws_client.cpp) and the backend's `esp-remotes.gateway.ts`), used for three things: the backend's live "connected" status for this remote (a 2s server-side heartbeat, much faster than any HTTP-polling TTL could reasonably be), immediate assignment updates when the remote is reassigned via the management page (no reboot needed), and a live feed of the other active referees' votes on the same platform (for the on-screen mini-scoreboard).

**WiFi-only**: unlike the OTA and REST API paths (both routed through `networkNewClient()`, working over either WiFi or Ethernet), the `WebSocketsClient` library manages its own internal `WiFiClient` and doesn't accept an injected generic `Client*` — so this connection specifically only works over WiFi. Not an issue today since Ethernet is `-DSKIP_ETHERNET`'d off in `platformio.ini`. Ethernet as a whole needs a proper pass — beyond this the `setup()` flow also mishandles the Ethernet-success path — before it's turned on; see the pending Claude memory note.

## Tests

`pio test -e native` runs a small, fast, hardware-free unit test suite against the handful of pure-logic functions (version comparison, URL parsing) — see [test/README.md](test/README.md) for what's covered, why the rest of the firmware isn't unit tested, and one-time setup on Windows.
