# SmartBilling — Capstone A05

Persiapan pengembangan web app monitoring dan billing listrik kost. Pengguna menangani fullstack; fairness, kalibrasi sensor, dan hardware dikoordinasikan anggota lain.

Repository: `C:\Users\Admin\source\repos\SmartBilling`.

## Mulai

1. Baca [AGENTS.md](AGENTS.md), [handoff](docs/HANDOFF.md), [PRD](docs/PRD.md), [arsitektur](docs/ARCHITECTURE.md), dan [ERD](docs/database/cpstn-erd-final.md).
2. Ikuti [petunjuk lingkungan lokal](docs/LOCAL-DEVELOPMENT.md) untuk inisialisasi, build, startup, dan smoke test.

Lingkup saat ini adalah Node.js/Express, PostgreSQL, dan Mosquitto dalam Docker Compose, dengan dashboard React + Vite (JavaScript), Recharts dan CSS biasa. Buka **http://127.0.0.1:3000** setelah startup; klik **Dataset 12 Sep** untuk melihat data simulasi existing. Dashboard memakai API nyata, memuat seluruh pagination histori, dan polling health/latest lima detik.

Ingest memakai [kontrak simulasi v1](docs/MQTT-CONTRACT.md). Alur MQTT → DB → [API latest/histori/harian](docs/API-MONITORING.md) dan persistensi 1441 sampel telah teruji. Dashboard lokal diverifikasi di browser pada 14 September 2026. Belum ada integrasi hardware, autentikasi aplikasi, sesi RFID, atau billing. Stack backend tetap JavaScript, Express, `pg` tanpa ORM, MQTT.js dan Eclipse Mosquitto.

## Keputusan produk

- ESP32 mengirim pembacaan sensor dan event RFID melalui MQTT; perhitungan berada di backend.
- Tap awal memulai sesi, tap berikutnya mengakhirinya.
- PostgreSQL menyimpan histori untuk pengamatan tujuh hari dan perbandingan; tidak ada penghapusan otomatis pada hari ketujuh.
- Docker untuk pengembangan lokal, Railway sebagai target deployment berikutnya.
- Asumsi fairness tambahan dalam ERD belum seluruhnya disetujui.
