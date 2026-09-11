# Usulan kontrak sensor simulasi v1

Status: **menunggu keputusan pengguna**, 11 September 2026. Belum ditemukan firmware atau kontrak payload di repository. Usulan ini tidak menyatakan kompatibilitas ESP32 nyata dan belum menjadi kontrak ingest yang aktif.

Topik: `smartbilling/sim/v1/devices/{device_uid}/readings`, QoS 1, retain false. Namespace `sim` hanya untuk pengujian; broker lokal tetap tidak dibuka ke LAN. Device UID dan channel dipetakan ke pemasangan meter pada database; sumber tidak dikenal ditolak dan tidak didaftarkan otomatis.

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

Aturan kualitas harian **disetujui pengguna pada 11 September 2026**, terpisah dari persetujuan kontrak MQTT yang masih tertunda: tidak melakukan interpolasi. Hari tanpa batas awal/akhir tepat atau memiliki gap/reset menghasilkan total null, dengan subtotal interval valid berlabel parsial. Sampling simulator 60 detik, toleransi gap 120 detik yang dapat dikonfigurasi. Nilai toleransi tersebut bukan ketentuan firmware atau kalibrasi sensor.
