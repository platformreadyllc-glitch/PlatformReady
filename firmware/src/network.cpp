// ── IMPORTANT ─────────────────────────────────────────────────────────────────
// Ethernet_Generic uses _Impl.h files that contain non-inline function bodies.
// Including <Ethernet_Generic.h> in more than one .cpp causes duplicate-symbol
// linker errors. This file is the ONLY translation unit allowed to include it.
// All Ethernet-related logic (init, config server, client factory) lives here.
// ──────────────────────────────────────────────────────────────────────────────

#include "network.h"
#include "webconfig.h"
#include "config.h"
#include "display.h"
#include "haptic.h"
#include "pins.h"
#include "url_utils.h"
#include "watchdog.h"
#include <SPI.h>
#include <Ethernet_Generic.h>
#include <WiFi.h>
#include <WiFiClient.h>

// ── MAC / Ethernet init ───────────────────────────────────────────────────────

static bool g_ethernet = false;
static byte g_mac[6];

static void generateMac() {
  uint64_t chipId = ESP.getEfuseMac();
  g_mac[0] = 0x02;
  g_mac[1] = (chipId >> 8)  & 0xFF;
  g_mac[2] = (chipId >> 16) & 0xFF;
  g_mac[3] = (chipId >> 24) & 0xFF;
  g_mac[4] = (chipId >> 32) & 0xFF;
  g_mac[5] = (chipId >> 40) & 0xFF;
}

bool networkTryEthernet(unsigned long dhcpTimeoutMs) {
#ifdef SKIP_ETHERNET
  return false;
#else
  // The reset pulse + SPI/chip init only need to happen once - called
  // again later (E2's runtime WiFi-fallback recovery path, re-probing
  // whether a replugged cable can now reach the backend), re-pulsing
  // ETH_RST would drop the W5500 mid-negotiation for no reason.
  static bool alreadyInitialized = false;
  if (!alreadyInitialized) {
    generateMac();

    pinMode(ETH_RST, OUTPUT);
    digitalWrite(ETH_RST, LOW);
    delay(100);
    digitalWrite(ETH_RST, HIGH);
    delay(200);

    SPI.begin();  // uses ESP32 VSPI defaults: SCLK=18, MISO=19, MOSI=23
    Ethernet.init(ETH_CS);
    // Ethernet.init() only records which pin is chip-select
    // (W5100Class::setSS()) - it does NOT actually probe/reset the W5x00
    // chip over SPI. That real init (chip-type detection, buffer setup)
    // only otherwise happens inside EthernetClass::begin(), via
    // W5100.init() - too late for us: W5100Class::getLinkStatus() reads
    // UNKNOWN (not LinkOFF), not the real PHY register, until
    // W5100Class::init() has run at least once. Without this, the
    // linkStatus() check right below always failed - cable or no cable -
    // and Ethernet.begin() (the only thing that would have actually set
    // it up) was never reached to fix that for next time either.
    // W5100.init() is idempotent (a no-op if already initialized, per its
    // own source) - Ethernet.begin() below will just find it already
    // done.
    W5100.init();
    alreadyInitialized = true;
  }

  if (Ethernet.linkStatus() != LinkON) return false;

  if (Ethernet.begin(g_mac, dhcpTimeoutMs) != 1) return false;

  g_ethernet = true;
  return true;
#endif
}

// Raw link-presence read, usable regardless of the currently active
// transport - e.g. to notice a cable replug while running on the WiFi
// fallback. Safe to call any time after the first networkTryEthernet()
// call (which performs the one-time SPI/chip init above, independent of
// whether the link was up yet at that point).
bool networkEthernetLinkPresent() {
#ifdef SKIP_ETHERNET
  return false;
#else
  return Ethernet.linkStatus() == LinkON;
#endif
}

bool networkBeginWiFi() {
  // Modem-sleep power saving is a common cause of silent ESP32 WiFi
  // drops; setAutoReconnect tells the driver to attempt reconnection on
  // its own when a disconnect event fires. Both are driver-level — the
  // active retry in main.cpp's loop() is still needed as a backstop for
  // disconnects the driver doesn't auto-recover from on its own.
  //
  // Deliberately does NOT touch g_ethernet - it used to unconditionally
  // reset it to false, which broke Ethernet even when this was called
  // only to configure the WiFi radio on the WiFi-only boot path. It's
  // safe to call regardless of current transport now.
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  return true;
}

// The only place that flips g_ethernet back to false at runtime (after
// boot's initial networkTryEthernet()/g_ethernet=true). Called from
// exactly one place: main.cpp's loop() runtime Ethernet-loss-to-WiFi
// fallback transition - never at boot, where the WiFi-only path simply
// never sets g_ethernet true in the first place.
bool networkFallbackToWiFi() {
  g_ethernet = false;
  return true;
}

// Non-interactive WiFi association for the runtime fallback path: a bare
// WiFi.begin() reconnects using ESP32-IDF-NVS-persisted STA credentials
// (the same pattern WiFiManager's own wifiConnectDefault() uses
// internally), rather than blocking on the captive-portal UI - which
// would be wrong for a headless mid-meet remote. Non-blocking: kicks off
// the association attempt and returns immediately; the actual connection
// is observed later via networkConnected()/WiFi.status(), same as the
// existing WiFi.reconnect() backstop in main.cpp's loop().
//
// Skips the call entirely if WiFi is already connected - it's left
// associated-but-idle (never disconnected) while running on Ethernet, so
// on a typical Ethernet-loss it's already sitting there ready to go.
// WiFi.begin() unconditionally tears down and restarts any existing
// association before reconnecting, so calling it blindly here was forcing
// a full, needless reassociation (many seconds, sometimes tens of
// seconds) on every single fallback instead of an instant handoff -
// confirmed as the cause of a real ~1 minute recovery time on hardware.
bool networkAssociateWiFiNonInteractive() {
  if (WiFi.status() == WL_CONNECTED) return true;
  WiFi.begin();
  return true;
}

bool networkIsEthernet() { return g_ethernet; }

bool networkConnected() {
  if (g_ethernet) {
    return Ethernet.linkStatus() == LinkON &&
           Ethernet.localIP() != IPAddress(0, 0, 0, 0);
  }
  return WiFi.status() == WL_CONNECTED;
}

String networkLocalIP() {
  if (g_ethernet) {
    IPAddress ip = Ethernet.localIP();
    return String(ip[0]) + "." + String(ip[1]) + "." +
           String(ip[2]) + "." + String(ip[3]);
  }
  return WiFi.localIP().toString();
}

// ── HTTP client factory ───────────────────────────────────────────────────────

static EthernetClient g_ethClient;
static WiFiClient     g_wifiClient;

Client* networkNewClient() {
  if (g_ethernet) {
    g_ethClient = EthernetClient();
    return &g_ethClient;
  }
  g_wifiClient = WiFiClient();
  return &g_wifiClient;
}

// ── WS client factory ─────────────────────────────────────────────────────
// Separate, long-lived instances dedicated to the persistent WS connection
// (ws_network_client.cpp) - unlike g_ethClient/g_wifiClient above, these are
// NOT reset to a fresh object on every call, since a WS session needs one
// stable underlying socket for its whole lifetime, not a fresh one per
// one-shot REST/OTA request.

static EthernetClient g_ethWsClient;
static WiFiClient     g_wifiWsClient;

// WebSocketsClient (via ws_network_client.cpp) calls the 3-arg
// connect(host, port, timeout_ms) on ESP32, but the generic Client
// interface only declares the 2-arg overload - EthernetClient has no
// 3-arg overload at all, and while WiFiClient does, it's not reachable
// through a plain Client* the way ws_network_client.cpp holds these. Both
// transports' connect timeouts are pre-configured once here instead
// (where the concrete types are in scope), approximating the WS library's
// own WEBSOCKETS_TCP_TIMEOUT (5000ms, WebSockets.h).
Client* networkEthernetWsClient() {
  static bool configured = false;
  if (!configured) {
    g_ethWsClient.setConnectionTimeout(5000);
    configured = true;
  }
  return &g_ethWsClient;
}

Client* networkWiFiWsClient() {
  static bool configured = false;
  if (!configured) {
    g_wifiWsClient.setTimeout(5);  // seconds - matches the 5000ms above
    configured = true;
  }
  return &g_wifiWsClient;
}

// ── Ethernet config web server (webConfigRunEthernet) ─────────────────────────
// Declared in webconfig.h, implemented here so Ethernet_Generic.h is only
// included in this one translation unit.

// ESP32's Server base class declares begin(uint16_t) as pure virtual.
// Ethernet_Generic doesn't implement that overload, making EthernetServer abstract.
class W5500Server : public EthernetServer {
public:
  explicit W5500Server(uint16_t port) : EthernetServer(port) {}
  using EthernetServer::begin;
  void begin(uint16_t port) override { (void)port; EthernetServer::begin(); }
};

static const char PAGE[] PROGMEM = R"html(
<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Remote Config</title>
<style>
body{font-family:sans-serif;max-width:420px;margin:40px auto;padding:0 16px}
h2{margin-bottom:8px}
label{display:block;margin-top:14px;font-weight:bold;font-size:14px}
input,select{width:100%;padding:8px;box-sizing:border-box;margin-top:4px;font-size:14px;border:1px solid #ccc;border-radius:4px}
button{width:100%;padding:12px;margin-top:24px;background:#2563eb;color:#fff;
       border:none;border-radius:6px;font-size:16px;cursor:pointer}
button:hover{background:#1d4ed8}
</style></head><body>
<h2>PlatformReady Remote</h2>
<form method="POST" action="/save">
<label>Serial Number<input name="serial" required placeholder="RL-001"></label>
<label>Remote Type
  <select name="type">
    <option value="side">Side Referee (4 buttons)</option>
    <option value="chief">Chief Judge (5 buttons)</option>
  </select>
</label>
<label>Backend URL<input name="host" required placeholder="http://192.168.1.100:3000"></label>
<button type="submit">Save &amp; Restart</button>
</form></body></html>
)html";

void webConfigRunEthernet(RemoteConfig& cfg) {
  // This loop waits indefinitely for a human to submit the config form — far
  // longer than the watchdog window. Always ends in ESP.restart() on save,
  // which reinitializes the watchdog fresh on the next boot, so no matching
  // watchdogResume() is needed here.
  watchdogPause();

  W5500Server server(80);
  server.begin();
  displayShowConfigEth(networkLocalIP());

  while (true) {
    EthernetClient client = server.available();
    if (!client) continue;

    String requestLine = client.readStringUntil('\n');
    requestLine.trim();

    int contentLength = 0;
    while (client.connected()) {
      String line = client.readStringUntil('\n');
      line.trim();
      if (line.isEmpty()) break;
      if (line.startsWith("Content-Length:")) {
        contentLength = line.substring(15).toInt();
      }
    }

    String body;
    if (requestLine.startsWith("POST") && contentLength > 0) {
      unsigned long deadline = millis() + 3000;
      while ((int)client.available() < contentLength && millis() < deadline);
      body = client.readString();
    }

    bool isSave = requestLine.startsWith("POST") && requestLine.indexOf("/save") >= 0;

    if (isSave) {
      // Platform/role are assigned later via the remote management page,
      // not at setup time — only the fixed identity fields are collected
      // here.
      cfg.serial      = formValue(body.c_str(), "serial").c_str();
      cfg.type        = formValue(body.c_str(), "type") == "chief" ? RemoteType::CHIEF : RemoteType::SIDE;
      cfg.backendHost = formValue(body.c_str(), "host").c_str();
      configSave(cfg);

      client.print("HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nConnection: close\r\n\r\n"
                   "<html><body><h2>Saved! Restarting...</h2></body></html>");
      client.flush();
      client.stop();
      delay(500);
      hapticDoubleClick();
      delay(300);
      ESP.restart();
    } else {
      String page = FPSTR(PAGE);
      String resp = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: ";
      resp += String(page.length());
      resp += "\r\nConnection: close\r\n\r\n";
      resp += page;
      client.print(resp);
      client.flush();
      client.stop();
    }
  }
}
