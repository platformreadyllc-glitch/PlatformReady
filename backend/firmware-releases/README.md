# Firmware releases

Binaries served to ESP32 remotes for OTA updates (see `firmware/README.md` for the full picture).

To cut a release:

1. Build the firmware (`pio run` in `firmware/`) and copy the resulting `.bin` here as `<type>-<version>.bin` (e.g. `side-1.0.1.bin`).
2. Update `manifest.json` with the new `version`/`file` for that `type`.

`.bin` files aren't committed to this repo — only `manifest.json` and this README are tracked. Devices fetch binaries via `GET /firmware/download/:file`.
