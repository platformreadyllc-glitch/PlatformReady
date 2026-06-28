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
  g_ethernet = false;
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
<label>Platform ID<input name="platformId" required placeholder="platform-1"></label>
<label>Role
  <select name="role">
    <option value="left">Left</option>
    <option value="right">Right</option>
    <option value="chief">Chief</option>
  </select>
</label>
<button type="submit">Save &amp; Restart</button>
</form></body></html>
)html";

static String urlDecode(const String& s) {
  String out;
  out.reserve(s.length());
  for (int i = 0; i < (int)s.length(); i++) {
    if (s[i] == '+') {
      out += ' ';
    } else if (s[i] == '%' && i + 2 < (int)s.length()) {
      char hex[3] = { s[i + 1], s[i + 2], '\0' };
      out += (char)strtol(hex, nullptr, 16);
      i += 2;
    } else {
      out += s[i];
    }
  }
  return out;
}

static String formValue(const String& body, const String& key) {
  String search = key + "=";
  int start = body.indexOf(search);
  if (start < 0) return "";
  start += search.length();
  int end = body.indexOf('&', start);
  return urlDecode(end < 0 ? body.substring(start) : body.substring(start, end));
}

void webConfigRunEthernet(RemoteConfig& cfg) {
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
      cfg.serial      = formValue(body, "serial");
      cfg.type        = formValue(body, "type") == "chief" ? RemoteType::CHIEF : RemoteType::SIDE;
      cfg.backendHost = formValue(body, "host");
      cfg.platformId  = formValue(body, "platformId");
      cfg.role        = formValue(body, "role");
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
