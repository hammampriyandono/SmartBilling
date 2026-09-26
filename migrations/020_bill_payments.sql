CREATE TABLE bill_payment_states (
 bill_share_id uuid PRIMARY KEY REFERENCES bill_shares(id) ON DELETE RESTRICT,
 status varchar(16) NOT NULL DEFAULT 'unpaid' CHECK(status IN ('unpaid','paid')),
 paid_at timestamptz,
 paid_note text CHECK(paid_note IS NULL OR length(paid_note)<=500),
 paid_by uuid REFERENCES users(id) ON DELETE RESTRICT,
 row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((status='paid')=(paid_at IS NOT NULL AND paid_by IS NOT NULL))
);

CREATE TABLE bill_payment_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 bill_share_id uuid NOT NULL REFERENCES bill_shares(id) ON DELETE RESTRICT,
 action varchar(16) NOT NULL CHECK(action IN ('mark_paid','unmark_paid')),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 effective_paid_at timestamptz,
 note text CHECK(note IS NULL OR length(note)<=500),
 actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 500),
 request_id uuid NOT NULL
);
CREATE INDEX bill_payment_events_share_time ON bill_payment_events(bill_share_id,occurred_at,id);

CREATE FUNCTION validate_bill_payment_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM bill_shares bs
  JOIN room_bills rb ON rb.id=bs.room_bill_id
  JOIN billing_periods bp ON bp.id=rb.billing_period_id
  WHERE bs.id=NEW.bill_share_id AND bs.occupancy_id IS NOT NULL AND bp.status='finalized'
 ) THEN RAISE EXCEPTION 'payment requires an allocated finalized bill'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bill_payment_state_valid BEFORE INSERT OR UPDATE ON bill_payment_states
FOR EACH ROW EXECUTE FUNCTION validate_bill_payment_state();

CREATE FUNCTION immutable_bill_payment_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'bill payment event is append-only'; END $$;
CREATE TRIGGER bill_payment_event_immutable BEFORE UPDATE OR DELETE ON bill_payment_events
FOR EACH ROW EXECUTE FUNCTION immutable_bill_payment_event();

CREATE FUNCTION protect_bill_payment_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'bill payment state cannot be deleted'; END $$;
CREATE TRIGGER bill_payment_state_no_delete BEFORE DELETE ON bill_payment_states
FOR EACH ROW EXECUTE FUNCTION protect_bill_payment_delete();
