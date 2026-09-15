#pragma once

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
