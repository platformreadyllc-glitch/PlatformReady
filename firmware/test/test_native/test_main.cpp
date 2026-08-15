// Host-compiled unit tests for the pure logic pulled out of the firmware's
// Arduino/ESP32-dependent modules. Run with `pio test -e native` from
// firmware/ — no hardware or Arduino framework needed. See
// firmware/platformio.ini's [env:native] and firmware/test/README.md.

#include <unity.h>
#include "../../src/version_compare.h"
#include "../../src/host_port.h"
#include "../../src/url_utils.h"

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

  return UNITY_END();
}
