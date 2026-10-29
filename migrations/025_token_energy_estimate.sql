-- Preserve the assumptions behind automatic expo estimates on every revision.
ALTER TABLE token_purchase_revisions ADD COLUMN energy_calculation jsonb;
ALTER TABLE token_purchase_revisions ADD CONSTRAINT token_estimate_metadata CHECK(
 energy_calculation IS NULL OR COALESCE((energy_kwh IS NOT NULL AND jsonb_typeof(energy_calculation)='object'
 AND energy_calculation->>'kind' IS NOT DISTINCT FROM 'simulation_estimate'
 AND energy_calculation->>'method' IS NOT DISTINCT FROM 'nominal_less_tax_v1'
 AND jsonb_typeof(energy_calculation->'tariff_rp_per_kwh')='string'
 AND energy_calculation->>'tariff_rp_per_kwh' ~ '^\d{1,6}(\.\d{1,4})?$'
 AND energy_calculation->>'tariff_rp_per_kwh' ~ '[1-9]'
 AND jsonb_typeof(energy_calculation->'tax_percent')='string'
 AND energy_calculation->>'tax_percent' ~ '^\d{1,2}(\.\d{1,2})?$'
 AND energy_calculation->>'rounding'='half_up_2_decimals'),false));

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
    OR NEW.note IS DISTINCT FROM prior.note OR NEW.energy_kwh IS DISTINCT FROM prior.energy_kwh
    OR NEW.energy_calculation IS DISTINCT FROM prior.energy_calculation)
  THEN RAISE EXCEPTION 'cancellation must preserve purchase values'; END IF;
 END IF;
 RETURN NEW;
END $$;
