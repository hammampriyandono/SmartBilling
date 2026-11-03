-- Connection diagnostics only; this table never creates sessions or energy readings.
CREATE TABLE rfid_device_status (
 device_id uuid PRIMARY KEY REFERENCES devices(id),
 boot_id uuid NOT NULL,
 connected boolean NOT NULL,
 reader_state text NOT NULL CHECK (reader_state IN ('ready','unavailable','error','unknown')),
 ntp_synced boolean NOT NULL,
 pending_tap boolean NOT NULL,
 uptime_ms bigint NOT NULL CHECK (uptime_ms BETWEEN 0 AND 4294967295),
 received_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX device_events_rfid_latest ON device_events(device_id,received_at DESC,id DESC) WHERE event_type='rfid_tap';
