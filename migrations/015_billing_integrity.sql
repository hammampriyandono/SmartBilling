CREATE FUNCTION validate_billing_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old billing_periods%ROWTYPE;
BEGIN
 IF NEW.supersedes_period_id IS NOT NULL THEN
  SELECT * INTO old FROM billing_periods WHERE id=NEW.supersedes_period_id FOR UPDATE;
  IF NOT FOUND OR old.property_id<>NEW.property_id OR old.starts_at<>NEW.starts_at OR old.ends_at<>NEW.ends_at OR NEW.revision_no<>old.revision_no+1
   THEN RAISE EXCEPTION 'invalid billing revision chain'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER billing_revision_valid BEFORE INSERT ON billing_periods FOR EACH ROW EXECUTE FUNCTION validate_billing_revision();

CREATE FUNCTION validate_billing_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pid uuid; prop uuid;
BEGIN
 IF TG_TABLE_NAME='billing_meter_segments' THEN
  SELECT property_id INTO prop FROM billing_periods WHERE id=NEW.billing_period_id;
  IF NOT EXISTS(SELECT 1 FROM meters WHERE id=NEW.meter_id AND property_id=prop) OR
    (NEW.room_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM rooms WHERE id=NEW.room_id AND property_id=prop)) THEN RAISE EXCEPTION 'billing segment property mismatch'; END IF;
  IF NEW.start_reading_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM meter_readings WHERE id=NEW.start_reading_id AND meter_id=NEW.meter_id) THEN RAISE EXCEPTION 'invalid start reading'; END IF;
  IF NEW.end_reading_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM meter_readings WHERE id=NEW.end_reading_id AND meter_id=NEW.meter_id) THEN RAISE EXCEPTION 'invalid end reading'; END IF;
 ELSIF TG_TABLE_NAME='room_bills' THEN
  SELECT property_id INTO prop FROM billing_periods WHERE id=NEW.billing_period_id;
  IF NOT EXISTS(SELECT 1 FROM rooms WHERE id=NEW.room_id AND property_id=prop) THEN RAISE EXCEPTION 'room bill property mismatch'; END IF;
 ELSIF TG_TABLE_NAME='bill_shares' AND NEW.occupancy_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM room_bills rb JOIN occupancies o ON o.room_id=rb.room_id WHERE rb.id=NEW.room_bill_id AND o.id=NEW.occupancy_id) THEN RAISE EXCEPTION 'bill share occupancy mismatch'; END IF;
 ELSIF TG_TABLE_NAME='bill_session_allocations' THEN
  IF NOT EXISTS(SELECT 1 FROM bill_shares bs JOIN session_participants sp ON sp.occupancy_id=bs.occupancy_id WHERE bs.id=NEW.bill_share_id AND sp.id=NEW.session_participant_id AND sp.usage_session_id=NEW.usage_session_id) THEN RAISE EXCEPTION 'session allocation mismatch'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER billing_segment_valid BEFORE INSERT OR UPDATE ON billing_meter_segments FOR EACH ROW EXECUTE FUNCTION validate_billing_child();
CREATE TRIGGER room_bill_valid BEFORE INSERT OR UPDATE ON room_bills FOR EACH ROW EXECUTE FUNCTION validate_billing_child();
CREATE TRIGGER bill_share_valid BEFORE INSERT OR UPDATE ON bill_shares FOR EACH ROW EXECUTE FUNCTION validate_billing_child();
CREATE TRIGGER session_allocation_valid BEFORE INSERT OR UPDATE ON bill_session_allocations FOR EACH ROW EXECUTE FUNCTION validate_billing_child();

CREATE FUNCTION protect_billing_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE locked boolean;
BEGIN
 IF TG_TABLE_NAME='billing_periods' THEN locked:=OLD.status IN ('finalized','superseded');
 ELSIF TG_TABLE_NAME IN ('billing_meter_segments','room_bills','billing_issues') THEN
  SELECT status IN ('finalized','superseded') INTO locked FROM billing_periods WHERE id=OLD.billing_period_id;
 ELSIF TG_TABLE_NAME='bill_shares' THEN
  SELECT bp.status IN ('finalized','superseded') INTO locked FROM billing_periods bp JOIN room_bills rb ON rb.billing_period_id=bp.id WHERE rb.id=OLD.room_bill_id;
 ELSE
  SELECT bp.status IN ('finalized','superseded') INTO locked FROM billing_periods bp JOIN room_bills rb ON rb.billing_period_id=bp.id JOIN bill_shares bs ON bs.room_bill_id=rb.id WHERE bs.id=OLD.bill_share_id;
 END IF;
 IF TG_TABLE_NAME='billing_periods' AND OLD.status='finalized' AND NEW.status='superseded' AND
  (NEW.id,NEW.property_id,NEW.starts_at,NEW.ends_at,NEW.revision_no,NEW.revision_kind,NEW.supersedes_period_id,NEW.source,NEW.calculation_version,NEW.policy_snapshot,NEW.tariff_snapshot,NEW.main_energy_kwh,NEW.residual_energy_kwh,NEW.preview_total_cost_rp,NEW.total_cost_rp,NEW.finalized_at,NEW.finalized_by,NEW.created_by,NEW.created_at)
  IS NOT DISTINCT FROM
  (OLD.id,OLD.property_id,OLD.starts_at,OLD.ends_at,OLD.revision_no,OLD.revision_kind,OLD.supersedes_period_id,OLD.source,OLD.calculation_version,OLD.policy_snapshot,OLD.tariff_snapshot,OLD.main_energy_kwh,OLD.residual_energy_kwh,OLD.preview_total_cost_rp,OLD.total_cost_rp,OLD.finalized_at,OLD.finalized_by,OLD.created_by,OLD.created_at)
 THEN locked:=false; END IF;
 IF locked THEN RAISE EXCEPTION 'finalized billing history is immutable'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER billing_period_history BEFORE UPDATE OR DELETE ON billing_periods FOR EACH ROW EXECUTE FUNCTION protect_billing_history();
CREATE TRIGGER billing_segment_history BEFORE UPDATE OR DELETE ON billing_meter_segments FOR EACH ROW EXECUTE FUNCTION protect_billing_history();
CREATE TRIGGER room_bill_history BEFORE UPDATE OR DELETE ON room_bills FOR EACH ROW EXECUTE FUNCTION protect_billing_history();
CREATE TRIGGER bill_share_history BEFORE UPDATE OR DELETE ON bill_shares FOR EACH ROW EXECUTE FUNCTION protect_billing_history();
CREATE TRIGGER session_allocation_history BEFORE UPDATE OR DELETE ON bill_session_allocations FOR EACH ROW EXECUTE FUNCTION protect_billing_history();
CREATE TRIGGER billing_issue_history BEFORE UPDATE OR DELETE ON billing_issues FOR EACH ROW EXECUTE FUNCTION protect_billing_history();
