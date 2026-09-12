#pragma once

// Pure voltage-to-level lookup, deliberately free of any Arduino/ESP32
// dependency so it can be host-unit-tested (see firmware/test/). battery.cpp
// owns the Arduino-facing ADC read + smoothing glue that feeds this.
//
// Simple 3-level classification against a typical single-cell Li-ion/LiPo
// discharge curve - a real fuel-gauge chip is planned for a future hardware
// revision, so this deliberately isn't trying to be more precise than a
// rough full/medium/low reading for now.

// Prefixed (BATT_*, not plain LOW/HIGH/FULL) because Arduino.h #defines
// LOW/HIGH as raw macros (digitalWrite's 0x0/0x1) - those would otherwise
// textually collide with an enumerator named LOW wherever this header is
// included alongside Arduino.h, enum class scoping notwithstanding (the
// preprocessor runs before the compiler ever sees C++ scope).
enum class BatteryLevel { BATT_LOW, BATT_MEDIUM, BATT_FULL };

BatteryLevel batteryLevelFromVoltage(float voltageVolts);
