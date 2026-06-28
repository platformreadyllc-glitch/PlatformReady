#pragma once
#include <Arduino.h>

enum class RemoteType { SIDE, CHIEF };

struct RemoteConfig {
  String serial;       // e.g. "RL-001"
  RemoteType type;     // SIDE or CHIEF
  String backendHost;  // e.g. "http://192.168.1.100:3000"
  String platformId;   // e.g. "platform-1"
  String role;         // "left", "right", or "chief"
  bool configured;     // false until first successful save
};

bool configLoad(RemoteConfig& out);
void configSave(const RemoteConfig& cfg);
void configClear();
