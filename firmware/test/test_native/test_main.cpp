// Host-compiled unit tests for the pure logic pulled out of the firmware's
// Arduino/ESP32-dependent modules. Run with `pio test -e native` from
// firmware/ — no hardware or Arduino framework needed. See
// firmware/platformio.ini's [env:native] and firmware/test/README.md.

#include <unity.h>
#include "../../src/version_compare.h"
#include "../../src/host_port.h"
#include "../../src/url_utils.h"
#include "../../src/scoreboard.h"
#include "../../src/battery_levels.h"
#include "../../src/transport_fsm.h"

void setUp(void) {}
void tearDown(void) {}

// ── otaIsNewer (firmware/src/version_compare.cpp) ───────────────────────────

void test_isNewer_basic_increase(void) {
  TEST_ASSERT_TRUE(otaIsNewer("1.0.1", "1.0.0"));
}

void test_isNewer_equal_is_not_newer(void) {
  TEST_ASSERT_FALSE(otaIsNewer("1.0.0", "1.0.0"));
}

void test_isNewer_older_is_not_newer(void) {
  TEST_ASSERT_FALSE(otaIsNewer("1.0.0", "1.0.1"));
}

void test_isNewer_compares_numerically_not_lexicographically(void) {
  // Would come out backwards under a plain string compare.
  TEST_ASSERT_TRUE(otaIsNewer("1.10.0", "1.9.0"));
  TEST_ASSERT_FALSE(otaIsNewer("1.9.0", "1.10.0"));
}

void test_isNewer_major_version_wins(void) {
  TEST_ASSERT_TRUE(otaIsNewer("2.0.0", "1.99.99"));
}

void test_isNewer_missing_patch_defaults_to_zero(void) {
  TEST_ASSERT_FALSE(otaIsNewer("1.0", "1.0.0"));
  TEST_ASSERT_TRUE(otaIsNewer("1.1", "1.0.5"));
}

// ── parseHostPort (firmware/src/host_port.cpp) ───────────────────────────────

void test_parseHostPort_strips_http_prefix(void) {
  HostPort hp = parseHostPort("http://192.168.1.100:3000");
  TEST_ASSERT_EQUAL_STRING("192.168.1.100", hp.host.c_str());
  TEST_ASSERT_EQUAL_UINT16(3000, hp.port);
}

void test_parseHostPort_strips_https_prefix(void) {
  HostPort hp = parseHostPort("https://example.com:8443");
  TEST_ASSERT_EQUAL_STRING("example.com", hp.host.c_str());
  TEST_ASSERT_EQUAL_UINT16(8443, hp.port);
}

void test_parseHostPort_defaults_port_80(void) {
  HostPort hp = parseHostPort("http://192.168.1.100");
  TEST_ASSERT_EQUAL_STRING("192.168.1.100", hp.host.c_str());
  TEST_ASSERT_EQUAL_UINT16(80, hp.port);
}

void test_parseHostPort_no_scheme(void) {
  HostPort hp = parseHostPort("192.168.1.100:3000");
  TEST_ASSERT_EQUAL_STRING("192.168.1.100", hp.host.c_str());
  TEST_ASSERT_EQUAL_UINT16(3000, hp.port);
}

// ── urlDecode / formValue (firmware/src/url_utils.cpp) ───────────────────────

void test_urlDecode_plus_becomes_space(void) {
  TEST_ASSERT_EQUAL_STRING("hello world", urlDecode("hello+world").c_str());
}

void test_urlDecode_percent_encoding(void) {
  TEST_ASSERT_EQUAL_STRING("a/b", urlDecode("a%2Fb").c_str());
}

void test_formValue_extracts_field(void) {
  std::string body = "serial=RL-001&host=http%3A%2F%2F192.168.1.100&platformId=platform-1";
  TEST_ASSERT_EQUAL_STRING("RL-001", formValue(body, "serial").c_str());
  TEST_ASSERT_EQUAL_STRING("http://192.168.1.100", formValue(body, "host").c_str());
}

void test_formValue_missing_key_returns_empty(void) {
  TEST_ASSERT_EQUAL_STRING("", formValue("a=1&b=2", "c").c_str());
}

void test_formValue_last_field_no_trailing_ampersand(void) {
  TEST_ASSERT_EQUAL_STRING("chief", formValue("role=chief", "role").c_str());
}

// ── scoreboard.cpp: reveal timing ──────────────────────────────────────────

void test_completeSince_sets_on_edge_and_holds(void) {
  // Not complete -> stays 0.
  TEST_ASSERT_EQUAL_UINT32(0, scoreboardUpdateCompleteSince(0, false, 5000));
  // Incomplete -> complete: anchors at now.
  TEST_ASSERT_EQUAL_UINT32(5000, scoreboardUpdateCompleteSince(0, true, 5000));
  // Still complete on a later frame: keeps the original anchor.
  TEST_ASSERT_EQUAL_UINT32(5000, scoreboardUpdateCompleteSince(5000, true, 9000));
  // Back to incomplete (auto-reset): clears.
  TEST_ASSERT_EQUAL_UINT32(0, scoreboardUpdateCompleteSince(5000, false, 9000));
}

void test_revealPhase_not_voted(void) {
  TEST_ASSERT_EQUAL(RevealPhase::NOT_VOTED,
                    scoreboardRevealPhase(false, 0, 1000));
  // Even once the group is complete, an empty slot stays NOT_VOTED.
  TEST_ASSERT_EQUAL(RevealPhase::NOT_VOTED,
                    scoreboardRevealPhase(false, 100, 5000));
}

void test_revealPhase_hidden_until_group_complete(void) {
  // This ref voted but the group isn't complete yet.
  TEST_ASSERT_EQUAL(RevealPhase::HIDDEN,
                    scoreboardRevealPhase(true, 0, 5000));
}

void test_revealPhase_hidden_during_reveal_delay(void) {
  // Group complete at t=5000, now t=5500 - within the 1s delay.
  TEST_ASSERT_EQUAL(RevealPhase::HIDDEN,
                    scoreboardRevealPhase(true, 5000, 5500));
}

void test_revealPhase_revealed_after_delay(void) {
  // Group complete at t=5000, now t=6000 - delay elapsed.
  TEST_ASSERT_EQUAL(RevealPhase::REVEALED,
                    scoreboardRevealPhase(true, 5000, 6000));
  TEST_ASSERT_EQUAL(RevealPhase::REVEALED,
                    scoreboardRevealPhase(true, 5000, 20000));
}

// ── scoreboard.cpp: clock interpolation ────────────────────────────────────

void test_interpolateClock_idle_returns_anchor(void) {
  TEST_ASSERT_EQUAL_FLOAT(42.0f,
                          scoreboardInterpolateClock(42.0f, 1000, 9000, false));
}

void test_interpolateClock_counts_down_while_running(void) {
  // Anchored at 60s @ t=1000; 2.5s later should read ~57.5s.
  TEST_ASSERT_FLOAT_WITHIN(
      0.01f, 57.5f, scoreboardInterpolateClock(60.0f, 1000, 3500, true));
}

void test_interpolateClock_clamps_at_zero(void) {
  TEST_ASSERT_EQUAL_FLOAT(
      0.0f, scoreboardInterpolateClock(2.0f, 1000, 10000, true));
}

// ── scoreboard.cpp: M:SS split (truncating) ────────────────────────────────

void test_clockParts_truncates(void) {
  int m, s;
  scoreboardClockParts(59.99f, m, s);
  TEST_ASSERT_EQUAL_INT(0, m);
  TEST_ASSERT_EQUAL_INT(59, s);  // not rounded up to 1:00

  scoreboardClockParts(125.0f, m, s);
  TEST_ASSERT_EQUAL_INT(2, m);
  TEST_ASSERT_EQUAL_INT(5, s);

  scoreboardClockParts(-3.0f, m, s);
  TEST_ASSERT_EQUAL_INT(0, m);
  TEST_ASSERT_EQUAL_INT(0, s);
}

// ── scoreboard.cpp: optimistic clock toggle ───────────────────────────────

void test_toggleClock_flips_and_resets_to_duration(void) {
  ClockToggle a = scoreboardToggleClock(false, 60.0f);
  TEST_ASSERT_TRUE(a.changed);
  TEST_ASSERT_TRUE(a.running);
  TEST_ASSERT_EQUAL_FLOAT(60.0f, a.remaining);

  ClockToggle b = scoreboardToggleClock(true, 60.0f);
  TEST_ASSERT_TRUE(b.changed);
  TEST_ASSERT_FALSE(b.running);
  TEST_ASSERT_EQUAL_FLOAT(60.0f, b.remaining);
}

void test_toggleClock_noop_without_known_duration(void) {
  ClockToggle t = scoreboardToggleClock(false, 0.0f);
  TEST_ASSERT_FALSE(t.changed);  // no real clock data yet
}

// ── battery_levels.cpp: voltage-to-level lookup ────────────────────────────

void test_batteryLevel_full_at_and_above_threshold(void) {
  TEST_ASSERT_EQUAL(BatteryLevel::BATT_FULL, batteryLevelFromVoltage(3.9f));
  TEST_ASSERT_EQUAL(BatteryLevel::BATT_FULL, batteryLevelFromVoltage(4.2f));
}

void test_batteryLevel_medium_between_thresholds(void) {
  TEST_ASSERT_EQUAL(BatteryLevel::BATT_MEDIUM, batteryLevelFromVoltage(3.6f));
  TEST_ASSERT_EQUAL(BatteryLevel::BATT_MEDIUM, batteryLevelFromVoltage(3.75f));
  // Just under the FULL threshold - still MEDIUM, not FULL.
  TEST_ASSERT_EQUAL(BatteryLevel::BATT_MEDIUM, batteryLevelFromVoltage(3.89f));
}

void test_batteryLevel_low_below_medium_threshold(void) {
  TEST_ASSERT_EQUAL(BatteryLevel::BATT_LOW, batteryLevelFromVoltage(3.59f));
  TEST_ASSERT_EQUAL(BatteryLevel::BATT_LOW, batteryLevelFromVoltage(3.0f));
  TEST_ASSERT_EQUAL(BatteryLevel::BATT_LOW, batteryLevelFromVoltage(0.0f));
}

// ── transport_fsm.cpp: runtime Ethernet<->WiFi switch decision ────────────

void test_transportDecide_debounces_flicker_no_switch(void) {
  bool lastLinkUp = true;
  unsigned long stableSince = 0, lastRecheck = 0;

  // Link drops at t=1000 - not stable yet, no switch.
  TEST_ASSERT_EQUAL(TransportAction::STAY,
                    transportDecide(true, false, lastLinkUp, stableSince,
                                    lastRecheck, 1000));
  // Still within the debounce window.
  TEST_ASSERT_EQUAL(TransportAction::STAY,
                    transportDecide(true, false, lastLinkUp, stableSince,
                                    lastRecheck, 1500));
  // Link recovers before the debounce window elapsed - flicker suppressed.
  TEST_ASSERT_EQUAL(TransportAction::STAY,
                    transportDecide(true, true, lastLinkUp, stableSince,
                                    lastRecheck, 1900));
  TEST_ASSERT_TRUE(lastLinkUp);
}

void test_transportDecide_switch_to_wifi_after_stable_loss(void) {
  bool lastLinkUp = true;
  unsigned long stableSince = 0, lastRecheck = 0;

  TEST_ASSERT_EQUAL(TransportAction::STAY,
                    transportDecide(true, false, lastLinkUp, stableSince,
                                    lastRecheck, 1000));
  // 1000ms later, still down - debounce elapsed.
  TEST_ASSERT_EQUAL(TransportAction::SWITCH_TO_WIFI,
                    transportDecide(true, false, lastLinkUp, stableSince,
                                    lastRecheck, 2000));
}

void test_transportDecide_switch_to_ethernet_after_stable_link_and_rate_limit(void) {
  bool lastLinkUp = false;
  unsigned long stableSince = 0, lastRecheck = 0;

  // Link comes up at t=1000 - not stable yet.
  TEST_ASSERT_EQUAL(TransportAction::STAY,
                    transportDecide(false, true, lastLinkUp, stableSince,
                                    lastRecheck, 1000));
  // Stable (1000ms since the edge), but the 5s recheck interval hasn't
  // elapsed since lastRecheck (still 0).
  TEST_ASSERT_EQUAL(TransportAction::STAY,
                    transportDecide(false, true, lastLinkUp, stableSince,
                                    lastRecheck, 2000));
  // Recheck interval elapsed - signals the switch and updates lastRecheck.
  TEST_ASSERT_EQUAL(TransportAction::SWITCH_TO_ETHERNET,
                    transportDecide(false, true, lastLinkUp, stableSince,
                                    lastRecheck, 6000));
  TEST_ASSERT_EQUAL_UINT32(6000, lastRecheck);
  // Immediately after - still stable and link up, but rate-limited again.
  TEST_ASSERT_EQUAL(TransportAction::STAY,
                    transportDecide(false, true, lastLinkUp, stableSince,
                                    lastRecheck, 6100));
}

void test_transportDecide_stays_when_already_on_matching_transport(void) {
  bool lastLinkUp = true;
  unsigned long stableSince = 0, lastRecheck = 0;

  // On Ethernet, link healthy - nothing to do.
  TEST_ASSERT_EQUAL(TransportAction::STAY,
                    transportDecide(true, true, lastLinkUp, stableSince,
                                    lastRecheck, 5000));

  lastLinkUp = false;
  // On WiFi, no cable present - nothing to do.
  TEST_ASSERT_EQUAL(TransportAction::STAY,
                    transportDecide(false, false, lastLinkUp, stableSince,
                                    lastRecheck, 5000));
}

int main(int argc, char** argv) {
  UNITY_BEGIN();

  RUN_TEST(test_isNewer_basic_increase);
  RUN_TEST(test_isNewer_equal_is_not_newer);
  RUN_TEST(test_isNewer_older_is_not_newer);
  RUN_TEST(test_isNewer_compares_numerically_not_lexicographically);
  RUN_TEST(test_isNewer_major_version_wins);
  RUN_TEST(test_isNewer_missing_patch_defaults_to_zero);

  RUN_TEST(test_parseHostPort_strips_http_prefix);
  RUN_TEST(test_parseHostPort_strips_https_prefix);
  RUN_TEST(test_parseHostPort_defaults_port_80);
  RUN_TEST(test_parseHostPort_no_scheme);

  RUN_TEST(test_urlDecode_plus_becomes_space);
  RUN_TEST(test_urlDecode_percent_encoding);
  RUN_TEST(test_formValue_extracts_field);
  RUN_TEST(test_formValue_missing_key_returns_empty);
  RUN_TEST(test_formValue_last_field_no_trailing_ampersand);

  RUN_TEST(test_completeSince_sets_on_edge_and_holds);
  RUN_TEST(test_revealPhase_not_voted);
  RUN_TEST(test_revealPhase_hidden_until_group_complete);
  RUN_TEST(test_revealPhase_hidden_during_reveal_delay);
  RUN_TEST(test_revealPhase_revealed_after_delay);
  RUN_TEST(test_interpolateClock_idle_returns_anchor);
  RUN_TEST(test_interpolateClock_counts_down_while_running);
  RUN_TEST(test_interpolateClock_clamps_at_zero);
  RUN_TEST(test_clockParts_truncates);
  RUN_TEST(test_toggleClock_flips_and_resets_to_duration);
  RUN_TEST(test_toggleClock_noop_without_known_duration);

  RUN_TEST(test_batteryLevel_full_at_and_above_threshold);
  RUN_TEST(test_batteryLevel_medium_between_thresholds);
  RUN_TEST(test_batteryLevel_low_below_medium_threshold);

  RUN_TEST(test_transportDecide_debounces_flicker_no_switch);
  RUN_TEST(test_transportDecide_switch_to_wifi_after_stable_loss);
  RUN_TEST(test_transportDecide_switch_to_ethernet_after_stable_link_and_rate_limit);
  RUN_TEST(test_transportDecide_stays_when_already_on_matching_transport);

  return UNITY_END();
}
