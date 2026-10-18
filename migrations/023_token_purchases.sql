-- Accounting records only. No backfill, seed, or changes to billing/history.
CREATE TABLE token_purchases (
 id uuid PRIMARY KEY,
 property_id uuid NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
 recorded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 status varchar(16) NOT NULL CHECK(status IN ('active','cancelled')),
 row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE token_purchase_revisions (
 purchase_id uuid NOT NULL REFERENCES token_purchases(id) ON DELETE RESTRICT,
 row_version integer NOT NULL CHECK(row_version>0),
 action varchar(16) NOT NULL CHECK(action IN ('create','correct','cancel')),
 status varchar(16) NOT NULL CHECK(status IN ('active','cancelled')),
 -- A calendar date in the property's timezone, not a UTC receipt timestamp.
 purchase_date date NOT NULL CHECK(purchase_date BETWEEN DATE '2000-01-01' AND DATE '2099-12-31'),
 amount_rp numeric(13,0) NOT NULL CHECK(amount_rp>0 AND amount_rp<=1000000000000),
 note text CHECK(note IS NULL OR length(note)<=500),
 reason text CHECK(reason IS NULL OR length(btrim(reason)) BETWEEN 1 AND 500),
 actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 request_id uuid NOT NULL UNIQUE,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(purchase_id,row_version),
 CHECK((action='create' AND row_version=1 AND status='active') OR
       (action='correct' AND row_version>1 AND status='active' AND reason IS NOT NULL) OR
       (action='cancel' AND row_version>1 AND status='cancelled' AND reason IS NOT NULL))
);
CREATE INDEX token_purchases_property ON token_purchases(property_id,id);
CREATE INDEX token_revisions_date ON token_purchase_revisions(purchase_date,purchase_id,row_version);

CREATE FUNCTION guard_token_purchase() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'token purchase cannot be deleted'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW.property_id<>OLD.property_id OR NEW.recorded_by<>OLD.recorded_by
    OR NEW.created_at<>OLD.created_at OR OLD.status='cancelled'
    OR NEW.row_version<>OLD.row_version+1 THEN RAISE EXCEPTION 'invalid token lifecycle'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM properties p JOIN users u ON u.id=p.owner_id
   WHERE p.id=NEW.property_id AND p.owner_id=NEW.recorded_by AND u.role='owner')
 THEN RAISE EXCEPTION 'token recorder must own property'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER token_purchase_guard BEFORE INSERT OR UPDATE OR DELETE ON token_purchases
FOR EACH ROW EXECUTE FUNCTION guard_token_purchase();

CREATE FUNCTION guard_token_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE head token_purchases; prior token_purchase_revisions;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'token revision is append-only'; END IF;
 SELECT * INTO head FROM token_purchases WHERE id=NEW.purchase_id FOR UPDATE;
 IF head.row_version<>NEW.row_version OR head.status<>NEW.status OR head.recorded_by<>NEW.actor_user_id
 THEN RAISE EXCEPTION 'token revision does not match head'; END IF;
 IF NEW.row_version>1 THEN
  SELECT * INTO prior FROM token_purchase_revisions WHERE purchase_id=NEW.purchase_id AND row_version=NEW.row_version-1;
  IF NOT FOUND OR prior.status<>'active' THEN RAISE EXCEPTION 'invalid token revision predecessor'; END IF;
  IF NEW.action='cancel' AND (NEW.purchase_date<>prior.purchase_date OR NEW.amount_rp<>prior.amount_rp OR NEW.note IS DISTINCT FROM prior.note)
  THEN RAISE EXCEPTION 'cancellation must preserve purchase values'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER token_revision_guard BEFORE INSERT OR UPDATE OR DELETE ON token_purchase_revisions
FOR EACH ROW EXECUTE FUNCTION guard_token_revision();

CREATE FUNCTION require_token_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM token_purchases h JOIN token_purchase_revisions v ON v.purchase_id=h.id
   AND v.row_version=h.row_version AND v.status=h.status WHERE h.id=NEW.id)
 THEN RAISE EXCEPTION 'token head requires matching revision'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER token_head_has_revision AFTER INSERT OR UPDATE ON token_purchases
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_token_revision();
