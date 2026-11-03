#pragma once
#include <stdint.h>
#include <stddef.h>
#include <string.h>

constexpr size_t WIFI_PROFILE_LIMIT = 4;
struct WifiProfile { char ssid[33]; char password[64]; };
struct WifiProfiles {
  uint32_t version;
  uint32_t count;
  WifiProfile items[WIFI_PROFILE_LIMIT];
  uint32_t checksum;
};

inline uint32_t wifiProfilesChecksum(const WifiProfiles& value) {
  uint32_t crc = 0xffffffff;
  const uint8_t* bytes = reinterpret_cast<const uint8_t*>(&value);
  for (size_t i = 0; i < offsetof(WifiProfiles, checksum); ++i) {
    crc ^= bytes[i];
    for (int bit = 0; bit < 8; ++bit) crc = (crc >> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return ~crc;
}

inline bool validWifiCredentials(const char* ssid, const char* password) {
  if (!ssid || !password) return false;
  const size_t ssidLength = strlen(ssid), passwordLength = strlen(password);
  if (!ssidLength || ssidLength > 32 || passwordLength < 8 || passwordLength > 63) return false;
  for (size_t i = 0; i < ssidLength; ++i) if (uint8_t(ssid[i]) < 32 || uint8_t(ssid[i]) == 127) return false;
  for (size_t i = 0; i < passwordLength; ++i) if (uint8_t(password[i]) < 32 || uint8_t(password[i]) > 126) return false;
  return true;
}

inline bool validWifiProfiles(const WifiProfiles& value) {
  if (value.version != 1 || !value.count || value.count > WIFI_PROFILE_LIMIT || value.checksum != wifiProfilesChecksum(value)) return false;
  for (size_t i = 0; i < value.count; ++i) {
    const WifiProfile& profile = value.items[i];
    if (!memchr(profile.ssid, 0, sizeof(profile.ssid)) || !memchr(profile.password, 0, sizeof(profile.password)) || !validWifiCredentials(profile.ssid, profile.password)) return false;
    for (size_t j = 0; j < i; ++j) if (!strcmp(value.items[j].ssid, profile.ssid)) return false;
  }
  return true;
}

// Prepare a copy first. Persist it only after the candidate has obtained an IP.
// The selected profile becomes first; full storage never evicts another network.
inline bool upsertWifiProfile(WifiProfiles& value, const char* ssid, const char* password) {
  if (!validWifiCredentials(ssid, password) || value.count > WIFI_PROFILE_LIMIT) return false;
  size_t index = 0;
  while (index < value.count && strcmp(value.items[index].ssid, ssid)) ++index;
  if (index == value.count && value.count == WIFI_PROFILE_LIMIT) return false;
  if (index == value.count) ++value.count;
  for (size_t i = index; i > 0; --i) value.items[i] = value.items[i - 1];
  WifiProfile profile{};
  memcpy(profile.ssid, ssid, strlen(ssid));
  memcpy(profile.password, password, strlen(password));
  value.items[0] = profile;
  value.version = 1;
  value.checksum = wifiProfilesChecksum(value);
  return true;
}

inline bool removeWifiProfile(WifiProfiles& value, size_t index) {
  if (value.count <= 1 || value.count > WIFI_PROFILE_LIMIT || index >= value.count) return false;
  for (size_t i = index; i + 1 < value.count; ++i) value.items[i] = value.items[i + 1];
  value.items[--value.count] = WifiProfile{};
  value.checksum = wifiProfilesChecksum(value);
  return true;
}
