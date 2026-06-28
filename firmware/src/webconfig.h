#pragma once
#include "config.h"

// Serves a configuration web page over Ethernet (port 80).
// Blocks until the user submits the form, saves to NVS, then restarts the ESP32.
// Call only when networkIsEthernet() is true and config is incomplete.
void webConfigRunEthernet(RemoteConfig& cfg);
