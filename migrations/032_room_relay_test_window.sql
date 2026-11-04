-- Explicit local commissioning tests are distinct from verified enablement.
-- Expiry blocks further commands; it never changes the electrical output.
ALTER TABLE room_relay_bindings ADD COLUMN test_until timestamptz;
ALTER TABLE room_relay_bindings ADD CONSTRAINT room_relay_test_requires_enabled
  CHECK (test_until IS NULL OR enabled);
