#include "haptic.h"
#include "pins.h"
#include <Arduino.h>

static unsigned long g_lastFiredMs = 0;

void hapticInit() {
  pinMode(MOTOR_PIN, OUTPUT);
  digitalWrite(MOTOR_PIN, LOW);
}

// Single blocking vibration pulse — max ~300ms so loop() isn't noticeably stalled.
void hapticPulse(int durationMs) {
  g_lastFiredMs = millis();
  digitalWrite(MOTOR_PIN, HIGH);
  delay(durationMs);
  digitalWrite(MOTOR_PIN, LOW);
}

unsigned long hapticLastFiredMs() { return g_lastFiredMs; }

// Two short pulses: press acknowledged + response received.
void hapticDoubleClick() {
  hapticPulse(50);
  delay(80);
  hapticPulse(50);
}

// Long pulse signals an error (network or server).
void hapticError() {
  hapticPulse(300);
}
