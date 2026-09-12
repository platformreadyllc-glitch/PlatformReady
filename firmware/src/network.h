#pragma once
#include <Arduino.h>
#include <Client.h>

// Tries Ethernet first (if W5500 cable is present); falls back to WiFi.
// Returns false only if Ethernet DHCP failed with a cable present.
// For WiFi, always returns true (WiFiManager blocks until connected or portal is dismissed).
// dhcpTimeoutMs bounds the blocking Ethernet.begin() DHCP negotiation -
// defaults to a patient 10s for the one-time boot call; the runtime
// reclaim path (main.cpp's loop()) passes a shorter value instead, since
// blocking the whole loop() for up to 10s on every periodic retry would
// be a real responsiveness regression (missed button presses, stalled WS
// heartbeat) if DHCP happens to be unavailable on that link.
bool networkTryEthernet(unsigned long dhcpTimeoutMs = 10000);

// Raw Ethernet.linkStatus() read, independent of which transport is
// currently active - safe to call any time after the first
// networkTryEthernet() call, including while running on WiFi (e.g. to
// notice a cable replug). Always false when built with -DSKIP_ETHERNET.
bool networkEthernetLinkPresent();

// Configures the WiFi radio's power/reconnect behavior. Safe to call
// regardless of current transport - does not touch which transport is
// active (see networkFallbackToWiFi() for that).
bool networkBeginWiFi();

// Runtime-only: switches the active transport to WiFi (flips
// networkIsEthernet() to false). Called when the Ethernet link is lost
// mid-operation and the device needs to fail over - never called at boot.
bool networkFallbackToWiFi();

// Runtime-only: kicks off a non-interactive WiFi association attempt
// (bare WiFi.begin(), using NVS-persisted credentials) as part of the
// same fallback transition. Non-blocking - does not wait for the
// connection to complete.
bool networkAssociateWiFiNonInteractive();

bool networkIsEthernet();
bool networkConnected();
String networkLocalIP();

// Returns a fresh Client instance for one HTTP request.
// Caller is responsible for calling stop() when done.
// Ethernet path: EthernetClient; WiFi path: WiFiClient.
// The returned pointer is valid until the next call to networkNewClient()
// or until the returned client's stop() is called.
// NOTE: not thread-safe; only call from loop().
Client* networkNewClient();

// Long-lived Client instances dedicated to the persistent WS connection
// (ws_network_client.cpp), one per transport. Unlike networkNewClient(),
// these are NOT reset to a fresh object per call - a WS session needs one
// stable underlying socket for as long as it's connected. Callers should
// pin whichever one they get for the life of a given TCP session rather
// than re-fetching per read/write call, so a mid-session transport flip
// (see networkIsEthernet()) can't split one connection's calls across two
// different sockets.
Client* networkEthernetWsClient();
Client* networkWiFiWsClient();
