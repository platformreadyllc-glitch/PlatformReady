// links2004/WebSockets' WEBSOCKETS_NETWORK_TYPE=NETWORK_CUSTOM branch (see
// ws_network_client.cpp) unconditionally requires a WebSocketsNetworkClientSecure
// to exist and fully link - WebSockets.h #includes its header and typedefs
// WEBSOCKETS_NETWORK_SSL_CLASS to it regardless of whether TLS is ever used,
// and that in turn makes WebSocketsClient.h/.cpp compile in a set of
// HAS_SSL-gated members and beginSSL()/beginSslWithCA()/etc. methods.
//
// This project never calls any of them - ws_client.cpp only ever calls
// plain webSocket.begin() (ws://, not wss://), which leaves the library's
// internal `isSSL` flag false and its `ssl` pointer NULL (see
// WebSocketsClient.cpp's begin()); every HAS_SSL codepath that would
// actually construct or call into a WebSocketsNetworkClientSecure is
// gated behind that flag and is therefore dead at runtime here (consistent
// with the project's no-TLS design - this is a private LAN, see
// firmware/README.md).
//
// So this is a deliberate dead-but-required stub to satisfy the linker,
// not a half-implemented TLS client - every method below is unreachable.
#include <WebSocketsNetworkClientSecure.h>

WebSocketsNetworkClientSecure::WebSocketsNetworkClientSecure() {}
WebSocketsNetworkClientSecure::WebSocketsNetworkClientSecure(WiFiClient) {}
WebSocketsNetworkClientSecure::~WebSocketsNetworkClientSecure() {}

int WebSocketsNetworkClientSecure::connect(IPAddress, uint16_t) { return 0; }
int WebSocketsNetworkClientSecure::connect(const char*, uint16_t) { return 0; }
int WebSocketsNetworkClientSecure::connect(const char*, uint16_t, int32_t) { return 0; }
size_t WebSocketsNetworkClientSecure::write(uint8_t) { return 0; }
size_t WebSocketsNetworkClientSecure::write(const uint8_t*, size_t) { return 0; }
size_t WebSocketsNetworkClientSecure::write(const char*) { return 0; }
int WebSocketsNetworkClientSecure::available() { return 0; }
int WebSocketsNetworkClientSecure::read() { return -1; }
int WebSocketsNetworkClientSecure::read(uint8_t*, size_t) { return 0; }
int WebSocketsNetworkClientSecure::peek() { return -1; }
void WebSocketsNetworkClientSecure::flush() {}
void WebSocketsNetworkClientSecure::stop() {}
uint8_t WebSocketsNetworkClientSecure::connected() { return 0; }
WebSocketsNetworkClientSecure::operator bool() { return false; }

void WebSocketsNetworkClientSecure::setCACert(const char*) {}
void WebSocketsNetworkClientSecure::setCertificate(const char*) {}
void WebSocketsNetworkClientSecure::setPrivateKey(const char*) {}
#if ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 4)
void WebSocketsNetworkClientSecure::setCACertBundle(const uint8_t*, size_t) {}
#else
void WebSocketsNetworkClientSecure::setCACertBundle(const uint8_t*) {}
#endif
void WebSocketsNetworkClientSecure::setInsecure() {}
bool WebSocketsNetworkClientSecure::verify(const char*, const char*) { return false; }
