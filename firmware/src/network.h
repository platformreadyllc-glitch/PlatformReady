#pragma once
#include <Arduino.h>
#include <Client.h>

// Tries Ethernet first (if W5500 cable is present); falls back to WiFi.
// Returns false only if Ethernet DHCP failed with a cable present.
// For WiFi, always returns true (WiFiManager blocks until connected or portal is dismissed).
bool networkTryEthernet();
bool networkBeginWiFi();

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
