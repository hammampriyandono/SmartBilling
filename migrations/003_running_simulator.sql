-- Checkpoint development-only. Sensor readings are still written only by MQTT ingest.
CREATE SCHEMA IF NOT EXISTS dev_checks;
CREATE TABLE dev_checks.running_simulator (
  meter_id uuid PRIMARY KEY REFERENCES meters(id) ON DELETE RESTRICT,
  checkpoint jsonb NOT NULL CHECK (jsonb_typeof(checkpoint) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
