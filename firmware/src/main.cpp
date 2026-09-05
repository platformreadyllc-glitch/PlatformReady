#include <Arduino.h>
#include <WiFiManager.h>
#include <WiFi.h>
#include "pins.h"
#include "config.h"
#include "display.h"
#include "network.h"
#include "buttons.h"
#include "haptic.h"
#include "api.h"
#include "webconfig.h"
#include "ota.h"
#include "version.h"
#include "watchdog.h"

static RemoteConfig cfg;
static bool registered = false;
static unsigned long lastRegisterAttempt = 0;
static String lastStatus = "READY";
static unsigned long lastOtaCheck = 0;
static unsigned long lastActivityMs = 0;
static unsigned long disconnectedSinceMs = 0;

// ── WiFiManager portal with custom params for full config ────────────────────
static void runWiFiManager(bool forcePortal) {
  WiFiManager wm;
  wm.setConfigPortalTimeout(300);  // 5 min before giving up and continuing

  // Platform/role are assigned later via the remote management page, not
  // at setup time — only the fixed identity fields are collected here.
  WiFiManagerParameter p_serial("serial", "Serial (e.g. RL-001)",              cfg.serial.c_str(),      16);
  WiFiManagerParameter p_type("type",     "Type: side or chief",               cfg.type == RemoteType::CHIEF ? "chief" : "side", 8);
  WiFiManagerParameter p_host("host",     "Backend URL",                       cfg.backendHost.c_str(), 64);
  wm.addParameter(&p_serial);
  wm.addParameter(&p_type);
  wm.addParameter(&p_host);

  if (forcePortal) {
    wm.resetSettings();
    configClear();
    cfg.configured = false;
  }

  // autoConnect() can legitimately block for up to the 300s portal timeout
  // above, waiting on a human — far longer than the watchdog window, and we
  // can't feed the watchdog from inside this third-party library's own loop.
  watchdogPause();
  wm.autoConnect("PlatformReady-Setup");
  watchdogResume();

  // Save our custom params only if they weren't loaded from flash
  // (i.e. first boot or forced config mode — portal was shown).
  if (!cfg.configured) {
    cfg.serial      = p_serial.getValue();
    cfg.type        = String(p_type.getValue()) == "chief" ? RemoteType::CHIEF : RemoteType::SIDE;
    cfg.backendHost = p_host.getValue();
    configSave(cfg);
    cfg.configured  = true;
  }
}

void setup() {
  Serial.begin(115200);
  delay(2000);  // give serial monitor time to connect
  Serial.println("[boot] serial ready");
  Serial.printf("[boot] firmware version %s\n", FIRMWARE_VERSION);

  // Must run before anything that could conceivably hang — see watchdog.h.
  watchdogInit();

  Serial.println("[boot] hapticInit");
  hapticInit();

  Serial.println("[boot] displayInit");
  displayInit();
  Serial.println("[boot] displayInit done");

  // Load saved config (may be empty on first boot)
  Serial.println("[boot] configLoad");
  configLoad(cfg);
  Serial.printf("[boot] configLoad done: serial=%s host=%s platform=%s role=%s\n",
    cfg.serial.c_str(), cfg.backendHost.c_str(), cfg.platformId.c_str(), cfg.role.c_str());

  // Must run before any other subsystem init: rolls back to the previous
  // firmware if we're crash-looping after a bad OTA update.
  otaHandleBootValidation();

  // Check for forced config mode: hold BTN_CONFIG at power-on
  pinMode(BTN_CONFIG, INPUT_PULLUP);
  bool forceConfig = !cfg.configured || (digitalRead(BTN_CONFIG) == LOW);
  Serial.printf("[boot] forceConfig=%d configured=%d\n", forceConfig, cfg.configured);

  String typeLabel = cfg.type == RemoteType::CHIEF ? "Chief Judge" : "Side Referee";
  displayShowConnecting(cfg.serial, typeLabel);

  // ── Network: Ethernet first, then WiFi ──────────────────────────────────
  Serial.println("[boot] networkTryEthernet");
  bool ethUp = networkTryEthernet();
  Serial.printf("[boot] ethUp=%d\n", ethUp);
  watchdogFeed();

  if (ethUp) {
    if (forceConfig) {
      webConfigRunEthernet(cfg);
    }
    networkBeginWiFi();
  } else {
    networkBeginWiFi();
    Serial.println("[boot] runWiFiManager");
    runWiFiManager(forceConfig);
    Serial.println("[boot] runWiFiManager done");
  }

  // ── Init subsystems ──────────────────────────────────────────────────────
  bool isChief = cfg.type == RemoteType::CHIEF;
  buttonsInit(isChief);
  apiInit(cfg.backendHost, cfg.platformId, cfg.serial);

  displayShowActive(cfg.platformId, cfg.role, "CONNECTING");
  hapticPulse(80);
  watchdogFeed();
  Serial.println("[boot] setup done");
}

void loop() {
  watchdogFeed();

  if (!networkConnected()) {
    if (disconnectedSinceMs == 0) disconnectedSinceMs = millis();
    Serial.println("[loop] no network");
    displayShowError("No network");

    // Active retry, WiFi only — WiFi.setAutoReconnect (network.cpp) handles
    // most drops on its own, but this is a backstop for ones it doesn't.
    // Ethernet's own link-based recovery is separate and already adequate.
    if (!networkIsEthernet() && millis() - disconnectedSinceMs > 10000) {
      Serial.println("[loop] attempting WiFi reconnect");
      WiFi.reconnect();
      disconnectedSinceMs = millis();  // don't hammer reconnect() every iteration
    }

    delay(2000);
    return;
  }
  disconnectedSinceMs = 0;

  // Register with backend once — retry every 5 s on failure
  if (!registered && millis() - lastRegisterAttempt > 5000) {
    lastRegisterAttempt = millis();
    Serial.println("[loop] registering...");
    String hardwareType = cfg.type == RemoteType::CHIEF ? "chief" : "side";
    ApiRemoteState state = apiRegisterRemote(hardwareType);
    Serial.printf("[loop] register result=%d\n", (int)state.result);
    // OK: freshly registered.  SERVER_ERROR: probably already registered — proceed anyway.
    if (state.result == ApiResult::OK || state.result == ApiResult::SERVER_ERROR) {
      registered  = true;
      lastStatus  = "READY";

      // Adopt the backend's current platform/role assignment (if any) —
      // assignment happens via the remote management page, not at setup
      // time, so this is the only way the device learns it. Clear any
      // stale cached assignment if the backend no longer has one (e.g. a
      // fresh pool registration).
      if (state.activated) {
        if (cfg.platformId != state.platformId || cfg.role != state.role) {
          cfg.platformId = state.platformId;
          cfg.role       = state.role;
          configSave(cfg);
        }
      } else if (!cfg.platformId.isEmpty() || !cfg.role.isEmpty()) {
        cfg.platformId = "";
        cfg.role       = "";
        configSave(cfg);
      }

      displayShowActive(cfg.platformId, cfg.role, lastStatus);
      hapticDoubleClick();

      // Registering successfully is our "this firmware works" milestone —
      // cancels any pending-update/rollback bookkeeping from a prior OTA.
      otaMarkValid();

      // Don't make freshly-booted devices wait up to OTA_CHECK_INTERVAL_MS
      // for their first update check.
      lastOtaCheck = millis();
      otaCheckAndApply(cfg, true);
      displayShowActive(cfg.platformId, cfg.role, lastStatus);
    }
  }

  if (!registered) return;

  // ── Vote buttons ─────────────────────────────────────────────────────────
  const Button    voteButtons[] = { Button::WHITE, Button::RED, Button::BLUE, Button::YELLOW };
  const char*     voteNames[]   = { "white",       "red",       "blue",       "yellow" };
  const char*     voteLabels[]  = { "WHITE",        "RED",       "BLUE",       "YELLOW" };

  for (int i = 0; i < 4; i++) {
    if (buttonRead(voteButtons[i]) != ButtonEvent::PRESSED) continue;

    lastActivityMs = millis();
    hapticPulse(40);
    ApiResult r = apiCastVote(voteNames[i]);
    if (r == ApiResult::OK) {
      lastStatus = voteLabels[i];
      hapticDoubleClick();
    } else {
      lastStatus = "ERR";
      hapticError();
    }
    displayShowActive(cfg.platformId, cfg.role, lastStatus);
  }

  // ── Clock button (chief only) ─────────────────────────────────────────────
  if (cfg.type == RemoteType::CHIEF &&
      buttonRead(Button::CLOCK) == ButtonEvent::PRESSED) {
    lastActivityMs = millis();
    hapticPulse(40);
    ApiResult r = apiPressClockButton();
    if (r == ApiResult::OK) {
      lastStatus = "CLOCK";
      hapticDoubleClick();
    } else {
      lastStatus = "ERR";
      hapticError();
    }
    displayShowActive(cfg.platformId, cfg.role, lastStatus);
  }

  // ── Periodic OTA check ────────────────────────────────────────────────────
  // Always checks on schedule; only applies (flash + reboot) once the device
  // has been free of button activity for OTA_IDLE_THRESHOLD_MS, so an update
  // never interrupts an in-progress competition action.
  if (millis() - lastOtaCheck > OTA_CHECK_INTERVAL_MS) {
    lastOtaCheck = millis();
    bool idle = (millis() - lastActivityMs) > OTA_IDLE_THRESHOLD_MS;
    otaCheckAndApply(cfg, idle);
    displayShowActive(cfg.platformId, cfg.role, lastStatus);
  }
}
