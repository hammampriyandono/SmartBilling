ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('owner','tenant','viewer'));

-- A viewer is a separate login, never the owner account. Access expires and
-- may be revoked without changing the owner's password or existing sessions.
CREATE TABLE owner_viewers (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL CHECK (isfinite(expires_at)),
  revoked_at timestamptz CHECK (isfinite(revoked_at)),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id <> owner_id)
);
CREATE FUNCTION validate_owner_viewer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND role='viewer' FOR SHARE) THEN
    RAISE EXCEPTION 'viewer account required';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.owner_id AND role='owner' FOR SHARE) THEN
    RAISE EXCEPTION 'viewer scope requires owner';
  END IF;
  IF TG_OP='UPDATE' AND (NEW.user_id<>OLD.user_id OR NEW.owner_id<>OLD.owner_id) THEN
    RAISE EXCEPTION 'viewer identity and scope immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER owner_viewer_valid BEFORE INSERT OR UPDATE ON owner_viewers
  FOR EACH ROW EXECUTE FUNCTION validate_owner_viewer();
CREATE FUNCTION protect_owner_viewer_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role<>OLD.role AND EXISTS(
    SELECT 1 FROM owner_viewers WHERE user_id=NEW.id OR owner_id=NEW.id
  ) THEN RAISE EXCEPTION 'role still referenced by viewer grant'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER owner_viewer_role_valid BEFORE UPDATE OF role ON users
  FOR EACH ROW EXECUTE FUNCTION protect_owner_viewer_role();
