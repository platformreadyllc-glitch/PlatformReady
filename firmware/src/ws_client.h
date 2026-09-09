#pragma once
#include <Arduino.h>

// Opens the persistent WS connection to the backend and registers the
// event handler. Call once after a successful registration (main.cpp),
// once remoteId (cfg.serial) is known — see esp-remotes.gateway.ts, which
// validates remoteId at connect time. isEthernet is reported once as a
// `?transport=` query param so the backend/frontend can show which
// network interface this remote is on - purely informational, doesn't
// affect the connection itself (which is WiFi-only regardless, see
// firmware/README.md).
void wsInit(const String& remoteId, bool isEthernet);

// Non-blocking - pumps the WS connection's state machine (connect/
// reconnect, heartbeat, incoming frames). Safe to call every loop()
// iteration even before wsInit() has run (a no-op until then), and
// regardless of WiFi state - the underlying client just keeps retrying its
// own connection on its own schedule.
void wsLoop();

// Returns true and fills platformId/role if a new assignment arrived since
// the last call (and clears the pending flag) - empty strings mean
// "unassigned". False if nothing changed since the last call. Unlike the
// scoreboard state below, this has one-shot side effects at the call site
// (configSave, haptics) so it must fire exactly once per change.
bool wsPollAssignmentChange(String& platformId, String& role);

// Mirrors the main scoring page's own reveal behavior: a referee's circle
// stays empty until they vote, shows an unrevealed ring once they have
// (even before the other two), then all three reveal together ~1s after
// the last of the three votes lands. REVEALED is the only state where
// `button` is meaningful ("white"/"red"/"blue"/"yellow").
enum class VoteDisplayState { NOT_VOTED, HIDDEN, REVEALED };

struct RefereeVoteDisplay {
  VoteDisplayState state = VoteDisplayState::NOT_VOTED;
  String button;
};

// mode: "ACTIVE"/"BREAK", state: "IDLE"/"RUNNING"/"EXPIRED" - mirrors
// PlatformClockSerialized minus the opening-attempts fields, which this
// secondary display deliberately doesn't track.
struct PlatformClockDisplay {
  String mode;
  String state;
  float remaining = 0;
  float duration  = 0;
};

struct ScoreboardState {
  RefereeVoteDisplay left;
  RefereeVoteDisplay right;
  RefereeVoteDisplay chief;
  PlatformClockDisplay clock;
};

// Re-derives and returns the current scoreboard display state (vote
// reveal state per role, plus the latest clock snapshot). A pure read,
// safe to call as often as needed (e.g. every redraw tick) - the reveal
// delay is timed internally against millis(), not tied to any single
// incoming message.
ScoreboardState wsGetScoreboard();

// Call right after this remote's own clock-button press succeeds
// (apiPressClockButton() returns OK), before the WS push confirming it
// has necessarily arrived back - that confirmation is a separate,
// independently-timed round-trip over the network, and waiting on it
// visibly lags a button press on the very device that made it. Mirrors
// the backend's own toggle semantics (handleChiefClockPress): flips
// RUNNING<->IDLE and resets remaining to the last-known duration, using
// data already cached locally from the last real push - the next real
// push (arriving shortly after) just reconfirms the same values.
void wsOptimisticClockToggle();
