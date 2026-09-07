#include "ws_client.h"
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

static RefereeVotes g_votes;
static bool g_votesChanged = false;

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
  } else if (strcmp(msgType, "votes") == 0) {
    const char* left  = doc["votes"]["left"];
    const char* right = doc["votes"]["right"];
    const char* chief = doc["votes"]["chief"];
    g_votes.left    = left ? left : "";
    g_votes.right   = right ? right : "";
    g_votes.chief   = chief ? chief : "";
    g_votesChanged  = true;
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

bool wsPollAssignmentChange(String& platformId, String& role) {
  if (!g_pendingAssignment.pending) return false;
  platformId = g_pendingAssignment.platformId;
  role       = g_pendingAssignment.role;
  g_pendingAssignment.pending = false;
  return true;
}

bool wsPollVotesChange(RefereeVotes& votes) {
  if (!g_votesChanged) return false;
  votes = g_votes;
  g_votesChanged = false;
  return true;
}
