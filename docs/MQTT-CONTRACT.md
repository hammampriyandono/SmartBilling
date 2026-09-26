# Kontrak sensor simulasi v1

Status: **disetujui pengguna untuk pengembangan lokal, 13 September 2026**, dan tetap menjadi kontrak simulator. Kontrak ESP32 produksi final yang kompatibel dengan payload v1 ini ditetapkan 24 September 2026 di [ESP32-MQTT-CONTRACT.md](ESP32-MQTT-CONTRACT.md).

Topik: `smartbilling/sim/v1/devices/{device_uid}/readings`, QoS 1, retain false. Namespace `sim` hanya untuk pengujian; broker lokal tetap tidak dibuka ke LAN. Device UID dan channel dipetakan ke pemasangan meter pada database; sumber tidak dikenal ditolak dan tidak didaftarkan otomatis.

Backend juga menerima topic produksi `smartbilling/v1/devices/{device_uid}/readings`. Namespace tidak mengubah schema payload atau menentukan provenance sendirian; provenance reading mengikuti meter installation yang diprovision.

```json
{
  "schema_version": 1,
  "boot_id": "550e8400-e29b-41d4-a716-446655440000",
  "sequence_no": 1,
  "channel_no": 1,
  "counter_epoch": 0,
  "measured_at": "2026-09-11T00:00:00Z",
  "energy_kwh": "12.345000000",
  "voltage_v": 220,
  "current_a": 0.5,
  "power_w": 100,
  "frequency_hz": 50,
  "power_factor": 0.91
}
```

- `boot_id`: UUID baru setiap boot. `sequence_no`: integer nonnegatif yang meningkat per channel/boot dan tidak berubah ketika pesan dicoba ulang. Gabungan meter, boot ID, sequence menjadi identitas deduplikasi sesuai ERD. ID yang sama dengan isi berbeda menjadi konflik, tidak menimpa baris lama.
- `channel_no`: channel perangkat, integer nonnegatif. `counter_epoch`: integer nonnegatif yang berubah saat counter energi direset, terpisah dari reboot ESP32.
- `measured_at`: waktu pengukuran RFC3339 dengan zona, maksimal milidetik; `received_at` dibuat backend. Waktu tiba bukan identitas pesan.
- `energy_kwh`: string desimal nonnegatif maksimal 11 digit integer dan 9 desimal untuk numeric(20,9), selalu counter kumulatif. Konsumsi dihitung dari delta counter yang konsisten.
- Parameter listrik lainnya opsional, nilai tidak tersedia dihilangkan atau null. Tidak diganti nol. Satuan mengikuti nama: V, A, W, Hz; power factor 0–1.
- Tidak ada RFID/billing dalam kontrak tahap ini. Pengamatan asli akan memerlukan kontrak firmware dan pemisahan environment yang ditinjau tersendiri.

Aturan kualitas harian **disetujui pengguna pada 11 September 2026**: tidak melakukan interpolasi. Hari tanpa batas awal/akhir tepat atau memiliki gap/reset menghasilkan total null, dengan subtotal interval valid berlabel parsial. Sampling simulator 60 detik, toleransi gap 120 detik yang dapat dikonfigurasi. Nilai toleransi tersebut bukan ketentuan firmware atau kalibrasi sensor.

## Detail implementasi lokal

Payload UTF-8 JSON object maksimal 4096 byte; field asing ditolak. Sequence harus integer aman JavaScript; channel dan epoch maksimal 2147483647. UID memakai 1–80 karakter huruf, angka, garis bawah atau tanda minus. Parameter opsional berupa JSON number sesuai presisi kolom SQL (V/Hz 4 desimal; A/W/faktor daya 6 desimal). Nol hanya diterima jika benar-benar dikirim.

Waktu dinormalisasi ke UTC, UUID ke huruf kecil, angka ke presisi SQL, missing/null opsional disetarakan. Duplikat identitas dengan isi semantik sama tidak menambah baris. Identitas sama dengan isi berbeda dicatat sebagai `identity_conflict`, tanpa menimpa data. Pencarian identitas melintasi pemasangan pada device/channel yang sama; perubahan timestamp tidak boleh menghindari konflik. Pemetaan mengikuti waktu pemasangan meter dan perangkat harus aktif.

`mqtt_rejections` menyimpan alasan, waktu terima, ukuran dan SHA-256 topik/payload; isi mentah tidak disimpan. QoS 0 ditolak. Flag retained yang diterima subscriber ditolak; MQTT 3 tidak selalu meneruskan flag retain publisher pada pengiriman langsung, sehingga pemeriksaan ini bukan bukti seluruh publish retain telah terdeteksi. Topik di luar subscription tidak diproses/dicatat.

Subscriber tunggal memakai client ID tetap dan sesi persisten. Callback acknowledgement selesai setelah transaksi pembacaan/penolakan tersimpan. Kegagalan DB dicoba ulang tiap dua detik dan readiness menjadi gagal. Antrean broker tetap terbatas: ini bukan jaminan tanpa kehilangan saat banjir pesan/gangguan panjang. Belum diuji fault injection saat transaksi berlangsung.

Simulator menggunakan boot virtual tetap `a0500000-0000-4000-8000-000000000001`, sequence dan counter deterministik lintas tanggal. Menjalankan ulang tanggal yang sama adalah replay boot virtual yang sama, bukan reboot perangkat baru. Per hari dibuat 1441 sampel termasuk kedua batas tengah malam Jakarta, delta 0,001 kWh per menit (1,44 kWh per hari). Batch 25 menunggu balasan probe backend dan memeriksa DB sebelum lanjut, termasuk saat replay. Simulator membaca DB untuk verifikasi lokal; seluruh penulisan pembacaan tetap melalui MQTT dan backend.

## Perbedaan prototipe Arduino/ESP32

Tambahan lokal 15 September 2026: simulator berkala memakai topik `smartbilling/sim/v1/devices/sim-running-01/readings`, channel 1, dengan schema v1 yang sama. Mapping eksplisit meter `00000000-0000-4000-8000-000000000105` terpisah dari dataset deterministik. Boot UUID baru per proses, counter epoch tetap 0, dan pesan pending direplay tanpa perubahan identitas/payload. Checkpoint development bukan field MQTT baru. Model counter/daya, batas durasi, serta perintah ada di LOCAL-DEVELOPMENT.md.

Informasi berikut berasal dari pengguna; perangkat belum diuji dengan backend ini.

| Prototipe saat ini | Simulasi v1 / penyelarasan berikutnya |
|---|---|
| `rumah/kamar/kamar2/telemetry`, `roomId` | Topik device UID dan `channel_no`; mapping kamar ditentukan database, bukan registrasi otomatis dari roomId. |
| `current`, `voltage`, `power` | `current_a`, `voltage_v`, `power_w`; pastikan satuan dan presisi firmware. |
| `energyWh` | `energy_kwh` string kumulatif; konversi Wh/1000 hanya setelah sifat kumulatif dan reset dikonfirmasi. |
| `status` | Tidak termasuk v1; perlu keputusan makna dan penempatan sebelum adapter menerima field ini. |
| Belum disebutkan | `schema_version`, UUID `boot_id`, `sequence_no`, `counter_epoch`, timestamp berzona perlu diselaraskan. |
| PubSubClient | Library standar hanya mendukung publish QoS 0; simulasi mensyaratkan QoS 1. Perlu keputusan firmware/library atau kontrak hardware tersendiri. |

Dukungan publish QoS 0 bersumber dari [README resmi PubSubClient](https://github.com/knolleary/pubsubclient). Kontrak final mensyaratkan QoS 1; tim firmware harus memakai library/implementasi yang benar-benar mendukung publish QoS 1 atau membawa bukti dan meminta revisi kontrak. Repository ini tidak mengganti library hardware, membuka LAN, atau mengklaim ESP32 fisik sudah berhasil diuji.
