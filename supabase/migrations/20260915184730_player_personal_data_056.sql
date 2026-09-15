BEGIN;
SET LOCAL statement_timeout = '10min';

-- ============================================================
-- NEXTPARI PHASE 056
-- PLAYER PERSONAL-DATA QUESTIONNAIRE
-- Sequence: after 055 (player manual verification).
--
-- Repository only. DO NOT APPLY from this change.
--
-- This questionnaire is NOT KYC verification.
-- Completeness, drafts, and field changes MUST NEVER request
-- verification, change Security restriction, hard-block, mutate
-- Wallet Ledger/balance, or alter deposits/withdrawals/casino/sports.
-- PHASE 055 remains the only path for manual verification actions.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS private;


CREATE TABLE IF NOT EXISTS private.player_personal_data (
    player_user_id UUID PRIMARY KEY,
    first_name TEXT,
    last_name TEXT,
    middle_name TEXT,
    date_of_birth DATE,
    citizenship_country_code TEXT,
    residence_country_code TEXT,
    residence_city TEXT,
    address_line_1 TEXT,
    address_line_2 TEXT,
    postal_code TEXT,
    document_type TEXT,
    document_issuing_country_code TEXT,
    document_series TEXT,
    document_number TEXT,
    document_issue_date DATE,
    document_expiry_date DATE,
    document_issuing_authority TEXT,
    questionnaire_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT player_personal_data_citizenship_country_check
        CHECK (
            citizenship_country_code IS NULL
            OR citizenship_country_code ~ '^[A-Z]{2}$'
        ),
    CONSTRAINT player_personal_data_residence_country_check
        CHECK (
            residence_country_code IS NULL
            OR residence_country_code ~ '^[A-Z]{2}$'
        ),
    CONSTRAINT player_personal_data_document_country_check
        CHECK (
            document_issuing_country_code IS NULL
            OR document_issuing_country_code ~ '^[A-Z]{2}$'
        ),
    CONSTRAINT player_personal_data_document_type_check
        CHECK (
            document_type IS NULL
            OR document_type IN (
                'passport',
                'national_id',
                'residence_permit',
                'driver_license',
                'other'
            )
        ),
    CONSTRAINT player_personal_data_name_len_check
        CHECK (
            (first_name IS NULL OR pg_catalog.char_length(first_name) BETWEEN 1 AND 100)
            AND (last_name IS NULL OR pg_catalog.char_length(last_name) BETWEEN 1 AND 100)
            AND (middle_name IS NULL OR pg_catalog.char_length(middle_name) BETWEEN 1 AND 100)
        ),
    CONSTRAINT player_personal_data_address_len_check
        CHECK (
            (residence_city IS NULL OR pg_catalog.char_length(residence_city) BETWEEN 1 AND 120)
            AND (address_line_1 IS NULL OR pg_catalog.char_length(address_line_1) BETWEEN 1 AND 200)
            AND (address_line_2 IS NULL OR pg_catalog.char_length(address_line_2) BETWEEN 1 AND 200)
            AND (postal_code IS NULL OR pg_catalog.char_length(postal_code) BETWEEN 1 AND 20)
        ),
    CONSTRAINT player_personal_data_document_len_check
        CHECK (
            (document_series IS NULL OR pg_catalog.char_length(document_series) BETWEEN 1 AND 32)
            AND (document_number IS NULL OR pg_catalog.char_length(document_number) BETWEEN 1 AND 64)
            AND (document_issuing_authority IS NULL OR pg_catalog.char_length(document_issuing_authority) BETWEEN 1 AND 200)
        ),
    CONSTRAINT player_personal_data_dob_past_check
        CHECK (date_of_birth IS NULL OR date_of_birth < pg_catalog.current_date),
    CONSTRAINT player_personal_data_issue_not_future_check
        CHECK (document_issue_date IS NULL OR document_issue_date <= pg_catalog.current_date),
    CONSTRAINT player_personal_data_expiry_after_issue_check
        CHECK (
            document_issue_date IS NULL
            OR document_expiry_date IS NULL
            OR document_expiry_date > document_issue_date
        )
);

COMMENT ON TABLE private.player_personal_data IS
'Canonical structured personal-data questionnaire. One row per player. Not KYC. Completeness is informational only and must never change verification, restriction, risk, money, or account access. Phone/email are not stored here.';

COMMENT ON COLUMN private.player_personal_data.questionnaire_completed_at IS
'Informational timestamp when required questionnaire fields are present. Must never drive verification, restriction, wallet, or access.';

COMMENT ON COLUMN private.player_personal_data.document_series IS
'Optional. Not every document scheme uses a series.';

COMMENT ON COLUMN private.player_personal_data.document_expiry_date IS
'Optional. Not every document scheme requires an expiry date.';


CREATE TABLE IF NOT EXISTS private.player_personal_data_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_user_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    actor_user_id UUID NOT NULL,
    changed_field_names TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    questionnaire_complete BOOLEAN NOT NULL DEFAULT FALSE,
    completeness_transition TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT player_personal_data_event_type_check
        CHECK (event_type IN (
            'PLAYER_PERSONAL_DATA_CREATED',
            'PLAYER_PERSONAL_DATA_UPDATED'
        )),
    CONSTRAINT player_personal_data_event_transition_check
        CHECK (
            completeness_transition IS NULL
            OR completeness_transition IN ('became_complete', 'became_incomplete')
        )
);

CREATE INDEX IF NOT EXISTS player_personal_data_events_player_idx
    ON private.player_personal_data_events (player_user_id, created_at DESC);

COMMENT ON TABLE private.player_personal_data_events IS
'Append-only questionnaire change audit. Stores field NAMES only. Never stores document numbers, names, addresses, or dates of birth.';


CREATE OR REPLACE FUNCTION private.player_personal_data_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
    RAISE EXCEPTION 'PLAYER_PERSONAL_DATA_EVENTS_IMMUTABLE';
END;
$fn$;

DROP TRIGGER IF EXISTS player_personal_data_events_no_update
    ON private.player_personal_data_events;
CREATE TRIGGER player_personal_data_events_no_update
    BEFORE UPDATE OR DELETE ON private.player_personal_data_events
    FOR EACH ROW
    EXECUTE FUNCTION private.player_personal_data_events_append_only();


CREATE OR REPLACE FUNCTION private.player_personal_data_norm_text(p_value TEXT, p_max INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
    v_text TEXT;
BEGIN
    v_text := pg_catalog.btrim(COALESCE(p_value, ''));
    IF v_text = '' THEN
        RETURN NULL;
    END IF;
    IF pg_catalog.char_length(v_text) > p_max THEN
        RAISE EXCEPTION 'PERSONAL_DATA_FIELD_TOO_LONG';
    END IF;
    RETURN v_text;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_personal_data_norm_country(p_value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
    v_text TEXT;
BEGIN
    v_text := pg_catalog.upper(pg_catalog.btrim(COALESCE(p_value, '')));
    IF v_text = '' THEN
        RETURN NULL;
    END IF;
    IF v_text !~ '^[A-Z]{2}$' THEN
        RAISE EXCEPTION 'PERSONAL_DATA_COUNTRY_INVALID';
    END IF;
    RETURN v_text;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_personal_data_parse_date(p_value TEXT)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
    v_text TEXT;
BEGIN
    v_text := pg_catalog.btrim(COALESCE(p_value, ''));
    IF v_text = '' THEN
        RETURN NULL;
    END IF;
    IF v_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
        RAISE EXCEPTION 'PERSONAL_DATA_DATE_INVALID';
    END IF;
    RETURN v_text::DATE;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_personal_data_norm_document_type(p_value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
    v_text TEXT;
BEGIN
    v_text := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_value, '')));
    IF v_text = '' THEN
        RETURN NULL;
    END IF;
    IF v_text NOT IN (
        'passport',
        'national_id',
        'residence_permit',
        'driver_license',
        'other'
    ) THEN
        RAISE EXCEPTION 'PERSONAL_DATA_DOCUMENT_TYPE_INVALID';
    END IF;
    RETURN v_text;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_personal_data_is_complete(
    p_first_name TEXT,
    p_last_name TEXT,
    p_date_of_birth DATE,
    p_citizenship_country_code TEXT,
    p_residence_country_code TEXT,
    p_residence_city TEXT,
    p_address_line_1 TEXT,
    p_document_type TEXT,
    p_document_issuing_country_code TEXT,
    p_document_number TEXT,
    p_document_issue_date DATE
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $fn$
    SELECT
        p_first_name IS NOT NULL
        AND p_last_name IS NOT NULL
        AND p_date_of_birth IS NOT NULL
        AND p_citizenship_country_code IS NOT NULL
        AND p_residence_country_code IS NOT NULL
        AND p_residence_city IS NOT NULL
        AND p_address_line_1 IS NOT NULL
        AND p_document_type IS NOT NULL
        AND p_document_issuing_country_code IS NOT NULL
        AND p_document_number IS NOT NULL
        AND p_document_issue_date IS NOT NULL;
$fn$;


CREATE OR REPLACE FUNCTION private.player_personal_data_mask_document(p_value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
    v_text TEXT;
    v_len INTEGER;
BEGIN
    v_text := pg_catalog.btrim(COALESCE(p_value, ''));
    IF v_text = '' THEN
        RETURN NULL;
    END IF;
    v_len := pg_catalog.char_length(v_text);
    IF v_len <= 4 THEN
        RETURN pg_catalog.repeat('*', v_len);
    END IF;
    RETURN pg_catalog.repeat('*', v_len - 4) || pg_catalog.right(v_text, 4);
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_personal_data_payload_text(
    p_payload JSONB,
    p_key TEXT,
    p_existing TEXT,
    p_max INTEGER
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
BEGIN
    IF p_payload IS NULL OR NOT pg_catalog.jsonb_exists(p_payload, p_key) THEN
        RETURN p_existing;
    END IF;
    RETURN private.player_personal_data_norm_text(p_payload ->> p_key, p_max);
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_personal_data_payload_country(
    p_payload JSONB,
    p_key TEXT,
    p_existing TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
BEGIN
    IF p_payload IS NULL OR NOT pg_catalog.jsonb_exists(p_payload, p_key) THEN
        RETURN p_existing;
    END IF;
    RETURN private.player_personal_data_norm_country(p_payload ->> p_key);
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_personal_data_payload_date(
    p_payload JSONB,
    p_key TEXT,
    p_existing DATE
)
RETURNS DATE
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
BEGIN
    IF p_payload IS NULL OR NOT pg_catalog.jsonb_exists(p_payload, p_key) THEN
        RETURN p_existing;
    END IF;
    RETURN private.player_personal_data_parse_date(p_payload ->> p_key);
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_personal_data_account_contacts(p_player_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_email TEXT;
    v_email_verified BOOLEAN := FALSE;
    v_phone TEXT;
    v_phone_verified BOOLEAN := FALSE;
    v_profile_phone TEXT;
    v_profile_email TEXT;
BEGIN
    SELECT
        pg_catalog.lower(pg_catalog.btrim(COALESCE(u.email, ''))),
        (u.email_confirmed_at IS NOT NULL),
        pg_catalog.btrim(COALESCE(u.phone, '')),
        (u.phone_confirmed_at IS NOT NULL)
    INTO v_email, v_email_verified, v_phone, v_phone_verified
    FROM auth.users AS u
    WHERE u.id = p_player_user_id;

    SELECT
        pg_catalog.btrim(COALESCE(p.phone, '')),
        pg_catalog.lower(pg_catalog.btrim(COALESCE(p.email, '')))
    INTO v_profile_phone, v_profile_email
    FROM public.profiles AS p
    WHERE p.id = p_player_user_id;

    IF v_phone IS NULL OR v_phone = '' THEN
        v_phone := NULLIF(v_profile_phone, '');
        v_phone_verified := FALSE;
    END IF;

    IF v_email IS NULL OR v_email = '' OR v_email LIKE '%@auth.nextpari.invalid' THEN
        v_email := NULLIF(v_profile_email, '');
        IF v_email IS NULL OR v_email LIKE '%@auth.nextpari.invalid' THEN
            v_email := NULL;
            v_email_verified := FALSE;
        ELSE
            v_email_verified := FALSE;
        END IF;
    END IF;

    IF private.player_has_verified_email(p_player_user_id) THEN
        v_email := private.player_verified_email(p_player_user_id);
        v_email_verified := TRUE;
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'email', v_email,
        'email_verified', v_email_verified,
        'phone', v_phone,
        'phone_verified', v_phone_verified
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_personal_data_legacy_defaults(p_player_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_meta JSONB := '{}'::JSONB;
    v_first TEXT;
    v_last TEXT;
    v_middle TEXT;
    v_dob DATE;
    v_raw_dob TEXT;
BEGIN
    SELECT COALESCE(u.raw_user_meta_data, '{}'::JSONB)
    INTO v_meta
    FROM auth.users AS u
    WHERE u.id = p_player_user_id;

    v_first := private.player_personal_data_norm_text(
        COALESCE(v_meta ->> 'firstName', v_meta ->> 'first_name'),
        100
    );
    v_last := private.player_personal_data_norm_text(
        COALESCE(v_meta ->> 'lastName', v_meta ->> 'last_name'),
        100
    );
    v_middle := private.player_personal_data_norm_text(
        COALESCE(v_meta ->> 'middleName', v_meta ->> 'middle_name'),
        100
    );
    v_raw_dob := pg_catalog.btrim(COALESCE(v_meta ->> 'birthDate', v_meta ->> 'birth_date', ''));
    IF v_raw_dob <> '' THEN
        BEGIN
            v_dob := private.player_personal_data_parse_date(v_raw_dob);
        EXCEPTION
            WHEN OTHERS THEN
                v_dob := NULL;
        END;
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'first_name', v_first,
        'last_name', v_last,
        'middle_name', v_middle,
        'date_of_birth', v_dob
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_personal_data_read(p_player_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_row private.player_personal_data%ROWTYPE;
    v_has_row BOOLEAN := FALSE;
    v_defaults JSONB;
    v_contacts JSONB;
    v_status TEXT;
    v_verified BOOLEAN := FALSE;
    v_identity_locked BOOLEAN := FALSE;
    v_complete BOOLEAN := FALSE;
    v_first TEXT;
    v_last TEXT;
    v_middle TEXT;
    v_dob DATE;
BEGIN
    SELECT *
    INTO v_row
    FROM private.player_personal_data AS d
    WHERE d.player_user_id = p_player_user_id;

    v_has_row := FOUND;
    v_defaults := private.player_personal_data_legacy_defaults(p_player_user_id);
    v_contacts := private.player_personal_data_account_contacts(p_player_user_id);

    IF v_has_row THEN
        v_first := v_row.first_name;
        v_last := v_row.last_name;
        v_middle := v_row.middle_name;
        v_dob := v_row.date_of_birth;
    ELSE
        v_first := v_defaults ->> 'first_name';
        v_last := v_defaults ->> 'last_name';
        v_middle := v_defaults ->> 'middle_name';
        IF v_defaults ->> 'date_of_birth' IS NOT NULL AND v_defaults ->> 'date_of_birth' <> '' THEN
            v_dob := (v_defaults ->> 'date_of_birth')::DATE;
        END IF;
    END IF;

    SELECT r.status
    INTO v_status
    FROM private.player_manual_verification_requests AS r
    WHERE r.player_user_id = p_player_user_id;

    v_verified := v_status = 'VERIFIED';
    v_identity_locked := v_verified AND v_has_row;
    v_complete := v_has_row AND private.player_personal_data_is_complete(
        v_row.first_name,
        v_row.last_name,
        v_row.date_of_birth,
        v_row.citizenship_country_code,
        v_row.residence_country_code,
        v_row.residence_city,
        v_row.address_line_1,
        v_row.document_type,
        v_row.document_issuing_country_code,
        v_row.document_number,
        v_row.document_issue_date
    );

    RETURN pg_catalog.jsonb_build_object(
        'ok', TRUE,
        'has_row', v_has_row,
        'identity_locked', v_identity_locked,
        'verification_status', v_status,
        'questionnaire_complete', v_complete,
        'questionnaire_completed_at', CASE WHEN v_has_row THEN v_row.questionnaire_completed_at ELSE NULL END,
        'first_name', v_first,
        'last_name', v_last,
        'middle_name', v_middle,
        'date_of_birth', v_dob,
        'citizenship_country_code', CASE WHEN v_has_row THEN v_row.citizenship_country_code ELSE NULL END,
        'residence_country_code', CASE WHEN v_has_row THEN v_row.residence_country_code ELSE NULL END,
        'residence_city', CASE WHEN v_has_row THEN v_row.residence_city ELSE NULL END,
        'address_line_1', CASE WHEN v_has_row THEN v_row.address_line_1 ELSE NULL END,
        'address_line_2', CASE WHEN v_has_row THEN v_row.address_line_2 ELSE NULL END,
        'postal_code', CASE WHEN v_has_row THEN v_row.postal_code ELSE NULL END,
        'document_type', CASE WHEN v_has_row THEN v_row.document_type ELSE NULL END,
        'document_issuing_country_code', CASE WHEN v_has_row THEN v_row.document_issuing_country_code ELSE NULL END,
        'document_series', CASE WHEN v_has_row THEN v_row.document_series ELSE NULL END,
        'document_number', CASE WHEN v_has_row THEN v_row.document_number ELSE NULL END,
        'document_issue_date', CASE WHEN v_has_row THEN v_row.document_issue_date ELSE NULL END,
        'document_expiry_date', CASE WHEN v_has_row THEN v_row.document_expiry_date ELSE NULL END,
        'document_issuing_authority', CASE WHEN v_has_row THEN v_row.document_issuing_authority ELSE NULL END,
        'email', v_contacts ->> 'email',
        'email_verified', COALESCE((v_contacts ->> 'email_verified')::BOOLEAN, FALSE),
        'phone', v_contacts ->> 'phone',
        'phone_verified', COALESCE((v_contacts ->> 'phone_verified')::BOOLEAN, FALSE),
        'created_at', CASE WHEN v_has_row THEN v_row.created_at ELSE NULL END,
        'updated_at', CASE WHEN v_has_row THEN v_row.updated_at ELSE NULL END
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_personal_data_staff_summary(p_player_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_row private.player_personal_data%ROWTYPE;
    v_has_row BOOLEAN := FALSE;
    v_complete BOOLEAN := FALSE;
    v_defaults JSONB;
    v_public TEXT;
BEGIN
    v_public := private.player_security_public_id(p_player_user_id);

    SELECT *
    INTO v_row
    FROM private.player_personal_data AS d
    WHERE d.player_user_id = p_player_user_id;
    v_has_row := FOUND;

    v_defaults := private.player_personal_data_legacy_defaults(p_player_user_id);
    v_complete := v_has_row AND private.player_personal_data_is_complete(
        v_row.first_name,
        v_row.last_name,
        v_row.date_of_birth,
        v_row.citizenship_country_code,
        v_row.residence_country_code,
        v_row.residence_city,
        v_row.address_line_1,
        v_row.document_type,
        v_row.document_issuing_country_code,
        v_row.document_number,
        v_row.document_issue_date
    );

    RETURN pg_catalog.jsonb_build_object(
        'ok', TRUE,
        'player_public_id', v_public,
        'has_row', v_has_row,
        'questionnaire_complete', v_complete,
        'first_name', CASE
            WHEN v_has_row THEN v_row.first_name
            ELSE v_defaults ->> 'first_name'
        END,
        'last_name', CASE
            WHEN v_has_row THEN v_row.last_name
            ELSE v_defaults ->> 'last_name'
        END,
        'date_of_birth', CASE
            WHEN v_has_row THEN to_char(v_row.date_of_birth, 'YYYY-MM-DD')
            ELSE v_defaults ->> 'date_of_birth'
        END,
        'citizenship_country_code', CASE WHEN v_has_row THEN v_row.citizenship_country_code ELSE NULL END,
        'residence_country_code', CASE WHEN v_has_row THEN v_row.residence_country_code ELSE NULL END,
        'residence_city', CASE WHEN v_has_row THEN v_row.residence_city ELSE NULL END,
        'document_type', CASE WHEN v_has_row THEN v_row.document_type ELSE NULL END,
        'document_number_masked', CASE
            WHEN v_has_row THEN private.player_personal_data_mask_document(v_row.document_number)
            ELSE NULL
        END,
        'updated_at', CASE WHEN v_has_row THEN v_row.updated_at ELSE NULL END
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_personal_data_save(
    p_player_user_id UUID,
    p_payload JSONB,
    p_actor_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_existing private.player_personal_data%ROWTYPE;
    v_has_row BOOLEAN := FALSE;
    v_status TEXT;
    v_verified BOOLEAN := FALSE;
    v_payload JSONB;
    v_first TEXT;
    v_last TEXT;
    v_middle TEXT;
    v_dob DATE;
    v_citizenship TEXT;
    v_residence_country TEXT;
    v_city TEXT;
    v_address_1 TEXT;
    v_address_2 TEXT;
    v_postal TEXT;
    v_doc_type TEXT;
    v_doc_country TEXT;
    v_doc_series TEXT;
    v_doc_number TEXT;
    v_issue DATE;
    v_expiry DATE;
    v_authority TEXT;
    v_complete BOOLEAN;
    v_was_complete BOOLEAN := FALSE;
    v_completed_at TIMESTAMPTZ;
    v_changed TEXT[] := ARRAY[]::TEXT[];
    v_transition TEXT;
    v_event TEXT;
BEGIN
    IF p_player_user_id IS NULL OR p_actor_user_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;
    IF p_actor_user_id <> p_player_user_id THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;

    v_payload := COALESCE(p_payload, '{}'::JSONB);
    IF pg_catalog.jsonb_typeof(v_payload) <> 'object' THEN
        RAISE EXCEPTION 'PERSONAL_DATA_PAYLOAD_INVALID';
    END IF;

    v_payload := v_payload
        - 'player_user_id'
        - 'playerUserId'
        - 'player_id'
        - 'playerId'
        - 'public_id'
        - 'publicId'
        - 'email'
        - 'phone'
        - 'email_verified'
        - 'emailVerified'
        - 'phone_verified'
        - 'phoneVerified'
        - 'verification_status'
        - 'verificationStatus'
        - 'restricted'
        - 'restriction'
        - 'wallet_status'
        - 'walletStatus'
        - 'balance'
        - 'staff_role'
        - 'staffRole'
        - 'actor_user_id'
        - 'actorUserId'
        - 'questionnaire_completed_at'
        - 'questionnaireCompletedAt'
        - 'passport';

    SELECT *
    INTO v_existing
    FROM private.player_personal_data AS d
    WHERE d.player_user_id = p_player_user_id
    FOR UPDATE;
    v_has_row := FOUND;

    SELECT r.status
    INTO v_status
    FROM private.player_manual_verification_requests AS r
    WHERE r.player_user_id = p_player_user_id;
    v_verified := v_status = 'VERIFIED';

    v_first := private.player_personal_data_payload_text(v_payload, 'first_name', v_existing.first_name, 100);
    v_last := private.player_personal_data_payload_text(v_payload, 'last_name', v_existing.last_name, 100);
    v_middle := private.player_personal_data_payload_text(v_payload, 'middle_name', v_existing.middle_name, 100);
    v_dob := private.player_personal_data_payload_date(v_payload, 'date_of_birth', v_existing.date_of_birth);
    v_citizenship := private.player_personal_data_payload_country(
        v_payload,
        'citizenship_country_code',
        v_existing.citizenship_country_code
    );
    v_residence_country := private.player_personal_data_payload_country(
        v_payload,
        'residence_country_code',
        v_existing.residence_country_code
    );
    v_city := private.player_personal_data_payload_text(v_payload, 'residence_city', v_existing.residence_city, 120);
    v_address_1 := private.player_personal_data_payload_text(v_payload, 'address_line_1', v_existing.address_line_1, 200);
    v_address_2 := private.player_personal_data_payload_text(v_payload, 'address_line_2', v_existing.address_line_2, 200);
    v_postal := private.player_personal_data_payload_text(v_payload, 'postal_code', v_existing.postal_code, 20);
    IF pg_catalog.jsonb_exists(v_payload, 'document_type') THEN
        v_doc_type := private.player_personal_data_norm_document_type(v_payload ->> 'document_type');
    ELSE
        v_doc_type := v_existing.document_type;
    END IF;
    v_doc_country := private.player_personal_data_payload_country(
        v_payload,
        'document_issuing_country_code',
        v_existing.document_issuing_country_code
    );
    v_doc_series := private.player_personal_data_payload_text(v_payload, 'document_series', v_existing.document_series, 32);
    v_doc_number := private.player_personal_data_payload_text(v_payload, 'document_number', v_existing.document_number, 64);
    v_issue := private.player_personal_data_payload_date(v_payload, 'document_issue_date', v_existing.document_issue_date);
    v_expiry := private.player_personal_data_payload_date(v_payload, 'document_expiry_date', v_existing.document_expiry_date);
    v_authority := private.player_personal_data_payload_text(
        v_payload,
        'document_issuing_authority',
        v_existing.document_issuing_authority,
        200
    );

    IF v_dob IS NOT NULL AND v_dob >= pg_catalog.current_date THEN
        RAISE EXCEPTION 'PERSONAL_DATA_DOB_INVALID';
    END IF;
    IF v_issue IS NOT NULL AND v_issue > pg_catalog.current_date THEN
        RAISE EXCEPTION 'PERSONAL_DATA_ISSUE_DATE_INVALID';
    END IF;
    IF v_issue IS NOT NULL AND v_expiry IS NOT NULL AND v_expiry <= v_issue THEN
        RAISE EXCEPTION 'PERSONAL_DATA_EXPIRY_INVALID';
    END IF;

    IF v_verified AND v_has_row THEN
        IF v_first IS DISTINCT FROM v_existing.first_name
            OR v_last IS DISTINCT FROM v_existing.last_name
            OR v_middle IS DISTINCT FROM v_existing.middle_name
            OR v_dob IS DISTINCT FROM v_existing.date_of_birth
            OR v_citizenship IS DISTINCT FROM v_existing.citizenship_country_code
            OR v_doc_type IS DISTINCT FROM v_existing.document_type
            OR v_doc_country IS DISTINCT FROM v_existing.document_issuing_country_code
            OR v_doc_series IS DISTINCT FROM v_existing.document_series
            OR v_doc_number IS DISTINCT FROM v_existing.document_number
            OR v_issue IS DISTINCT FROM v_existing.document_issue_date
            OR v_expiry IS DISTINCT FROM v_existing.document_expiry_date
            OR v_authority IS DISTINCT FROM v_existing.document_issuing_authority
        THEN
            RAISE EXCEPTION 'PERSONAL_DATA_IDENTITY_LOCKED';
        END IF;
    END IF;

    v_complete := private.player_personal_data_is_complete(
        v_first,
        v_last,
        v_dob,
        v_citizenship,
        v_residence_country,
        v_city,
        v_address_1,
        v_doc_type,
        v_doc_country,
        v_doc_number,
        v_issue
    );
    IF v_has_row THEN
        v_was_complete := private.player_personal_data_is_complete(
            v_existing.first_name,
            v_existing.last_name,
            v_existing.date_of_birth,
            v_existing.citizenship_country_code,
            v_existing.residence_country_code,
            v_existing.residence_city,
            v_existing.address_line_1,
            v_existing.document_type,
            v_existing.document_issuing_country_code,
            v_existing.document_number,
            v_existing.document_issue_date
        );
    END IF;

    IF v_complete THEN
        v_completed_at := CASE
            WHEN v_has_row THEN COALESCE(v_existing.questionnaire_completed_at, pg_catalog.now())
            ELSE pg_catalog.now()
        END;
    ELSE
        v_completed_at := NULL;
    END IF;

    IF v_has_row THEN
        IF v_first IS DISTINCT FROM v_existing.first_name THEN
            v_changed := array_append(v_changed, 'first_name');
        END IF;
        IF v_last IS DISTINCT FROM v_existing.last_name THEN
            v_changed := array_append(v_changed, 'last_name');
        END IF;
        IF v_middle IS DISTINCT FROM v_existing.middle_name THEN
            v_changed := array_append(v_changed, 'middle_name');
        END IF;
        IF v_dob IS DISTINCT FROM v_existing.date_of_birth THEN
            v_changed := array_append(v_changed, 'date_of_birth');
        END IF;
        IF v_citizenship IS DISTINCT FROM v_existing.citizenship_country_code THEN
            v_changed := array_append(v_changed, 'citizenship_country_code');
        END IF;
        IF v_residence_country IS DISTINCT FROM v_existing.residence_country_code THEN
            v_changed := array_append(v_changed, 'residence_country_code');
        END IF;
        IF v_city IS DISTINCT FROM v_existing.residence_city THEN
            v_changed := array_append(v_changed, 'residence_city');
        END IF;
        IF v_address_1 IS DISTINCT FROM v_existing.address_line_1 THEN
            v_changed := array_append(v_changed, 'address_line_1');
        END IF;
        IF v_address_2 IS DISTINCT FROM v_existing.address_line_2 THEN
            v_changed := array_append(v_changed, 'address_line_2');
        END IF;
        IF v_postal IS DISTINCT FROM v_existing.postal_code THEN
            v_changed := array_append(v_changed, 'postal_code');
        END IF;
        IF v_doc_type IS DISTINCT FROM v_existing.document_type THEN
            v_changed := array_append(v_changed, 'document_type');
        END IF;
        IF v_doc_country IS DISTINCT FROM v_existing.document_issuing_country_code THEN
            v_changed := array_append(v_changed, 'document_issuing_country_code');
        END IF;
        IF v_doc_series IS DISTINCT FROM v_existing.document_series THEN
            v_changed := array_append(v_changed, 'document_series');
        END IF;
        IF v_doc_number IS DISTINCT FROM v_existing.document_number THEN
            v_changed := array_append(v_changed, 'document_number');
        END IF;
        IF v_issue IS DISTINCT FROM v_existing.document_issue_date THEN
            v_changed := array_append(v_changed, 'document_issue_date');
        END IF;
        IF v_expiry IS DISTINCT FROM v_existing.document_expiry_date THEN
            v_changed := array_append(v_changed, 'document_expiry_date');
        END IF;
        IF v_authority IS DISTINCT FROM v_existing.document_issuing_authority THEN
            v_changed := array_append(v_changed, 'document_issuing_authority');
        END IF;
        IF v_completed_at IS DISTINCT FROM v_existing.questionnaire_completed_at THEN
            v_changed := array_append(v_changed, 'questionnaire_completed_at');
        END IF;
    ELSE
        IF v_first IS NOT NULL THEN v_changed := array_append(v_changed, 'first_name'); END IF;
        IF v_last IS NOT NULL THEN v_changed := array_append(v_changed, 'last_name'); END IF;
        IF v_middle IS NOT NULL THEN v_changed := array_append(v_changed, 'middle_name'); END IF;
        IF v_dob IS NOT NULL THEN v_changed := array_append(v_changed, 'date_of_birth'); END IF;
        IF v_citizenship IS NOT NULL THEN v_changed := array_append(v_changed, 'citizenship_country_code'); END IF;
        IF v_residence_country IS NOT NULL THEN v_changed := array_append(v_changed, 'residence_country_code'); END IF;
        IF v_city IS NOT NULL THEN v_changed := array_append(v_changed, 'residence_city'); END IF;
        IF v_address_1 IS NOT NULL THEN v_changed := array_append(v_changed, 'address_line_1'); END IF;
        IF v_address_2 IS NOT NULL THEN v_changed := array_append(v_changed, 'address_line_2'); END IF;
        IF v_postal IS NOT NULL THEN v_changed := array_append(v_changed, 'postal_code'); END IF;
        IF v_doc_type IS NOT NULL THEN v_changed := array_append(v_changed, 'document_type'); END IF;
        IF v_doc_country IS NOT NULL THEN v_changed := array_append(v_changed, 'document_issuing_country_code'); END IF;
        IF v_doc_series IS NOT NULL THEN v_changed := array_append(v_changed, 'document_series'); END IF;
        IF v_doc_number IS NOT NULL THEN v_changed := array_append(v_changed, 'document_number'); END IF;
        IF v_issue IS NOT NULL THEN v_changed := array_append(v_changed, 'document_issue_date'); END IF;
        IF v_expiry IS NOT NULL THEN v_changed := array_append(v_changed, 'document_expiry_date'); END IF;
        IF v_authority IS NOT NULL THEN v_changed := array_append(v_changed, 'document_issuing_authority'); END IF;
    END IF;

    IF NOT v_has_row THEN
        INSERT INTO private.player_personal_data (
            player_user_id,
            first_name,
            last_name,
            middle_name,
            date_of_birth,
            citizenship_country_code,
            residence_country_code,
            residence_city,
            address_line_1,
            address_line_2,
            postal_code,
            document_type,
            document_issuing_country_code,
            document_series,
            document_number,
            document_issue_date,
            document_expiry_date,
            document_issuing_authority,
            questionnaire_completed_at
        ) VALUES (
            p_player_user_id,
            v_first,
            v_last,
            v_middle,
            v_dob,
            v_citizenship,
            v_residence_country,
            v_city,
            v_address_1,
            v_address_2,
            v_postal,
            v_doc_type,
            v_doc_country,
            v_doc_series,
            v_doc_number,
            v_issue,
            v_expiry,
            v_authority,
            v_completed_at
        );
        v_event := 'PLAYER_PERSONAL_DATA_CREATED';
    ELSE
        UPDATE private.player_personal_data AS d
        SET
            first_name = v_first,
            last_name = v_last,
            middle_name = v_middle,
            date_of_birth = v_dob,
            citizenship_country_code = v_citizenship,
            residence_country_code = v_residence_country,
            residence_city = v_city,
            address_line_1 = v_address_1,
            address_line_2 = v_address_2,
            postal_code = v_postal,
            document_type = v_doc_type,
            document_issuing_country_code = v_doc_country,
            document_series = v_doc_series,
            document_number = v_doc_number,
            document_issue_date = v_issue,
            document_expiry_date = v_expiry,
            document_issuing_authority = v_authority,
            questionnaire_completed_at = v_completed_at,
            updated_at = pg_catalog.now()
        WHERE d.player_user_id = p_player_user_id;
        v_event := 'PLAYER_PERSONAL_DATA_UPDATED';
    END IF;

    IF v_complete AND NOT v_was_complete THEN
        v_transition := 'became_complete';
    ELSIF NOT v_complete AND v_was_complete THEN
        v_transition := 'became_incomplete';
    ELSE
        v_transition := NULL;
    END IF;

    INSERT INTO private.player_personal_data_events (
        player_user_id,
        event_type,
        actor_user_id,
        changed_field_names,
        questionnaire_complete,
        completeness_transition
    ) VALUES (
        p_player_user_id,
        v_event,
        p_actor_user_id,
        v_changed,
        v_complete,
        v_transition
    );

    RETURN private.player_personal_data_read(p_player_user_id);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.player_personal_data()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;
    RETURN private.player_personal_data_read(v_uid);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.player_save_personal_data(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;
    RETURN private.player_personal_data_save(v_uid, p_payload, v_uid);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_player_personal_data_summary(p_player_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
BEGIN
    PERFORM private.get_current_owner_context();
    v_uid := private.player_security_user_id_from_public_id(p_player_id);
    RETURN private.player_personal_data_staff_summary(v_uid);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.security_player_personal_data_summary(p_player_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
BEGIN
    PERFORM private.get_current_security_context();
    v_uid := private.player_security_user_id_from_public_id(p_player_id);
    RETURN private.player_personal_data_staff_summary(v_uid);
END;
$fn$;


REVOKE ALL ON TABLE private.player_personal_data FROM PUBLIC;
REVOKE ALL ON TABLE private.player_personal_data FROM anon, authenticated;
REVOKE ALL ON TABLE private.player_personal_data FROM service_role;
GRANT SELECT ON TABLE private.player_personal_data TO service_role;
REVOKE INSERT, UPDATE, DELETE ON TABLE private.player_personal_data FROM service_role;

REVOKE ALL ON TABLE private.player_personal_data_events FROM PUBLIC;
REVOKE ALL ON TABLE private.player_personal_data_events FROM anon, authenticated;
REVOKE ALL ON TABLE private.player_personal_data_events FROM service_role;
GRANT SELECT ON TABLE private.player_personal_data_events TO service_role;
REVOKE INSERT, UPDATE, DELETE ON TABLE private.player_personal_data_events FROM service_role;

REVOKE ALL ON FUNCTION private.player_personal_data_events_append_only() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_personal_data_norm_text(TEXT, INTEGER) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_personal_data_norm_country(TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_personal_data_parse_date(TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_personal_data_norm_document_type(TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_personal_data_is_complete(TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_personal_data_mask_document(TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_personal_data_payload_text(JSONB, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_personal_data_payload_country(JSONB, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_personal_data_payload_date(JSONB, TEXT, DATE) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_personal_data_account_contacts(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_personal_data_legacy_defaults(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_personal_data_read(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_personal_data_staff_summary(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_personal_data_save(UUID, JSONB, UUID) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.player_personal_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_personal_data() TO authenticated;

REVOKE ALL ON FUNCTION public.player_save_personal_data(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_save_personal_data(JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.owner_player_personal_data_summary(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_player_personal_data_summary(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.security_player_personal_data_summary(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_player_personal_data_summary(TEXT) TO authenticated;

COMMIT;
