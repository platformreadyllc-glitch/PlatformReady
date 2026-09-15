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

// Temporary debugging tool for the WS-over-Ethernet "connects once, then
// stuck disconnected forever" bug - reported over REST (which keeps
// working even while the WS connection is stuck), so it's observable
// throughout a stuck period rather than only at the last successful WS
// connect. Fire-and-forget: result isn't checked by callers. Remove once
// that bug is confirmed fixed and this stops earning its keep.
void apiReportDiagnostics(uint32_t freeHeap, unsigned long uptimeMs, bool wsConnectedLocally);

// TEMPORARY - instrumentation for the "Ethernet WS drops, and reconnecting
// afterward sometimes silently fails for 30+s before one attempt lands"
// investigation. Unlike apiReportDiagnostics() above (a periodic snapshot),
// this is a one-shot event report - called directly from
// ws_network_client.cpp around every raw connect()/teardown attempt on the
// WS socket, success or failure, so the backend log can see attempts that
// never make it to a real WS handshake (invisible to the backend
// otherwise). Same REST channel, same fire-and-forget contract as
// apiReportDiagnostics(). Remove alongside the rest of this instrumentation
// once the root cause is found.
void apiReportEvent(const String& tag, const String& detail);
