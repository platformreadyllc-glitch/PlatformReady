#pragma once

#include <Arduino.h>

void hapticInit();
void hapticPulse(int durationMs = 50);
void hapticDoubleClick();
void hapticError();

// TEMPORARY - testing whether the motor's current draw is correlated with
// the Ethernet WS drops (a possible brownout on a shared supply rail on
// this prototype board). Returns the millis() timestamp the motor was last
// driven HIGH, 0 if never - callers compute their own "how long ago" from
// this rather than this module tracking elapsed time itself. Remove
// alongside the rest of this instrumentation once the root cause is found.
unsigned long hapticLastFiredMs();

// TEMPORARY - shared by every WS-drop instrumentation call site (ws_client.cpp,
// ws_network_client.cpp) so they all report the same " msSinceHaptic=<ms>"/
// " msSinceHaptic=never" suffix. Remove alongside the rest of this
// instrumentation once the root cause is found.
String hapticDetailSuffix();
