#include "ota.h"
#include "version.h"
#include "version_compare.h"
#include "api.h"
#include "network.h"
#include "display.h"
#include "watchdog.h"
#include <Preferences.h>
#include <ArduinoHttpClient.h>
#include <ArduinoJson.h>
#include <Update.h>
#include "esp_ota_ops.h"

// Deliberately NOT using the ESP32 core's HTTPUpdate library: its header
// (HTTPUpdate.h) expects HTTPClient.h to already be included, but on a
// case-insensitive filesystem (Windows) that collides with ArduinoHttpClient's
// own identically-named-but-differently-cased HttpClient.h — the wrong file
// silently wins and HTTPClient never gets declared, breaking the build. Using
// Update.h directly with ArduinoHttpClient (same as api.cpp) avoids the
// collision entirely, and as a bonus works over both WiFi and Ethernet via
// networkNewClient(), rather than being tied to WiFiClient specifically.

// Boot-attempt crash-loop protection is implemented by hand (rather than
// relying on esp-idf's Kconfig-gated automatic rollback-on-crash-loop
// feature) because whether that feature is compiled into the precompiled
// arduino-esp32 core PlatformIO pulls in isn't guaranteed. This counter is
// a portable fallback that works regardless: esp_ota_mark_app_invalid_
// rollback_and_reboot() is a direct partition-table operation, not gated
// behind any sdkconfig flag.
#define OTA_MAX_BOOT_ATTEMPTS 3

static Preferences otaPrefs;
static const char* OTA_NS = "ota";

static void clearPending() {
  otaPrefs.begin(OTA_NS, false);
  otaPrefs.putBool("pending", false);
  otaPrefs.end();
}

// Streams the .bin at `path` straight into the inactive OTA partition.
// Returns true only if the full advertised Content-Length was written and
// flashed with no error; Update.errorString() has details on failure.
static bool downloadAndFlash(const String& path) {
  Client* cl = networkNewClient();
  HttpClient http(*cl, apiGetHost(), apiGetPort());
  http.setTimeout(10000);

  int err = http.get(path);
  if (err != HTTP_SUCCESS) {
    http.stop();
    Serial.println("[ota] download: network error");
    return false;
  }

  int code = http.responseStatusCode();
  if (code < 200 || code >= 300) {
    http.stop();
    Serial.printf("[ota] download: http %d\n", code);
    return false;
  }

  http.skipResponseHeaders();
  long len = http.contentLength();
  if (len <= 0) {
    http.stop();
    Serial.println("[ota] download: missing/invalid content length");
    return false;
  }

  if (!Update.begin((size_t)len, U_FLASH)) {
    http.stop();
    Serial.printf("[ota] Update.begin failed: %s\n", Update.errorString());
    return false;
  }

  uint8_t buf[1024];
  unsigned long lastDataMs = millis();
  const unsigned long STALL_TIMEOUT_MS = 15000;

  while (Update.remaining() > 0) {
    // Keeps a slow-but-progressing download from tripping the watchdog. The
    // stall-abort below remains the primary defense against a truly stalled
    // download — this is pure backup in case that logic somehow doesn't fire.
    watchdogFeed();

    int avail = http.available();
    if (avail <= 0) {
      if (!http.connected()) break;
      if (millis() - lastDataMs > STALL_TIMEOUT_MS) {
        Serial.println("[ota] download stalled, aborting");
        break;
      }
      delay(5);
      continue;
    }

    size_t want = (size_t)avail;
    if (want > sizeof(buf)) want = sizeof(buf);
    if (want > Update.remaining()) want = Update.remaining();

    int n = http.read(buf, want);
    if (n <= 0) break;

    if (Update.write(buf, (size_t)n) != (size_t)n) {
      Serial.printf("[ota] flash write error: %s\n", Update.errorString());
      break;
    }
    lastDataMs = millis();
  }

  http.stop();

  if (Update.remaining() != 0) {
    Update.abort();
    Serial.println("[ota] download incomplete");
    return false;
  }

  if (!Update.end(true)) {
    Serial.printf("[ota] Update.end failed: %s\n", Update.errorString());
    return false;
  }

  return !Update.hasError();
}

void otaHandleBootValidation() {
  otaPrefs.begin(OTA_NS, false);
  bool pending = otaPrefs.getBool("pending", false);
  if (!pending) {
    otaPrefs.end();
    return;
  }

  uint32_t attempts = otaPrefs.getUInt("bootAttempts", 0) + 1;
  otaPrefs.putUInt("bootAttempts", attempts);
  Serial.printf("[ota] pending update, boot attempt %u/%u\n", attempts, OTA_MAX_BOOT_ATTEMPTS);

  if (attempts > OTA_MAX_BOOT_ATTEMPTS) {
    Serial.println("[ota] boot validation failed too many times, rolling back");
    otaPrefs.putBool("pending", false);
    otaPrefs.end();
    esp_err_t err = esp_ota_mark_app_invalid_rollback_and_reboot();
    // Only reached if there's no valid previous partition to roll back to
    // (e.g. this is the very first OTA update ever applied). Restart plain
    // rather than looping forever on a broken image.
    Serial.printf("[ota] rollback failed (%d), restarting anyway\n", (int)err);
    ESP.restart();
    return;
  }

  otaPrefs.end();
}

void otaMarkValid() {
  otaPrefs.begin(OTA_NS, false);
  bool pending = otaPrefs.getBool("pending", false);
  if (pending) {
    otaPrefs.putBool("pending", false);
    otaPrefs.putUInt("bootAttempts", 0);
    Serial.println("[ota] firmware marked valid");
  }
  otaPrefs.end();

  // Best-effort: a bonus safety net if the IDF auto-rollback-on-crash-loop
  // feature happens to be enabled in this core build. Harmless no-op
  // otherwise. The boot-attempt counter above is the mechanism actually
  // relied on.
  (void)esp_ota_mark_app_valid_cancel_rollback();
}

void otaCheckAndApply(const RemoteConfig& cfg, bool allowApply) {
  displayShowOtaChecking();

  String path = "/firmware/latest?type=";
  path += (cfg.type == RemoteType::CHIEF) ? "chief" : "side";

  Client* cl = networkNewClient();
  HttpClient http(*cl, apiGetHost(), apiGetPort());
  http.setTimeout(5000);

  int err = http.get(path);
  if (err != HTTP_SUCCESS) {
    http.stop();
    Serial.println("[ota] version check network error");
    return;
  }

  int code = http.responseStatusCode();
  String body = http.responseBody();
  http.stop();

  if (code < 200 || code >= 300) {
    Serial.printf("[ota] version check http %d\n", code);
    return;
  }

  JsonDocument doc;
  if (deserializeJson(doc, body) != DeserializationError::Ok) {
    Serial.println("[ota] version check: bad json");
    return;
  }

  const char* remoteVersion = doc["version"];
  const char* downloadUrl   = doc["url"];
  if (!remoteVersion || !downloadUrl) {
    Serial.println("[ota] version check: missing fields");
    return;
  }

  if (!otaIsNewer(remoteVersion, FIRMWARE_VERSION)) {
    Serial.println("[ota] up to date");
    return;
  }

  if (!allowApply) {
    Serial.printf("[ota] update %s available, deferring (device busy)\n", remoteVersion);
    return;
  }

  Serial.printf("[ota] applying update %s -> %s\n", FIRMWARE_VERSION, remoteVersion);

  otaPrefs.begin(OTA_NS, false);
  otaPrefs.putBool("pending", true);
  otaPrefs.putUInt("bootAttempts", 0);
  otaPrefs.putString("prevVersion", FIRMWARE_VERSION);
  otaPrefs.putString("targetVersion", remoteVersion);
  otaPrefs.end();

  displayShowOtaUpdating();

  if (downloadAndFlash(downloadUrl)) {
    Serial.println("[ota] update ok, rebooting");
    displayShowOtaSuccess();
    delay(1500);
    ESP.restart();
  } else {
    Serial.printf("[ota] update failed: %s\n", Update.errorString());
    displayShowOtaFailed(Update.errorString());
    delay(2000);
    clearPending();
  }
}
