#include "api.h"
#include "network.h"
#include <ArduinoHttpClient.h>
#include <ArduinoJson.h>

static String g_host;
static uint16_t g_port;
static String g_platformId;
static String g_remoteId;

static void parseHostPort(const String& url) {
  String h = url;
  if (h.startsWith("http://"))  h = h.substring(7);
  if (h.startsWith("https://")) h = h.substring(8);
  int colonIdx = h.lastIndexOf(':');
  if (colonIdx >= 0) {
    g_port = (uint16_t)h.substring(colonIdx + 1).toInt();
    g_host = h.substring(0, colonIdx);
  } else {
    g_host = h;
    g_port = 80;
  }
}

void apiInit(const String& backendHost, const String& platformId, const String& remoteId) {
  parseHostPort(backendHost);
  g_platformId = platformId;
  g_remoteId   = remoteId;
}

static ApiResult post(const String& path, const String& body) {
  Client* cl = networkNewClient();
  HttpClient http(*cl, g_host, g_port);
  http.setTimeout(5000);

  int err = http.post(path, "application/json", body);
  if (err != HTTP_SUCCESS) {
    http.stop();
    return ApiResult::NETWORK_ERROR;
  }

  int code = http.responseStatusCode();
  http.responseBody();
  http.stop();

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
    return ApiResult::NETWORK_ERROR;
  }

  int code = http.responseStatusCode();
  responseOut = http.responseBody();
  http.stop();

  return (code >= 200 && code < 300) ? ApiResult::OK : ApiResult::SERVER_ERROR;
}

ApiResult apiRegisterRemote(const String& role) {
  JsonDocument doc;
  doc["remoteId"]     = g_remoteId;
  doc["role"]         = role;
  doc["hasVibration"] = true;
  doc["hasDisplay"]   = true;
  doc["active"]       = false;
  String body;
  serializeJson(doc, body);

  String response;
  ApiResult result = postWithResponse(
    "/platforms/" + g_platformId + "/remotes", body, response);

  if (result == ApiResult::OK) {
    JsonDocument resp;
    if (deserializeJson(resp, response) == DeserializationError::Ok) {
      const char* assignedPlatformId = resp["platformId"];
      if (assignedPlatformId && g_platformId != assignedPlatformId) {
        Serial.printf("[api] transferred to platform: %s\n", assignedPlatformId);
        g_platformId = assignedPlatformId;
      }
    }
  }

  return result;
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
