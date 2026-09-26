CREATE OR REPLACE FUNCTION protect_billing_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE locked boolean; old_data jsonb:=to_jsonb(OLD); new_data jsonb:=to_jsonb(NEW); target uuid;
BEGIN
 IF TG_TABLE_NAME='billing_periods' THEN
  locked:=(old_data->>'status') IN ('finalized','superseded');
  IF old_data->>'status'='finalized' AND new_data->>'status'='superseded' THEN
   new_data:=new_data-'status'-'row_version'-'updated_at';old_data:=old_data-'status'-'row_version'-'updated_at';
   IF new_data=old_data THEN locked:=false; END IF;
  END IF;
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
 IF locked THEN RAISE EXCEPTION 'finalized billing history is immutable'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
