# SmartBilling — Capstone A05

Persiapan pengembangan web app monitoring dan billing listrik kost. Pengguna menangani fullstack; fairness, kalibrasi sensor, dan hardware dikoordinasikan anggota lain.

Repository: `C:\Users\Admin\source\repos\SmartBilling`.

## Mulai

1. Baca [AGENTS.md](AGENTS.md), [handoff](docs/HANDOFF.md), [PRD](docs/PRD.md), [arsitektur](docs/ARCHITECTURE.md), dan [ERD](docs/database/cpstn-erd-final.md).
2. Ikuti [petunjuk lingkungan lokal](docs/LOCAL-DEVELOPMENT.md) untuk inisialisasi, build, startup, dan smoke test.

Lingkup saat ini adalah Node.js/Express, PostgreSQL, dan Mosquitto dalam Docker Compose. Migration inti monitoring serta API daftar/latest/histori telah ditulis; lihat [API monitoring](docs/API-MONITORING.md) untuk status uji dan batasnya. Ingest sensor serta simulator menunggu keputusan [usulan kontrak MQTT](docs/MQTT-CONTRACT.md). Belum ada frontend, autentikasi aplikasi, sesi RFID, atau billing. Stack yang disetujui: JavaScript, Express, `pg` tanpa ORM, MQTT.js, dan Eclipse Mosquitto. Frontend dan ORM aplikasi belum dipilih.

## Keputusan produk

- ESP32 mengirim pembacaan sensor dan event RFID melalui MQTT; perhitungan berada di backend.
- Tap awal memulai sesi, tap berikutnya mengakhirinya.
- PostgreSQL menyimpan histori untuk pengamatan tujuh hari dan perbandingan; tidak ada penghapusan otomatis pada hari ketujuh.
- Docker untuk pengembangan lokal, Railway sebagai target deployment berikutnya.
- Asumsi fairness tambahan dalam ERD belum seluruhnya disetujui.
