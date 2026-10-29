// Native profile/storage fixtures only. Never connects to Wi-Fi or MQTT.
#include "../firmware/pzem-dashboard/wifi_profiles.h"
#include <cassert>
#include <iostream>
#include <string>
int main() {
  WifiProfiles profiles{};
  assert(!validWifiProfiles(profiles));
  assert(upsertWifiProfile(profiles, "fixture-home", "fixture-pass-home"));
  assert(validWifiProfiles(profiles));
  assert(upsertWifiProfile(profiles, "fixture-backup", "fixture-pass-backup"));
  assert(profiles.count == 2 && !strcmp(profiles.items[1].ssid, "fixture-home"));
  assert(upsertWifiProfile(profiles, "fixture-home", "fixture-pass-updated"));
  assert(profiles.count == 2 && !strcmp(profiles.items[0].password, "fixture-pass-updated"));
  assert(!strcmp(profiles.items[1].ssid, "fixture-backup"));
  assert(upsertWifiProfile(profiles, "fixture-third", "fixture-pass-third"));
  assert(upsertWifiProfile(profiles, "fixture-fourth", "fixture-pass-fourth"));
  WifiProfiles before = profiles;
  assert(!upsertWifiProfile(profiles, "fixture-fifth", "fixture-pass-fifth"));
  assert(!memcmp(&before, &profiles, sizeof(profiles)));
  assert(!upsertWifiProfile(profiles, "", "fixture-pass"));
  assert(!upsertWifiProfile(profiles, "fixture", "short"));
  assert(!upsertWifiProfile(profiles, "fixture\n", "fixture-pass"));
  assert(!upsertWifiProfile(profiles, std::string(33, 's').c_str(), "fixture-pass"));
  assert(!upsertWifiProfile(profiles, "fixture", std::string(64, 'p').c_str()));
  assert(validWifiProfiles(profiles));
  WifiProfiles restored{}; memcpy(&restored, &profiles, sizeof(restored));
  assert(validWifiProfiles(restored));
  restored.items[0].password[0] ^= 1;
  assert(!validWifiProfiles(restored));
  restored = profiles; restored.count = 5; restored.checksum = wifiProfilesChecksum(restored);
  assert(!validWifiProfiles(restored));
  restored = profiles; memset(restored.items[0].ssid, 'x', sizeof(restored.items[0].ssid)); restored.checksum = wifiProfilesChecksum(restored);
  assert(!validWifiProfiles(restored));
  restored = profiles; restored.items[1] = restored.items[0]; restored.checksum = wifiProfilesChecksum(restored);
  assert(!validWifiProfiles(restored));
  assert(removeWifiProfile(profiles, 1));
  assert(validWifiProfiles(profiles));
  while (profiles.count > 1) assert(removeWifiProfile(profiles, 0));
  before = profiles;
  assert(!removeWifiProfile(profiles, 0));
  assert(!memcmp(&before, &profiles, sizeof(profiles)));
  std::cout << "PASS: profile switching preserves previous networks, update, full storage, invalid input, persistence integrity, duplicate rejection and last-profile guard.\n";
}
