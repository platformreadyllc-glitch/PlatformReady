#pragma once

// Pure runtime Ethernet<->WiFi transport-switch decision logic, deliberately
// free of any Arduino/ESP32 dependency so it can be host-unit-tested (see
// firmware/test/). Time is passed in as a millis()-style value rather than
// read here. main.cpp's loop() owns the Arduino-facing glue: reading
// Ethernet.linkStatus(), calling networkFallbackToWiFi()/networkTryEthernet()
// in response to the returned action, and holding the in/out state below
// across calls (module-static locals in main.cpp, not this file - this file
// has no state of its own, matching scoreboard.h's style).
//
// Only decides the runtime-loss/recovery transition - the initial boot-time
// choice (networkTryEthernet() then WiFi if that fails) is separate, in
// main.cpp's setup(), and never goes through here.

enum class TransportAction { STAY, SWITCH_TO_WIFI, SWITCH_TO_ETHERNET };

// Called every loop() tick with the current transport and a fresh raw
// Ethernet.linkStatus() read.
//
// `lastLinkUp`/`linkStableSinceMs` (in/out): debounces link flicker - a raw
// reading only counts once it's held steady for LINK_DEBOUNCE_MS, so a
// marginal/bouncing cable doesn't thrash the transport back and forth.
// Caller holds these across calls; any consistent initial values work (an
// apparent edge on the very first call just starts the debounce window,
// which is harmless).
//
// `lastEthRecheckMs` (in/out): rate-limits SWITCH_TO_ETHERNET signals to
// once per ETH_RECHECK_INTERVAL_MS while on the WiFi fallback - unlike the
// link-status read itself (cheap, local SPI), actually acting on this
// signal means a real Ethernet.begin()/DHCP attempt (a real network
// exchange), so re-signaling every tick would be wasteful. Updated as soon
// as SWITCH_TO_ETHERNET is returned, regardless of whether the caller's
// subsequent real attempt succeeds - a failed attempt still shouldn't be
// retried faster than this interval.
TransportAction transportDecide(bool currentlyEthernet,
                                 bool ethernetLinkUp,
                                 bool& lastLinkUp,
                                 unsigned long& linkStableSinceMs,
                                 unsigned long& lastEthRecheckMs,
                                 unsigned long nowMs);
