CREATE OR REPLACE FUNCTION protect_billing_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE locked boolean; old_data jsonb:=to_jsonb(OLD); target uuid;
BEGIN
 IF TG_TABLE_NAME='billing_periods' THEN locked:=OLD.status IN ('finalized','superseded');
 ELSIF TG_TABLE_NAME IN ('billing_meter_segments','room_bills','billing_issues') THEN
  target:=(old_data->>'billing_period_id')::uuid;
  SELECT status IN ('finalized','superseded') INTO locked FROM billing_periods WHERE id=target;
 ELSIF TG_TABLE_NAME='bill_shares' THEN
  target:=(old_data->>'room_bill_id')::uuid;
  SELECT bp.status IN ('finalized','superseded') INTO locked FROM billing_periods bp JOIN room_bills rb ON rb.billing_period_id=bp.id WHERE rb.id=target;
 ELSE
  target:=(old_data->>'bill_share_id')::uuid;
  SELECT bp.status IN ('finalized','superseded') INTO locked FROM billing_periods bp JOIN room_bills rb ON rb.billing_period_id=bp.id JOIN bill_shares bs ON bs.room_bill_id=rb.id WHERE bs.id=target;
 END IF;
 IF TG_TABLE_NAME='billing_periods' AND OLD.status='finalized' AND NEW.status='superseded' AND
  (NEW.id,NEW.property_id,NEW.starts_at,NEW.ends_at,NEW.revision_no,NEW.revision_kind,NEW.supersedes_period_id,NEW.source,NEW.calculation_version,NEW.policy_snapshot,NEW.tariff_snapshot,NEW.main_energy_kwh,NEW.residual_energy_kwh,NEW.preview_total_cost_rp,NEW.total_cost_rp,NEW.finalized_at,NEW.finalized_by,NEW.created_by,NEW.created_at)
  IS NOT DISTINCT FROM
  (OLD.id,OLD.property_id,OLD.starts_at,OLD.ends_at,OLD.revision_no,OLD.revision_kind,OLD.supersedes_period_id,OLD.source,OLD.calculation_version,OLD.policy_snapshot,OLD.tariff_snapshot,OLD.main_energy_kwh,OLD.residual_energy_kwh,OLD.preview_total_cost_rp,OLD.total_cost_rp,OLD.finalized_at,OLD.finalized_by,OLD.created_by,OLD.created_at)
 THEN locked:=false; END IF;
 IF locked THEN RAISE EXCEPTION 'finalized billing history is immutable'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
