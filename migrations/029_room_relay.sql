-- Opt-in preparation only. No installation or device is enabled by this migration.
CREATE TABLE room_relay_bindings (
  id uuid PRIMARY KEY,
  meter_id uuid NOT NULL UNIQUE REFERENCES meters(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT false,
  row_version integer NOT NULL DEFAULT 1 CHECK (row_version > 0),
  last_boot_id uuid,
  last_report_sequence bigint CHECK (last_report_sequence >= 0),
  last_reported_at timestamptz,
  last_received_at timestamptz,
  reported_state text CHECK (reported_state IN ('on','off')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((last_boot_id IS NULL AND last_report_sequence IS NULL AND last_reported_at IS NULL
    AND last_received_at IS NULL AND reported_state IS NULL) OR
    (last_boot_id IS NOT NULL AND last_report_sequence IS NOT NULL AND last_reported_at IS NOT NULL
    AND last_received_at IS NOT NULL AND reported_state IS NOT NULL))
);

CREATE FUNCTION validate_room_relay_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.id,NEW.meter_id) IS DISTINCT FROM (OLD.id,OLD.meter_id) THEN
    RAISE EXCEPTION 'relay binding identity is immutable';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM meters WHERE id=NEW.meter_id AND kind='room') THEN
    RAISE EXCEPTION 'relay must reference a room installation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER room_relay_binding_valid BEFORE INSERT OR UPDATE ON room_relay_bindings
  FOR EACH ROW EXECUTE FUNCTION validate_room_relay_binding();

CREATE TABLE room_relay_commands (
  id uuid PRIMARY KEY,
  binding_id uuid NOT NULL REFERENCES room_relay_bindings(id) ON DELETE RESTRICT,
  sequence_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  target_boot_id uuid NOT NULL,
  desired_state text NOT NULL CHECK (desired_state IN ('on','off')),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','confirmed','rejected','unconfirmed')),
  publish_attempted_at timestamptz,
  confirmed_at timestamptz,
  result_reason text,
  CHECK (expires_at > issued_at AND expires_at <= issued_at + interval '15 seconds'),
  CHECK ((status IN ('confirmed','rejected')) = (confirmed_at IS NOT NULL))
);
CREATE UNIQUE INDEX room_relay_one_pending ON room_relay_commands(binding_id) WHERE status IN ('queued','sent');
CREATE INDEX room_relay_history ON room_relay_commands(binding_id,issued_at DESC);
