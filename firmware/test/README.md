# Firmware unit tests

Host-compiled unit tests (`[env:native]` in `platformio.ini`) for the pure logic pulled out of the Arduino/ESP32-dependent code:

- `otaIsNewer()` ([version_compare.h](../src/version_compare.h)) — the semver-ish comparator that gates whether an OTA update applies.
- `parseHostPort()` ([host_port.h](../src/host_port.h)) — backend URL parsing.
- `urlDecode()`/`formValue()` ([url_utils.h](../src/url_utils.h)) — form-body parsing for the Ethernet config page.

## Why only these three

Almost everything else in this firmware is thin glue around hardware/OS APIs — WiFi/Ethernet, NVS persistence, I2C display writes, GPIO, and especially the actual OTA flash/rollback operations (`Update.h`/`esp_ota_*`). Unit-testing those would need heavy mocking for little signal, and the behavior that actually matters (does a crash-looping update really get rolled back?) can only be meaningfully proven on real hardware — which is how the OTA/rollback flow was verified (see `firmware/README.md`). These three functions are the exception: pure string/logic parsing with real edge cases (e.g. `"1.10.0"` vs `"1.9.0"` under numeric vs lexicographic comparison) that are easy to get subtly wrong and cheap to pin down with a fast, hardware-free test.

## Running

```
cd firmware
pio test -e native
```

No board or serial connection needed — this compiles and runs on your own machine via a host C/C++ compiler, not the ESP32 toolchain.

`[env:native]` only runs when explicitly targeted (`-e native`, or via `pio test`). `platformio.ini`'s `default_envs = esp32dev` keeps a bare `pio run`/`pio run --target upload` (e.g. VSCode's "Upload" button) scoped to the real board — otherwise it would also try to build the `native` environment as a normal firmware target and fail, since it isn't one.

**One-time setup on Windows** (there's no system compiler by default): install PlatformIO's own packaged MinGW toolchain, isolated under `~/.platformio`, not a system-wide install:

```
pio pkg install -g -t platformio/toolchain-gccmingw32
```

`[env:native]`'s `extra_scripts = pre:../scripts/native_toolchain.py` points the build at it and statically links the test binary's MinGW runtime (see that script for why — the short version: `build_flags` doesn't reliably reach the link step on this platform, so it's done via `LINKFLAGS` directly).

## Adding more pure-logic tests

Extract the logic into its own dependency-free `.h`/`.cpp` in `src/` (plain `const char*`/`std::string`, no `Arduino.h`, no framework headers), add it to `[env:native]`'s `build_src_filter` in `platformio.ini`, and add cases to `test_native/test_main.cpp`. Don't add hardware-touching code here — extend the manual hardware verification process in `firmware/README.md` instead.
