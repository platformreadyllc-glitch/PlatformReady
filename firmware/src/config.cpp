#include "config.h"
#include <Preferences.h>

static Preferences prefs;

bool configLoad(RemoteConfig& out) {
  prefs.begin("remote", true);
  out.configured  = prefs.getBool("ok", false);
  out.serial      = prefs.getString("serial", "");
  out.type        = prefs.getInt("type", 0) == 1 ? RemoteType::CHIEF : RemoteType::SIDE;
  out.backendHost = prefs.getString("host", "");
  out.platformId  = prefs.getString("platformId", "");
  out.role        = prefs.getString("role", "");
  prefs.end();
  return out.configured;
}

void configSave(const RemoteConfig& cfg) {
  prefs.begin("remote", false);
  prefs.putBool("ok", true);
  prefs.putString("serial", cfg.serial);
  prefs.putInt("type", cfg.type == RemoteType::CHIEF ? 1 : 0);
  prefs.putString("host", cfg.backendHost);
  prefs.putString("platformId", cfg.platformId);
  prefs.putString("role", cfg.role);
  prefs.end();
}

void configClear() {
  prefs.begin("remote", false);
  prefs.clear();
  prefs.end();
}
