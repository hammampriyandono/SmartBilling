CREATE TABLE billing_periods (
 id uuid PRIMARY KEY, property_id uuid NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
 starts_at timestamptz NOT NULL CHECK(isfinite(starts_at)), ends_at timestamptz NOT NULL CHECK(isfinite(ends_at) AND ends_at>starts_at),
 revision_no integer NOT NULL CHECK(revision_no>=1), revision_kind varchar(16) NOT NULL CHECK(revision_kind IN ('initial','correction')),
 supersedes_period_id uuid UNIQUE REFERENCES billing_periods(id) ON DELETE RESTRICT,
 status varchar(16) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','finalized','superseded')),
 property_reconciliation_status varchar(16) NOT NULL DEFAULT 'review' CHECK(property_reconciliation_status IN ('valid','review')),
 source varchar(16) NOT NULL CHECK(source IN ('production','simulation','mixed')),
 calculation_version varchar(40) NOT NULL, policy_snapshot jsonb NOT NULL, tariff_snapshot jsonb,
 main_energy_kwh numeric(20,9), residual_energy_kwh numeric(20,9), preview_total_cost_rp numeric(18,0), total_cost_rp numeric(18,0),
 row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0), finalized_at timestamptz, finalized_by uuid REFERENCES users(id) ON DELETE RESTRICT,
 created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(property_id,starts_at,ends_at,revision_no),
 CHECK((status IN ('finalized','superseded'))=(finalized_at IS NOT NULL AND finalized_by IS NOT NULL)),
 CHECK((revision_kind='initial' AND supersedes_period_id IS NULL) OR (revision_kind='correction' AND supersedes_period_id IS NOT NULL))
);
CREATE UNIQUE INDEX one_effective_final_period ON billing_periods(property_id,starts_at,ends_at) WHERE status='finalized';
CREATE INDEX billing_property_time ON billing_periods(property_id,starts_at,ends_at);

CREATE TABLE billing_meter_segments (
 id uuid PRIMARY KEY, billing_period_id uuid NOT NULL REFERENCES billing_periods(id) ON DELETE RESTRICT,
 meter_id uuid NOT NULL REFERENCES meters(id) ON DELETE RESTRICT, room_id uuid REFERENCES rooms(id) ON DELETE RESTRICT,
 segment_starts_at timestamptz NOT NULL, segment_ends_at timestamptz NOT NULL CHECK(segment_ends_at>segment_starts_at),
 start_reading_id bigint REFERENCES meter_readings(id) ON DELETE RESTRICT, end_reading_id bigint REFERENCES meter_readings(id) ON DELETE RESTRICT,
 start_energy_kwh numeric(20,9), end_energy_kwh numeric(20,9), consumption_kwh numeric(20,9),
 quality varchar(16) NOT NULL CHECK(quality IN ('valid','review')), reason varchar(80), data_source varchar(16) NOT NULL CHECK(data_source IN ('production','simulation','mixed')),
 calculation_evidence jsonb NOT NULL, UNIQUE(billing_period_id,meter_id,segment_starts_at,segment_ends_at)
);
CREATE TABLE room_bills (
 id uuid PRIMARY KEY, billing_period_id uuid NOT NULL REFERENCES billing_periods(id) ON DELETE RESTRICT,
 room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT, status varchar(16) NOT NULL CHECK(status IN ('review','finalized')),
 room_energy_kwh numeric(20,9), attributable_energy_kwh numeric(20,9), room_cost_rp numeric(18,0), attributable_cost_rp numeric(18,0),
 preview_total_cost_rp numeric(18,0), total_cost_rp numeric(18,0), reasons jsonb NOT NULL, calculation_evidence jsonb NOT NULL,
 UNIQUE(billing_period_id,room_id), CHECK(status<>'finalized' OR total_cost_rp IS NOT NULL)
);
CREATE TABLE bill_shares (
 id uuid PRIMARY KEY, room_bill_id uuid NOT NULL REFERENCES room_bills(id) ON DELETE RESTRICT,
 occupancy_id uuid REFERENCES occupancies(id) ON DELETE RESTRICT, allocation_kind varchar(24) NOT NULL CHECK(allocation_kind IN ('occupancy','owner_unassigned')),
 room_energy_kwh numeric(20,9), attributable_energy_kwh numeric(20,9), room_cost_rp numeric(18,0), attributable_cost_rp numeric(18,0),
 rounding_adjustment_rp numeric(18,0), total_cost_rp numeric(18,0), allocation_evidence jsonb NOT NULL,
 CHECK((allocation_kind='owner_unassigned')=(occupancy_id IS NULL))
);
CREATE UNIQUE INDEX one_share_occupancy ON bill_shares(room_bill_id,occupancy_id) WHERE occupancy_id IS NOT NULL;
CREATE UNIQUE INDEX one_share_owner ON bill_shares(room_bill_id) WHERE occupancy_id IS NULL;
CREATE TABLE bill_session_allocations (
 id uuid PRIMARY KEY, bill_share_id uuid NOT NULL REFERENCES bill_shares(id) ON DELETE RESTRICT,
 usage_session_id uuid NOT NULL REFERENCES usage_sessions(id) ON DELETE RESTRICT,
 session_participant_id uuid NOT NULL REFERENCES session_participants(id) ON DELETE RESTRICT,
 allocated_energy_kwh numeric(20,9), cost_rp numeric(18,0), status varchar(16) NOT NULL CHECK(status IN ('valid','review')),
 reason varchar(80), calculation_evidence jsonb NOT NULL, UNIQUE(bill_share_id,usage_session_id,session_participant_id)
);
CREATE TABLE billing_issues (
 id uuid PRIMARY KEY, billing_period_id uuid NOT NULL REFERENCES billing_periods(id) ON DELETE RESTRICT,
 room_bill_id uuid REFERENCES room_bills(id) ON DELETE RESTRICT, usage_session_id uuid REFERENCES usage_sessions(id) ON DELETE RESTRICT,
 scope varchar(16) NOT NULL CHECK(scope IN ('property','room','session')), code varchar(80) NOT NULL,
 details jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX billing_issues_period ON billing_issues(billing_period_id,scope,code);
