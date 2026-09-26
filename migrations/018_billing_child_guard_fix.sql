CREATE OR REPLACE FUNCTION validate_billing_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE data jsonb:=to_jsonb(NEW); prop uuid; target uuid;
BEGIN
 IF TG_TABLE_NAME='billing_meter_segments' THEN
  SELECT property_id INTO prop FROM billing_periods WHERE id=(data->>'billing_period_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM meters WHERE id=(data->>'meter_id')::uuid AND property_id=prop) OR
    (data->>'room_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM rooms WHERE id=(data->>'room_id')::uuid AND property_id=prop)) THEN RAISE EXCEPTION 'billing segment property mismatch'; END IF;
  IF data->>'start_reading_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM meter_readings WHERE id=(data->>'start_reading_id')::bigint AND meter_id=(data->>'meter_id')::uuid) THEN RAISE EXCEPTION 'invalid start reading'; END IF;
  IF data->>'end_reading_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM meter_readings WHERE id=(data->>'end_reading_id')::bigint AND meter_id=(data->>'meter_id')::uuid) THEN RAISE EXCEPTION 'invalid end reading'; END IF;
 ELSIF TG_TABLE_NAME='room_bills' THEN
  SELECT property_id INTO prop FROM billing_periods WHERE id=(data->>'billing_period_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM rooms WHERE id=(data->>'room_id')::uuid AND property_id=prop) THEN RAISE EXCEPTION 'room bill property mismatch'; END IF;
 ELSIF TG_TABLE_NAME='bill_shares' AND data->>'occupancy_id' IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM room_bills rb JOIN occupancies o ON o.room_id=rb.room_id WHERE rb.id=(data->>'room_bill_id')::uuid AND o.id=(data->>'occupancy_id')::uuid) THEN RAISE EXCEPTION 'bill share occupancy mismatch'; END IF;
 ELSIF TG_TABLE_NAME='bill_session_allocations' THEN
  IF NOT EXISTS(SELECT 1 FROM bill_shares bs JOIN session_participants sp ON sp.occupancy_id=bs.occupancy_id WHERE bs.id=(data->>'bill_share_id')::uuid AND sp.id=(data->>'session_participant_id')::uuid AND sp.usage_session_id=(data->>'usage_session_id')::uuid) THEN RAISE EXCEPTION 'session allocation mismatch'; END IF;
 END IF;
 RETURN NEW;
END $$;
