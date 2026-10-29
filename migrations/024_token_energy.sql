-- Manually recorded purchased energy; never infer kWh from Rupiah or backfill history.
ALTER TABLE token_purchase_revisions ADD COLUMN energy_kwh numeric(15,6);
ALTER TABLE token_purchase_revisions ADD CONSTRAINT token_energy_range
 CHECK(energy_kwh IS NULL OR (energy_kwh>0 AND energy_kwh<=999999999.999999));

-- Keep the existing append-only lifecycle, including preservation on cancellation.
CREATE OR REPLACE FUNCTION guard_token_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE head token_purchases; prior token_purchase_revisions;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'token revision is append-only'; END IF;
 SELECT * INTO head FROM token_purchases WHERE id=NEW.purchase_id FOR UPDATE;
 IF head.row_version<>NEW.row_version OR head.status<>NEW.status OR head.recorded_by<>NEW.actor_user_id
 THEN RAISE EXCEPTION 'token revision does not match head'; END IF;
 IF NEW.row_version>1 THEN
  SELECT * INTO prior FROM token_purchase_revisions WHERE purchase_id=NEW.purchase_id AND row_version=NEW.row_version-1;
  IF NOT FOUND OR prior.status<>'active' THEN RAISE EXCEPTION 'invalid token revision predecessor'; END IF;
  IF NEW.action='cancel' AND (NEW.purchase_date<>prior.purchase_date OR NEW.amount_rp<>prior.amount_rp
    OR NEW.note IS DISTINCT FROM prior.note OR NEW.energy_kwh IS DISTINCT FROM prior.energy_kwh)
  THEN RAISE EXCEPTION 'cancellation must preserve purchase values'; END IF;
 END IF;
 RETURN NEW;
END $$;
