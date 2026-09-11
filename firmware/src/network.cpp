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

bool networkTryEthernet() {
#ifdef SKIP_ETHERNET
  return false;
#else
  generateMac();

  pinMode(ETH_RST, OUTPUT);
  digitalWrite(ETH_RST, LOW);
  delay(100);
  digitalWrite(ETH_RST, HIGH);
  delay(200);

  SPI.begin();  // uses ESP32 VSPI defaults: SCLK=18, MISO=19, MOSI=23
  Ethernet.init(ETH_CS);

  if (Ethernet.linkStatus() != LinkON) return false;

  if (Ethernet.begin(g_mac, 10000) != 1) return false;

  g_ethernet = true;
  return true;
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
bool networkAssociateWiFiNonInteractive() {
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
