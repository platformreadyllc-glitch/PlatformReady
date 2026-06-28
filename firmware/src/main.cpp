#include <Arduino.h>
#include <WiFiManager.h>
#include "pins.h"
#include "config.h"
#include "display.h"
#include "network.h"
#include "buttons.h"
#include "haptic.h"
#include "api.h"
#include "webconfig.h"

static RemoteConfig cfg;
static bool registered = false;
static unsigned long lastRegisterAttempt = 0;
static String lastStatus = "READY";

// ── WiFiManager portal with custom params for full config ────────────────────
static void runWiFiManager(bool forcePortal) {
  WiFiManager wm;
  wm.setConfigPortalTimeout(300);  // 5 min before giving up and continuing

  WiFiManagerParameter p_serial("serial",     "Serial (e.g. RL-001)",              cfg.serial.c_str(),      16);
  WiFiManagerParameter p_type("type",         "Type: side or chief",               cfg.type == RemoteType::CHIEF ? "chief" : "side", 8);
  WiFiManagerParameter p_host("host",         "Backend URL",                       cfg.backendHost.c_str(), 64);
  WiFiManagerParameter p_platform("platform", "Platform ID (e.g. platform-1)",     cfg.platformId.c_str(),  32);
  WiFiManagerParameter p_role("role",         "Role: left, right, or chief",       cfg.role.c_str(),         8);
  wm.addParameter(&p_serial);
  wm.addParameter(&p_type);
  wm.addParameter(&p_host);
  wm.addParameter(&p_platform);
  wm.addParameter(&p_role);

  if (forcePortal) {
    wm.resetSettings();
    configClear();
    cfg.configured = false;
  }

  wm.autoConnect("PlatformReady-Setup");

  // Save our custom params only if they weren't loaded from flash
  // (i.e. first boot or forced config mode — portal was shown).
  if (!cfg.configured) {
    cfg.serial      = p_serial.getValue();
    cfg.type        = String(p_type.getValue()) == "chief" ? RemoteType::CHIEF : RemoteType::SIDE;
    cfg.backendHost = p_host.getValue();
    cfg.platformId  = p_platform.getValue();
    cfg.role        = p_role.getValue();
    configSave(cfg);
    cfg.configured  = true;
  }
}

void setup() {
  Serial.begin(115200);
  delay(2000);  // give serial monitor time to connect
  Serial.println("[boot] serial ready");

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
  Serial.println("[boot] setup done");
}

void loop() {
  if (!networkConnected()) {
    Serial.println("[loop] no network");
    displayShowError("No network");
    delay(2000);
    return;
  }

  // Register with backend once — retry every 5 s on failure
  if (!registered && millis() - lastRegisterAttempt > 5000) {
    lastRegisterAttempt = millis();
    Serial.println("[loop] registering...");
    ApiResult r = apiRegisterRemote(cfg.role);
    Serial.printf("[loop] register result=%d\n", (int)r);
    // OK: freshly registered.  SERVER_ERROR: probably already registered — proceed anyway.
    if (r == ApiResult::OK || r == ApiResult::SERVER_ERROR) {
      registered  = true;
      lastStatus  = "READY";
      displayShowActive(cfg.platformId, cfg.role, lastStatus);
      hapticDoubleClick();
    }
  }

  if (!registered) return;

  // ── Vote buttons ─────────────────────────────────────────────────────────
  const Button    voteButtons[] = { Button::WHITE, Button::RED, Button::BLUE, Button::YELLOW };
  const char*     voteNames[]   = { "white",       "red",       "blue",       "yellow" };
  const char*     voteLabels[]  = { "WHITE",        "RED",       "BLUE",       "YELLOW" };

  for (int i = 0; i < 4; i++) {
    if (buttonRead(voteButtons[i]) != ButtonEvent::PRESSED) continue;

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
}
