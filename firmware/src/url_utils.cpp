#include "url_utils.h"
#include <cstdlib>

std::string urlDecode(const std::string& s) {
  std::string out;
  out.reserve(s.size());
  for (size_t i = 0; i < s.size(); i++) {
    if (s[i] == '+') {
      out += ' ';
    } else if (s[i] == '%' && i + 2 < s.size()) {
      char hex[3] = { s[i + 1], s[i + 2], '\0' };
      out += (char)strtol(hex, nullptr, 16);
      i += 2;
    } else {
      out += s[i];
    }
  }
  return out;
}

std::string formValue(const std::string& body, const std::string& key) {
  std::string search = key + "=";
  size_t start = body.find(search);
  if (start == std::string::npos) return "";
  start += search.size();
  size_t end = body.find('&', start);
  return urlDecode(end == std::string::npos ? body.substr(start) : body.substr(start, end - start));
}
