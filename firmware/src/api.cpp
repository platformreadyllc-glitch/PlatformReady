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
  // Read and discard the response body so the connection closes cleanly
  http.responseBody();
  http.stop();

  return (code >= 200 && code < 300) ? ApiResult::OK : ApiResult::SERVER_ERROR;
}

ApiResult apiRegisterRemote(const String& role) {
  JsonDocument doc;
  doc["remoteId"]     = g_remoteId;
  doc["role"]         = role;
  doc["hasVibration"] = true;
  doc["hasDisplay"]   = true;
  // Register as spare so we don't conflict with the kb-* active slots.
  // A frontend remote-management page can deactivate a kb-* remote and
  // activate this one via the substitute endpoint.
  doc["isSpare"] = true;
  doc["active"]  = false;
  String body;
  serializeJson(doc, body);
  return post("/platforms/" + g_platformId + "/remotes", body);
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
