CREATE TABLE mqtt_rejections (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now(),
  reason varchar(64) NOT NULL,
  topic_sha256 char(64) NOT NULL,
  payload_sha256 char(64) NOT NULL,
  payload_bytes integer NOT NULL CHECK (payload_bytes >= 0)
);
CREATE INDEX mqtt_rejections_received ON mqtt_rejections(received_at);
-- Tidak menyimpan payload mentah: pesan invalid dapat memuat secret/PII tak terduga.
