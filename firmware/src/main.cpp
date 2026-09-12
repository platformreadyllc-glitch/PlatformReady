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
#include "ws_client.h"
#include "battery.h"

static RemoteConfig cfg;
static bool registered = false;
static unsigned long lastRegisterAttempt = 0;
static String lastStatus = "READY";
static unsigned long lastOtaCheck = 0;
static unsigned long lastActivityMs = 0;
static unsigned long disconnectedSinceMs = 0;
static bool wasDisconnected = false;
static unsigned long lastScoreboardTick = 0;
static unsigned long lastStatusChangeMs = 0;
// How long a transient status word (WHITE, ERR, CLOCK, ...) stays on
// screen before the scoreboard's bottom line reverts to showing the
// remote's platform/position instead - see refreshDisplay().
static const unsigned long STATUS_DISPLAY_MS = 5000;

// All lastStatus writes should go through this, not a bare assignment -
// refreshDisplay() needs to know *when* it changed, not just its value.
static void setStatus(const String& s) {
  lastStatus = s;
  lastStatusChangeMs = millis();
}

// "platform-1"/"chief" -> "P:1 - Chief". Strips a leading "platform"/
// "platform-" prefix (case-insensitive) if present so the common naming
// scheme abbreviates cleanly; falls back to the full platformId
// otherwise rather than assuming every platform follows that convention.
static String formatPlatformRole(const String& platformId, const String& role) {
  String lower = platformId;
  lower.toLowerCase();
  String shortId = platformId;
  if (lower.startsWith("platform-")) {
    shortId = platformId.substring(9);
  } else if (lower.startsWith("platform")) {
    shortId = platformId.substring(8);
  }
  String roleCap = role;
  if (roleCap.length() > 0) {
    roleCap.setCharAt(0, toupper(roleCap[0]));
  }
  return "P:" + shortId + " - " + roleCap;
}

static ScoreVote toScoreVote(const RefereeVoteDisplay& v) {
  ScoreVote sv;
  switch (v.state) {
    case VoteDisplayState::NOT_VOTED: sv.state = ScoreVoteState::EMPTY;    break;
    case VoteDisplayState::HIDDEN:    sv.state = ScoreVoteState::HIDDEN;   break;
    case VoteDisplayState::REVEALED:  sv.state = ScoreVoteState::REVEALED; break;
  }
  sv.button = v.button;
  return sv;
}

// Single choke point for "redraw whatever's currently true" - shows the
// live mini-scoreboard once registered and assigned to a platform, or
// falls back to the plain unassigned/status screen otherwise (including
// the window right after boot where cfg.platformId may still hold a
// stale cached assignment from before this registration cycle has
// reconfirmed it with the backend). Replaces the repeated
// `displayShowActive(cfg.platformId, cfg.role, lastStatus)` call sites
// below - keeps display.cpp itself free of any ws_client.h dependency.
static void refreshDisplay() {
  if (!registered || cfg.platformId.isEmpty()) {
    displayShowActive(cfg.platformId, cfg.role, lastStatus);
    return;
  }
  ScoreboardState s = wsGetScoreboard();
  // A transient status (just voted, just pressed clock, ERR) is only
  // useful briefly - once it's stale, showing the remote's own platform/
  // position is more useful than a permanently-stuck "READY".
  bool statusFresh = millis() - lastStatusChangeMs < STATUS_DISPLAY_MS;
  String bottomText = statusFresh ? lastStatus
                                   : formatPlatformRole(cfg.platformId, cfg.role);
  displayShowScoreboard(bottomText, toScoreVote(s.left), toScoreVote(s.chief),
                         toScoreVote(s.right), s.clock.remaining,
                         networkIsEthernet(), batteryGetLevel());
}

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

  batteryInit();

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
  // Non-blocking regardless of WiFi state, and a no-op before wsInit() has
  // run - safe to pump unconditionally ahead of the network gate below.
  wsLoop();
  // Samples on its own ~2s schedule internally - cheap to call every
  // iteration, same pattern as wsLoop() above.
  batteryLoop();

  if (!networkConnected()) {
    if (disconnectedSinceMs == 0) disconnectedSinceMs = millis();
    wasDisconnected = true;
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

  // Network just came back — nothing else in loop() proactively redraws the
  // screen on reconnect (only specific events do: a button press, the
  // periodic OTA check), so without this the device could be working fine
  // underneath while still showing a stale "No network" screen.
  if (wasDisconnected) {
    wasDisconnected = false;
    Serial.println("[loop] network restored");
    refreshDisplay();
  }

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
      setStatus("READY");

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

      refreshDisplay();
      hapticDoubleClick();

      // Registering successfully is our "this firmware works" milestone —
      // cancels any pending-update/rollback bookkeeping from a prior OTA.
      otaMarkValid();

      // Opens the persistent connection used for liveness, live assignment
      // sync, and the mini-scoreboard - see ws_client.h.
      wsInit(cfg.serial);

      // Don't make freshly-booted devices wait up to OTA_CHECK_INTERVAL_MS
      // for their first update check.
      lastOtaCheck = millis();
      otaCheckAndApply(cfg, true);
      refreshDisplay();
    }
  }

  if (!registered) return;

  // Periodic redraw while assigned to a platform - the mini-scoreboard's
  // hidden->revealed vote transition is timed purely against millis(), not
  // triggered by any incoming message, so nothing else would ever redraw
  // it. Also keeps the displayed clock roughly current between the
  // backend's ~1/sec pushes. Unconditional (no dirty-flag check) - a
  // full-buffer redraw on this OLED is cheap and 4Hz is a light load.
  if (!cfg.platformId.isEmpty() && millis() - lastScoreboardTick > 250) {
    lastScoreboardTick = millis();
    refreshDisplay();
  }

  // ── Live assignment updates ─────────────────────────────────────────────
  // Lets a reassignment made via the remote management page take effect
  // immediately instead of only at the next reboot (see
  // esp-remotes.gateway.ts on the backend).
  String newPlatformId, newRole;
  if (wsPollAssignmentChange(newPlatformId, newRole)) {
    cfg.platformId = newPlatformId;
    cfg.role       = newRole;
    configSave(cfg);
    apiSetPlatformId(newPlatformId);
    setStatus("READY");
    refreshDisplay();
    hapticDoubleClick();
    Serial.printf("[loop] assignment changed: platform=%s role=%s\n",
                   cfg.platformId.c_str(), cfg.role.c_str());
  }

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
      setStatus(voteLabels[i]);
      hapticDoubleClick();
    } else {
      setStatus("ERR");
      hapticError();
    }
    refreshDisplay();
  }

  // ── Clock button (chief only) ─────────────────────────────────────────────
  if (cfg.type == RemoteType::CHIEF &&
      buttonRead(Button::CLOCK) == ButtonEvent::PRESSED) {
    lastActivityMs = millis();
    hapticPulse(40);
    ApiResult r = apiPressClockButton();
    if (r == ApiResult::OK) {
      setStatus("CLOCK");
      // Don't wait on the WS push to confirm what this remote's own
      // button press just did - see wsOptimisticClockToggle().
      wsOptimisticClockToggle();
      hapticDoubleClick();
    } else {
      setStatus("ERR");
      hapticError();
    }
    refreshDisplay();
  }

  // ── Periodic OTA check ────────────────────────────────────────────────────
  // Always checks on schedule; only applies (flash + reboot) once the device
  // has been free of button activity for OTA_IDLE_THRESHOLD_MS, so an update
  // never interrupts an in-progress competition action.
  if (millis() - lastOtaCheck > OTA_CHECK_INTERVAL_MS) {
    lastOtaCheck = millis();
    bool idle = (millis() - lastActivityMs) > OTA_IDLE_THRESHOLD_MS;
    otaCheckAndApply(cfg, idle);
    refreshDisplay();
  }
}
