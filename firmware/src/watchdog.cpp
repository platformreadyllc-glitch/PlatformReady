#include "watchdog.h"
#include <Arduino.h>
#include <esp_task_wdt.h>

void watchdogInit() {
  esp_err_t err = esp_task_wdt_init(WATCHDOG_TIMEOUT_SECONDS, true);
  if (err != ESP_OK) {
    Serial.printf("[watchdog] init failed: %d\n", (int)err);
  }

  err = esp_task_wdt_add(NULL);
  // ESP_ERR_INVALID_ARG just means this task is already subscribed (e.g. the
  // core subscribed it by default) — not an error worth reporting.
  if (err != ESP_OK && err != ESP_ERR_INVALID_ARG) {
    Serial.printf("[watchdog] add failed: %d\n", (int)err);
  }
}

void watchdogFeed() {
  esp_task_wdt_reset();
}

void watchdogPause() {
  esp_task_wdt_delete(NULL);
}

void watchdogResume() {
  esp_task_wdt_add(NULL);
}
