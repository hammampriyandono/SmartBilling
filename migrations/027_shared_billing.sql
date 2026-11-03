-- Nullable columns preserve legacy bills. Existing final snapshots are not recalculated.
ALTER TABLE billing_periods ADD COLUMN shared_summary jsonb;
ALTER TABLE room_bills ADD COLUMN shared_energy_kwh numeric(20,9) CHECK(shared_energy_kwh>=0),
 ADD COLUMN shared_cost_rp numeric(18,0) CHECK(shared_cost_rp>=0);
ALTER TABLE bill_shares ADD COLUMN shared_energy_kwh numeric(20,9) CHECK(shared_energy_kwh>=0),
 ADD COLUMN shared_cost_rp numeric(18,0) CHECK(shared_cost_rp>=0);

CREATE FUNCTION validate_shared_billing_finalize() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='finalized' AND OLD.status<>'finalized'
  AND NEW.policy_snapshot->>'shared_allocation'='equal_active_occupants_v1' THEN
  IF NEW.shared_summary IS NULL OR NEW.shared_summary->>'complete' IS DISTINCT FROM 'true'
   OR NEW.property_reconciliation_status<>'valid' THEN
   RAISE EXCEPTION 'shared billing evidence is incomplete';
  END IF;
  IF EXISTS(SELECT 1 FROM room_bills rb WHERE rb.billing_period_id=NEW.id
    AND (rb.shared_energy_kwh IS NULL OR rb.shared_cost_rp IS NULL
      OR rb.total_cost_rp IS DISTINCT FROM (SELECT sum(bs.total_cost_rp) FROM bill_shares bs WHERE bs.room_bill_id=rb.id))) THEN
   RAISE EXCEPTION 'shared billing allocation invariant failed';
  END IF;
  IF (NEW.shared_summary->>'energy_kwh')::numeric IS DISTINCT FROM
   (SELECT sum(bs.shared_energy_kwh) FROM bill_shares bs JOIN room_bills rb ON rb.id=bs.room_bill_id WHERE rb.billing_period_id=NEW.id) THEN
   RAISE EXCEPTION 'shared billing energy invariant failed';
  END IF;
  IF (NEW.shared_summary->>'estimated_cost_rp')::numeric IS DISTINCT FROM
   (SELECT sum(bs.shared_cost_rp) FROM bill_shares bs JOIN room_bills rb ON rb.id=bs.room_bill_id WHERE rb.billing_period_id=NEW.id)
   OR NEW.main_energy_kwh IS DISTINCT FROM
   (SELECT sum(bs.room_energy_kwh+bs.attributable_energy_kwh+bs.shared_energy_kwh) FROM bill_shares bs JOIN room_bills rb ON rb.id=bs.room_bill_id WHERE rb.billing_period_id=NEW.id)
   OR EXISTS(SELECT 1 FROM bill_shares bs JOIN room_bills rb ON rb.id=bs.room_bill_id WHERE rb.billing_period_id=NEW.id
    AND bs.total_cost_rp IS DISTINCT FROM bs.room_cost_rp+bs.attributable_cost_rp+bs.shared_cost_rp+bs.rounding_adjustment_rp) THEN
   RAISE EXCEPTION 'shared billing cost or main energy invariant failed';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER billing_shared_finalize_valid BEFORE UPDATE ON billing_periods
 FOR EACH ROW EXECUTE FUNCTION validate_shared_billing_finalize();
