#pragma once

// Task-watchdog safety net: if the main loop task stops making real progress
// for this long, the chip panics and reboots — converting a silent hang
// (which OTA's crash-loop rollback can't see, since it relies on the device
// actually rebooting to detect a bad update) into a detected reset that the
// existing boot-attempt-counter rollback can then recover from
// automatically. See firmware/README.md.
//
// Chosen from a full inventory of every blocking call in this codebase:
// HTTP timeouts (5-10s), Ethernet.begin() (10s), and the OTA download's own
// 15s stall-abort all comfortably fit under this with normal per-iteration
// feeding. The two genuinely indefinite waits (the Ethernet config page's
// while(true), and WiFiManager's up-to-300s portal) are explicitly exempted
// via watchdogPause()/watchdogResume() rather than covered by this timeout.
#define WATCHDOG_TIMEOUT_SECONDS 30

// Call once, early in setup(), before anything that could conceivably hang.
void watchdogInit();

// Call periodically — every loop() iteration, plus inside any other
// individually long-running-but-bounded loop that does real work (e.g. the
// OTA download loop) — to keep the watchdog from firing.
void watchdogFeed();

// Temporarily unsubscribe the current task from the watchdog. Use around a
// genuinely indefinite, intentional wait (e.g. waiting for a human to submit
// a config form) that would otherwise false-trigger it. Must be paired with
// watchdogResume() unless the code path always ends in a reboot anyway (the
// watchdog gets reinitialized fresh on the next boot regardless).
void watchdogPause();

// Re-subscribe the current task after a watchdogPause().
void watchdogResume();
