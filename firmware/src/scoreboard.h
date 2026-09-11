#pragma once

// Pure mini-scoreboard logic, deliberately free of any Arduino/ESP32
// dependency so it can be host-unit-tested (see firmware/test/). Time is
// passed in as a millis()-style value rather than read here.
// ws_client.cpp and display.cpp own the Arduino-facing glue.

enum class RevealPhase { NOT_VOTED, HIDDEN, REVEALED };

// Tracks the instant all three referees' votes last became simultaneously
// cast - the anchor for the group reveal delay. `prev` of 0 means "not
// currently complete". Returns the updated anchor: set once on the
// incomplete->complete edge, cleared to 0 as soon as votes go incomplete
// again (e.g. the backend's auto-reset).
unsigned long scoreboardUpdateCompleteSince(unsigned long prev,
                                            bool allThreeVoted,
                                            unsigned long nowMs);

// One referee's reveal phase. Empty until they vote (HIDDEN once they
// have), then REVEALED for everyone once all three are in and the ~1s
// reveal delay has elapsed - mirrors the frontend's usePlatformState.ts.
RevealPhase scoreboardRevealPhase(bool voted,
                                  unsigned long completeSinceMs,
                                  unsigned long nowMs);

// Live clock value while running: interpolates down from the last pushed
// anchor (backend only pushes ~1/s), clamped at 0. Returns anchorRemaining
// unchanged when not running.
float scoreboardInterpolateClock(float anchorRemaining,
                                 unsigned long anchorMs,
                                 unsigned long nowMs,
                                 bool running);

// M:SS split, truncating - matches the frontend's formatTime() (Math.floor)
// so a fresh 60s clock reads 0:59 almost immediately rather than sitting
// on 1:00 for most of the first second.
void scoreboardClockParts(float remainingSeconds, int& minutes, int& seconds);

// Optimistic outcome of the chief's own clock-button press, applied before
// the confirming WS push round-trips back: RUNNING<->IDLE toggle, remaining
// resets to `duration`. `changed` is false (leave the display alone, let
// the real push drive it) when duration isn't known yet.
struct ClockToggle {
  bool changed;
  bool running;
  float remaining;
};
ClockToggle scoreboardToggleClock(bool wasRunning, float duration);
