#pragma once
#include <Arduino.h>
#include <Client.h>

// Tries Ethernet first (if W5500 cable is present); falls back to WiFi.
// Returns false only if Ethernet DHCP failed with a cable present.
// For WiFi, always returns true (WiFiManager blocks until connected or portal is dismissed).
bool networkTryEthernet();

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
