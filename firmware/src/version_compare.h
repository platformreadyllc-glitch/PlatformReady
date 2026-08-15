#pragma once

// Pure version-comparison logic, deliberately free of any Arduino/ESP32
// dependency so it can be unit tested on the host (see firmware/test/).
//
// Returns true if `remote` is a newer version than `local`. Compares up to
// three dot-separated numeric components (major.minor.patch) numerically,
// not lexicographically — "1.10.0" is newer than "1.9.0". Missing trailing
// components (e.g. "1.0") are treated as 0. Non-numeric input parses as 0.
bool otaIsNewer(const char* remote, const char* local);
