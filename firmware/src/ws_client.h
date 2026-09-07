#pragma once
#include <Arduino.h>

// Cached last-known votes from the other referees active on this remote's
// platform, pushed by the backend over the WS connection (see
// esp-remotes.gateway.ts). Empty string means "no vote cast" (mirrors the
// backend's null) — consumed by the mini-scoreboard display.
struct RefereeVotes {
  String left;
  String right;
  String chief;
};

// Opens the persistent WS connection to the backend and registers the
// event handler. Call once after a successful registration (main.cpp),
// once remoteId (cfg.serial) is known — see esp-remotes.gateway.ts, which
// validates remoteId at connect time.
void wsInit(const String& remoteId);

// Non-blocking - pumps the WS connection's state machine (connect/
// reconnect, heartbeat, incoming frames). Safe to call every loop()
// iteration even before wsInit() has run (a no-op until then), and
// regardless of WiFi state - the underlying client just keeps retrying its
// own connection on its own schedule.
void wsLoop();

// Returns true and fills platformId/role if a new assignment arrived since
// the last call (and clears the pending flag) - empty strings mean
// "unassigned". False if nothing changed since the last call.
bool wsPollAssignmentChange(String& platformId, String& role);

// Returns true and fills votes if they changed since the last call (and
// clears the pending flag). False if nothing changed since the last call.
bool wsPollVotesChange(RefereeVotes& votes);
