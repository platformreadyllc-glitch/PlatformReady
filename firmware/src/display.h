#pragma once
#include <Arduino.h>

void displayInit();
void displayShowConnecting(const String& serial, const String& type);
void displayShowConfigEth(const String& ip);
void displayShowActive(const String& platformId, const String& role, const String& status);
void displayShowError(const String& msg);

// Mini-scoreboard, shown instead of displayShowActive() once a remote is
// assigned to a platform (see main.cpp's refreshDisplay()). Deliberately
// decoupled from ws_client.h's own (richer) state types so display.cpp
// stays a dependency-free leaf module — main.cpp translates.
enum class ScoreVoteState { EMPTY, HIDDEN, REVEALED };

struct ScoreVote {
  ScoreVoteState state = ScoreVoteState::EMPTY;
  String button;  // meaningful only when state == REVEALED
};

void displayShowScoreboard(const String& status, const ScoreVote& left,
                            const ScoreVote& chief, const ScoreVote& right,
                            float clockRemaining, bool isEthernet);

// OTA update status screens (see ota.cpp).
void displayShowOtaChecking();
// `frame` cycles a trailing "..." animation (0-3 dots) so the screen visibly
// updates during the otherwise-silent download/restart wait.
void displayShowOtaUpdating(int frame);
void displayShowOtaFailed(const String& reason);
void displayShowOtaSuccess(int frame);
