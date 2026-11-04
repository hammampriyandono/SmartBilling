-- Historical bindings remain HIGH=ON. New installations explicitly opt in.
ALTER TABLE room_relay_bindings ADD COLUMN gpio_on_level smallint NOT NULL DEFAULT 1
  CHECK (gpio_on_level IN (0,1));
ALTER TABLE room_relay_bindings DROP CONSTRAINT room_relay_gpio_matches_state;
ALTER TABLE room_relay_bindings ADD CONSTRAINT room_relay_gpio_matches_state CHECK (
  reported_gpio_level IS NULL OR (reported_state IS NOT NULL AND
    ((reported_gpio_level=gpio_on_level AND reported_state='on') OR
     (reported_gpio_level<>gpio_on_level AND reported_state='off'))));
CREATE FUNCTION protect_room_relay_polarity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.gpio_on_level IS DISTINCT FROM OLD.gpio_on_level AND
     (OLD.enabled OR NEW.enabled OR NEW.last_boot_id IS NOT NULL OR
      NEW.last_report_sequence IS NOT NULL OR NEW.last_reported_at IS NOT NULL OR
      NEW.last_received_at IS NOT NULL OR NEW.reported_state IS NOT NULL OR
      NEW.reported_gpio_level IS NOT NULL OR
      EXISTS(SELECT 1 FROM room_relay_commands WHERE binding_id=OLD.id)) THEN
    RAISE EXCEPTION 'relay polarity is locked after commissioning';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER room_relay_polarity_immutable BEFORE UPDATE ON room_relay_bindings
  FOR EACH ROW EXECUTE FUNCTION protect_room_relay_polarity();
