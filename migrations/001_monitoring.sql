CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE users (
  id uuid PRIMARY KEY,
  name varchar(120) NOT NULL,
  email varchar(254) NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash text NOT NULL,
  role varchar(16) NOT NULL CHECK (role IN ('owner', 'tenant')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE properties (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name varchar(120) NOT NULL,
  timezone varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE rooms (
  id uuid PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  code varchar(32) NOT NULL,
  name varchar(120) NOT NULL,
  active_from timestamptz NOT NULL,
  active_until timestamptz,
  CHECK (active_until IS NULL OR active_until > active_from),
  UNIQUE (property_id, code), UNIQUE (id, property_id)
);
CREATE TABLE devices (
  id uuid PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  device_uid varchar(80) NOT NULL UNIQUE,
  firmware_version varchar(40),
  status varchar(20) NOT NULL CHECK (status IN ('active', 'inactive')),
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, property_id)
);
CREATE TABLE communal_loads (
  id uuid PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  name varchar(120) NOT NULL,
  load_type varchar(20) NOT NULL CHECK (load_type IN ('shared', 'attributable')),
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (id, property_id)
);
CREATE TABLE meters (
  id uuid PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  device_id uuid NOT NULL,
  room_id uuid,
  communal_load_id uuid,
  kind varchar(20) NOT NULL CHECK (kind IN ('main', 'room', 'communal')),
  channel_no integer NOT NULL CHECK (channel_no >= 0),
  serial_number varchar(100),
  installed_at timestamptz NOT NULL,
  retired_at timestamptz,
  CHECK (retired_at IS NULL OR retired_at > installed_at),
  CHECK ((kind = 'main' AND room_id IS NULL AND communal_load_id IS NULL)
      OR (kind = 'room' AND room_id IS NOT NULL AND communal_load_id IS NULL)
      OR (kind = 'communal' AND room_id IS NULL AND communal_load_id IS NOT NULL)),
  FOREIGN KEY (device_id, property_id) REFERENCES devices(id, property_id) ON DELETE RESTRICT,
  FOREIGN KEY (room_id, property_id) REFERENCES rooms(id, property_id) ON DELETE RESTRICT,
  FOREIGN KEY (communal_load_id, property_id) REFERENCES communal_loads(id, property_id) ON DELETE RESTRICT,
  EXCLUDE USING gist (device_id WITH =, channel_no WITH =, tstzrange(installed_at, retired_at, '[)') WITH &&),
  EXCLUDE USING gist (room_id WITH =, tstzrange(installed_at, retired_at, '[)') WITH &&) WHERE (kind = 'room'),
  EXCLUDE USING gist (communal_load_id WITH =, tstzrange(installed_at, retired_at, '[)') WITH &&) WHERE (kind = 'communal'),
  EXCLUDE USING gist (property_id WITH =, tstzrange(installed_at, retired_at, '[)') WITH &&) WHERE (kind = 'main')
);
CREATE TABLE meter_readings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  meter_id uuid NOT NULL REFERENCES meters(id) ON DELETE RESTRICT,
  boot_id uuid NOT NULL,
  sequence_no bigint NOT NULL CHECK (sequence_no >= 0),
  counter_epoch integer NOT NULL CHECK (counter_epoch >= 0),
  measured_at timestamptz NOT NULL CHECK (isfinite(measured_at)),
  received_at timestamptz NOT NULL DEFAULT now(),
  voltage_v numeric(12,4) CHECK (voltage_v >= 0 AND voltage_v < 'Infinity'::numeric),
  current_a numeric(12,6) CHECK (current_a >= 0 AND current_a < 'Infinity'::numeric),
  power_w numeric(16,6) CHECK (power_w >= 0 AND power_w < 'Infinity'::numeric),
  energy_kwh numeric(20,9) NOT NULL CHECK (energy_kwh >= 0 AND energy_kwh < 'Infinity'::numeric),
  frequency_hz numeric(10,4) CHECK (frequency_hz >= 0 AND frequency_hz < 'Infinity'::numeric),
  power_factor numeric(7,6) CHECK (power_factor >= 0 AND power_factor <= 1),
  quality varchar(20) NOT NULL CHECK (quality IN ('valid', 'suspect', 'invalid')),
  UNIQUE (meter_id, boot_id, sequence_no)
);
CREATE INDEX readings_history ON meter_readings(meter_id, measured_at, id);
CREATE INDEX devices_property ON devices(property_id);
CREATE INDEX properties_owner ON properties(owner_id);

CREATE FUNCTION validate_property() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.owner_id AND role = 'owner') THEN
    RAISE EXCEPTION 'property owner must have owner role';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.timezone) THEN
    RAISE EXCEPTION 'unknown property timezone';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER property_valid BEFORE INSERT OR UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION validate_property();

CREATE FUNCTION prevent_owner_role_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role <> 'owner' AND EXISTS (SELECT 1 FROM properties WHERE owner_id = OLD.id) THEN
    RAISE EXCEPTION 'owner role still referenced';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER owner_role_valid BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION prevent_owner_role_change();

CREATE FUNCTION protect_meter_mapping() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.property_id, NEW.device_id, NEW.room_id, NEW.communal_load_id, NEW.kind, NEW.channel_no, NEW.installed_at)
     IS DISTINCT FROM
     (OLD.property_id, OLD.device_id, OLD.room_id, OLD.communal_load_id, OLD.kind, OLD.channel_no, OLD.installed_at) THEN
    RAISE EXCEPTION 'create a new meter installation instead of changing mapping';
  END IF;
  IF EXISTS (SELECT 1 FROM meter_readings WHERE meter_id = OLD.id AND measured_at >= NEW.retired_at) THEN
    RAISE EXCEPTION 'retirement would exclude stored readings';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER meter_mapping_immutable BEFORE UPDATE ON meters FOR EACH ROW EXECUTE FUNCTION protect_meter_mapping();

CREATE FUNCTION validate_reading_installation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE installation meters%ROWTYPE;
BEGIN
  SELECT * INTO installation FROM meters WHERE id = NEW.meter_id FOR SHARE;
  IF NOT FOUND OR NEW.measured_at < installation.installed_at
     OR NEW.measured_at >= installation.retired_at THEN
    RAISE EXCEPTION 'reading outside meter installation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reading_installation_valid BEFORE INSERT ON meter_readings FOR EACH ROW EXECUTE FUNCTION validate_reading_installation();
CREATE FUNCTION immutable_reading() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'raw readings are immutable'; END $$;
CREATE TRIGGER reading_immutable BEFORE UPDATE OR DELETE ON meter_readings FOR EACH ROW EXECUTE FUNCTION immutable_reading();
