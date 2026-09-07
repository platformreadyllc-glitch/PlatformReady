#pragma once
#include <Arduino.h>

enum class ApiResult { OK, NETWORK_ERROR, SERVER_ERROR };

// Registration response. platformId/role are only meaningful when result is
// OK. activated reflects whether the backend currently has this remote
// placed on a platform (vs. sitting unassigned in the pool) — platform/role
// assignment happens via the remote management page, not at setup time.
struct ApiRemoteState {
  ApiResult result = ApiResult::NETWORK_ERROR;
  String platformId;
  String role;
  bool activated = false;
};

void apiInit(const String& backendHost, const String& platformId, const String& remoteId);

// Host/port already parsed out of backendHost by apiInit(). Exposed so other
// modules (e.g. ota.cpp) can talk to the same backend without re-parsing.
const String& apiGetHost();
uint16_t apiGetPort();

// Updates the platformId used to build vote/clock URLs. Needed because a
// live reassignment can arrive over the WS connection (ws_client.cpp) after
// apiInit() has already run — without this, apiCastVote()/
// apiPressClockButton() would keep posting to the remote's old platform
// until the next reboot.
void apiSetPlatformId(const String& platformId);

// Registers this remote with the backend (POST /remotes — not
// platform-scoped, since a fresh remote has no platform yet). Call once
// after network is up. hardwareType is "side" or "chief". Returns OK or
// SERVER_ERROR (treat both as "proceed") along with the backend's current
// platform/role assignment for this remote, if any.
ApiRemoteState apiRegisterRemote(const String& hardwareType);

ApiResult apiCastVote(const String& button);   // "white", "red", "blue", "yellow"
ApiResult apiPressClockButton();
