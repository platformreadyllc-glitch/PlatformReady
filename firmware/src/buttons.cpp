#include "buttons.h"
#include "pins.h"
#include <Arduino.h>

static const unsigned long DEBOUNCE_MS = 50;

struct BtnState {
  int pin;
  bool enabled;
  bool lastStable;   // last debounced level (HIGH = released)
  bool pending;      // raw reading being watched for stability
  unsigned long changedAt;
};

static BtnState btns[] = {
  { BTN_WHITE,  true,  HIGH, HIGH, 0 },
  { BTN_RED,    true,  HIGH, HIGH, 0 },
  { BTN_BLUE,   true,  HIGH, HIGH, 0 },
  { BTN_YELLOW, true,  HIGH, HIGH, 0 },
  { BTN_CLOCK,  false, HIGH, HIGH, 0 },  // enabled only for chief
};

void buttonsInit(bool isChief) {
  btns[static_cast<int>(Button::CLOCK)].enabled = isChief;
  for (auto& b : btns) {
    if (b.enabled) pinMode(b.pin, INPUT_PULLUP);
  }
}

ButtonEvent buttonRead(Button btn) {
  auto& b = btns[static_cast<int>(btn)];
  if (!b.enabled) return ButtonEvent::NONE;

  bool raw = digitalRead(b.pin) == HIGH;  // HIGH = not pressed (pullup active)

  if (raw != b.pending) {
    b.pending   = raw;
    b.changedAt = millis();
  }

  if (millis() - b.changedAt >= DEBOUNCE_MS && b.pending != b.lastStable) {
    b.lastStable = b.pending;
    if (!b.lastStable) return ButtonEvent::PRESSED;  // LOW = pressed
  }

  return ButtonEvent::NONE;
}
