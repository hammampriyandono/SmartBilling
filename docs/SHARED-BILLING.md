# Komunal bersama dan billing

Keputusan pengguna 30 Oktober 2026: lampu bersama setelah meter utama dan di luar kedua meter kamar dibagi rata kepada penghuni aktif. Gloria dan Rozan saat ini masing-masing menerima separuh. Ini menggantikan asumsi ERD lama tentang pembagian per kamar untuk periode yang mengaktifkan aturan baru.

## Perhitungan

Semua energi berasal dari delta counter pada rentang yang sama:

```text
Energi bersama = konsumsi utama − seluruh konsumsi kamar
                − konsumsi fasilitas attributable yang bermeter terpisah
Bagian bersama = energi bersama / jumlah penghuni aktif
Energi ditagihkan = energi kamar + alokasi RFID valid + bagian bersama
Biaya = energi ditagihkan × tarif, dengan pembulatan Rupiah akhir
```

Meter shared khusus, bila kelak dipasang, menjadi pembanding dan tidak ditambahkan lagi ke residual. Energi fasilitas attributable yang dikurangi dari residual tetap memerlukan alokasi sesi RFID yang sah pada tagihan final. Lampu bersama tidak memerlukan tap RFID. Beban lain dan selisih pengukuran dapat ikut residual; labelnya **estimasi energi bersama**, bukan pengukuran khusus satu lampu atau hasil kalibrasi.

Tidak menghitung dari angka 5 W pada label lampu, menjumlahkan counter mentah antarmeter, mengubah timestamp atau menginterpolasi data.

## Rentang dan penghuni

Aturan `equal_active_occupants_v1` memakai putaran UTC 60 detik: satu pembacaan production/valid per meter dalam 2 detik pertama menit, spread maksimal 1 detik. Dibutuhkan satu meter utama dan satu meter setiap kamar pada katalog pengamatan, termasuk kamar kosong. Fasilitas attributable juga harus selaras agar tidak ditagihkan lagi sebagai shared.

Delta putaran berurutan dikumpulkan menjadi rentang tersambung dengan penerima dan dasar tarif yang sama. **Jangan membuang residual negatif per menit dan hanya menagih yang positif**: resolusi Wh dapat membuat counter antarmeter bertambah pada menit berbeda. Residual yang tetap negatif setelah satu rentang dijumlahkan membuat shared `review/null`, bukan nol. Gap, reset, data invalid/duplikat atau waktu tidak selaras memutus rentang; tidak membuat sampel pengganti.

Pembagi mengikuti occupancy yang mencakup seluruh interval, bukan jumlah ESP atau angka tetap dua. Pengguna ganda, occupancy simulasi atau perpindahan di tengah interval tanpa batas terukur perlu ditinjau; tidak mengarang energi melalui prorata durasi. Tanpa penghuni aktif, pembagian belum tersedia. Pergantian meter dalam satu periode ditandai pemetaan perlu ditinjau pada versi ini.

## Estimasi dan final

- Owner melihat energi/biaya bersama, pembagi, bukti rentang serta bagian tiap penghuni. Tenant hanya menerima energi kamar, bagian bersama dan total miliknya; tanpa identitas tetangga, counter utama atau snapshot alokasi seluruh properti.
- Estimasi boleh berupa subtotal parsial dari interval valid, dengan cakupan/alasan terlihat. Jika shared belum tersedia, total gabungan juga belum tersedia; biaya kamar tetap tersimpan terpisah. Estimasi RFID belum ditambahkan; kalkulasi final tetap memakai alokasi RFID existing.
- Dasar estimasi mengikuti jadwal tarif properti. Bila belum ada jadwal, acuan expo existing Rp1.444,70/kWh tetap diberi label asumsi estimasi. Ini bukan tarif operasional. Finalisasi memerlukan tarif operasional, tanpa default tersembunyi atau tarif khusus pratinjau.
- Final membutuhkan rentang bersama lengkap sesuai toleransi batas, energi kamar yang cocok dengan rentang residual, serta rekonsiliasi utama/fasilitas valid. Pergantian penghuni/tarif yang belum didukung kalkulator final tetap `review`.
- Energi dibagi presisi 9 desimal; sisa terkecil mengikuti ID occupancy yang urut. Biaya memakai BigInt dan sisa terbesar. Jumlah bagian final sama dengan total yang dibulatkan; selisih Rp1 dicatat sebagai `rounding_adjustment_rp`. Estimasi komponen terpisah dapat berbeda Rp1 dari final.

## Penyimpanan dan penggunaan

Migration `027_shared_billing.sql` menambah `billing_periods.shared_summary`, serta `shared_energy_kwh` dan `shared_cost_rp` pada room bill/share. Kolom nullable mempertahankan nominal lama; tidak ada hitung ulang histori melalui migration. Guard PostgreSQL memeriksa total energi utama, energi/biaya shared, jumlah bagian dan pembulatan sebelum finalisasi. Trigger immutable existing melindungi snapshot final termasuk kolom baru.

Periode baru menawarkan checkbox **Bagi rata komunal bersama kepada penghuni aktif**, default aktif. Periode lama tanpa `shared_allocation` mempertahankan perilaku lama sampai aturan draft/review diperbarui. Penyimpanan aturan mengosongkan kalkulasi draft agar dapat dihitung ulang. Tagihan final hanya dapat diperbaiki melalui revisi/koreksi. Tidak ada finalisasi atau pembayaran otomatis.

Query shared dibatasi 250.000 sampel untuk mendukung periode bulanan prototipe; di atas batas ditandai rentang terlalu besar. Batas ringkasan kamar existing tetap berlaku. Tidak menghapus histori untuk memenuhi batas. Saat rangkaian dimatikan, histori dan estimasi terakhir tetap tersedia; data sesudah pembacaan terakhir tidak dianggap konsumsi nol.

## Verifikasi

Unit menguji baseline counter berbeda, residual negatif sementara/akhir, data kosong/reset/duplikat/simulasi, occupancy, fasilitas RFID, pencegahan hitung ganda dan isolasi tenant. Uji PostgreSQL terisolasi dengan fixture rollback menguji estimasi, final, pembulatan Rp108+Rp109=Rp217, penolakan invariant yang tidak cocok, immutable final dan revisi.

Pada laptop, aturan diaktifkan melalui API owner dengan CSRF, idempotensi, row version dan audit pada dua draft existing. Tidak membuat tarif operasional, tagihan final, pembayaran atau data sensor buatan. Pemeriksaan 15.57–15.59 WIB menunjukkan subtotal bersama 0,003 kWh: masing-masing 0,0015 kWh dan estimasi Rp2 memakai acuan expo. Cakupan masih parsial; draft berstatus review karena rentang historis dan tarif belum lengkap. Bukti privat di `.local/shared-billing/`; cadangan/kredensial tidak masuk Git.
