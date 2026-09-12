#include "battery.h"
#include "pins.h"

// The divider is two equal 100k resistors, so the ADC sees exactly half the
// true battery voltage.
static const float DIVIDER_RATIO = 2.0f;

// BATT_SENSE (GPIO2) is an ADC2 pin - on the classic ESP32 (not S2/S3/C3),
// ADC2 is shared with the WiFi driver and a read can spuriously fail
// (returning 0 or a garbage-low value) while WiFi is actively associated -
// a well-known hardware limitation, not something fixable in software, and
// not worth a hardware rewire for this simple a reading. Taking several
// samples and using the median (rather than a plain average) rejects that
// kind of occasional lone outlier without needing a heavier filter -
// battery voltage changes slowly, so a handful of samples a few ms apart
// is plenty.
static const int SAMPLE_COUNT = 8;
static const unsigned long SAMPLE_INTERVAL_MS = 2000;

static float g_smoothedVoltage = 0;
static bool g_haveReading = false;
static unsigned long g_lastSampleMs = 0;

static float readVoltageOnce() {
  // analogReadMilliVolts() calibrates against the chip's own eFuse
  // reference rather than assuming a flat 3.3V/4095-count scale, which
  // matters more near the edges of the ADC's range than it does here, but
  // it's the more correct primitive to reach for regardless.
  uint32_t mv = analogReadMilliVolts(BATT_SENSE);
  return (mv / 1000.0f) * DIVIDER_RATIO;
}

void batteryInit() {
  analogReadResolution(12);
  pinMode(BATT_SENSE, INPUT);
}

void batteryLoop() {
  if (g_haveReading && millis() - g_lastSampleMs < SAMPLE_INTERVAL_MS) return;
  g_lastSampleMs = millis();

  float samples[SAMPLE_COUNT];
  for (int i = 0; i < SAMPLE_COUNT; i++) {
    samples[i] = readVoltageOnce();
    delay(2);
  }

  // Insertion sort - SAMPLE_COUNT is tiny, not worth pulling in <algorithm>.
  for (int i = 1; i < SAMPLE_COUNT; i++) {
    float key = samples[i];
    int j = i - 1;
    while (j >= 0 && samples[j] > key) {
      samples[j + 1] = samples[j];
      j--;
    }
    samples[j + 1] = key;
  }

  g_smoothedVoltage = samples[SAMPLE_COUNT / 2];
  g_haveReading = true;
}

BatteryLevel batteryGetLevel() {
  // Optimistic default for the brief window before the first sample
  // completes (effectively immediate - batteryLoop()'s own !g_haveReading
  // check means the very first call always samples right away).
  if (!g_haveReading) return BatteryLevel::BATT_FULL;
  return batteryLevelFromVoltage(g_smoothedVoltage);
}

float batteryGetVoltage() {
  return g_smoothedVoltage;
}
