# Kontrol relay kamar — persiapan tanpa ESP

## Mengganti driver setelah uji

Jika binding sudah memiliki history, polaritas record lama tetap immutable.
Tutup kontrol melalui `--mode disable`, lalu gunakan `--mode replace
--gpio-on-level <0|1> --row-version <VERSI_TERBARU> --reason "..."`.
Migration033 mengarsipkan binding lama dan membuat ID baru dalam keadaan nonaktif
untuk meter yang sama. ID baru harus dipasang pada firmware; telemetry/mapping
sensor tidak dipindah. Request lama ditahan oleh versi; laporan/dispatch binding
retired ditolak. Semua command lama tetap terlihat di histori kamar.
Setelah firmware dan heartbeat baru sesuai, buka mode uji lagi secara eksplisit.

## Akses uji lampu sebelum verifikasi fisik — 4 November 2026

Pengguna meminta mencoba tombol dan memperjelas bahwa beban Kamar2 hanya lampu.
Operator lokal dapat membuka mode uji eksplisit melalui utility development:
`--mode test --test-load-confirmed --row-version <VERSI_TERBARU> --reason "..."`.
Mode ini tidak menyatakan hardware terverifikasi dan diaudit sebagai `relay_test`.
Identitas, pemasangan aktif tunggal, statusfresh, otorisasi, CSRF, idempotency,
deadline15detik dan ACK tetap diperiksa. API dan worker memblokir perintah sesudah
`test_until` (15menit sejak dibuka); restart backend tidak memperpanjang jendela.
UI menampilkan mode uji/deadline dan pengguna perlu mengamati lampu langsung.
Berakhirnya akses **tidak mengubah output relay atau mematikan beban**.
`--mode disable` menutup akses lebih awal dan mengosongkan test_until.
Mode enable biasa tetap memerlukan hardware-verified. Tidak ada flash ulang
atau command ON/OFF otomatis ketika membuka mode uji. Status terkunci pada
catatan sebelumnya di bawah sudah digantikan oleh akses uji ini; baca HANDOFF.

Pembaruan terbaru 4 November: setelah dipasang, pengguna melaporkan relay dan
lampu menyala sementara heartbeat asli GPIO3HIGH. Kandidat koreksi kembali ke
HIGH=ON/LOW=OFF telah dipasang pada ESP asli10003bb78ff4 dan bindinggpio_on_level1
lokal; heartbeatUSB16:11WIB GPIOLOW/stateOFF. Binding tetap nonaktif sampai uji
fisik kondisi awalOFF. Label UI mengikuti polaritas binding dan menolak state/GPIO konflik.
Status upload dan verifikasi terbaru dicatat pada HANDOFF.

Pembaruan4November2026: pengguna memilih mencoba sesuai header elektro yang
menetapkan **LOW=ON/HIGH=OFF**. Dukungan polaritas per binding ada pada migration031;
default1 mempertahankan instalasiHIGHlama. Parser menerima bentuk status, service
memeriksa pasanganstate/GPIO terhadap binding, dan CHECK database menegakkannya.
Polaritas hanya dapat diganti saat binding nonaktif/tanpa command dan status lama
dikosongkan. Firmware memakai ROOM_RELAY_ACTIVE_LOW1 untuk bindinggpio_on_level0.
Uji rangkaian tanpa beban dan commissioning tetap diperlukan; source/codecheck
bukan bukti kontak/tegangan jalur. Riwayat2November di bawah tetap memakaiHIGH.
Pada 4 November firmware telah dipasang pada ESP Kamar2 asli10003bb78ff4 dan
migration031 diterapkan lokal. Binding tetap nonaktif; GPIOLOW yang dilaporkan
setelah boot belum membuktikan kondisi kontak. Belum ada perintah ON/OFF atau
commissioning fisik. Detail hasil dan backup ada di HANDOFF terbaru.

Status 2 November 2026: **jalur dashboard → MQTT → board uji → ACK GPIO sudah terpasang dan diverifikasi** pada COM5/MAC10:00:3b:b6:c9:28. Atas koreksi pengguna, GPIO3 HIGH=ON dan LOW=OFF. Uji live mengirim satu OFF yang terkonfirmasi GPIOLOW; tidak mengirim ON dan kontak/tegangan jalur belum diukur. Pemasangan Kamar2 sementara mengikuti board cadangan melalui lifecycle API; histori node asli tetap tersimpan dan firmware node asli belum diubah. WiFi/MQTT kembali tersambung setelah keluar bootloader. PZEM masih belum meresponsUART0/25byte sehingga belum ada pengukuran baru dari pemasangan uji.

## Lingkup dan keputusan

- Pembaruan pengguna 2 November: **ESP baru menjadi board uji coba** berbasis `pzem-dashboard` untuk pengembangan relay. ESP Kamar2 existing disimpan sebagai cadangan jika pengujian gagal. Bukan kebutuhan controller relay terpisah; pemetaan relay ke device pemasangan meter pada persiapan ini tetap sesuai. MAC/UID board uji belum tersedia. Firmware/config board cadangan dipertahankan, board baru memakai identitas/kredensialnya sendiri. Mapping/histori Kamar2 belum dipindah; jika board uji nanti menggantikan pembaca fisik, gunakan lifecycle pemasangan sesuai waktu perpindahan sebenarnya, bukan dua pemasangan aktif atau meniru identitas board lama.
- Urutan uji yang ditegaskan pengguna: **flash ESP baru → pasang sementara menggantikan ESP Kamar2 → uji PZEM serta ON/OFF dari dashboard → setelah berhasil, flash mekanisme yang sama ke ESP Kamar2 asli**. Board asli menjadi cadangan selama percobaan. Firmware akhir tiap board tetap memakai identitas/config masing-masing; jangan menyalin binary berkredensial/UID board uji ke board asli. Backup dan pemeriksaan target dilakukan sebelum masing-masing upload.
- Pengguna mengizinkan persiapan kontrol dari rumah; ESP berada di bengkel. Kamar 2 adalah calon target pertama, belum identitas perangkat yang terverifikasi. Target mengikuti pemasangan meter aktif, bukan nama kamar atau MAC yang ditanam di kode. Perpindahan pemasangan membuat binding baru; binding lama tidak dipindahkan diam-diam.
- Versi awal berupa permintaan ON/OFF manual oleh owner dengan alasan dan konfirmasi tujuan. Tenggat pembayaran/masa sewa serta pemutusan otomatis belum ditetapkan dan tidak diimplementasikan.
- Default implementasi: feature flag `ROOM_RELAY_CONTROL_ENABLED=false`, binding kosong/nonaktif, batas eksekusi 15 detik, heartbeat perangkat maksimal berumur 30 detik, polling web 5 detik. Angka ini merupakan pilihan implementasi, bukan kebijakan tenggat penghuni.
- Instance lokal sudah opt-in hanya untuk binding uji Kamar2 dan UID board cadangan. Tanggal2November pengguna menetapkan HIGH=ON/LOW=OFF, menggantikan activeLOWtrue dalam header elektro awal. `relay_control.h` disesuaikan minimal; Serial dan MQTT kini membaca GPIO3 secara langsung. GPIOLOW0 adalah laporan asli, bukan pengganti data hilang.
- Relay satu kanal: satu ESP harus memiliki tepat satu pemasangan aktif berupa meter kamar. Device dengan pemasangan ganda, meter utama/komunal, fixture simulasi, perangkat nonaktif, dan pemasangan yang sudah berakhir tidak boleh dikendalikan.
- Laporan relay berarti state GPIO/driver yang dilaporkan firmware. Tanpa sensor kontak/tegangan terpisah, ini belum membuktikan listrik pada jalur kamar benar-benar ON/OFF.

## Web dan backend

Panel **Relay kamar** berada di Monitoring listrik untuk meter kamar owner. Tenant tidak melihat tombol dan seluruh endpoint kontrol menolak tenant di server.

`GET /api/owner/rooms/:roomId/relay` mengembalikan pemasangan saat ini, identitas device, binding, versi, state/freshness, alasan tombol nonaktif, serta sepuluh perintah terakhir. State kosong/lama tetap tidak diketahui; daya 0 W tidak dipakai sebagai bukti relay OFF.

`POST /api/owner/rooms/:roomId/relay/commands` menerima hanya `meter_id`, `row_version`, `desired_state=on|off`, dan `reason`. Wajib sesi owner, CSRF dan `Idempotency-Key` UUID. Respons 202 mencatat permintaan, bukan menyatakan relay berhasil berubah. Retry key/body sama mengembalikan perintah yang sama, termasuk setelah restart. Key dipakai untuk payload berbeda ditolak. Satu binding hanya boleh memiliki satu perintah pending.

Migration `029_room_relay.sql` menambahkan binding dan outbox. Identitas binding/pemasangan immutable, perintah memiliki nomor urut global, batas waktu dan status. Audit permintaan memakai `audit_logs`; retry tidak menambah audit/perintah ganda. Worker mengirim QoS1 non-retained, mengulangi wire yang sama paling cepat tiga detik, dan memeriksa kembali mapping, owner, boot, status serta deadline sebelum publish. Timeout ditampilkan sebagai **belum terkonfirmasi**, karena perangkat mungkin sudah mengeksekusi tetapi ACK hilang. Tidak ada fallback ke reset counter, timer pemutusan, RFID atau pembuatan data sensor.

Broker PUBACK hanya mengakui pesan MQTT. Status `confirmed` memerlukan laporan perangkat dengan command ID, sequence, binding, boot, state dan waktu yang cocok. ACK tertunda dapat menyelesaikan histori tanpa menimpa heartbeat yang lebih baru. Replay/retained report tidak menyegarkan liveness.

## Kontrak MQTT sementara untuk adapter firmware

Kontrak ini dipakai adapter pada `firmware/pzem-relay-trial/relay_dashboard.h`, di atas fungsi relay elektro dan portal existing. Transport kontrol memakai API native lwmqtt yang sudah dibundel library MQTT existing, dengan clientID bersufiks relay; telemetri mempertahankan koneksinya sendiri. QoS1 dan nonretained diperiksa sebelum pesan masuk antrean, eksekusi/publish dilakukan di luar callback. Jadwal sensor dan cadangan waktu putaran UTC dipertahankan. Status mencerminkan GPIO, bukan sensor kontak.

Topik per perangkat:

| Arah | Topik | QoS / retain |
|---|---|---|
| Backend → ESP | `smartbilling/v1/devices/{device_uid}/relay/commands` | 1 / false |
| ESP → backend | `smartbilling/v1/devices/{device_uid}/relay/status` | 1 / false |

Contoh perintah (semua identitas/waktu contoh; bukan pesan untuk perangkat nyata):

```json
{
  "schema_version": 1,
  "command_id": "11111111-1111-4111-8111-111111111111",
  "binding_id": "22222222-2222-4222-8222-222222222222",
  "sequence_no": "12",
  "target_boot_id": "33333333-3333-4333-8333-333333333333",
  "desired_state": "off",
  "issued_at": "2026-11-02T02:00:00.000Z",
  "expires_at": "2026-11-02T02:00:15.000Z"
}
```

Nomor urut command berbentuk string integer positif agar tidak kehilangan presisi bigint di JavaScript. Binding UUID dikonfigurasi secara eksplisit pada adapter, bukan diterima bebas dari pesan. Boot ID memakai boot aktual firmware; backend mengambilnya dari heartbeat, bukan dari frontend.

Heartbeat/ACK menggunakan field wajib berikut:

```json
{
  "schema_version": 1,
  "binding_id": "22222222-2222-4222-8222-222222222222",
  "boot_id": "33333333-3333-4333-8333-333333333333",
  "report_sequence": 1,
  "reported_at": "2026-11-02T02:00:01.000Z",
  "state": "off",
  "gpio_pin": 3,
  "gpio_level": 0,
  "command_id": null,
  "command_sequence": null,
  "result": "status",
  "reason": null
}
```

- `report_sequence`: integer aman JavaScript, meningkat untuk setiap laporan dalam boot yang sama. Heartbeat sekitar 10 detik, serta setelah perubahan Serial/lokal. Timestamp akuisisi state menggunakan NTP aktual; jangan memalsukan waktu lama menjadi waktu kirim ulang.
- `gpio_pin` wajib3 dan `gpio_level` wajib0/1; `state` harus sesuai `gpio_on_level` pada binding: level yang sama berarti ON, level lainnya OFF. Default1 mempertahankan HIGH/ON dari migration030; migration031 mendukung active LOW secara eksplisit. Laporan tanpa GPIO tetap tidak siap dikendalikan.
- Heartbeat: `result=status`, command ID/sequence/reason null. ACK sukses: `result=applied`, command ID/sequence dari perintah, state hasil baca driver dan reason null. Penolakan: `result=rejected`, command ID/sequence dari perintah dan reason `expired|wrong_boot|superseded|relay_unavailable`.
- Firmware wajib memvalidasi namespace/topic, non-retained/QoS, field, NTP siap, binding/boot, deadline maksimal 15 detik, dan sequence sebelum mengubah GPIO. Pesan lama, salah target, sudah kedaluwarsa atau belum sinkron NTP tidak boleh mengubah relay. Nomor urut lebih rendah tidak boleh menimpa perintah baru; retry ID yang sama mengembalikan hasil sebelumnya tanpa mengeksekusi lagi. Boot baru menolak seluruh perintah boot lama.
- Pengiriman ulang ACK memakai waktu hasil asli; heartbeat baru memakai waktu state yang benar-benar diperiksa ulang. ACK baru hanya boleh dibuat setelah fungsi relay menyelesaikan perubahan/readback driver. Jangan menganggap pemanggilan fungsi atau MQTT publish sebagai bukti tegangan listrik.

ACL opt-in broker LAN: `ROOM_RELAY_DEVICE_UID` kosong tidak menambah izin. UID wajib akun PZEM terdaftar atau akun kombinasi PZEM yang secara eksplisit diizinkan (`RFID_PZEM_UID/EXTRA_UID`), bukan reader RFID biasa. Board cadangan memakai akun kombinasi milik MAC-nya sendiri. Hanya backend boleh menulis command target itu; hanya target boleh membaca command/menulis status. Observer dan perangkat lain tetap ditolak. Satu target uji dapat diganti lewat konfigurasi setelah verifikasi pemasangan.

## Persiapan dan commissioning nanti di bengkel

1. Dapatkan paket source lengkap yang benar-benar dipakai tim elektro saat tes, tanpa menyalin secret ke Git. Cocokkan fungsi ON/OFF/status dan polaritas driver dari `relay_control.h`. Pertahankan pin, inisialisasi, perintah Serial, parser PZEM, counter, Wi-Fi portal, checkpoint/antrean dan jadwal menit. Tambahkan adapter MQTT terpisah yang memanggil fungsi relay existing; jangan mengganti dasar kode yang sudah diuji.
2. Verifikasi MAC/UID board serta pemasangan meter Kamar 2 melalui Administrasi/API. Jangan mem-flash atau mengirim perintah berdasarkan tebakan nama board. Buat backup firmware sebelum upload sesuai workflow existing.
3. Migration menambahkan tabel kosong. Utility lokal berikut default **plan**, hanya membaca. Ganti placeholder memakai identitas yang sudah diverifikasi; jalankan di environment backend dengan secret mount existing:

```text
node scripts/configure-room-relay.js --owner-id <UUID_OWNER> --room-id <UUID_KAMAR> --meter-id <UUID_PEMASANGAN> --device-uid <UID_TERVERIFIKASI>
```

4. Tambahkan `--mode prepare --reason "Persiapan uji relay kamar"` untuk membuat binding **nonaktif** beserta audit. Rerun prepare memakai binding existing. Gunakan ID binding ini pada adapter firmware. Jangan menanam ID contoh.
5. Sesudah adapter siap, aktifkan izin broker hanya untuk UID terverifikasi dan flag backend agar dapat menerima laporan. Binding tetap nonaktif sehingga worker belum boleh mengirim perintah. Pertahankan ACL existing untuk telemetri/perangkat lain.
6. Periksa heartbeat asli dan uji driver/rangkaian bersama tim elektro. Untuk mengizinkan kontrol setelah verifikasi fisik, utility membutuhkan `--mode enable --hardware-verified --row-version <VERSI_TERBARU> --reason "Hasil uji fisik ..."`. Ia menolak status lama, target berubah/ambigu, versi stale dan perintah pending. Tidak ada langkah ini yang dijalankan otomatis.
7. Uji tombol owner ON dan OFF, cocokkan command/ACK dengan Serial serta kondisi beban. Uji tenant ditolak, koneksi putus, pesan ulang, lewat deadline, boot baru dan reconnect. Konfirmasi dari perangkat tetap harus dibedakan dari hasil pengukuran jalur listrik.

Untuk menonaktifkan akses kontrol, utility mendukung `--mode disable --row-version <VERSI_TERBARU> --reason "..."`. Ini menghentikan dispatch baru, **bukan perintah untuk mematikan beban**. Mengganti kamar/ESP menggunakan lifecycle pemasangan dan binding baru, bukan mengedit histori binding lama. Perintah yang telah masuk jaringan tetap bergantung pada validasi TTL firmware.

## Pengujian dari rumah

```powershell
node --test test/room-relay.test.js web/room-relay-data.test.js
node scripts/test-room-relay-isolated.js
node scripts/test-room-relay-broker-isolated.js
npm run build
```

Runner Docker menggunakan PostgreSQL/Mosquitto terpisah dengan `network none`, tanpa port host atau volume aplikasi. Semua identitas/pesan adalah fixture uji terpisah; tidak menjadi pembacaan/sesi/tagihan pengamatan. Uji broker mencakup izin default tertutup, command/status round trip, larangan lintas perangkat/arah/observer dan regenerasi ACL setelah restart. Uji ini membuktikan jalur software, bukan fungsi relay fisik atau kompatibilitas header yang belum diterima.
