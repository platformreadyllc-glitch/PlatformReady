// Implements links2004/WebSockets' WEBSOCKETS_NETWORK_TYPE=NETWORK_CUSTOM
// extension point (see platformio.ini) - the library ships
// WebSocketsNetworkClient.h as an opaque skeleton (a Client subclass that
// forwards every call through an app-defined `Impl`, no .cpp), with a
// worked example at
// .pio/libdeps/esp32dev/WebSockets/examples/esp32_pio/CustomNetworkClient/
// dispatching between WiFi and GSM. This is that same pattern, dispatching
// between WiFi and Ethernet instead.
//
// WebSocketsClient::loop() constructs a fresh WebSocketsNetworkClient
// wrapper on every single reconnect attempt (see WebSocketsClient.cpp) -
// this class's own state (Impl::active) is therefore necessarily
// per-instance and short-lived, re-decided at each connect() call. The
// real, persistent sockets live in network.cpp
// (networkEthernetWsClient()/networkWiFiWsClient()) and outlive this
// wrapper's own churn.
//
// network.cpp documents itself as the only translation unit allowed to
// include <Ethernet_Generic.h> (duplicate-symbol linker errors otherwise) -
// this file respects that by going through network.h's accessors instead
// of touching EthernetClient/Ethernet_Generic.h directly.

#include <WebSocketsNetworkClient.h>
#include "network.h"
#include <string.h>

struct WebSocketsNetworkClient::Impl {
  // Which underlying Client this specific TCP session is pinned to, chosen
  // once at connect() time from the transport active right then - not
  // re-queried from networkIsEthernet() on every subsequent read/write, so
  // a transport flip mid-session can't split one connection's calls across
  // two different sockets (see network.h's accessor comments).
  Client* active = nullptr;
};

WebSocketsNetworkClient::WebSocketsNetworkClient() : _impl(new Impl()) {}

WebSocketsNetworkClient::WebSocketsNetworkClient(WiFiClient wifi_client)
    : _impl(new Impl()) {
  // Unused: this project's transport choice comes from networkIsEthernet()
  // at connect() time, not from a client handed in at construction - the
  // library itself never actually calls this overload (only the default
  // constructor, via `new WEBSOCKETS_NETWORK_CLASS()`), it exists only to
  // satisfy the base skeleton's declared API surface.
  (void)wifi_client;
}

WebSocketsNetworkClient::~WebSocketsNetworkClient() {}

int WebSocketsNetworkClient::connect(IPAddress ip, uint16_t port) {
  _impl->active = networkIsEthernet() ? networkEthernetWsClient() : networkWiFiWsClient();
  return _impl->active->connect(ip, port);
}

int WebSocketsNetworkClient::connect(const char* host, uint16_t port) {
  _impl->active = networkIsEthernet() ? networkEthernetWsClient() : networkWiFiWsClient();
  return _impl->active->connect(host, port);
}

int WebSocketsNetworkClient::connect(const char* host, uint16_t port, int32_t timeout_ms) {
  // The generic Client interface has no 3-arg connect() (only WiFiClient
  // exposes one, and only EthernetClient has none at all) - both
  // transports' connect timeouts are pre-configured once in network.cpp's
  // accessors instead (see their comments), so timeout_ms is unused here.
  (void)timeout_ms;
  _impl->active = networkIsEthernet() ? networkEthernetWsClient() : networkWiFiWsClient();
  return _impl->active->connect(host, port);
}

size_t WebSocketsNetworkClient::write(uint8_t data) {
  return _impl->active ? _impl->active->write(data) : 0;
}

size_t WebSocketsNetworkClient::write(const uint8_t* buf, size_t size) {
  return _impl->active ? _impl->active->write(buf, size) : 0;
}

size_t WebSocketsNetworkClient::write(const char* str) {
  if (!_impl->active) return 0;
  return _impl->active->write(reinterpret_cast<const uint8_t*>(str), strlen(str));
}

int WebSocketsNetworkClient::available() {
  return _impl->active ? _impl->active->available() : 0;
}

int WebSocketsNetworkClient::read() {
  return _impl->active ? _impl->active->read() : -1;
}

int WebSocketsNetworkClient::read(uint8_t* buf, size_t size) {
  return _impl->active ? _impl->active->read(buf, size) : 0;
}

int WebSocketsNetworkClient::peek() {
  return _impl->active ? _impl->active->peek() : -1;
}

void WebSocketsNetworkClient::flush() {
  if (_impl->active) _impl->active->flush();
}

void WebSocketsNetworkClient::stop() {
  if (_impl->active) _impl->active->stop();
}

uint8_t WebSocketsNetworkClient::connected() {
  return _impl->active ? _impl->active->connected() : 0;
}

WebSocketsNetworkClient::operator bool() {
  return _impl->active ? (bool)(*_impl->active) : false;
}
