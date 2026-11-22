BEGIN;
SET LOCAL statement_timeout = '10min';

-- ============================================================
-- NEXTPARI PHASE 068
-- EXPRESS OF THE DAY + RESULTS CONTRACT
-- Sequence: after 067 (fraud attribution wallet ledger key).
--
-- Repository only. DO NOT APPLY from this change.
-- Additive sports content tables. No wallet/ledger rewrite.
-- ============================================================

CREATE TABLE IF NOT EXISTS private.express_of_day (
    id uuid PRIMARY KEY,
    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    status text NOT NULL CHECK (status IN ('draft', 'published', 'unpublished', 'archived')),
    published_at timestamptz,
    expires_at timestamptz,
    combined_odds numeric,
    odds_computed_at timestamptz,
    creator_id uuid NOT NULL,
    publisher_id uuid,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS private.express_of_day_selections (
    id uuid PRIMARY KEY,
    express_id uuid NOT NULL REFERENCES private.express_of_day(id) ON DELETE CASCADE,
    sort_order integer NOT NULL,
    canonical_event_id text NOT NULL,
    provider text NOT NULL,
    feed_type text NOT NULL,
    fixture_id text NOT NULL,
    market_id text NOT NULL,
    market_key text NOT NULL,
    selection_id text NOT NULL,
    outcome_id text NOT NULL,
    line text NOT NULL DEFAULT '',
    odds_snapshot numeric NOT NULL,
    odds_snapshot_at timestamptz NOT NULL,
    match_label text NOT NULL,
    league text NOT NULL,
    outcome_name text NOT NULL,
    UNIQUE (express_id, sort_order)
);

CREATE INDEX IF NOT EXISTS express_of_day_status_idx
    ON private.express_of_day (status, expires_at);

REVOKE ALL ON TABLE private.express_of_day FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.express_of_day_selections FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.express_of_day_json(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $fn$
    SELECT jsonb_build_object(
        'id', e.id,
        'title', e.title,
        'description', e.description,
        'status', e.status,
        'publishedAt', e.published_at,
        'expiresAt', e.expires_at,
        'combinedOdds', e.combined_odds,
        'oddsComputedAt', e.odds_computed_at,
        'creatorId', e.creator_id,
        'publisherId', e.publisher_id,
        'createdAt', e.created_at,
        'updatedAt', e.updated_at,
        'selections', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'id', s.id,
                'sortOrder', s.sort_order,
                'canonicalEventId', s.canonical_event_id,
                'provider', s.provider,
                'feedType', s.feed_type,
                'fixtureId', s.fixture_id,
                'marketId', s.market_id,
                'marketKey', s.market_key,
                'selectionId', s.selection_id,
                'outcomeId', s.outcome_id,
                'line', s.line,
                'oddsSnapshot', s.odds_snapshot,
                'oddsSnapshotAt', s.odds_snapshot_at,
                'matchLabel', s.match_label,
                'league', s.league,
                'outcomeName', s.outcome_name
            ) ORDER BY s.sort_order)
            FROM private.express_of_day_selections AS s
            WHERE s.express_id = e.id
        ), '[]'::jsonb)
    )
    FROM private.express_of_day AS e
    WHERE e.id = p_id;
$fn$;

CREATE OR REPLACE FUNCTION public.owner_express_list()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    result jsonb;
BEGIN
    PERFORM private.get_current_owner_context();
    SELECT coalesce(jsonb_agg(private.express_of_day_json(e.id) ORDER BY e.updated_at DESC), '[]'::jsonb)
    INTO result
    FROM private.express_of_day AS e;
    RETURN result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.owner_express_get(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    PERFORM private.get_current_owner_context();
    RETURN private.express_of_day_json(p_id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.player_express_published()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    result jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'JWT_REQUIRED';
    END IF;
    SELECT coalesce(jsonb_agg(private.express_of_day_json(e.id) ORDER BY e.published_at DESC), '[]'::jsonb)
    INTO result
    FROM private.express_of_day AS e
    WHERE e.status = 'published'
      AND (e.expires_at IS NULL OR e.expires_at > now());
    RETURN result;
END;
$fn$;

CREATE TABLE IF NOT EXISTS private.express_of_day_audit (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    action text NOT NULL,
    express_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS express_of_day_audit_express_idx
    ON private.express_of_day_audit (express_id, created_at DESC);

REVOKE ALL ON TABLE private.express_of_day_audit FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.express_of_day_write_audit(
    p_action text,
    p_express_id uuid,
    p_actor_id uuid,
    p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    INSERT INTO private.express_of_day_audit (action, express_id, actor_id, payload)
    VALUES (p_action, p_express_id, p_actor_id, coalesce(p_payload, '{}'::jsonb));
END;
$fn$;

CREATE OR REPLACE FUNCTION private.express_of_day_replace_selections(
    p_express_id uuid,
    p_selections jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_row jsonb;
    v_index integer := 0;
BEGIN
    DELETE FROM private.express_of_day_selections WHERE express_id = p_express_id;
    FOR v_row IN SELECT value FROM jsonb_array_elements(coalesce(p_selections, '[]'::jsonb))
    LOOP
        INSERT INTO private.express_of_day_selections (
            id, express_id, sort_order, canonical_event_id, provider, feed_type, fixture_id,
            market_id, market_key, selection_id, outcome_id, line, odds_snapshot, odds_snapshot_at,
            match_label, league, outcome_name
        ) VALUES (
            coalesce((v_row->>'id')::uuid, gen_random_uuid()),
            p_express_id,
            coalesce((v_row->>'sortOrder')::integer, v_index),
            v_row->>'canonicalEventId',
            v_row->>'provider',
            v_row->>'feedType',
            v_row->>'fixtureId',
            v_row->>'marketId',
            v_row->>'marketKey',
            v_row->>'selectionId',
            v_row->>'outcomeId',
            coalesce(v_row->>'line', ''),
            (v_row->>'oddsSnapshot')::numeric,
            coalesce((v_row->>'oddsSnapshotAt')::timestamptz, pg_catalog.now()),
            v_row->>'matchLabel',
            v_row->>'league',
            v_row->>'outcomeName'
        );
        v_index := v_index + 1;
    END LOOP;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.owner_express_save(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_owner uuid;
    v_id uuid;
    v_existing private.express_of_day%ROWTYPE;
BEGIN
    SELECT o.auth_user_id INTO v_owner FROM private.get_current_owner_context() AS o;
    v_id := coalesce(nullif(p_payload->>'id', '')::uuid, gen_random_uuid());
    SELECT * INTO v_existing FROM private.express_of_day WHERE id = v_id;
    IF FOUND AND v_existing.status = 'archived' THEN
        RAISE EXCEPTION 'EXPRESS_ARCHIVED';
    END IF;
    INSERT INTO private.express_of_day (
        id, title, description, status, published_at, expires_at, combined_odds, odds_computed_at,
        creator_id, publisher_id, created_at, updated_at
    ) VALUES (
        v_id,
        p_payload->>'title',
        coalesce(p_payload->>'description', ''),
        coalesce(nullif(p_payload->>'status', ''), 'draft'),
        nullif(p_payload->>'publishedAt', '')::timestamptz,
        nullif(p_payload->>'expiresAt', '')::timestamptz,
        nullif(p_payload->>'combinedOdds', '')::numeric,
        nullif(p_payload->>'oddsComputedAt', '')::timestamptz,
        coalesce(nullif(p_payload->>'creatorId', '')::uuid, v_owner),
        nullif(p_payload->>'publisherId', '')::uuid,
        coalesce(nullif(p_payload->>'createdAt', '')::timestamptz, pg_catalog.now()),
        coalesce(nullif(p_payload->>'updatedAt', '')::timestamptz, pg_catalog.now())
    )
    ON CONFLICT (id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        status = excluded.status,
        published_at = excluded.published_at,
        expires_at = excluded.expires_at,
        combined_odds = excluded.combined_odds,
        odds_computed_at = excluded.odds_computed_at,
        publisher_id = excluded.publisher_id,
        updated_at = excluded.updated_at;
    PERFORM private.express_of_day_replace_selections(v_id, p_payload->'selections');
    PERFORM private.express_of_day_write_audit(
        'EXPRESS_SAVED',
        v_id,
        v_owner,
        jsonb_build_object('status', coalesce(p_payload->>'status', 'draft'))
    );
    RETURN private.express_of_day_json(v_id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.owner_express_set_status(p_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_owner uuid;
    v_row private.express_of_day%ROWTYPE;
BEGIN
    SELECT o.auth_user_id INTO v_owner FROM private.get_current_owner_context() AS o;
    IF p_status NOT IN ('published', 'unpublished', 'archived') THEN
        RAISE EXCEPTION 'EXPRESS_STATUS_INVALID';
    END IF;
    SELECT * INTO v_row FROM private.express_of_day WHERE id = p_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'EXPRESS_NOT_FOUND';
    END IF;
    UPDATE private.express_of_day
    SET status = p_status,
        publisher_id = CASE WHEN p_status = 'published' THEN v_owner ELSE publisher_id END,
        published_at = CASE WHEN p_status = 'published' THEN pg_catalog.now() ELSE published_at END,
        updated_at = pg_catalog.now()
    WHERE id = p_id;
    PERFORM private.express_of_day_write_audit(
        CASE p_status
            WHEN 'published' THEN 'EXPRESS_PUBLISHED'
            WHEN 'unpublished' THEN 'EXPRESS_UNPUBLISHED'
            ELSE 'EXPRESS_ARCHIVED'
        END,
        p_id,
        v_owner,
        jsonb_build_object('status', p_status)
    );
    RETURN private.express_of_day_json(p_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.owner_express_list() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owner_express_get(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owner_express_save(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owner_express_set_status(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.player_express_published() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_express_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_express_get(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_express_save(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_express_set_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.player_express_published() TO authenticated;

COMMIT;
