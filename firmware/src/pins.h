#pragma once

// ── W5500 SPI Ethernet ──────────────────────────────────────────────────────
// Uses ESP32 VSPI defaults for MOSI/MISO/SCLK (GPIO 23/19/18).
#define ETH_CS       5
#define ETH_RST     15

// ── I2C Display ──────────────────────────────────────────────────────────────
#define DISPLAY_SDA 21
#define DISPLAY_SCL 22

// ── Vote buttons (active LOW with internal pullup) ───────────────────────────
#define BTN_WHITE   13
#define BTN_RED     14
#define BTN_BLUE    27
#define BTN_YELLOW  26

// ── Clock button (chief remote only, same wiring scheme) ─────────────────────
#define BTN_CLOCK   25

// ── Haptic motor via 2N2222 NPN ─────────────────────────────────────────────
// GPIO → 470Ω → Base(Q1); Collector(Q1) → Motor(−); Motor(+) → 3V3
// 1N4001 flyback diode: anode = Motor(−) / Collector, cathode = 3V3
#define MOTOR_PIN   32

// ── Hold this button at power-on to enter config mode ────────────────────────
#define BTN_CONFIG  BTN_WHITE

// ── Battery voltage sense ─────────────────────────────────────────────────────
// Simple two-resistor (100k/100k) divider from BATT+ to GND; this pin reads
// the midpoint, i.e. half the true battery voltage - battery.cpp multiplies
// the reading back up. GPIO2 is an ADC2 pin, which on the classic ESP32
// (not S2/S3/C3) is shared with the WiFi driver and can spuriously fail to
// read while WiFi is associated - see battery.cpp's note on the mitigation.
#define BATT_SENSE  2
