#pragma once
#include <Arduino.h>
#include "battery_levels.h"

// Reads the battery voltage divider on BATT_SENSE (see pins.h) and
// classifies it via battery_levels.h's simple full/medium/low lookup.
// Call batteryInit() once in setup(), then batteryLoop() every loop()
// iteration - non-blocking, it only actually samples the ADC on its own
// internal schedule. batteryGetLevel() returns the latest smoothed result,
// safe to call anytime after batteryInit().
void batteryInit();
void batteryLoop();
BatteryLevel batteryGetLevel();
