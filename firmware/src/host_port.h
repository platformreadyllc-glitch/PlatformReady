#pragma once
#include <cstdint>
#include <string>

// Pure URL host/port parsing, deliberately free of any Arduino/ESP32
// dependency so it can be unit tested on the host (see firmware/test/).

struct HostPort {
  std::string host;
  uint16_t port;
};

// Strips a leading "http://" or "https://" and splits "host:port". Defaults
// to port 80 if none is given.
HostPort parseHostPort(const std::string& url);
