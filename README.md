# SmartBilling — Capstone A05

Persiapan pengembangan web app monitoring dan billing listrik kost. Pengguna menangani fullstack; fairness, kalibrasi sensor, dan hardware dikoordinasikan anggota lain.

Repository: `C:\Users\Admin\source\repos\SmartBilling`.

## Mulai

1. Baca [AGENTS.md](AGENTS.md), [handoff](docs/HANDOFF.md), [PRD](docs/PRD.md), [arsitektur](docs/ARCHITECTURE.md), dan [ERD](docs/database/cpstn-erd-final.md).
2. Ikuti [petunjuk lingkungan lokal](docs/LOCAL-DEVELOPMENT.md) untuk inisialisasi, build, startup, dan smoke test.

Lingkup saat ini adalah Node.js/Express minimum, PostgreSQL, dan Mosquitto dalam Docker Compose. Belum ada frontend, autentikasi aplikasi, ingest sensor, sesi RFID, billing, atau migration ERD. Stack minimum yang disetujui: JavaScript, Express, `pg` tanpa ORM, MQTT.js, dan Eclipse Mosquitto. Frontend dan ORM aplikasi belum dipilih.

## Keputusan produk

- ESP32 mengirim pembacaan sensor dan event RFID melalui MQTT; perhitungan berada di backend.
- Tap awal memulai sesi, tap berikutnya mengakhirinya.
- PostgreSQL menyimpan histori untuk pengamatan tujuh hari dan perbandingan; tidak ada penghapusan otomatis pada hari ketujuh.
- Docker untuk pengembangan lokal, Railway sebagai target deployment berikutnya.
- Asumsi fairness tambahan dalam ERD belum seluruhnya disetujui.
