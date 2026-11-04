-- Keep command history bound to its original polarity. Recommissioning uses a
-- new binding ID for the same meter instead of rewriting historical meaning.
ALTER TABLE room_relay_bindings ADD COLUMN retired_at timestamptz;
ALTER TABLE room_relay_bindings ADD CONSTRAINT room_relay_retired_disabled
  CHECK (retired_at IS NULL OR (NOT enabled AND test_until IS NULL));
ALTER TABLE room_relay_bindings DROP CONSTRAINT room_relay_bindings_meter_id_key;
CREATE UNIQUE INDEX room_relay_one_active_binding ON room_relay_bindings(meter_id)
  WHERE retired_at IS NULL;
CREATE FUNCTION protect_retired_room_relay_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.retired_at IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'retired relay binding is immutable';
  END IF;
  IF NEW.retired_at IS NOT NULL AND EXISTS (
    SELECT 1 FROM room_relay_commands WHERE binding_id=OLD.id AND status IN ('queued','sent')) THEN
    RAISE EXCEPTION 'relay binding has pending commands';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER room_relay_retirement_guard BEFORE UPDATE ON room_relay_bindings
  FOR EACH ROW EXECUTE FUNCTION protect_retired_room_relay_binding();
