#pragma once
#include <Arduino.h>

void displayInit();
void displayShowConnecting(const String& serial, const String& type);
void displayShowConfigEth(const String& ip);
void displayShowActive(const String& platformId, const String& role, const String& status);
void displayShowError(const String& msg);

// OTA update status screens (see ota.cpp).
void displayShowOtaChecking();
// `frame` cycles a trailing "..." animation (0-3 dots) so the screen visibly
// updates during the otherwise-silent download/restart wait.
void displayShowOtaUpdating(int frame);
void displayShowOtaFailed(const String& reason);
void displayShowOtaSuccess(int frame);
