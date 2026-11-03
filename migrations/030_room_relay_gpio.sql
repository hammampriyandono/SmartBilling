-- GPIO report is independent of the PZEM measurement stream. Old/absent
-- reports remain unknown until a new device report provides the actual level.
ALTER TABLE room_relay_bindings ADD COLUMN reported_gpio_level smallint
  CHECK (reported_gpio_level IN (0,1));
ALTER TABLE room_relay_bindings ADD CONSTRAINT room_relay_gpio_matches_state
  CHECK (reported_gpio_level IS NULL OR (reported_state IS NOT NULL AND
    ((reported_gpio_level=1 AND reported_state='on') OR (reported_gpio_level=0 AND reported_state='off'))));
