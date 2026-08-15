#pragma once
#include <string>

// Pure URL/form-body parsing, deliberately free of any Arduino/ESP32
// dependency so it can be unit tested on the host (see firmware/test/).
// Used by the Ethernet config web server (see network.cpp).

// Decodes application/x-www-form-urlencoded text: '+' -> space, '%XX' -> byte.
std::string urlDecode(const std::string& s);

// Extracts the value of `key` from a "k1=v1&k2=v2" form body, URL-decoded.
// Returns "" if the key isn't present.
std::string formValue(const std::string& body, const std::string& key);
