# Kontrak perangkat ESP32 dan MQTT produksi v1

Status 24 September 2026: kontrak backend production-ready untuk telemetry listrik. Ini membekukan bentuk pesan dan aturan identitas, tetapi belum menyatakan firmware, sensor, kalibrasi, TLS broker, atau interval produksi telah diuji pada hardware nyata. Namespace simulator lama tetap didukung dan terpisah.

## Topic dan transport

- Produksi: `smartbilling/v1/devices/{device_uid}/readings`
- Simulator: `smartbilling/sim/v1/devices/{device_uid}/readings`
- Publish QoS **1**, retain **false**, payload UTF-8 JSON maksimal 4096 byte.
- `{device_uid}` harus sama persis dengan record device yang diprovision owner: 1–80 karakter `A-Z a-z 0-9 _ -`.
- Device tidak boleh mengirim room ID, tenant, tarif, atau nominal. Mapping channel ke kamar/fasilitas ditentukan oleh installation temporal di database.

Broker production harus memakai TLS dan kredensial per device/kelompok terbatas dengan ACL hanya untuk topic device tersebut. Alamat broker, user, dan password tidak ditanam di repository.

## Payload JSON

```json
{
  "schema_version": 1,
  "boot_id": "550e8400-e29b-41d4-a716-446655440000",
  "sequence_no": 42,
  "channel_no": 1,
  "counter_epoch": 0,
  "measured_at": "2026-09-24T04:15:00.000Z",
  "energy_kwh": "12.345678901",
  "voltage_v": 220.125,
  "current_a": 0.512345,
  "power_w": 110.123456,
  "frequency_hz": 50.0125,
  "power_factor": 0.978321
}
```

Field wajib:

- `schema_version`: integer `1`.
- `boot_id`: UUID v4 baru pada setiap boot firmware.
- `sequence_no`: integer aman nonnegatif, monoton naik per channel selama satu boot. Retry memakai sequence dan payload byte/semantik yang sama.
- `channel_no`: integer nonnegatif yang sama dengan pemasangan meter pada backend.
- `counter_epoch`: integer nonnegatif yang hanya bertambah ketika counter energi benar-benar direset atau kehilangan continuity.
- `measured_at`: RFC3339 berzona, maksimal milidetik.
- `energy_kwh`: string desimal kumulatif nonnegatif, maksimal 11 digit integer dan 9 desimal.

Field opsional dapat dihilangkan atau `null`; jangan mengganti nilai tidak tersedia dengan nol. Nama field dan satuannya adalah `voltage_v`, `current_a`, `power_w`, `frequency_hz`, dan `power_factor` 0–1. Field asing ditolak.

## Waktu NTP

Firmware harus sinkron NTP sebelum mengirim telemetry production. Simpan waktu pengukuran saat sampel dibuat, bukan waktu retry MQTT. Gunakan UTC `Z` bila memungkinkan. Jangan mengirim waktu default boot, waktu tanpa zona, tanggal kalender invalid, atau waktu yang mundur akibat clock belum sinkron. Bila NTP belum valid, buffer sampel hanya jika timestamp dapat dipulihkan secara sah; selain itu jangan memalsukan timestamp.

Backend menyimpan `received_at` terpisah. `received_at` tidak mengganti `measured_at` dan tidak dapat memperbaiki boundary billing.

## Reboot, reset counter, dan deduplikasi

- Reboot: buat `boot_id` baru dan mulai `sequence_no` dari 0. Pertahankan `counter_epoch` dan nilai kumulatif bila counter masih kontinu.
- Counter hilang/reset: naikkan `counter_epoch` secara persisten sebelum mengirim nilai counter baru. Jangan menurunkan energi dalam epoch yang sama.
- Retry: gunakan boot, sequence, channel, timestamp, epoch, dan seluruh nilai yang sama. Backend mengabaikan replay identik sebagai `duplicate_sequence`.
- Identitas sama dengan isi berbeda adalah `identity_conflict` dan ditolak; firmware tidak boleh “memperbaiki” sampel dengan menggunakan sequence lama.

## Sampling dan gangguan koneksi

Baseline integrasi adalah satu sampel per channel setiap 60 detik. Ini bukan ambang gap billing production; ambang tersebut tetap menunggu hasil uji firmware dan perangkat nyata. Firmware sebaiknya juga menghasilkan sampel tepat pada boundary periode bila scheduler backend/hardware kelak menyediakannya.

Saat Wi-Fi/MQTT terputus:

1. tetap ukur pada interval yang sama;
2. simpan antrean terbatas secara persisten beserta identitas dan timestamp asli;
3. kirim kembali berurutan setelah reconnect dengan QoS 1;
4. jangan mengganti sequence/timestamp saat retry;
5. bila buffer penuh, catat kehilangan lokal dan jangan mengarang sampel pengganti.

Ukuran dan endurance flash harus diputuskan tim hardware. Broker/backend bukan jaminan penyimpanan offline tanpa batas.

## Mengapa counter harus kumulatif

Counter kumulatif memungkinkan backend menghitung delta antara dua boundary, mendeteksi replay, gap, reset, dan counter turun, serta memverifikasi continuity setelah restart. Energi interval saja tidak menyediakan anchor sebelum/sesudah periode dan mudah terhitung ganda pada QoS 1. Menjumlahkan energi interval juga dapat menyembunyikan sampel hilang. Karena itu billing hanya memakai delta counter kumulatif yang terbukti valid.

## Penolakan dan diagnosis

`mqtt_rejections` hanya menyimpan reason, waktu, ukuran, serta hash topic/payload—tidak menyimpan payload mentah atau secret. Log backend menampilkan reason tanpa UID/payload. Reason utama:

- `unregistered_device_uid`, `inactive_device`;
- `unregistered_channel`, `no_installation_at_timestamp`;
- `invalid_timestamp`, `invalid_boot_id`, `invalid_sequence_no`;
- `invalid_json`, `unknown_field`, `invalid_energy_kwh`, `invalid_qos`, `retained_not_allowed`;
- `duplicate_sequence` untuk replay identik (bukan rejection row);
- `identity_conflict` untuk sequence sama dengan isi berbeda.

## Pemeriksaan sebelum pemasangan

Owner terautentikasi dapat membaca:

`GET /api/owner/hardware-readiness?device_uid={uid}&at={RFC3339}`

Respons mengembalikan device, installation aktif pada waktu tersebut, meter asset, channel, target kamar/fasilitas, serta `ready` dan `issues`. Endpoint tidak mengubah data. Tenant mendapat 403 dan device owner lain menjadi 404.

CLI lokal read-only:

```powershell
.\scripts\docker.ps1 compose exec -T backend node scripts/verify-device-readiness.js <device_uid> <owner_uuid> 2026-09-24T00:00:00Z
```

Contoh konfigurasi aman ada di `docs/examples/esp32-config.example.h`. Salin ke lokasi firmware yang diabaikan Git dan isi melalui provisioning lokal; jangan commit hasilnya.
