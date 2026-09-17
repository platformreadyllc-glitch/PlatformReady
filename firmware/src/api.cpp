#include "api.h"
#include "network.h"
#include "host_port.h"
#include <ArduinoHttpClient.h>
#include <ArduinoJson.h>

static String g_host;
static uint16_t g_port;
static String g_platformId;
static String g_remoteId;

void apiInit(const String& backendHost, const String& platformId, const String& remoteId) {
  HostPort hp = parseHostPort(backendHost.c_str());
  g_host = hp.host.c_str();
  g_port = hp.port;
  g_platformId = platformId;
  g_remoteId   = remoteId;
}

const String& apiGetHost() { return g_host; }
uint16_t apiGetPort() { return g_port; }

void apiSetPlatformId(const String& platformId) { g_platformId = platformId; }

// TEMPORARY - chasing why real vote/clock REST calls sometimes fail (the
// device shows ERR) with no corresponding WS-level event logged at all -
// see apiReportDiagnostics()'s comment for why this is tracked locally
// and reported later rather than immediately. Remove alongside the rest
// of this instrumentation once the root cause is found.
static String g_lastRestError;

static void trackRestFailure(const String& path, int httpErr, int statusCode) {
  if (httpErr != HTTP_SUCCESS) {
    g_lastRestError = path + " httpErr=" + String(httpErr);
  } else if (statusCode < 200 || statusCode >= 300) {
    g_lastRestError = path + " status=" + String(statusCode);
  }
}

static ApiResult post(const String& path, const String& body) {
  Client* cl = networkNewClient();
  HttpClient http(*cl, g_host, g_port);
  http.setTimeout(5000);

  int err = http.post(path, "application/json", body);
  if (err != HTTP_SUCCESS) {
    http.stop();
    trackRestFailure(path, err, 0);
    return ApiResult::NETWORK_ERROR;
  }

  int code = http.responseStatusCode();
  http.responseBody();
  http.stop();
  trackRestFailure(path, HTTP_SUCCESS, code);

  return (code >= 200 && code < 300) ? ApiResult::OK : ApiResult::SERVER_ERROR;
}

// Like post(), but captures the response body into responseOut.
static ApiResult postWithResponse(const String& path, const String& body, String& responseOut) {
  Client* cl = networkNewClient();
  HttpClient http(*cl, g_host, g_port);
  http.setTimeout(5000);

  int err = http.post(path, "application/json", body);
  if (err != HTTP_SUCCESS) {
    http.stop();
    trackRestFailure(path, err, 0);
    return ApiResult::NETWORK_ERROR;
  }

  int code = http.responseStatusCode();
  responseOut = http.responseBody();
  http.stop();
  trackRestFailure(path, HTTP_SUCCESS, code);

  return (code >= 200 && code < 300) ? ApiResult::OK : ApiResult::SERVER_ERROR;
}

ApiRemoteState apiRegisterRemote(const String& hardwareType) {
  JsonDocument doc;
  doc["remoteId"]     = g_remoteId;
  doc["hardwareType"] = hardwareType;
  doc["hasVibration"] = true;
  doc["hasDisplay"]   = true;
  String body;
  serializeJson(doc, body);

  String response;
  ApiRemoteState state;
  state.result = postWithResponse("/remotes", body, response);

  if (state.result == ApiResult::OK) {
    JsonDocument resp;
    if (deserializeJson(resp, response) == DeserializationError::Ok) {
      const char* platformId = resp["platformId"];
      const char* role       = resp["role"];
      if (platformId) {
        state.platformId = platformId;
        state.activated  = true;
        if (g_platformId != platformId) {
          Serial.printf("[api] platform: %s\n", platformId);
          g_platformId = platformId;
        }
      }
      if (role) {
        state.role = role;
      }
    }
  }

  return state;
}

ApiResult apiCastVote(const String& button) {
  JsonDocument doc;
  doc["remoteId"] = g_remoteId;
  doc["button"]   = button;
  String body;
  serializeJson(doc, body);
  return post("/platforms/" + g_platformId + "/vote", body);
}

ApiResult apiPressClockButton() {
  JsonDocument doc;
  doc["remoteId"] = g_remoteId;
  String body;
  serializeJson(doc, body);
  return post("/platforms/" + g_platformId + "/clock", body);
}

void apiReportDiagnostics(uint32_t freeHeap, unsigned long uptimeMs, bool wsConnectedLocally) {
  JsonDocument doc;
  doc["freeHeap"] = freeHeap;
  doc["uptimeMs"] = uptimeMs;
  doc["wsConnectedLocally"] = wsConnectedLocally;
  // Piggybacked rather than reported immediately when it happens: that
  // would need firing another REST call right when the connection just
  // proved it couldn't complete one - exactly the least reliable moment to
  // try. This periodic report already runs regardless of WS/network state
  // (see main.cpp), so it's a robust, if slightly delayed, way to surface
  // a failure that happened between reports.
  if (!g_lastRestError.isEmpty()) {
    doc["lastRestError"] = g_lastRestError;
    g_lastRestError = "";
  }
  String body;
  serializeJson(doc, body);
  post("/remotes/" + g_remoteId + "/diagnostics", body);
}

void apiReportEvent(const String& tag, const String& detail) {
  JsonDocument doc;
  doc["tag"] = tag;
  doc["detail"] = detail;
  String body;
  serializeJson(doc, body);
  post("/remotes/" + g_remoteId + "/event", body);
}
