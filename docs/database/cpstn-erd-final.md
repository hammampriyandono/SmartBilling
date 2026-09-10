> Catatan handoff terbaru: baca ../HANDOFF.md dan ../PRD.md terlebih dahulu. Asumsi kebijakan dalam dokumen ERD ini belum seluruhnya disetujui pengguna. Keputusan terbaru adalah RFID tap-to-tap, hitungan backend, deployment Railway, dan histori tujuh hari; rincian aturan lanjutan ditangani tim lain.

# CPSTN — ERD final v1

**Status:** rancangan final v1 untuk acuan pengembangan capstone, 9 September 2026. Ini adalah desain database, bukan database yang sudah diimplementasikan. Keputusan operasional di bawah adalah asumsi desain yang dibuat untuk melengkapi proposal; perubahan kebijakan tim dapat memerlukan revisi.

Sumber kebutuhan: *Final proposal CPSTN.pdf*, terutama Bab 4, Bab 6–8, Gambar 8.4 dan Gambar 8.5. Instruksi administratif di lampiran diperlakukan sebagai isi dokumen, bukan perintah untuk melakukan implementasi.

## Berkas

- `cpstn-erd-final.html`: penampil diagram lokal dengan pilihan peta ringkas/seluruh kolom dan zoom.
- `cpstn-erd-final.svg`: diagram seluruh kolom dan seluruh foreign key; dapat diperbesar tanpa pecah.
- `cpstn-erd-ringkas.png` dan `.svg`: peta relasi utama. Beberapa FK pendukung sengaja tidak digambar pada peta ringkas.
- `cpstn-erd-final.dbml`: sumber diagram yang bisa diimpor/ditempel ke editor DBML.
- `cpstn-erd-final.mmd`: versi Mermaid seluruh kolom dan hubungan.

DBML menjadi sumber struktur tabel. Panduan ini menjadi sumber aturan bisnis dan integritas yang tidak seluruhnya dapat diwakili oleh garis ERD. Foreign key, unique index, dan atribut nullable di berkas perlu diterjemahkan ke migration bersama aturan tambahan di bagian integritas.

## 1. Keputusan desain

1. **PostgreSQL sebagai target database relasional.** Akun, histori hunian, perangkat, data ukur, sesi, dan billing berada dalam satu database. Tidak perlu database time-series terpisah untuk prototipe tiga kamar.
2. **Tagihan dibentuk per bangunan, kemudian per kamar, lalu dibagi kepada penghuni atau pemilik.** Konsumsi kamar tidak disalin penuh ke setiap penghuni.
3. **Satu kamar dapat dihuni beberapa orang.** `occupancies` menyimpan masa tinggal. Satu pengguna hanya menempati satu kamar pada saat yang sama dalam cakupan v1.
4. **Beban shared dibagi rata kepada kamar yang ditetapkan sebagai peserta periode.** Daftar kamar dan pembagi dibekukan pada `policy_snapshot`. Kamar peserta harus memiliki cakupan pengukuran lengkap; perubahan kamar aktif di tengah periode memerlukan review, bukan otomatis mengubah pembagi.
5. **Kamar kosong tetap mendapat bagian shared.** Bagian tersebut dan pemakaian kamar ketika kosong menjadi tanggungan owner. Tidak dialihkan diam-diam kepada kamar lain.
6. **Penggunaan fasilitas komunal dibagi kepada anggota sesi yang terdaftar.** Setiap anggota berbobot sama. Dua anggota dari kamar yang sama tetap dihitung sebagai dua pengguna; bagiannya kemudian dijumlahkan ke kamar tersebut.
7. **Anggota sesi dibekukan saat sesi aktif.** Penghuni tambahan dapat didaftarkan pada tahap pending. Perubahan anggota setelah pemakaian mulai harus menutup segmen sesi lama dan memulai sesi baru dengan pembacaan batas yang sama. Ini menghindari pembebanan pemakaian sebelum seseorang bergabung.
8. **Billing menggunakan selisih counter kWh yang valid.** Nilai counter kumulatif tidak dijumlahkan antar sampel. Data daya digunakan untuk monitoring dan pemeriksaan, bukan menggantikan counter tanpa kebijakan estimasi yang eksplisit.
9. **Hasil final merupakan snapshot.** Data yang terlambat tidak boleh mengubah tagihan final secara otomatis. Koreksi dibuat sebagai revisi pengganti yang menyimpan jejak versi sebelumnya.

Penggunaan `numeric` untuk energi/uang menghindari keterbatasan representasi floating-point pada nilai desimal. `timestamptz` digunakan untuk waktu kejadian; zona waktu bangunan tetap disimpan terpisah untuk menentukan batas hari/bulan. Lihat [PostgreSQL: Numeric Types](https://www.postgresql.org/docs/current/datatype-numeric.html) dan [Date/Time Types](https://www.postgresql.org/docs/current/datatype-datetime.html).

## 2. Fungsi 18 tabel

| Kelompok | Tabel | Fungsi |
|---|---|---|
| Akun dan hunian | `users` | Kredensial bersama untuk owner dan tenant; hanya password hash. |
| Akun dan hunian | `properties` | Bangunan kost, owner, dan zona waktu. |
| Akun dan hunian | `rooms` | Identitas kamar serta masa aktif kamar. |
| Akun dan hunian | `occupancies` | Relasi penghuni–kamar beserta awal/akhir masa tinggal. |
| Akun dan hunian | `rfid_cards` | Identitas kartu dan riwayat pendaftarannya ke pengguna. |
| Perangkat | `devices` | ESP32/pengirim MQTT, versi firmware, status, last seen. |
| Perangkat | `communal_loads` | Identitas dan jenis fasilitas komunal. |
| Perangkat | `meters` | Pemasangan meter pada jalur utama, kamar, atau fasilitas. |
| Data | `meter_readings` | Sampel listrik mentah dengan identitas pesan dan epoch counter. |
| Data | `device_events` | Inbox kejadian RFID/sesi/reset dan status pemrosesan. |
| Sesi | `usage_sessions` | Interval penggunaan fasilitas, pembacaan batas, dan status. |
| Sesi | `session_participants` | Anggota sesi, masa tinggal, dan kartu yang digunakan. |
| Billing | `billing_periods` | Total tagihan bangunan, rentang waktu, tarif efektif, kebijakan dan revisi. |
| Billing | `period_meter_totals` | Snapshot konsumsi setiap pemasangan meter dalam periode. |
| Billing | `room_bills` | Ringkasan tiga komponen biaya untuk satu kamar. |
| Billing | `bill_shares` | Bagian tagihan kamar untuk setiap masa tinggal; null penghuni berarti bagian owner. |
| Billing | `bill_session_allocations` | Energi peserta sesi yang masuk ke bagian tagihan tertentu. |
| Audit | `audit_logs` | Jejak koreksi, perubahan konfigurasi dan finalisasi. |

`bill_shares` dan `bill_session_allocations` berbeda: yang pertama menyimpan bagian total seseorang; yang kedua menjelaskan sesi mana yang menyumbang ke komponen attributable miliknya. Biaya sesi tidak disimpan lagi secara independen, sehingga tidak muncul dua sumber nominal yang berbeda.

## 3. Hubungan dan aturan pokok

**Hunian.** `properties → rooms → occupancies`, sedangkan `users → occupancies`. Masa tinggal lama tidak ditimpa ketika penghuni pindah. Gunakan interval `[starts_at, ends_at)`: awal termasuk, akhir tidak termasuk. Penghuni yang pindah tepat pada pukul 12.00 tidak tercatat di dua kamar pada saat yang sama.

**Meter.** `devices → meters → meter_readings`. `meters.kind` mengatur target:

| kind | room_id | communal_load_id |
|---|---|---|
| main | null | null |
| room | wajib | null |
| communal | null | wajib |

Satu bangunan memiliki tepat satu pemasangan meter utama aktif; satu kamar/fasilitas maksimal satu meter aktif. Riwayat pergantian boleh memiliki banyak record dengan masa pemasangan tidak bertumpang tindih. `device_id`, jenis, dan target pemasangan yang sudah memiliki data tidak boleh dipindahkan lewat update. Jika perangkat/meter diganti, tutup pemasangan lama dan buat pemasangan baru.

**Komunal.** `usage_sessions` menunjuk meter pemasangan tertentu, sehingga data sesi tetap menunjuk alat yang benar setelah alat diganti. Fasilitasnya diperoleh dari `meters.communal_load_id`. Sesi hanya boleh terjadi pada fasilitas attributable. Shared yang dihitung sebagai residual tidak membutuhkan fasilitas/meter dummy. Meter khusus shared boleh dipasang untuk pengecekan, tetapi hasilnya tidak ditambahkan lagi ke residual.

**Sesi banyak orang.** `usage_sessions → session_participants ← occupancies`. Kartu peserta harus terdaftar kepada pengguna yang sama dengan penghuni pada occupancy, dan berlaku pada waktu registrasi sesi. Bukti identitas tersebut tidak boleh bergantung pada pemilik kartu yang berubah di kemudian hari: revokasi assignment lama, lalu buat assignment baru bila kartu didaftarkan ulang.

**Billing.** `billing_periods → room_bills → bill_shares → bill_session_allocations`. Alokasi terakhir menunjuk `session_participants`. Tidak boleh mengaitkan peserta ke share penghuni lain, ke kamar lain, atau ke periode yang tidak beririsan.

## 4. Perhitungan yang dibekukan

Untuk satu periode dan satu versi perhitungan:

```text
E_main       = total energi valid meter utama pada periode
E_room[i]    = total energi valid jalur kamar i pada periode
E_attr[i]    = total alokasi sesi peserta yang tinggal di kamar i pada periode
E_shared     = E_main - SUM(E_room[i]) - SUM(E_attr[i])
r            = total_bill_rp / E_main

RoomCost[i]   = E_room[i] × r
AttrCost[i]   = E_attr[i] × r
SharedCost[i] = (E_shared / N_kamar_peserta) × r
Bill[i]       = RoomCost[i] + AttrCost[i] + SharedCost[i]
```

Seluruh meter dibandingkan pada batas waktu yang sama. `E_attr` adalah energi sesi teralokasi pada periode, bukan seluruh counter meter fasilitas. Konsumsi fasilitas di luar sesi bukan otomatis konsumsi pengguna terakhir. Standby boleh masuk residual shared bila kebijakan menyatakannya; pemakaian tanpa identitas yang semestinya memerlukan sesi harus ditandai untuk review.

**Residual negatif, E_main nol dengan tagihan positif, atau pengukuran utama yang belum lengkap menghalangi finalisasi.** Jangan menggunakan `max(0, residual)` untuk menyembunyikan ketidakseimbangan. Residual mencakup beban bersama dan selisih teknis pengukuran/rugi-rugi; dashboard perlu menamakannya secara jujur. Jangan mengklaim residual sebagai pengukuran murni lampu/pompa tanpa meter khusus.

### Pembagian di dalam kamar

Ini adalah **kebijakan tambahan desain**, karena proposal belum merinci pergantian penghuni dan kamar berisi beberapa orang.

- Pecah waktu kamar pada setiap perubahan penghuni. Untuk tiap interval, hitung konsumsi kamar dari pembacaan batas, lalu bagi rata di antara penghuni yang hadir pada interval itu.
- Konsumsi saat tidak ada penghuni dialokasikan ke share owner (`occupancy_id = null`).
- Bagian shared kamar dibagi menurut proporsi waktu. Untuk setiap interval, bagi porsinya kepada penghuni yang hadir; porsi interval kosong diberikan kepada owner.
- Energi attributable langsung masuk kepada peserta sesi yang sesuai, bukan dibagi lagi kepada seluruh penghuni kamar.
- Pembagian konsumsi kamar antarorang adalah alokasi, **bukan hasil pengukuran listrik individual**. Simpan interval, pembacaan acuan, anggota dan metode estimasinya dalam `allocation_evidence`.
- Bila tidak tersedia pembacaan tepat pada perubahan penghuni, interpolasi hanya boleh digunakan menurut kebijakan kualitas yang terdokumentasi. Jika gap terlalu panjang atau terjadi reset, tahan finalisasi untuk review.

### Sesi melewati akhir bulan

Sesi tidak boleh dimasukkan penuh ke dua bulan atau seluruhnya ke bulan berakhir. Iris energi sesi pada batas periode menggunakan data counter yang valid, kemudian bagi energi setiap irisan kepada anggota sesi. Simpan satu `bill_session_allocations` untuk setiap peserta dan share periode. Sesi boleh masih aktif saat periode sebelumnya difinalisasi hanya bila keanggotaan sudah tetap dan energi sampai batas bulan sudah tervalidasi. Jika occupancy peserta berakhir saat sesi aktif, tutup segmen pada batas tersebut untuk mencegah beban masuk ke penghuni/kamar yang salah.

### Pembulatan dan revisi

Hitung pada presisi desimal penuh; pembulatan Rupiah dilakukan saat menghasilkan tagihan. Gunakan metode sisa terbesar dengan urutan ID sebagai pemecah seri yang deterministik. Alokasikan sisa pembulatan secara bertingkat dari periode ke kamar, lalu dari kamar ke share. Simpan perubahan dari jumlah komponen yang telah dibulatkan pada `rounding_adjustment_rp`.

Invariant finalisasi:

```text
SUM(room_bills.total_cost_rp) = billing_periods.total_bill_rp
SUM(bill_shares.total_cost_rp per kamar) = room_bills.total_cost_rp
SUM(bill_session_allocations.allocated_energy_kwh per share)
    = bill_shares.attributable_energy_kwh
SUM(energi setiap komponen bill_shares per kamar)
    = energi komponen yang sama pada room_bills
total_cost_rp = room_cost_rp + attributable_cost_rp
              + shared_cost_rp + rounding_adjustment_rp
```

Revisi menggunakan `revision_no` berikutnya dan `supersedes_period_id`. Salin seluruh input/kebijakan dan hitung ulang sebagai satu snapshot pengganti. Setelah revisi final, versi lama ditandai superseded tanpa mengubah angka atau bukti perhitungannya. Dashboard memilih satu versi final yang berlaku; versi lama tidak ditambahkan ke tagihan baru. Ini tidak mencakup pengembalian uang atau payment gateway.

## 5. Aturan integritas untuk migration dan backend

**Sudah ditulis di DBML:** PK, FK dengan penghapusan restrict, nullable, unique email/device UID, serta kombinasi unik untuk data pesan, peserta sesi, snapshot meter dan tagihan. Normalisasi email menjadi lowercase sebelum disimpan.

**Harus ditambahkan saat implementasi:**

1. CHECK jenis/status yang diperbolehkan, nilai fisik valid/nonnegatif, `ends_at > starts_at`, `revision_no >= 1`, bobot peserta positif, dan target meter eksklusif. Nilai `rounding_adjustment_rp` boleh negatif. FK nullable tidak berarti semua kombinasi null valid.
2. Unique parsial untuk satu kartu aktif per UID (`revoked_at IS NULL`), satu sesi pending/active per meter, serta satu share owner per room bill (`occupancy_id IS NULL`). Unique biasa pada `(room_bill_id, occupancy_id)` belum membatasi beberapa baris null.
3. Pencegahan rentang occupancy pengguna bertumpang tindih; penghuni berbeda pada kamar yang sama diperbolehkan. Cegah rentang pemasangan meter bertumpang tindih per target/channel dan cegah periode billing bertumpang tindih, kecuali revisi dengan rentang identik.
4. Satu versi finalized yang berlaku per bangunan/rentang. Validasi rantai revisi: bangunan/rentang sama, revision bertambah satu, tidak ada siklus dan tidak ada dua pengganti untuk versi yang sama. Pembuatan/finalisasi revisi dilakukan atomik dengan penguncian periode.
5. Validasi lintas tabel: semua kamar, perangkat, fasilitas, periode, sesi dan share pada satu rangkaian billing harus berada pada bangunan yang sama. Peran pemilik/penghuni juga divalidasi; jangan mengandalkan kolom role di frontend.
6. Pembacaan awal/akhir sesi dan snapshot harus berasal dari meter terkait. Event sesi harus berasal dari device meter terkait. Meter harus terpasang pada waktu kejadian. Bila epoch counter berbeda, gunakan segmentasi dan bukti koreksi; tidak boleh langsung mengurangkan dua counter.
7. Peserta harus memiliki occupancy yang berlaku selama segmen sesi, kartu yang sah ketika registrasi, serta user yang sesuai. Sesi completed memerlukan peserta dan energi valid; pending yang belum dipakai tidak boleh menyumbang energi billing.
8. Satu peserta hanya boleh memiliki satu alokasi dalam satu revisi periode; share-nya harus memiliki occupancy yang sama. Unique yang melibatkan periode melalui parent membutuhkan validasi transaksi/trigger atau FK komposit tambahan pada migration.
9. Snapshot periode mencakup seluruh jalur energi tanpa hitung ganda. Jangan menghitung meter yang terpasang seri pada jalur yang sama sebagai dua sumber konsumsi. Total meter utama yang diganti di tengah periode harus merupakan gabungan interval pemasangan yang tidak tumpang tindih.
10. Finalisasi memverifikasi seluruh persamaan konservasi energi/biaya, bukti alokasi, kelengkapan data, dan status review. Lakukan dalam satu transaksi. Snapshot final dan turunannya tidak boleh diubah/hapus; status superseded hanya berubah melalui alur revisi.
11. Indeks baca tambahan: `meter_readings(meter_id, measured_at)`, `device_events(processing_status, received_at)`, `occupancies(room_id, starts_at)`, `occupancies(user_id, starts_at)`, `usage_sessions(meter_id, started_at)`, dan indeks pada FK yang sering di-join. Indeks kondisional dan interval tidak diwakili lengkap pada DBML ini.

CHECK dipakai untuk aturan satu baris. Aturan lintas baris/tabel perlu UNIQUE, FK, exclusion constraint, trigger, atau validasi transaksi sesuai kasus; jangan menulis CHECK yang membaca tabel lain. Rujukan: [PostgreSQL: Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html). Sintaks sumber diagram mengikuti [DBML documentation](https://dbml.dbdiagram.io/docs/).

## 6. Ketahanan data dan hak akses

Identitas pesan `(meter_id, boot_id, sequence_no)` dan `(device_id, boot_id, sequence_no)` harus berasal dari firmware dan tetap sama saat retransmisi. Backend melakukan insert idempoten. Duplikat dengan payload berbeda menjadi konflik yang perlu diperiksa, bukan menimpa data lama. Nomor urut perangkat tidak digantikan auto-increment database.

`boot_id` berubah ketika ESP32 restart; `counter_epoch` berubah ketika counter energi PZEM reset. Keduanya berbeda. Berhentinya koneksi tidak otomatis menghilangkan energi kumulatif, tetapi kejadian RFID/sesi tetap perlu retry dan penanganan urutan. Inbox `device_events` disimpan sebelum pemrosesan supaya kejadian gagal dapat dicoba ulang.

Data baru yang valid dapat memperbarui draft, tetapi tidak mengubah versi final. Data hilang tidak disimpan sebagai angka nol. Gap, reset, event terlambat, dan sesi ambigu ditandai. Kebijakan batas gap harus ditentukan dari pengujian interval sampling tim firmware dan dibekukan pada periode; angka toleransinya tidak dikarang di ERD.

Owner hanya mengakses properti miliknya. Tenant mengakses occupancy dan `bill_shares` miliknya, data kamar selama masa tinggalnya, serta detail sesi yang diikutinya. Jangan memberikan seluruh histori penghuni lama hanya karena pengguna sekarang menempati kamar yang sama. Batasi identitas peserta lain pada tampilan sesi bersama. `audit_logs` tidak menyimpan password, token autentikasi, atau kredensial broker.

## 7. Contoh konsistensi

Misalnya tagihan bangunan Rp540.000, energi utama 360 kWh, dan tiga kamar memiliki konsumsi 50, 100, serta 150 kWh. Energi attributable kamar masing-masing 10, 20, dan 0 kWh.

```text
Shared = 360 - (50 + 100 + 150) - (10 + 20 + 0) = 30 kWh
Tarif efektif = 540.000 / 360 = Rp1.500/kWh
Shared per kamar = 30 / 3 = 10 kWh
```

| Kamar | Kamar (kWh) | Attributable (kWh) | Shared (kWh) | Total biaya |
|---|---:|---:|---:|---:|
| A | 50 | 10 | 10 | Rp105.000 |
| B | 100 | 20 | 10 | Rp195.000 |
| C | 150 | 0 | 10 | Rp240.000 |
| Total | 300 | 30 | 30 | **Rp540.000** |

Jika A dihuni dua orang sepanjang periode, konsumsi kamar dan shared dibagi menjadi 25 dan 5 kWh per orang. Bila seluruh attributable A digunakan orang pertama, bagiannya menjadi Rp60.000, sedangkan orang kedua Rp45.000. Jumlahnya tetap Rp105.000.

Jika satu sesi menghabiskan 12 kWh dengan dua anggota dan melintasi bulan dengan irisan 4 kWh serta 8 kWh, setiap peserta mendapat 2 kWh pada bulan pertama dan 4 kWh pada bulan berikutnya. Total alokasi tetap 12 kWh. Contoh ini memerlukan pembacaan counter pada batas bulan; membagi berdasarkan durasi saja tidak selalu mewakili konsumsi sebenarnya.

## 8. Perubahan dari ERD proposal

- Owner/Tenant disatukan pada `users`; `occupancies` mempertahankan sejarah hunian.
- Meter utama dan komunal tidak lagi dipaksa memiliki `room_id`.
- Sesi dan peserta dipisahkan untuk banyak pengguna, dengan bukti kartu dan pembacaan energi.
- Ditambahkan sumber total tagihan dan snapshot konsumsi per periode.
- Tagihan kamar dan bagiannya dipisahkan, sehingga tidak ada duplikasi energi untuk kamar bersama.
- Sesi lintas periode memiliki alokasi terpisah yang dapat ditelusuri.
- Identitas pesan, status pemrosesan event, epoch counter, audit dan revisi melengkapi ketahanan data.

FDI tidak disimpan sebagai nilai billing operasional. Definisi biaya ideal pada Bab 2 perlu diselaraskan dengan model tiga komponen pada Bab 4 sebelum pengujian. Hasil pengujian menggunakan biaya acuan independen; membandingkan billing dengan rumus dan data yang sama hanya menunjukkan konsistensi aritmetika, bukan membuktikan akurasi atau keadilan eksternal.

## 9. Pemeriksaan hasil

Struktur diperiksa untuk 18 tabel, 36 foreign key, kecocokan tipe PK/FK, dan 10 kombinasi unique. Diagram dihasilkan dari definisi yang sama dengan DBML dan Mermaid. Contoh alokasi energi/biaya diperiksa secara aritmetis. Penampil lokal diperiksa untuk pergantian diagram dan zoom.

Belum dilakukan: migration PostgreSQL, uji concurrency, integrasi firmware/MQTT, atau impor melalui parser resmi DBML. Berkas ini tidak mengklaim semua aturan integritas sudah dieksekusi di database. Tahap implementasi tetap harus menerjemahkan aturan pada bagian 5 ke database/backend.
