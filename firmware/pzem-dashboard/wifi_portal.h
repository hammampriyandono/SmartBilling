#pragma once
#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <esp_system.h>
#include "wifi_profiles.h"

// Local AP only. No cloud configuration commands, MQTT secrets or sensor state.
class WifiPortal {
 public:
  bool begin(const char* seedSsid, const char* seedPassword, const char* setupSsid, const char* setupPassword) {
    if (!validWifiCredentials(seedSsid, seedPassword) || !validWifiCredentials(setupSsid, setupPassword) || strlen(setupPassword) < 12) return false;
    apName = setupSsid;
    apPassword = setupPassword;
    if (!storage.begin("wifi-net-v1", false)) return false;
    const size_t size = storage.getBytesLength("profiles");
    if (size) {
      if (size != sizeof(profiles) || storage.getBytes("profiles", &profiles, sizeof(profiles)) != sizeof(profiles) || !validWifiProfiles(profiles)) return false;
    } else {
      if (!upsertWifiProfile(profiles, seedSsid, seedPassword) || !persist(profiles)) return false;
    }
    // Credentials are managed exclusively by the separate profile namespace.
    WiFi.persistent(false);
    WiFi.setAutoReconnect(false);
    pinMode(9, INPUT_PULLUP); // ESP32-C3 BOOT: hold only while application runs.
    const char* headers[] = {"Origin", "Host"};
    server.collectHeaders(headers, 2);
    server.on("/", HTTP_GET, [this]() { render(); });
    server.on("/save", HTTP_POST, [this]() { saveCandidate(); });
    server.on("/use", HTTP_POST, [this]() { useSaved(); });
    server.on("/remove", HTTP_POST, [this]() { removeSaved(); });
    server.on("/close", HTTP_POST, [this]() {
      if (!allowMutation()) return;
      if (testing || launchPending) { reply(409, "Tunggu sampai percobaan jaringan selesai."); return; }
      reply(200, "Pengaturan ditutup. Sambungkan HP kembali ke jaringan internet.");
      closeRequested = true;
    });
    server.onNotFound([this]() { reply(404, "Buka http://192.168.4.1 saat terhubung ke Wi-Fi pengaturan perangkat."); });
    attemptStarted = millis();
    disconnectedSince = millis();
    startSaved(0);
    return true;
  }

  void tick() {
    const uint32_t now = millis();
    handleSetupRequest(now);
    if (portalActive) server.handleClient();
    if (launchPending) {
      launchPending = false;
      testing = true;
      attemptStarted = now;
      WiFi.disconnect(false, false);
      WiFi.begin(candidate.ssid, candidate.password);
    }
    if (testing) {
      if (WiFi.status() == WL_CONNECTED && WiFi.SSID() == candidate.ssid) {
        WifiProfiles next = profiles;
        if (upsertWifiProfile(next, candidate.ssid, candidate.password) && persist(next)) {
          profiles = next;
          profileIndex = 0;
          notice = "Wi-Fi berhasil terhubung dan profil tersimpan. Periksa dashboard untuk memastikan data diterima server. Tekan Selesai untuk menutup pengaturan.";
          Serial.println("Profil Wi-Fi tersimpan; koneksi server diperiksa terpisah.");
        } else {
          notice = "Wi-Fi tersambung, tetapi penyimpanan gagal. Profil lama tetap dipertahankan; jangan matikan perangkat sebelum mencoba lagi.";
        }
        testing = false;
        candidate = WifiProfile{};
      } else if (uint32_t(now - attemptStarted) >= CONNECT_WAIT_MS) {
        testing = false;
        candidate = WifiProfile{};
        notice = "Gagal tersambung. Periksa nama jaringan, password dan frekuensi 2,4 GHz. Profil lama tetap tersimpan.";
        Serial.println("Percobaan Wi-Fi gagal; mencoba profil tersimpan kembali.");
        startSaved(0);
      }
    } else if (WiFi.status() != WL_CONNECTED && uint32_t(now - attemptStarted) >= CONNECT_WAIT_MS) {
      startSaved((profileIndex + 1) % profiles.count);
    }
    const bool connected = WiFi.status() == WL_CONNECTED;
    if (connected && !wasConnected) Serial.println("Wi-Fi terhubung; menunggu koneksi MQTT/NTP.");
    if (wasConnected && !connected) disconnectedSince = now;
    wasConnected = connected;
    if (!connected && !portalActive && !autoPortalUsed && uint32_t(now - disconnectedSince) >= AUTO_SETUP_MS) {
      autoPortalUsed = true;
      open();
    }
    // open() may run later in this tick; an older `now` would underflow and
    // immediately expire a portal opened by BOOT, serial or automatic fallback.
    if (portalActive && (closeRequested || uint32_t(millis() - portalStarted) >= PORTAL_MS)) close();
  }

 private:
  static constexpr uint32_t CONNECT_WAIT_MS = 20000, AUTO_SETUP_MS = 60000, PORTAL_MS = 300000;
  Preferences storage;
  WifiProfiles profiles{};
  WifiProfile candidate{};
  WebServer server{IPAddress(192, 168, 4, 1), 80};
  String apName, apPassword, csrf, notice, serialCommand;
  uint32_t attemptStarted = 0, disconnectedSince = 0, portalStarted = 0, buttonStarted = 0;
  size_t profileIndex = 0;
  bool portalActive = false, autoPortalUsed = false, testing = false, launchPending = false;
  bool wasConnected = false, closeRequested = false, buttonDown = false, buttonHandled = false;

  bool persist(const WifiProfiles& next) {
    return storage.putBytes("profiles", &next, sizeof(next)) == sizeof(next);
  }

  void startSaved(size_t index) {
    profileIndex = index;
    attemptStarted = millis();
    WiFi.disconnect(false, false);
    WiFi.begin(profiles.items[index].ssid, profiles.items[index].password);
  }

  void handleSetupRequest(uint32_t now) {
    if (digitalRead(9) == LOW) {
      if (!buttonDown) { buttonDown = true; buttonStarted = now; buttonHandled = false; }
      if (!buttonHandled && uint32_t(now - buttonStarted) >= 3000) { buttonHandled = true; open(); }
    } else buttonDown = false;
    // Bounded serial command: no password input or echo through Serial Monitor.
    while (Serial.available()) {
      const char value = char(Serial.read());
      if (value == '\n' || value == '\r') {
        if (serialCommand == "wifi-setup") open();
        serialCommand = "";
      } else if (serialCommand.length() < 32) serialCommand += value;
      else serialCommand = "";
    }
  }

  void open() {
    if (portalActive) return;
    WiFi.mode(WIFI_AP_STA);
    const IPAddress address(192, 168, 4, 1);
    if (!WiFi.softAPConfig(address, address, IPAddress(255, 255, 255, 0)) || !WiFi.softAP(apName.c_str(), apPassword.c_str(), 1, false, 2)) {
      Serial.println("Wi-Fi pengaturan gagal dibuka.");
      WiFi.mode(WIFI_STA);
      return;
    }
    uint8_t bytes[16]; esp_fill_random(bytes, sizeof(bytes));
    char token[33];
    for (size_t i = 0; i < sizeof(bytes); ++i) snprintf(token + i * 2, 3, "%02x", bytes[i]);
    csrf = token;
    notice = "Pilih profil tersimpan atau tambahkan hotspot/Wi-Fi 2,4 GHz. Koneksi Wi-Fi belum membuktikan internet atau sensor bekerja.";
    portalActive = true;
    autoPortalUsed = true;
    portalStarted = millis();
    closeRequested = false;
    server.begin();
    Serial.println("Pengaturan Wi-Fi aktif selama 5 menit. Hubungkan HP ke Wi-Fi pengaturan; buka http://192.168.4.1. Sandi tersedia di berkas privat perangkat.");
  }

  void close() {
    // A candidate must finish/expire before closing; never change sensor NVS.
    if (testing || launchPending) {
      testing = launchPending = false;
      candidate = WifiProfile{};
      startSaved(0);
    }
    server.stop();
    WiFi.softAPdisconnect(true);
    WiFi.mode(WIFI_STA);
    portalActive = closeRequested = false;
    csrf = "";
    Serial.println("Pengaturan Wi-Fi ditutup; profil dan pembacaan sensor dipertahankan.");
  }

  bool localRequest() {
    return portalActive && server.client().localIP() == IPAddress(192, 168, 4, 1);
  }

  void securityHeaders() {
    server.sendHeader("Cache-Control", "no-store");
    server.sendHeader("Pragma", "no-cache");
    server.sendHeader("X-Content-Type-Options", "nosniff");
    server.sendHeader("Referrer-Policy", "no-referrer");
    server.sendHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  }

  void reply(int status, const String& text) {
    securityHeaders();
    server.send(status, "text/plain; charset=utf-8", text);
  }

  bool allowMutation() {
    if (!localRequest()) { reply(403, "Akses hanya melalui Wi-Fi pengaturan perangkat."); return false; }
    const String origin = server.header("Origin");
    if (server.header("Host") != "192.168.4.1" || (origin.length() && origin != "http://192.168.4.1") || !csrf.length() || server.arg("csrf") != csrf) {
      reply(403, "Sesi pengaturan tidak valid. Buka kembali http://192.168.4.1."); return false;
    }
    return true;
  }

  static String escaped(const String& value) {
    String out;
    for (size_t i = 0; i < value.length(); ++i) {
      switch (value[i]) {
        case '&': out += "&amp;"; break;
        case '<': out += "&lt;"; break;
        case '>': out += "&gt;"; break;
        case '"': out += "&quot;"; break;
        case '\'': out += "&#39;"; break;
        default: out += value[i];
      }
    }
    return out;
  }

  String tokenInput() { return "<input type='hidden' name='csrf' value='" + csrf + "'>"; }

  void render() {
    if (!localRequest()) { reply(403, "Akses hanya melalui Wi-Fi pengaturan perangkat."); return; }
    String page = "<!doctype html><html lang='id'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Wi-Fi SmartBilling</title><style>body{font:16px system-ui;background:#f2f5f7;color:#172c32;margin:0;padding:20px}main{max-width:540px;background:white;margin:auto;padding:24px;border-radius:16px}input,button{font:inherit;box-sizing:border-box;padding:12px;border:1px solid #aab9bd;border-radius:8px}input{width:100%;margin:8px 0 16px}button{background:#086b60;color:white;cursor:pointer}form{margin:16px 0}small{color:#53676c}li{margin:14px 0}.actions{display:flex;gap:8px}.actions form{margin:4px 0}.secondary{background:white;color:#25464b}p{line-height:1.5}</style><main><small>SMARTBILLING / PENGATURAN PERANGKAT</small><h1>Pengaturan Wi-Fi</h1>";
    page += "<p>" + escaped(apName) + "</p><p role='status'>" + escaped(notice) + "</p>";
    page += "<p>Wi-Fi: <strong>" + (WiFi.status() == WL_CONNECTED ? escaped(WiFi.SSID()) : String("belum terhubung")) + "</strong></p>";
    page += "<p><a href='/'>Perbarui status</a></p><h2>Jaringan tersimpan</h2><ul>";
    for (size_t i = 0; i < profiles.count; ++i) {
      page += "<li>" + escaped(profiles.items[i].ssid) + "<div class='actions'><form method='post' action='/use'>" + tokenInput() + "<input type='hidden' name='index' value='" + String(i) + "'><button" + (testing || launchPending ? String(" disabled") : String("")) + ">Gunakan</button></form>";
      if (profiles.count > 1) page += "<form method='post' action='/remove'>" + tokenInput() + "<input type='hidden' name='index' value='" + String(i) + "'><button class='secondary'" + (testing || launchPending ? String(" disabled") : String("")) + ">Hapus profil</button></form>";
      page += "</div></li>";
    }
    page += "</ul><h2>Tambahkan atau perbarui jaringan</h2><p>Maksimum 4 profil. Nama jaringan harus persis sama. Password lama tidak ditampilkan.</p><form method='post' action='/save' autocomplete='off'>" + tokenInput();
    page += "<label>Nama Wi-Fi (SSID)<input name='ssid' maxlength='32' required></label><label>Password<input name='password' type='password' minlength='8' maxlength='63' autocomplete='new-password' required></label><button" + (testing || launchPending ? String(" disabled") : String("")) + ">Uji dan simpan</button></form>";
    page += "<form method='post' action='/close'>" + tokenInput() + "<button class='secondary'>Selesai</button></form><small>Pengaturan ditutup otomatis setelah 5 menit. Setelah selesai, sambungkan HP kembali ke internet dan periksa dashboard. Broker lokal tetap membutuhkan jaringan yang dapat menjangkau PC.</small></main></html>";
    securityHeaders();
    server.send(200, "text/html; charset=utf-8", page);
  }

  bool idleMutation() {
    if (!allowMutation()) return false;
    if (testing || launchPending) { reply(409, "Percobaan jaringan masih berlangsung. Tunggu lalu perbarui status."); return false; }
    return true;
  }

  void saveCandidate() {
    if (!idleMutation()) return;
    const String ssid = server.arg("ssid"), password = server.arg("password");
    // Reject embedded NULs and validate byte length, not HTML character count.
    if (ssid.length() != strlen(ssid.c_str()) || password.length() != strlen(password.c_str()) || !validWifiCredentials(ssid.c_str(), password.c_str())) {
      reply(400, "SSID harus 1-32 byte dan password 8-63 karakter ASCII. Gunakan jaringan pribadi 2,4 GHz bersandi."); return;
    }
    WifiProfiles next = profiles;
    if (!upsertWifiProfile(next, ssid.c_str(), password.c_str())) { reply(409, "Penyimpanan 4 profil penuh. Hapus satu profil atau perbarui nama jaringan yang sudah tersimpan."); return; }
    candidate = next.items[0];
    queueCandidate();
  }

  bool selectedIndex(size_t& index) {
    const String raw = server.arg("index");
    if (raw.length() != 1 || raw[0] < '0' || raw[0] > '3' || size_t(raw[0] - '0') >= profiles.count) { reply(400, "Profil tidak valid."); return false; }
    index = size_t(raw[0] - '0');
    return true;
  }

  void useSaved() {
    if (!idleMutation()) return;
    size_t index;
    if (!selectedIndex(index)) return;
    candidate = profiles.items[index];
    queueCandidate();
  }

  void queueCandidate() {
    notice = "Sedang mencoba jaringan selama maksimal 20 detik. Tunggu lalu tekan Perbarui status. Profil lama tetap tersimpan.";
    launchPending = true;
    server.sendHeader("Location", "/");
    securityHeaders();
    server.send(303, "text/plain", "Mencoba jaringan; kembali ke halaman pengaturan.");
  }

  void removeSaved() {
    if (!idleMutation()) return;
    size_t index;
    if (!selectedIndex(index)) return;
    if (WiFi.status() == WL_CONNECTED && WiFi.SSID() == profiles.items[index].ssid) { reply(409, "Profil yang sedang dipakai tidak dapat dihapus. Gunakan jaringan lain dahulu."); return; }
    WifiProfiles next = profiles;
    if (!removeWifiProfile(next, index)) { reply(409, "Pertahankan minimal satu profil Wi-Fi."); return; }
    if (!persist(next)) { reply(500, "Gagal menyimpan perubahan; profil lama dipertahankan."); return; }
    profiles = next;
    profileIndex = 0;
    notice = "Profil dihapus. Profil Wi-Fi lain dan data sensor tetap dipertahankan.";
    server.sendHeader("Location", "/"); securityHeaders(); server.send(303, "text/plain", "Profil dihapus.");
  }
};
