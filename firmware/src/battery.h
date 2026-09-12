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

// The raw smoothed voltage behind batteryGetLevel()'s classification -
// exposed for remote diagnostics (reported to the backend, see
// ws_client.cpp) since there's no serial/USB access to these units to
// check it directly. Same "optimistic until first sample" caveat as
// batteryGetLevel() for the brief pre-first-sample window.
float batteryGetVoltage();
