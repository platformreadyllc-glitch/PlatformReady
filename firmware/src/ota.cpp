#include "ota.h"
#include "version.h"
#include "api.h"
#include "network.h"
#include "display.h"
#include <Preferences.h>
#include <ArduinoHttpClient.h>
#include <ArduinoJson.h>
#include <HTTPUpdate.h>
#include <WiFi.h>
#include "esp_ota_ops.h"

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

static bool isNewer(const String& remote, const String& local) {
  auto parse = [](const String& v, int& major, int& minor, int& patch) {
    major = minor = patch = 0;
    int dot1 = v.indexOf('.');
    if (dot1 < 0) { major = v.toInt(); return; }
    major = v.substring(0, dot1).toInt();
    int dot2 = v.indexOf('.', dot1 + 1);
    if (dot2 < 0) { minor = v.substring(dot1 + 1).toInt(); return; }
    minor = v.substring(dot1 + 1, dot2).toInt();
    patch = v.substring(dot2 + 1).toInt();
  };
  int rMajor, rMinor, rPatch, lMajor, lMinor, lPatch;
  parse(remote, rMajor, rMinor, rPatch);
  parse(local, lMajor, lMinor, lPatch);
  if (rMajor != lMajor) return rMajor > lMajor;
  if (rMinor != lMinor) return rMinor > lMinor;
  return rPatch > lPatch;
}

static void clearPending() {
  otaPrefs.begin(OTA_NS, false);
  otaPrefs.putBool("pending", false);
  otaPrefs.end();
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

  if (!isNewer(remoteVersion, FIRMWARE_VERSION)) {
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

  // HTTPUpdate only accepts WiFiClient (not the generic Client used
  // elsewhere via networkNewClient()) in this core version — a non-issue
  // today since Ethernet is disabled (-DSKIP_ETHERNET). See firmware/README.md.
  WiFiClient updateClient;
  httpUpdate.rebootOnUpdate(false);
  t_httpUpdate_return result =
      httpUpdate.update(updateClient, apiGetHost(), apiGetPort(), downloadUrl, FIRMWARE_VERSION);

  switch (result) {
    case HTTP_UPDATE_OK:
      Serial.println("[ota] update ok, rebooting");
      displayShowOtaSuccess();
      delay(1500);
      ESP.restart();
      break;

    case HTTP_UPDATE_NO_UPDATES:
      Serial.println("[ota] server reported no update (race?)");
      clearPending();
      break;

    case HTTP_UPDATE_FAILED:
    default:
      Serial.printf("[ota] update failed: %s\n", httpUpdate.getLastErrorString().c_str());
      displayShowOtaFailed(httpUpdate.getLastErrorString());
      delay(2000);
      clearPending();
      break;
  }
}
