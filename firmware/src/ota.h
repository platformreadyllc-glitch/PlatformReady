#pragma once
#include <Arduino.h>
#include "config.h"

// How often loop() should call otaCheckAndApply() (see main.cpp).
#define OTA_CHECK_INTERVAL_MS (6UL * 60UL * 60UL * 1000UL)  // 6 hours
// How long the device must be free of button activity before an available
// update is allowed to apply (flash + reboot), so it never interrupts an
// in-progress competition action.
#define OTA_IDLE_THRESHOLD_MS (2UL * 60UL * 1000UL)  // 2 minutes

// Call once, very early in setup() (right after configLoad(), before any
// other subsystem init). Detects a pending OTA update left over from the
// previous boot and either lets boot continue normally, or — if the device
// has now rebooted too many times without reaching otaMarkValid() — rolls
// back to the previous firmware and reboots into it.
void otaHandleBootValidation();

// Call once the app has reached a "this firmware works" milestone (first
// successful backend registration). Clears any pending-update bookkeeping
// so future reboots are treated as normal power cycles, not crash loops.
void otaMarkValid();

// Checks the backend for a newer firmware version for cfg.type. Always
// performs the (cheap) check; only downloads + flashes + reboots if
// allowApply is true and a newer version is available. Safe to call
// repeatedly — a failed check or failed download never touches the running
// firmware.
void otaCheckAndApply(const RemoteConfig& cfg, bool allowApply);
