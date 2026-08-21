-- =============================================================================
-- Migration: 20260821020000_allow_short_qr_tokens_and_exact_db_matching.sql
-- Description: Updates student_portal_create_session to support scanning and verifying
--              all student and employee QR codes and structures (including CCS CRMC-2026-XXXX,
--              raw student IDs, URLs, JSON, delimited formats) against the database.
-- Safety: 100% Additive and Backward-Compatible with existing RPC interfaces.
-- =============================================================================

create or replace function public.student_portal_create_session(
  p_qr_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_raw_trimmed text;
  v_clean_token text;
  v_person record;
  v_raw_token text;
  v_token_hash text;
  v_expires_at timestamptz;
  v_role text;
  v_dept text;
begin
  v_raw_trimmed := trim(coalesce(p_qr_token, ''));

  -- 1. URL extraction (e.g. https://.../scan?token=CRMC-2026-0378 or /2026-0378)
  if v_raw_trimmed ~* '^https?://' then
    if v_raw_trimmed ~* '[?&](token|qr|qr_token|code|id|student|student_number)=([^&#]+)' then
      v_raw_trimmed := (regexp_matches(v_raw_trimmed, '[?&](?:token|qr|qr_token|code|id|student|student_number)=([^&#]+)', 'i'))[1];
    else
      v_raw_trimmed := regexp_replace(v_raw_trimmed, '^.*/([^/?#]+)[/?#]*$', '\1');
    end if;
  end if;

  -- 2. Prefix format stripping (e.g. STUDENT:CRMC-2026-0378, QR=2026-0378, ID: 2026-0378)
  v_raw_trimmed := regexp_replace(v_raw_trimmed, '^(?:student|employee|qr|id|code|attendee|token)[\s:=_-]+', '', 'i');

  -- 3. Delimited barcode payload extraction (e.g. CRMC-2026-0378|BSIT|CCS)
  if v_raw_trimmed ~ '[|;\t]' then
    v_raw_trimmed := split_part(v_raw_trimmed, '|', 1);
    v_raw_trimmed := split_part(v_raw_trimmed, ';', 1);
    v_raw_trimmed := split_part(v_raw_trimmed, E'\t', 1);
  end if;

  v_raw_trimmed := trim(v_raw_trimmed);
  v_clean_token := lower(v_raw_trimmed);

  -- Reject empty or unreasonably long tokens
  if length(v_clean_token) < 3 or length(v_clean_token) > 256 then
    return jsonb_build_object('status', 'invalid_token');
  end if;

  -- Validate student or employee existence and active status in database
  -- Match across all token structures: exact qr_token, case-insensitive, person_number, student_number, with/without CRMC- prefix
  select
    p.id as person_id,
    st.id as student_id,
    coalesce(st.full_name, p.full_name) as full_name,
    coalesce(st.student_number, p.person_number) as student_number,
    p.person_kind,
    ar.department as student_dept,
    ar.course,
    ar.year_level,
    ar.academic_year
  into v_person
  from public.people p
  left join public.students st on st.id = p.id
  left join lateral (
    select r.department, r.course, r.year_level, r.academic_year
    from public.student_academic_records r
    where r.student_id = p.id
    order by r.created_at desc
    limit 1
  ) ar on true
  where (
      -- Exact matches
      p.qr_token = v_raw_trimmed
      or lower(p.qr_token) = v_clean_token
      or p.person_number = v_raw_trimmed
      or lower(p.person_number) = v_clean_token
      or st.student_number = v_raw_trimmed
      or lower(st.student_number) = v_clean_token
      -- Structure variations: with/without CRMC- prefix
      or ('CRMC-' || p.person_number) = v_raw_trimmed
      or lower('CRMC-' || p.person_number) = v_clean_token
      or p.qr_token = ('CRMC-' || v_raw_trimmed)
      or lower(p.qr_token) = ('crmc-' || v_clean_token)
      or lower(replace(p.qr_token, 'CRMC-', '')) = v_clean_token
      or lower(replace(p.qr_token, 'crmc-', '')) = v_clean_token
    )
    and p.person_status = 'Active'
    and p.person_kind in ('student', 'staff', 'employee')
  limit 1;

  if v_person.person_id is null then
    return jsonb_build_object('status', 'invalid_token');
  end if;

  if v_person.person_kind = 'student' then
    v_role := 'student';
    v_dept := v_person.student_dept;
  else
    v_role := 'employee';
    v_dept := coalesce(public.extract_employee_department(v_person.student_number), 'INSTITUTION');
  end if;

  -- Transaction-scoped advisory lock prevents race conditions during concurrent logins
  perform pg_advisory_xact_lock(hashtext(v_person.person_id::text));

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(v_raw_token, 'sha256'::text), 'hex');
  v_expires_at := now() + interval '15 minutes';

  -- Atomic UPSERT ensures exactly 1 active session per user
  insert into public.student_portal_sessions (
    person_id,
    token_hash,
    expires_at,
    created_at,
    last_activity_at
  )
  values (
    v_person.person_id,
    v_token_hash,
    v_expires_at,
    now(),
    now()
  )
  on conflict (person_id) do update
  set token_hash = excluded.token_hash,
    expires_at = excluded.expires_at,
    created_at = excluded.created_at,
    last_activity_at = excluded.last_activity_at;

  return jsonb_build_object(
    'status', 'ok',
    'session_token', v_raw_token,
    'expires_at', v_expires_at,
    'student', jsonb_build_object(
      'full_name', v_person.full_name,
      'student_number', v_person.student_number,
      'department', v_dept,
      'course', case when v_role = 'student' then v_person.course else null end,
      'year_level', case when v_role = 'student' then v_person.year_level else null end,
      'academic_year', case when v_role = 'student' then v_person.academic_year else null end,
      'role', v_role,
      'person_kind', v_person.person_kind
    )
  );
end;
$$;

revoke all on function public.student_portal_create_session(text) from public;
grant execute on function public.student_portal_create_session(text) to anon, authenticated;
