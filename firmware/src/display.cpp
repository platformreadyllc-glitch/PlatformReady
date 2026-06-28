#include "display.h"
#include "pins.h"
#include <U8g2lib.h>

// Most 128x64 I2C OLEDs use SSD1306. If yours uses SH1106, replace with:
//   U8G2_SH1106_128X64_NONAME_F_HW_I2C
static U8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2(
    U8G2_R0, U8X8_PIN_NONE, DISPLAY_SCL, DISPLAY_SDA);

void displayInit() {
  u8g2.begin();
  u8g2.setFont(u8g2_font_6x10_tf);
}

static void drawHeader(const char* title) {
  u8g2.setFont(u8g2_font_7x13B_tf);
  u8g2.drawStr(0, 13, title);
  u8g2.drawHLine(0, 16, 128);
  u8g2.setFont(u8g2_font_6x10_tf);
}

void displayShowConnecting(const String& serial, const String& type) {
  u8g2.clearBuffer();
  drawHeader("CONNECTING...");
  u8g2.drawStr(0, 32, serial.isEmpty() ? "(unconfigured)" : serial.c_str());
  u8g2.drawStr(0, 46, type.c_str());
  u8g2.sendBuffer();
}

void displayShowConfigEth(const String& ip) {
  u8g2.clearBuffer();
  drawHeader("CONFIG MODE");
  u8g2.drawStr(0, 32, "Open browser:");
  String url = "http://" + ip;
  u8g2.drawStr(0, 46, url.c_str());
  u8g2.sendBuffer();
}

void displayShowActive(const String& platformId, const String& role, const String& status) {
  u8g2.clearBuffer();
  String hdr = platformId + " - " + role;
  u8g2.setFont(u8g2_font_6x10_tf);
  u8g2.drawStr(0, 10, hdr.c_str());
  u8g2.drawHLine(0, 13, 128);
  u8g2.setFont(u8g2_font_10x20_tf);
  u8g2.drawStr(0, 40, status.c_str());
  u8g2.sendBuffer();
}

void displayShowError(const String& msg) {
  u8g2.clearBuffer();
  drawHeader("ERROR");
  u8g2.drawStr(0, 32, msg.c_str());
  u8g2.sendBuffer();
}
