CREATE TABLE occupancies (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL CHECK (isfinite(starts_at)),
  ends_at timestamptz CHECK (isfinite(ends_at) AND ends_at > starts_at),
  created_at timestamptz NOT NULL DEFAULT now(),
  EXCLUDE USING gist (user_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
);
CREATE INDEX occupancies_room_time ON occupancies(room_id, starts_at);
CREATE INDEX occupancies_user_time ON occupancies(user_id, starts_at);
CREATE FUNCTION validate_occupancy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tenant users%ROWTYPE; room rooms%ROWTYPE;
BEGIN
  SELECT * INTO tenant FROM users WHERE id=NEW.user_id FOR UPDATE;
  IF NOT FOUND OR tenant.role <> 'tenant' THEN RAISE EXCEPTION 'occupancy requires tenant'; END IF;
  SELECT * INTO room FROM rooms WHERE id=NEW.room_id FOR UPDATE;
  IF NOT FOUND OR NOT tstzrange(room.active_from,room.active_until,'[)') @> tstzrange(NEW.starts_at,NEW.ends_at,'[)') THEN
    RAISE EXCEPTION 'occupancy outside room lifetime';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER occupancy_valid BEFORE INSERT OR UPDATE ON occupancies FOR EACH ROW EXECUTE FUNCTION validate_occupancy();
CREATE FUNCTION protect_occupancy_parent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'users' THEN
    IF NEW.role <> 'tenant' AND EXISTS(SELECT 1 FROM occupancies WHERE user_id=NEW.id) THEN
      RAISE EXCEPTION 'tenant role still referenced';
    END IF;
  ELSE
    IF EXISTS(SELECT 1 FROM occupancies WHERE room_id=NEW.id AND
      NOT tstzrange(NEW.active_from,NEW.active_until,'[)') @> tstzrange(starts_at,ends_at,'[)')) THEN
      RAISE EXCEPTION 'room lifetime excludes occupancy';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tenant_role_valid BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION protect_occupancy_parent();
CREATE TRIGGER room_occupancy_valid BEFORE UPDATE ON rooms FOR EACH ROW EXECUTE FUNCTION protect_occupancy_parent();
