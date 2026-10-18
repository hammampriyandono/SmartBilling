# Uji integrasi RFID ESP32 — 3 Oktober 2026

**Software teruji; kompilasi Arduino penuh dan hardware belum teruji.** Tidak ada flash atau relay aktif. Backend tetap menentukan sesi melalui tap pertama membuka/tap berikutnya kartu sama menutup, bukan timer/daya/status relay. Varian ini untuk uji LAN terautentikasi, bukan firmware Internet-production tersertifikasi.

## Firmware, wiring, dependency dan secret

Sumber tim berasal dari `D:\Hammam\aKuliah\Capstone`. `IOT.ino` dan `bongo.h` disalin ke `firmware/team-original/` tanpa perubahan isi, selain normalisasi line ending. File eksternal tidak disentuh. Jangan flash varian original: masih memakai broker publik, topic global, QoS0 dan relay lokal.

Varian integrasi ada di `firmware/rfid-integration/rfid-integration.ino`. Bitmap bongo, OLED dan pin dipertahankan. Loading animation dipindahkan ke loop untuk menghindari akses OLED bersamaan. MFRC522 library menggantikan driver manual 4-byte agar select/HALT/WUPA dan UID cascade tersedia.

- Board kandidat: **ESP32-C3 Dev Module**, FQBN `esp32:esp32:esp32c3`; model/revisi fisik belum dikonfirmasi.
- Dependency kandidat yang perlu dikompilasi bersama: Arduino-ESP32 **3.3.0**, MQTT by Joel Gaehwiler/256dpi **2.5.3**, ArduinoJson **7.4.2**, MFRC522 **1.4.12**, Adafruit SSD1306 **2.5.13** dengan GFX/BusIO. Versi dependency transitif harus dicatat saat compile. **Bukan PubSubClient**.
- [MQTT library](https://github.com/256dpi/arduino-mqtt) mendukung publish QoS1/retain/auth; callback tidak melakukan publish/subscribe. [Preferences Espressif](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/preferences.html) untuk checkpoint NVS; [MFRC522](https://github.com/miguelbalboa/rfid) untuk reader.
- RFID SCK **4**, MISO **5**, MOSI **6**, CS **7**, RST **10**; OLED SDA **0**, SCL **1**, alamat **0x3C**, 128×64; GPIO relay asal **3**. Periksa tegangan, common ground, strapping pin dan board bersama tim elektro.
- `secrets.h` tim **tidak dibaca/disalin**. Buat secrets baru dari `secrets.example.h`; `**/secrets.h` diabaikan Git. Tidak ada secret asli pada contoh, dokumentasi atau log. Jangan menaruh password di argumen command-line.

Relay nonaktif default: tidak ada pinMode/digitalWrite GPIO3; `RFID_ENABLE_RELAY=1` sengaja compile-error. **Lepaskan relay secara fisik** saat uji awal: pin high-impedance bukan jaminan modul tetap mati. Sebelum mengimplementasikan relay, pengguna/tim harus menentukan polaritas/fail-safe, keamanan listrik, boot/power-loss, makna sesi terbuka serta perilaku offline/replay. Timer lima detik original tidak dipakai.

## Topic dan payload

Publish **QoS1, retain=false** ke `smartbilling/v1/devices/<DEVICE_UID>/rfid/taps`:

```json
{
  "schema_version": 1,
  "boot_id": "d6e0e5c3-d6b7-4162-bca8-d7049c393ae1",
  "sequence_no": 0,
  "previous_event": null,
  "reader_channel": 0,
  "card_uid": "AABBCCDD",
  "occurred_at": "2026-10-03T01:00:00.123Z"
}
```

UID contoh sintetis. Tepat tujuh field; UID uppercase hex 4/7/10-byte; boot UUID; sequence safe-integer nonnegatif; timestamp RFC3339 berzona hingga milidetik. Kontrak simulator existing `smartbilling/sim/v1/devices/.../rfid/taps` tidak diubah. Tidak ada adapter UID-only `rfid/tap` atau timestamp/identitas rekaan server.

`previous_event={boot_id,sequence_no}` adalah event terakhir **termasuk penolakan bisnis yang telah mengonsumsi urutan**. Dalam boot sama sequence +1. Boot baru sequence 0 menunjuk head boot lama; previous null hanya untuk stream baru. Satu UID untuk satu board/stream, jangan menggunakan UID simulator untuk hardware. Backend melarang stream dengan provenance campuran.

UTC NTP wajib sebelum tap baru. Firmware menunggu callback sinkronisasi dan memblokir tap bila usia sinkronisasi >6 jam. Retry mempertahankan waktu kejadian asli. `future_time` dan `non_increasing_time` ditolak backend; waktu tiba tidak menggantikan waktu tap.

## NVS, kartu ditahan dan respons

Namespace NVS `sb-rfid-v1`, key `state`, menyimpan config, head, pending **wire JSON persis** dan SHA256 dalam satu value. Pending wajib tersimpan sukses sebelum publish. Retry setiap **5 detik** dengan identitas/payload sama, termasuk setelah reboot. Setelah respons terminal yang cocok, head dan clear pending disimpan dalam satu commit NVS. Gagal tulis/corrupt/config berubah menghentikan reader.

PUBACK bukan bukti sesi diproses. Satu pending maksimum: **tap baru tidak direkam saat offline, pending atau NTP belum siap**; lepaskan dan scan ulang ketika siap. Pending lama dapat diretry tanpa NTP baru. Tidak menjamin tap selamat jika power cut terjadi sebelum commit NVS. Jangan erase NVS untuk memperbaiki stream yang memiliki histori.

Reader disarmed setelah restart. WUPA mendeteksi kartu yang telah HALT; re-arm setelah **tiga RF timeout berurutan**, interval 100 ms. Kartu terus hadir tidak membuat tap kedua. Collision/error bukan removal; version register invalid menghentikan reader. Ini bukan delay-only debounce. Noise, removal cepat dan banyak kartu harus diuji fisik.

Subscribe **QoS1** ke `smartbilling/v1/devices/<DEVICE_UID>/rfid/responses`, respons non-retained:

```json
{
  "schema_version": 1,
  "device_uid": "esp32-reader-01",
  "boot_id": "d6e0e5c3-d6b7-4162-bca8-d7049c393ae1",
  "sequence_no": 0,
  "request_sha256": "<sha256-byte-request-asli>",
  "status": "processed",
  "reason": null,
  "action": "opened",
  "consumed": true
}
```

Device/boot/sequence/hash semuanya harus cocok dengan pending. Tidak ada UID kartu, nama tenant, payload/secret atau topic global pada respons. OLED memakai status/action. Replay membaca hasil inbox PostgreSQL yang persisten; tidak perlu migration/outbox tambahan karena perangkat terus replay pending sampai menerima terminal. Backend tidak menunggu PUBACK balasan di handler incoming (menghindari deadlock antrean MQTT.js).

| Hasil | Tindakan perangkat |
| --- | --- |
| processed opened/closed, consumed=true | Simpan head, clear pending, tampilkan hasil backend. |
| rejected, consumed=true | Simpan head, clear pending; tampilkan alasan, tidak mengubah sesi secara lokal. |
| pending, consumed=false | Pertahankan pending dan retry. |
| review/conflict atau rejected consumed=false | Pertahankan pending, hentikan tap baru; investigasi. |
| Identitas/hash berbeda | Abaikan. |
| Payload tidak tervalidasi | Backend mencatat hash/alasan tanpa respons identitas tidak tepercaya. |

Konflik tidak dibalas sebagai sukses event lama. Reason mencakup `unknown_or_inactive_device`, `source_mismatch`, `unknown_reader`, `invalid_card_or_account`, `facility_busy`, `invalid_occupancy`, `simulation_context`, `chain_branch`, `boot_reused`. Respons adalah **hasil event historis**, bukan status relay/sesi live. OLED idle `Last OPEN` hanya hasil terakhir.

## Registrasi owner sebelum memasang board

Gunakan Administrasi/API existing, bukan seed simulasi atau mengedit histori. Mutasi memakai login owner, CSRF, UUID Idempotency-Key, alasan dan row_version pada lifecycle.

1. Buat kamar manual pada properti owner; membership/undangan dan aktivasi tenant, lalu occupancy yang mencakup tap: `/api/owner/tenants/invitations`, `/api/auth/activate`, `/api/owner/occupancies`.
2. Kartu tenant aktif: `POST /api/owner/rfid-cards`, UID uppercase, periode kartu/occupancy sesuai. Kartu asing tidak diregistrasi otomatis.
3. Fasilitas manual **attributable**: `POST /api/owner/facilities`.
4. Device UID baru/manual aktif: `POST /api/owner/devices`; reader/channel aktif: `POST /api/owner/readers`, mengarah ke fasilitas dan properti yang sama. Metadata stream dibuat atomik pada event valid pertama; tidak perlu SQL manual.
5. Meter asset fisik dan installation **communal** pada fasilitas, dengan device/channel sensor dan installed_at: `/api/owner/meter-assets`, `/api/owner/meter-installations`. Reader/sensor boleh device terpisah. Jangan mengubah identitas record yang sudah memiliki histori; pakai lifecycle/new record.
6. Periksa `GET /api/owner/rfid-readiness?device_uid=<UID>&at=<RFC3339>`: mapping reader/fasilitas/meter/asset, provenance dan head; tidak memutasi data/membuka payload/kartu. Owner lain 404, tenant 403, tanpa login 401. Untuk sensor gunakan `/api/owner/hardware-readiness?device_uid=<SENSOR_UID>`.
7. Readiness bukan sertifikasi kartu/occupancy atau bukti PZEM: periksa akun/kartu aktif dan occupancy properti tersebut lewat API owner terpisah. Semua lifecycle time harus mencakup timestamp tap. Master simulasi tidak boleh menjadi konteks sesi fisik.

Tanpa installation sesi ditolak. Dengan installation namun tanpa PZEM/batas tepat awal-akhir, energi tetap **null** (`session_open`/`boundary_missing`), bukan nol. Counter reset, ambigu/gap juga tidak dipaksakan valid. Tidak ada energi dari relay/OLED/interpolasi. Gap produksi belum disepakati; konfigurasi development existing tetap berlaku. Billing tidak diubah.

## LAN opt-in, bukan membuka broker otomatis

Pemeriksaan lokal: Wi-Fi Windows **192.168.1.6**, dapat berubah. Broker default tidak memiliki host listener 1883, hanya jaringan Docker. ESP32 tidak memakai localhost, hostname `mqtt`, atau broker publik original.

`compose.rfid-lan.yaml` **belum diaktifkan**. Override terpisah mempertahankan auth backend dan menambah password hashed per device serta ACL: username=device UID; write hanya taps sendiri; read hanya responses sendiri. ESP32 tidak memakai kredensial backend. Anonymous tetap false. TCP LAN belum TLS; hanya jaringan tepercaya terisolasi, bukan Internet. Firewall tidak diubah otomatis.

Setelah operator menyetujui pembukaan listener LAN:

```powershell
# Buat password melalui prompt, tidak sebagai argumen. -c HANYA pertama kali;
# bila file sudah ada gunakan tanpa -c agar akun reader lain tidak tertimpa.
$rfidSecretDir = (Resolve-Path .local/secrets).Path
$rfidDeviceUid = '<REGISTERED_DEVICE_UID>'
docker run --rm -it -v "${rfidSecretDir}:/provision" eclipse-mosquitto:2 mosquitto_passwd -c /provision/rfid_device_passwords $rfidDeviceUid
$env:RFID_LAN_BIND_IP = '<IP_WIFI_WINDOWS_SAAT_INI>'
$env:RFID_LAN_PORT = '1883'
.\scripts\docker.ps1 compose -f compose.yaml -f compose.rfid-lan.yaml config --quiet
# Perintah opt-in ini membuka listener LAN/restart broker; tidak dijalankan tugas ini.
.\scripts\docker.ps1 compose -f compose.yaml -f compose.rfid-lan.yaml up -d mqtt
```

Isi secrets integrasi baru dengan Wi-Fi, IP Windows, port, UID/channel dan password broker yang sesuai. Jangan bind 0.0.0.0/interface Internet/VPN, port-forward router atau membuka anonymous. Operator membatasi firewall ke subnet uji secara manual. Internet memerlukan TLS/verifikasi sertifikat. Akses ESP32→LAN/firewall belum diuji.

## Compile tanpa upload

Arduino CLI tersedia di `.local/arduino-tools`, cache/config di `.local/arduino-cli.yaml`. Unduhan toolchain resmi 410 MiB terlalu lambat dan dihentikan; core belum terpasang. **Sketch lengkap belum dikompilasi**, dependency di atas masih kandidat. Berikut command lanjutan setelah tooling tersedia:

```powershell
$rfidCli = '.\.local\arduino-tools\arduino-cli.exe'
& $rfidCli --config-file .local/arduino-cli.yaml core update-index
& $rfidCli --config-file .local/arduino-cli.yaml core install esp32:esp32@3.3.0
& $rfidCli --config-file .local/arduino-cli.yaml lib install 'MQTT@2.5.3' 'ArduinoJson@7.4.2' 'MFRC522@1.4.12' 'Adafruit SSD1306@2.5.13'
# Hanya compile placeholder, tidak membaca secrets.h nyata, tidak upload.
& $rfidCli --config-file .local/arduino-cli.yaml compile --fqbn esp32:esp32:esp32c3 --build-property 'compiler.cpp.extra_flags=-DRFID_USE_EXAMPLE_SECRETS' firmware/rfid-integration
```

Catat build/memory dan versi transitif aktual; lakukan review tim elektro sebelum penggunaan board. Tidak ada command flash di panduan ini.

## Reproduksi test software terisolasi

`compose.rfid-verification.yaml` memakai PostgreSQL/broker sendiri, **tanpa host port dan volume aplikasi**, PostgreSQL tmpfs. Pakai project test baru untuk setiap fresh run, bukan reset/drop DB. Semua command -p harus konsisten. Jangan restart PostgreSQL tmpfs untuk membuktikan persistence; hanya restart backend.

```powershell
node scripts/init-rfid-verification-secrets.js
.\scripts\docker.ps1 compose build backend
$rfidTestStack = @('-f','compose.rfid-verification.yaml','-p','smartbilling-rfid-verification-new')
.\scripts\docker.ps1 compose @rfidTestStack up -d
.\scripts\docker.ps1 compose @rfidTestStack exec -T backend npm run migrate
.\scripts\docker.ps1 compose @rfidTestStack exec -T backend node scripts/verify-rfid-hardware.js prepare
.\scripts\docker.ps1 compose @rfidTestStack restart backend
.\scripts\docker.ps1 compose @rfidTestStack exec -T backend node scripts/verify-rfid-hardware.js resume
.\scripts\docker.ps1 compose @rfidTestStack exec -T backend node scripts/verify-rfid-broker-acl.js
# Mapping fixed-ID dibutuhkan test concurrency existing; hanya dalam stack test.
.\scripts\docker.ps1 compose @rfidTestStack exec -T backend npm run seed:demo
.\scripts\docker.ps1 compose @rfidTestStack exec -T backend node scripts/setup-rfid-verification.js
.\scripts\docker.ps1 compose @rfidTestStack exec -T -e INTEGRATION_DB=1 backend node --test
.\scripts\docker.ps1 compose @rfidTestStack exec -T backend node scripts/provision.js owner /run/secrets/rfid_test_owner_password
.\scripts\docker.ps1 compose @rfidTestStack exec -T backend node scripts/verify-rfid-api.js
.\scripts\docker.ps1 compose @rfidTestStack exec -T -e AUTH_TEST_PASSWORD_FILE=/run/secrets/rfid_test_owner_password backend node scripts/verify-mqtt.js 2026-09-14
```

Prepare menolak DB ber-user. `exercise` hanya untuk meneruskan fase prepare terinterupsi, bukan mengulang setelah resume. Secret fixture dibuat acak di .local; bukan secrets tim. Backend bisa mencetak menunggu DB sebelum migration pertama selesai; tidak membuat seed otomatis. Fixture committed dapat diperiksa setelah restart backend.

```powershell
g++ -std=c++11 -Wall -Wextra -Werror test/firmware-presence.cpp -o .local/firmware-presence-test.exe
.\.local\firmware-presence-test.exe
npm test
npm run check
git diff --check
```

Native C++ hanya menguji presence gate dan kebijakan balasan, bukan driver/NVS fisik atau build Arduino. Script `rfid-history-fingerprint.js` read-only mencetak count/digest seluruh tabel, bukan isi row/secret; jalankan one-off container dengan konfigurasi aplikasi utama sebelum/sesudah uji. Jangan cleanup/drop/reset/hapus volume.

## Bukti dan batas pemeriksaan

Hasil aktual lengkap ada di HANDOFF. Software MQTT open/close, replay paralel, konflik, asing/busy, pending serta cross-boot setelah restart lulus. Energi fixture null tanpa reading. PostgreSQL/backend 38/38, host 60 lulus/7 PostgreSQL skip, native C++ lulus. ACL broker nyata terisolasi lulus. Fingerprint 36 tabel aplikasi utama sama: 1.457 reading, 8 event, 4 sesi termasuk simulator/audit/auth/master/billing. Tidak ada migration/backfill histori.

Inventory serial hanya COM1; tidak ada komunikasi board. Belum diuji: sketch Arduino penuh, power-cut NVS, NTP/Wi-Fi/offline aktual, RF removal/noise, OLED, PZEM dan akses LAN ESP32. Software/native C++ bukan bukti hardware berhasil. Relay tetap memerlukan keputusan pengguna.
