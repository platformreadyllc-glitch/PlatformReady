#pragma once
#include <Arduino.h>

enum class ApiResult { OK, NETWORK_ERROR, SERVER_ERROR };

void apiInit(const String& backendHost, const String& platformId, const String& remoteId);

// Registers this remote on the platform. Call once after network is up.
// Returns OK or SERVER_ERROR (treat both as "proceed" — 4xx likely means already registered).
ApiResult apiRegisterRemote(const String& role);

ApiResult apiCastVote(const String& button);   // "white", "red", "blue", "yellow"
ApiResult apiPressClockButton();
