#include "scoreboard.h"

static const unsigned long REVEAL_DELAY_MS = 1000;

unsigned long scoreboardUpdateCompleteSince(unsigned long prev,
                                            bool allThreeVoted,
                                            unsigned long nowMs) {
  if (!allThreeVoted) return 0;
  return prev == 0 ? nowMs : prev;
}

RevealPhase scoreboardRevealPhase(bool voted,
                                  unsigned long completeSinceMs,
                                  unsigned long nowMs) {
  if (!voted) return RevealPhase::NOT_VOTED;
  bool revealed = completeSinceMs != 0 &&
                  (nowMs - completeSinceMs >= REVEAL_DELAY_MS);
  return revealed ? RevealPhase::REVEALED : RevealPhase::HIDDEN;
}

float scoreboardInterpolateClock(float anchorRemaining,
                                 unsigned long anchorMs,
                                 unsigned long nowMs,
                                 bool running) {
  if (!running) return anchorRemaining;
  float elapsed = (nowMs - anchorMs) / 1000.0f;
  float remaining = anchorRemaining - elapsed;
  return remaining < 0 ? 0.0f : remaining;
}

void scoreboardClockParts(float remainingSeconds, int& minutes, int& seconds) {
  if (remainingSeconds < 0) remainingSeconds = 0;
  int total = (int)remainingSeconds;
  minutes = total / 60;
  seconds = total % 60;
}

ClockToggle scoreboardToggleClock(bool wasRunning, float duration) {
  if (duration <= 0) return {false, wasRunning, duration};
  return {true, !wasRunning, duration};
}
