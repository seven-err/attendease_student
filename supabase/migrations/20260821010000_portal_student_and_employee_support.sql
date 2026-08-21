-- =============================================================================
-- Migration: 20260821010000_portal_student_and_employee_support.sql
-- Description: Enables both Student and Employee QR scanning with strict department schedule isolation.
-- Safety: 100% Additive and Backward-Compatible with existing RPC interfaces.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Helper function: Extract Department Code from Employee Person Number
-- ---------------------------------------------------------------------------

create or replace function public.extract_employee_department(
  p_person_number text
)
returns text
language plpgsql
immutable
as $$
declare
  v_match text[];
begin
  if p_person_number is null then
    return null;
  end if;
  
  -- Match formats like EMP-CCS-007, EMP-CBE-006, EMP-CCJE-002, EMP-ADMIN-015, EMP-OFFICE-005, EMP-HS-001, EMP-ELEM-006, EMP-PSYCH-001
  v_match := regexp_matches(p_person_number, '^EMP-([A-Za-z0-9]+)-', 'i');
  if v_match is not null and array_length(v_match, 1) >= 1 then
    return upper(v_match[1]);
  end if;
  
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Internal Helper: Validate Session for both Students and Employees
-- ---------------------------------------------------------------------------

create or replace function public.internal_validate_student_portal_session(
  p_session_token text
)
returns table (
  person_id uuid,
  student_id uuid,
  full_name text,
  student_number text,
  department text,
  course text,
  year_level text,
  academic_year text,
  person_kind text,
  role text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token_hash text;
  v_session record;
  v_max_expiry timestamptz;
  v_new_expiry timestamptz;
begin
  if p_session_token is null or length(p_session_token) != 64 or p_session_token !~ '^[0-9a-fA-F]{64}$' then
    return;
  end if;

  v_token_hash := encode(extensions.digest(lower(p_session_token), 'sha256'::text), 'hex');

  select s.id as session_row_id, s.person_id, s.created_at, s.expires_at
  into v_session
  from public.student_portal_sessions s
  where s.token_hash = v_token_hash
    and s.expires_at > now()
  limit 1;

  if v_session.session_row_id is null then
    return;
  end if;

  -- 1-hour absolute cap from creation
  v_max_expiry := v_session.created_at + interval '1 hour';
  if now() >= v_max_expiry then
    delete from public.student_portal_sessions where id = v_session.session_row_id;
    return;
  end if;

  -- 15-minute rolling inactivity window bounded by 1-hour absolute cap
  v_new_expiry := least(now() + interval '15 minutes', v_max_expiry);

  update public.student_portal_sessions
  set expires_at = v_new_expiry,
      last_activity_at = now()
  where id = v_session.session_row_id;

  return query
  select
    p.id as person_id,
    st.id as student_id,
    coalesce(st.full_name, p.full_name) as full_name,
    coalesce(st.student_number, p.person_number) as student_number,
    case
      when p.person_kind = 'student' then ar.department
      else coalesce(public.extract_employee_department(p.person_number), 'INSTITUTION')
    end as department,
    case
      when p.person_kind = 'student' then ar.course
      else null::text
    end as course,
    case
      when p.person_kind = 'student' then ar.year_level
      else null::text
    end as year_level,
    case
      when p.person_kind = 'student' then ar.academic_year
      else null::text
    end as academic_year,
    p.person_kind,
    case
      when p.person_kind = 'student' then 'student'
      else 'employee'
    end as role
  from public.people p
  left join public.students st on st.id = p.id
  left join lateral (
    select r.department, r.course, r.year_level, r.academic_year
    from public.student_academic_records r
    where r.student_id = p.id
    order by r.created_at desc
    limit 1
  ) ar on true
  where p.id = v_session.person_id
    and p.person_status = 'Active'
    and p.person_kind in ('student', 'staff', 'employee')
  limit 1;
end;
$$;

revoke all on function public.internal_validate_student_portal_session(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPC: student_portal_create_session (Accepts Student and Employee QR Tokens)
-- ---------------------------------------------------------------------------

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

  if length(v_clean_token) < 3 or length(v_clean_token) > 256 then
    return jsonb_build_object('status', 'invalid_token');
  end if;

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

  -- Transaction-scoped advisory lock prevents race conditions during concurrent scans
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

-- ---------------------------------------------------------------------------
-- 4. RPC: student_portal_get_today_attendance (Role & Department Strict Isolation)
-- ---------------------------------------------------------------------------

create or replace function public.student_portal_get_today_attendance(
  p_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user record;
  v_today date := (timezone('Asia/Manila', now()))::date;
  v_records jsonb;
begin
  select * into v_user from public.internal_validate_student_portal_session(p_session_token);
  if v_user.person_id is null then
    return jsonb_build_object('status', 'session_expired');
  end if;

  with attended_sessions as (
    select
      s.id as session_id,
      s.title as session_title,
      s.description as session_description,
      s.date as session_date,
      s.start_time,
      s.end_time,
      s.status as session_status,
      s.department as session_department,
      ms.name as main_session_name,
      l.scanned_at as time_in_at,
      l.time_out_at,
      l.attendance_status as raw_status,
      case
        when l.attendance_status = 'Absent' then 'Absent'
        when l.scanned_at is not null and l.time_out_at is not null then 'Complete'
        when l.scanned_at is not null and l.time_out_at is null then 'In Progress'
        when l.scanned_at is null and l.time_out_at is not null then 'Missing Time In'
        else 'In Progress'
      end as portal_status,
      case
        when l.attendance_status in ('Late', 'Late (Excused)') then true
        else false
      end as is_late,
      case
        when l.attendance_status = 'Late (Excused)' then 'Late (Excused)'
        when l.attendance_status = 'Late' then 'Late'
        else null
      end as late_label
    from public.attendance_sessions s
    inner join public.attendance_logs l on l.session_id = s.id
      and (l.person_id = v_user.person_id or l.student_id = v_user.person_id)
    left join public.main_sessions ms on ms.id = s.main_session_id
    where s.date = v_today
      and s.status in ('Open', 'Closed')
      and s.trashed_at is null
      and (ms.id is null or ms.trashed_at is null)
  ),
  unattended_today_sessions as (
    select
      s.id as session_id,
      s.title as session_title,
      s.description as session_description,
      s.date as session_date,
      s.start_time,
      s.end_time,
      s.status as session_status,
      s.department as session_department,
      ms.name as main_session_name,
      null::timestamptz as time_in_at,
      null::timestamptz as time_out_at,
      null::text as raw_status,
      case
        when s.status = 'Open' then 'Awaiting Scan'
        else 'Not Recorded'
      end as portal_status,
      false as is_late,
      null::text as late_label
    from public.attendance_sessions s
    left join public.main_sessions ms on ms.id = s.main_session_id
    where s.date = v_today
      and s.status in ('Open', 'Closed')
      and s.trashed_at is null
      and (ms.id is null or ms.trashed_at is null)
      and not exists (
        select 1 from public.attendance_logs l
        where l.session_id = s.id
          and (l.person_id = v_user.person_id or l.student_id = v_user.person_id)
      )
      -- Role & Department matching:
      and (
        case
          when v_user.role = 'student' then
            -- Student matching rules:
            -- Must not be an employee-targeted session
            not (
              lower(coalesce(s.description, '')) ~ 'employee|staff|faculty|personnel|teachers'
              or lower(coalesce(ms.description, '')) ~ 'employee|staff|faculty|personnel|teachers'
              or lower(coalesce(ms.name, '')) ~ 'employee|staff|faculty|personnel|teachers|founder.*attendance'
              or lower(coalesce(s.title, '')) ~ 'employee|staff|faculty|personnel|teachers'
            )
            -- Department match: null (all depts) or exact match
            and (
              s.department is null
              or public.normalize_department_code(s.department) = public.normalize_department_code(v_user.department)
            )
            -- Year match
            and public.resolve_attendance_year_match(
              v_user.year_level,
              public.resolve_session_target_year_levels(s.target_year_levels, s.year_level)
            ) = 'intended'

          else
            -- Employee matching rules:
            -- Must be an employee session
            (
              lower(coalesce(s.description, '')) ~ 'employee|staff|faculty|personnel|teachers'
              or lower(coalesce(ms.description, '')) ~ 'employee|staff|faculty|personnel|teachers'
              or lower(coalesce(ms.name, '')) ~ 'employee|staff|faculty|personnel|teachers|founder.*attendance'
              or lower(coalesce(s.title, '')) ~ 'employee|staff|faculty|personnel|teachers'
            )
            -- Department match: null (institutional employee session) or matching employee department
            and (
              s.department is null
              or public.normalize_department_code(s.department) = public.normalize_department_code(v_user.department)
            )
        end
      )
  ),
  combined_today as (
    select * from attended_sessions
    union all
    select * from unattended_today_sessions
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'session_id', c.session_id,
      'session_title', c.session_title,
      'session_description', c.session_description,
      'main_session_name', c.main_session_name,
      'department', c.session_department,
      'date', to_char(c.session_date, 'YYYY-MM-DD'),
      'start_time', c.start_time,
      'end_time', c.end_time,
      'session_status', c.session_status,
      'time_in', c.time_in_at,
      'time_out', c.time_out_at,
      'raw_status', c.raw_status,
      'portal_status', c.portal_status,
      'is_late', c.is_late,
      'late_label', c.late_label
    ) order by c.start_time asc
  ), '[]'::jsonb)
  into v_records
  from combined_today c;

  return jsonb_build_object(
    'status', 'ok',
    'date', to_char(v_today, 'YYYY-MM-DD'),
    'records', v_records
  );
end;
$$;

revoke all on function public.student_portal_get_today_attendance(text) from public;
grant execute on function public.student_portal_get_today_attendance(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPC: student_portal_get_attendance_history (Trash-Filtered Paginated Logs)
-- ---------------------------------------------------------------------------

create or replace function public.student_portal_get_attendance_history(
  p_session_token text,
  p_limit int default 20,
  p_offset int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user record;
  v_limit int := greatest(1, least(coalesce(p_limit, 20), 50));
  v_offset int := greatest(0, coalesce(p_offset, 0));
  v_total_count int;
  v_records jsonb;
begin
  select * into v_user from public.internal_validate_student_portal_session(p_session_token);
  if v_user.person_id is null then
    return jsonb_build_object('status', 'session_expired');
  end if;

  select count(*)::int
  into v_total_count
  from public.attendance_logs l
  inner join public.attendance_sessions s on s.id = l.session_id
  left join public.main_sessions ms on ms.id = s.main_session_id
  where (l.person_id = v_user.person_id or l.student_id = v_user.person_id)
    and s.status in ('Open', 'Closed', 'Archived')
    and s.trashed_at is null
    and (ms.id is null or ms.trashed_at is null);

  with history_logs as (
    select
      s.id as session_id,
      s.title as session_title,
      s.description as session_description,
      s.date as session_date,
      s.start_time,
      s.end_time,
      s.status as session_status,
      s.department as session_department,
      ms.name as main_session_name,
      l.scanned_at as time_in_at,
      l.time_out_at,
      l.attendance_status as raw_status,
      case
        when l.attendance_status = 'Absent' then 'Absent'
        when l.scanned_at is not null and l.time_out_at is not null then 'Complete'
        when l.scanned_at is not null and l.time_out_at is null then 'In Progress'
        when l.scanned_at is null and l.time_out_at is not null then 'Missing Time In'
        else 'In Progress'
      end as portal_status,
      case
        when l.attendance_status in ('Late', 'Late (Excused)') then true
        else false
      end as is_late,
      case
        when l.attendance_status = 'Late (Excused)' then 'Late (Excused)'
        when l.attendance_status = 'Late' then 'Late'
        else null
      end as late_label
    from public.attendance_logs l
    inner join public.attendance_sessions s on s.id = l.session_id
    left join public.main_sessions ms on ms.id = s.main_session_id
    where (l.person_id = v_user.person_id or l.student_id = v_user.person_id)
      and s.status in ('Open', 'Closed', 'Archived')
      and s.trashed_at is null
      and (ms.id is null or ms.trashed_at is null)
    order by s.date desc, s.start_time desc
    limit v_limit
    offset v_offset
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'session_id', h.session_id,
      'session_title', h.session_title,
      'session_description', h.session_description,
      'main_session_name', h.main_session_name,
      'department', h.session_department,
      'date', to_char(h.session_date, 'YYYY-MM-DD'),
      'start_time', h.start_time,
      'end_time', h.end_time,
      'session_status', h.session_status,
      'time_in', h.time_in_at,
      'time_out', h.time_out_at,
      'raw_status', h.raw_status,
      'portal_status', h.portal_status,
      'is_late', h.is_late,
      'late_label', h.late_label
    )
  ), '[]'::jsonb)
  into v_records
  from history_logs h;

  return jsonb_build_object(
    'status', 'ok',
    'total_count', v_total_count,
    'limit', v_limit,
    'offset', v_offset,
    'records', v_records
  );
end;
$$;

revoke all on function public.student_portal_get_attendance_history(text, int, int) from public;
grant execute on function public.student_portal_get_attendance_history(text, int, int) to anon, authenticated;
