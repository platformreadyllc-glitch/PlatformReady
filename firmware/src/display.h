#pragma once
#include <Arduino.h>

void displayInit();
void displayShowConnecting(const String& serial, const String& type);
void displayShowConfigEth(const String& ip);
void displayShowActive(const String& platformId, const String& role, const String& status);
void displayShowError(const String& msg);

// OTA update status screens (see ota.cpp).
void displayShowOtaChecking();
void displayShowOtaUpdating();
void displayShowOtaFailed(const String& reason);
void displayShowOtaSuccess();
