#include "ws_client.h"
#include "scoreboard.h"
#include "api.h"
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <string.h>

// Routed through WEBSOCKETS_NETWORK_TYPE=NETWORK_CUSTOM (platformio.ini) +
// ws_network_client.cpp, so this connection follows whichever transport
// network.cpp's networkIsEthernet() currently reports, same as REST/OTA
// (networkNewClient()) - unlike the plain default build, which hardcodes
// a WiFiClient internally.
static WebSocketsClient webSocket;
static bool g_started = false;
// Set once by wsInit(), reused by wsNotifyTransportChanged() to rebuild
// the URL (the ?transport= query param needs to change on every runtime
// transport switch, not just at initial connect).
static String g_remoteId;

static String wsUrl(const String& remoteId, bool isEthernet) {
  return "/esp32-ws?remoteId=" + remoteId +
         "&transport=" + (isEthernet ? "ethernet" : "wifi");
}

struct PendingAssignment {
  bool pending = false;
  String platformId;
  String role;
};
static PendingAssignment g_pendingAssignment;

// Raw per-role vote strings as last received from the backend (empty =
// no vote cast), and the wall-clock instant (millis(), 0 = unset) all
// three most recently became simultaneously non-empty. Pure inputs to the
// scoreboard.* derivation, not display-ready state.
struct RawVotes {
  String left;
  String right;
  String chief;
};
static RawVotes g_rawVotes;
static unsigned long g_completeSince = 0;

// g_clock.remaining holds the value as of the last push, not "right now" -
// the backend only pushes ~once/sec (while running). g_clockAnchorMs is the
// millis() this anchor was captured at; wsGetScoreboard() interpolates the
// live value from there, matching the frontend (usePlatformState.ts).
static PlatformClockDisplay g_clock;
static unsigned long g_clockAnchorMs = 0;

static bool allVoted() {
  return !g_rawVotes.left.isEmpty() && !g_rawVotes.right.isEmpty() &&
         !g_rawVotes.chief.isEmpty();
}

static void handleTextFrame(uint8_t* payload, size_t length) {
  JsonDocument doc;
  if (deserializeJson(doc, payload, length) != DeserializationError::Ok) {
    Serial.println("[ws] bad json");
    return;
  }

  const char* msgType = doc["type"];
  if (!msgType) return;

  if (strcmp(msgType, "assignment") == 0) {
    const char* platformId = doc["platformId"];
    const char* role       = doc["role"];
    g_pendingAssignment.platformId = platformId ? platformId : "";
    g_pendingAssignment.role       = role ? role : "";
    g_pendingAssignment.pending    = true;
    Serial.printf("[ws] assignment: platform=%s role=%s\n",
                   g_pendingAssignment.platformId.c_str(),
                   g_pendingAssignment.role.c_str());
  } else if (strcmp(msgType, "state") == 0) {
    const char* left  = doc["votes"]["left"];
    const char* right = doc["votes"]["right"];
    const char* chief = doc["votes"]["chief"];
    g_rawVotes.left  = left ? left : "";
    g_rawVotes.right = right ? right : "";
    g_rawVotes.chief = chief ? chief : "";
    g_completeSince =
        scoreboardUpdateCompleteSince(g_completeSince, allVoted(), millis());

    const char* clockMode  = doc["clock"]["mode"];
    const char* clockState = doc["clock"]["state"];
    g_clock.mode      = clockMode ? clockMode : "";
    g_clock.state     = clockState ? clockState : "";
    g_clock.remaining = doc["clock"]["remaining"] | 0.0f;
    g_clock.duration  = doc["clock"]["duration"]  | 0.0f;
    g_clockAnchorMs   = millis();
  }
}

static void wsEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.println("[ws] connected");
      break;
    case WStype_DISCONNECTED:
      Serial.println("[ws] disconnected");
      break;
    case WStype_TEXT:
      handleTextFrame(payload, length);
      break;
    default:
      break;
  }
}

void wsInit(const String& remoteId, bool isEthernet) {
  g_remoteId = remoteId;
  webSocket.begin(apiGetHost(), apiGetPort(), wsUrl(remoteId, isEthernet));
  webSocket.onEvent(wsEvent);
  webSocket.setReconnectInterval(5000);
  // The backend's own 2s ping keeps its liveness view current regardless;
  // this is purely for the client's own connection to notice a dead
  // backend and cycle instead of hanging silently.
  webSocket.enableHeartbeat(15000, 3000, 2);
  g_started = true;
}

void wsLoop() {
  if (!g_started) return;
  webSocket.loop();
}

void wsNotifyTransportChanged(bool isEthernet) {
  if (!g_started) return;
  // disconnect() first properly tears down any live connection (stops and
  // deletes the underlying wrapper) before begin() below resets its tcp
  // pointer to NULL again - calling begin() directly on a live connection
  // would otherwise leak the old wrapper instead of freeing it. begin()
  // only touches _host/_port/the connection state, not the event
  // callback/reconnect-interval/heartbeat config set above, so those don't
  // need to be reapplied.
  webSocket.disconnect();
  webSocket.begin(apiGetHost(), apiGetPort(), wsUrl(g_remoteId, isEthernet));
}

bool wsPollAssignmentChange(String& platformId, String& role) {
  if (!g_pendingAssignment.pending) return false;
  platformId = g_pendingAssignment.platformId;
  role       = g_pendingAssignment.role;
  g_pendingAssignment.pending = false;
  return true;
}

static RefereeVoteDisplay deriveVoteDisplay(const String& raw) {
  RefereeVoteDisplay d;
  RevealPhase phase =
      scoreboardRevealPhase(!raw.isEmpty(), g_completeSince, millis());
  switch (phase) {
    case RevealPhase::NOT_VOTED:
      d.state = VoteDisplayState::NOT_VOTED;
      break;
    case RevealPhase::HIDDEN:
      d.state = VoteDisplayState::HIDDEN;
      break;
    case RevealPhase::REVEALED:
      d.state  = VoteDisplayState::REVEALED;
      d.button = raw;
      break;
  }
  return d;
}

ScoreboardState wsGetScoreboard() {
  ScoreboardState s;
  s.left  = deriveVoteDisplay(g_rawVotes.left);
  s.right = deriveVoteDisplay(g_rawVotes.right);
  s.chief = deriveVoteDisplay(g_rawVotes.chief);

  s.clock = g_clock;
  s.clock.remaining = scoreboardInterpolateClock(
      g_clock.remaining, g_clockAnchorMs, millis(), g_clock.state == "RUNNING");
  return s;
}

void wsOptimisticClockToggle() {
  ClockToggle t = scoreboardToggleClock(g_clock.state == "RUNNING",
                                        g_clock.duration);
  if (!t.changed) return;  // no real clock data yet - let the push drive it
  g_clock.state     = t.running ? "RUNNING" : "IDLE";
  g_clock.remaining = t.remaining;
  g_clockAnchorMs   = millis();
}
