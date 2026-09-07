#include "display.h"
#include "pins.h"
#include <Wire.h>
#include <U8g2lib.h>

// Most 128x64 I2C OLEDs use SSD1306. If yours uses SH1106, replace with:
//   U8G2_SH1106_128X64_NONAME_F_HW_I2C
static U8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2(
    U8G2_R2, U8X8_PIN_NONE, DISPLAY_SCL, DISPLAY_SDA);

static bool g_displayPresent = false;

static uint8_t g_displayAddr = 0x3C;

void displayInit() {
  delay(100);  // let display power rail stabilise
  Wire.begin(DISPLAY_SDA, DISPLAY_SCL);

  for (uint8_t addr : {0x3C, 0x3D}) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      g_displayPresent = true;
      g_displayAddr    = addr;
      Serial.printf("[display] found at 0x%02X\n", addr);
      break;
    }
  }

  if (!g_displayPresent) {
    Serial.println("[display] not found on 0x3C or 0x3D");
    Wire.end();
    return;
  }

  u8g2.begin();
  u8g2.setFont(u8g2_font_6x10_tf);
}

static void drawHeader(const char* title) {
  u8g2.setFont(u8g2_font_7x13B_tf);
  u8g2.drawStr(0, 13, title);
  u8g2.setFont(u8g2_font_6x10_tf);
}

void displayShowConnecting(const String& serial, const String& type) {
  if (!g_displayPresent) return;
  u8g2.clearBuffer();
  drawHeader("CONNECTING...");
  u8g2.drawStr(0, 32, serial.isEmpty() ? "(unconfigured)" : serial.c_str());
  u8g2.drawStr(0, 46, type.c_str());
  u8g2.sendBuffer();
}

void displayShowConfigEth(const String& ip) {
  if (!g_displayPresent) return;
  u8g2.clearBuffer();
  drawHeader("CONFIG MODE");
  u8g2.drawStr(0, 32, "Open browser:");
  String url = "http://" + ip;
  u8g2.drawStr(0, 46, url.c_str());
  u8g2.sendBuffer();
}

void displayShowActive(const String& platformId, const String& role, const String& status) {
  if (!g_displayPresent) return;
  u8g2.clearBuffer();
  // platformId is empty until this remote has been assigned to a platform
  // via the remote management page — show a friendly placeholder instead
  // of a bare " - ".
  String hdr = platformId.isEmpty() ? "Unassigned" : (platformId + " - " + role);
  u8g2.setFont(u8g2_font_6x10_tf);
  u8g2.drawStr(0, 10, hdr.c_str());
  // No divider — this is the main in-operation screen, so the reclaimed
  // space goes to a bigger, bolder status word (the primary thing a
  // referee glances at). Most status words are short (READY, WHITE, ERR,
  // CLOCK, ...) and fit the big font, but "CONNECTING" (shown once at
  // boot) doesn't — measure and fall back to a smaller bold font rather
  // than run text off the right edge.
  u8g2.setFont(u8g2_font_logisoso22_tf);
  if (u8g2.getStrWidth(status.c_str()) <= 128) {
    u8g2.drawStr(0, 44, status.c_str());
  } else {
    u8g2.setFont(u8g2_font_9x18B_tf);
    u8g2.drawStr(0, 40, status.c_str());
  }
  u8g2.sendBuffer();
}

// Formats seconds as "M:SS" (no leading zero on minutes - clocks here
// range from a 60s attempt up to a 20min break, never triple-digit
// minutes). Negative input (shouldn't happen - backend clamps to 0)
// still renders sensibly rather than a garbled negative string.
static String formatClock(float remainingSeconds) {
  if (remainingSeconds < 0) remainingSeconds = 0;
  int totalSeconds = (int)(remainingSeconds + 0.5f);
  int minutes = totalSeconds / 60;
  int seconds = totalSeconds % 60;
  char buf[8];
  snprintf(buf, sizeof(buf), "%d:%02d", minutes, seconds);
  return String(buf);
}

// One referee's circle: a ring (single line = not voted yet, concentric
// double line = voted but not yet revealed), and once revealed a
// hand-drawn checkmark (white/good) or X with the infraction letter below
// (no font here has check/X glyphs - confirmed against u8g2's font
// tables, all Latin-1-only). No role label above it — removed per user
// feedback to free up vertical space.
static void drawScoreColumn(int centerX, const ScoreVote& vote) {
  const int cy = 13;
  const int r  = 10;

  u8g2.drawCircle(centerX, cy, r);

  switch (vote.state) {
    case ScoreVoteState::EMPTY:
      break;
    case ScoreVoteState::HIDDEN:
      u8g2.drawCircle(centerX, cy, r - 1);
      break;
    case ScoreVoteState::REVEALED:
      if (vote.button == "white") {
        u8g2.drawLine(centerX - 5, cy, centerX - 1, cy + 5);
        u8g2.drawLine(centerX - 1, cy + 5, centerX + 6, cy - 6);
      } else {
        u8g2.drawLine(centerX - 6, cy - 6, centerX + 6, cy + 6);
        u8g2.drawLine(centerX - 6, cy + 6, centerX + 6, cy - 6);
        char letter = 'R';
        if (vote.button == "blue") letter = 'B';
        else if (vote.button == "yellow") letter = 'Y';
        char buf[2] = { letter, '\0' };
        u8g2.setFont(u8g2_font_6x10_tf);
        u8g2.drawStr(centerX - u8g2.getStrWidth(buf) / 2, 32, buf);
      }
      break;
  }
}

// The panel is physically two-color (confirmed on hardware: with this
// project's U8G2_R2 rotation, the top ~48 rows render on the blue segment,
// the bottom ~16 on yellow) - live/frequently-changing info (votes, clock)
// stays in the blue area, general/status info in the yellow strip at the
// bottom, matching the real scoring page's own vote-circles-above-clock
// layout.
void displayShowScoreboard(const String& status, const ScoreVote& left,
                            const ScoreVote& chief, const ScoreVote& right,
                            float clockRemaining) {
  if (!g_displayPresent) return;
  u8g2.clearBuffer();

  drawScoreColumn(21, left);
  drawScoreColumn(64, chief);
  drawScoreColumn(107, right);

  u8g2.setFont(u8g2_font_9x18B_tf);
  String clockStr = formatClock(clockRemaining);
  u8g2.drawStr((128 - u8g2.getStrWidth(clockStr.c_str())) / 2, 47, clockStr.c_str());

  u8g2.setFont(u8g2_font_6x10_tf);
  u8g2.drawStr((128 - u8g2.getStrWidth(status.c_str())) / 2, 58, status.c_str());

  u8g2.sendBuffer();
}

void displayShowError(const String& msg) {
  if (!g_displayPresent) return;
  u8g2.clearBuffer();
  drawHeader("ERROR");
  u8g2.drawStr(0, 32, msg.c_str());
  u8g2.sendBuffer();
}

void displayShowOtaChecking() {
  if (!g_displayPresent) return;
  u8g2.clearBuffer();
  drawHeader("UPDATE");
  u8g2.drawStr(0, 32, "Checking for updates...");
  u8g2.sendBuffer();
}

void displayShowOtaUpdating(int frame) {
  if (!g_displayPresent) return;
  u8g2.clearBuffer();
  drawHeader("UPDATE");
  String dots;
  for (int i = 0; i < (frame % 4); i++) dots += '.';
  u8g2.drawStr(0, 32, ("Update in progress" + dots).c_str());
  u8g2.drawStr(0, 46, "Do not power off");
  u8g2.sendBuffer();
}

void displayShowOtaFailed(const String& reason) {
  if (!g_displayPresent) return;
  u8g2.clearBuffer();
  drawHeader("UPDATE");
  u8g2.drawStr(0, 32, "Update failed");
  // Truncate to roughly what fits on one 128px-wide line at this font.
  String line = reason.substring(0, 21);
  u8g2.drawStr(0, 46, line.c_str());
  u8g2.sendBuffer();
}

void displayShowOtaSuccess(int frame) {
  if (!g_displayPresent) return;
  u8g2.clearBuffer();
  drawHeader("UPDATE");
  u8g2.drawStr(0, 32, "Update success");
  String dots;
  for (int i = 0; i < (frame % 4); i++) dots += '.';
  u8g2.drawStr(0, 46, ("Restarting" + dots).c_str());
  u8g2.sendBuffer();
}
