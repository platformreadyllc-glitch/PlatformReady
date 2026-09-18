#include "battery_levels.h"

// Thresholds for a single-cell Li-ion/LiPo, the common case for a small
// handheld remote like this - a rested cell reads ~4.2V full, ~3.7V
// nominal/mid-discharge, and is considered empty around 3.0-3.3V under
// load. These are deliberately conservative round numbers, not tied to any
// specific cell's datasheet - tune against the real pack once degradation
// data is available, especially once the planned fuel-gauge chip replaces
// this simple divider-based reading entirely.
static const float FULL_THRESHOLD_V = 3.9f;    // >= this: FULL
static const float MEDIUM_THRESHOLD_V = 3.6f;  // >= this (and < FULL): MEDIUM, else LOW

BatteryLevel batteryLevelFromVoltage(float voltageVolts) {
  if (voltageVolts >= FULL_THRESHOLD_V) return BatteryLevel::BATT_FULL;
  if (voltageVolts >= MEDIUM_THRESHOLD_V) return BatteryLevel::BATT_MEDIUM;
  return BatteryLevel::BATT_LOW;
}
