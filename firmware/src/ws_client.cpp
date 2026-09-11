#include "ws_client.h"
#include "scoreboard.h"
#include "api.h"
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <string.h>

// WebSocketsClient manages its own internal WiFiClient and doesn't accept
// an injected generic Client* the way ArduinoHttpClient's HttpClient does
// (see network.cpp's networkNewClient()) - so, like OTA before it got that
// treatment, this connection is WiFi-only. Non-issue today: Ethernet is
// -DSKIP_ETHERNET'd off. See firmware/README.md.
static WebSocketsClient webSocket;
static bool g_started = false;

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

void wsInit(const String& remoteId) {
  String url = "/esp32-ws?remoteId=" + remoteId;
  webSocket.begin(apiGetHost(), apiGetPort(), url);
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

void wsNotifyTransportChanged() {
  if (!g_started) return;
  // WebSocketsClient::loop() reconnects immediately (not after its usual
  // setReconnectInterval() throttle) once already-connected, and always
  // constructs a fresh underlying network client on reconnect - so a
  // plain disconnect() here is all that's needed to make it pick up
  // whichever transport is now active, once the WEBSOCKETS_NETWORK_TYPE=
  // NETWORK_CUSTOM wrapper (ws_network_client.cpp) lands and makes that
  // client transport-aware. Until then this is WiFi-only regardless (see
  // the comment above), so calling this just forces a prompt reconnect
  // over the same transport - still a real improvement (faster recovery
  // on a network event) but not yet the actual transport switch.
  webSocket.disconnect();
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
