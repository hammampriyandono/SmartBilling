CREATE TABLE owner_idempotency (
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_key uuid NOT NULL,
  request_sha256 char(64) NOT NULL,
  response_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, request_key)
);
CREATE FUNCTION immutable_owner_idempotency() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'owner idempotency records are append-only'; END $$;
CREATE TRIGGER owner_idempotency_immutable BEFORE UPDATE OR DELETE ON owner_idempotency
FOR EACH ROW EXECUTE FUNCTION immutable_owner_idempotency();
