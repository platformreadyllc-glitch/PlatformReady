#include "host_port.h"
#include <cstdlib>

static bool stripPrefix(std::string& s, const std::string& prefix) {
  if (s.compare(0, prefix.size(), prefix) == 0) {
    s = s.substr(prefix.size());
    return true;
  }
  return false;
}

HostPort parseHostPort(const std::string& url) {
  std::string h = url;
  if (!stripPrefix(h, "http://")) {
    stripPrefix(h, "https://");
  }

  HostPort result;
  size_t colonIdx = h.find_last_of(':');
  if (colonIdx != std::string::npos) {
    result.host = h.substr(0, colonIdx);
    result.port = static_cast<uint16_t>(atoi(h.substr(colonIdx + 1).c_str()));
  } else {
    result.host = h;
    result.port = 80;
  }
  return result;
}
