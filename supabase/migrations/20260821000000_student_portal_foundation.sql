-- =============================================================================
-- Migration: 20260821000000_student_portal_foundation.sql
-- Description: Hardened Student Portal tables, RLS policies, and SECURITY DEFINER RPCs.
-- Safety: 100% Additive. No modifications to existing checker tables or RPCs.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. Table: student_portal_sessions
-- ---------------------------------------------------------------------------

create table if not exists public.student_portal_sessions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

create index if not exists idx_student_portal_sessions_hash_expires
  on public.student_portal_sessions (token_hash, expires_at);

-- Enforce single active session per student at the database constraint level
create unique index if not exists idx_student_portal_sessions_person_unique
  on public.student_portal_sessions (person_id);

alter table public.student_portal_sessions enable row level security;

-- Revoke all direct table privileges from public and anon
revoke all on table public.student_portal_sessions from public, anon;

-- Admin access policy
drop policy if exists "student_portal_sessions_admin_all" on public.student_portal_sessions;
create policy "student_portal_sessions_admin_all" on public.student_portal_sessions
  for all to authenticated
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));

-- ---------------------------------------------------------------------------
-- 2. Table: attendance_issue_reports
-- ---------------------------------------------------------------------------

create table if not exists public.attendance_issue_reports (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  session_id uuid references public.attendance_sessions(id) on delete set null,
  issue_type text not null check (issue_type in ('missing_time_in', 'missing_time_out', 'incorrect_time', 'wrong_status', 'other')),
  details text not null,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'resolved', 'dismissed')),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_attendance_issue_reports_person
  on public.attendance_issue_reports (person_id, created_at desc);

create index if not exists idx_attendance_issue_reports_session
  on public.attendance_issue_reports (session_id, status);

alter table public.attendance_issue_reports enable row level security;

-- Revoke all direct table privileges from public and anon
revoke all on table public.attendance_issue_reports from public, anon;

-- Admin & department admin access policies (scoped via AttendEase department helpers)
drop policy if exists "attendance_issue_reports_admin_select" on public.attendance_issue_reports;
create policy "attendance_issue_reports_admin_select" on public.attendance_issue_reports
  for select to authenticated
  using (
    public.is_admin((select auth.uid()))
    or (
      public.is_department_admin((select auth.uid()))
      and (
        (
          attendance_issue_reports.session_id is not null
          and exists (
            select 1 from public.attendance_sessions s
            where s.id = attendance_issue_reports.session_id
              and public.can_access_department((select auth.uid()), s.department)
          )
        )
        or public.person_in_user_department((select auth.uid()), attendance_issue_reports.person_id)
      )
    )
  );

drop policy if exists "attendance_issue_reports_admin_update" on public.attendance_issue_reports;
create policy "attendance_issue_reports_admin_update" on public.attendance_issue_reports
  for update to authenticated
  using (
    public.is_admin((select auth.uid()))
    or (
      public.is_department_admin((select auth.uid()))
      and (
        (
          attendance_issue_reports.session_id is not null
          and exists (
            select 1 from public.attendance_sessions s
            where s.id = attendance_issue_reports.session_id
              and public.can_access_department((select auth.uid()), s.department)
          )
        )
        or public.person_in_user_department((select auth.uid()), attendance_issue_reports.person_id)
      )
    )
  )
  with check (
    public.is_admin((select auth.uid()))
    or (
      public.is_department_admin((select auth.uid()))
      and (
        (
          attendance_issue_reports.session_id is not null
          and exists (
            select 1 from public.attendance_sessions s
            where s.id = attendance_issue_reports.session_id
              and public.can_access_department((select auth.uid()), s.department)
          )
        )
        or public.person_in_user_department((select auth.uid()), attendance_issue_reports.person_id)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Internal Helper: Validate Session & Enforce Expiry (Inaccessible to RPCs)
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
  academic_year text
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
    ar.department,
    ar.course,
    ar.year_level,
    ar.academic_year
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
    and p.person_kind = 'student'
  limit 1;
end;
$$;

revoke all on function public.internal_validate_student_portal_session(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC: student_portal_create_session (Concurrency-Safe QR Exchange)
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
  v_clean_token text;
  v_person record;
  v_raw_token text;
  v_token_hash text;
  v_expires_at timestamptz;
begin
  v_clean_token := lower(trim(coalesce(p_qr_token, '')));

  if length(v_clean_token) != 64 or v_clean_token !~ '^[0-9a-fA-F]{64}$' then
    return jsonb_build_object('status', 'invalid_token');
  end if;

  select
    p.id as person_id,
    st.id as student_id,
    coalesce(st.full_name, p.full_name) as full_name,
    coalesce(st.student_number, p.person_number) as student_number,
    ar.department,
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
  where p.qr_token = v_clean_token
    and p.person_status = 'Active'
    and p.person_kind = 'student'
  limit 1;

  if v_person.person_id is null then
    return jsonb_build_object('status', 'invalid_token');
  end if;

  -- Transaction-scoped advisory lock prevents race conditions during concurrent scans
  perform pg_advisory_xact_lock(hashtext(v_person.person_id::text));

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(v_raw_token, 'sha256'::text), 'hex');
  v_expires_at := now() + interval '15 minutes';

  -- Atomic UPSERT ensures exactly 1 active session per student at all times without hot-path table scans
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
      'department', v_person.department,
      'course', v_person.course,
      'year_level', v_person.year_level,
      'academic_year', v_person.academic_year
    )
  );
end;
$$;

revoke all on function public.student_portal_create_session(text) from public;
grant execute on function public.student_portal_create_session(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPC: student_portal_get_today_attendance (Targeting & Trash Aware)
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
  v_student record;
  v_today date := (timezone('Asia/Manila', now()))::date;
  v_records jsonb;
begin
  select * into v_student from public.internal_validate_student_portal_session(p_session_token);
  if v_student.person_id is null then
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
      and (l.person_id = v_student.person_id or l.student_id = v_student.person_id)
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
      and (
        s.department is null
        or public.normalize_department_code(s.department) = public.normalize_department_code(v_student.department)
      )
      and public.resolve_attendance_year_match(
        v_student.year_level,
        public.resolve_session_target_year_levels(s.target_year_levels, s.year_level)
      ) = 'intended'
      and not exists (
        select 1 from public.attendance_logs l
        where l.session_id = s.id
          and (l.person_id = v_student.person_id or l.student_id = v_student.person_id)
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
-- 6. RPC: student_portal_get_attendance_history (Trash-Filtered Paginated Logs)
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
  v_student record;
  v_limit int := greatest(1, least(coalesce(p_limit, 20), 50));
  v_offset int := greatest(0, coalesce(p_offset, 0));
  v_total_count int;
  v_records jsonb;
begin
  select * into v_student from public.internal_validate_student_portal_session(p_session_token);
  if v_student.person_id is null then
    return jsonb_build_object('status', 'session_expired');
  end if;

  select count(*)::int
  into v_total_count
  from public.attendance_logs l
  inner join public.attendance_sessions s on s.id = l.session_id
  left join public.main_sessions ms on ms.id = s.main_session_id
  where (l.person_id = v_student.person_id or l.student_id = v_student.person_id)
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
    where (l.person_id = v_student.person_id or l.student_id = v_student.person_id)
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

-- ---------------------------------------------------------------------------
-- 7. RPC: student_portal_report_issue (Atomic Rate-Limited & Trash-Aware)
-- ---------------------------------------------------------------------------

create or replace function public.student_portal_report_issue(
  p_session_token text,
  p_session_id uuid default null,
  p_issue_type text default 'other',
  p_details text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student record;
  v_clean_type text;
  v_clean_details text;
  v_recent_reports int;
  v_report_id uuid;
  v_session_authorized boolean := false;
begin
  select * into v_student from public.internal_validate_student_portal_session(p_session_token);
  if v_student.person_id is null then
    return jsonb_build_object('status', 'session_expired');
  end if;

  v_clean_type := lower(trim(coalesce(p_issue_type, 'other')));
  if v_clean_type not in ('missing_time_in', 'missing_time_out', 'incorrect_time', 'wrong_status', 'other') then
    v_clean_type := 'other';
  end if;

  v_clean_details := trim(coalesce(p_details, ''));
  if length(v_clean_details) < 5 or length(v_clean_details) > 1000 then
    return jsonb_build_object('status', 'invalid_details', 'message', 'Details must be between 5 and 1000 characters.');
  end if;

  -- Verify session authorization if session_id is provided
  if p_session_id is not null then
    -- Check 1: Student has an attendance log in that session (and session is not trashed)
    if exists (
      select 1 from public.attendance_logs l
      inner join public.attendance_sessions s on s.id = l.session_id
      left join public.main_sessions ms on ms.id = s.main_session_id
      where l.session_id = p_session_id
        and (l.person_id = v_student.person_id or l.student_id = v_student.person_id)
        and s.trashed_at is null
        and (ms.id is null or ms.trashed_at is null)
    ) then
      v_session_authorized := true;
    -- Check 2: Session was scheduled for this student's department and year level (and not trashed)
    elsif exists (
      select 1 from public.attendance_sessions s
      left join public.main_sessions ms on ms.id = s.main_session_id
      where s.id = p_session_id
        and s.status in ('Open', 'Closed', 'Archived')
        and s.trashed_at is null
        and (ms.id is null or ms.trashed_at is null)
        and (
          s.department is null
          or public.normalize_department_code(s.department) = public.normalize_department_code(v_student.department)
        )
        and public.resolve_attendance_year_match(
          v_student.year_level,
          public.resolve_session_target_year_levels(s.target_year_levels, s.year_level)
        ) = 'intended'
    ) then
      v_session_authorized := true;
    end if;

    if not v_session_authorized then
      return jsonb_build_object('status', 'unauthorized_session', 'message', 'You are not authorized to report an issue for this session.');
    end if;
  end if;

  -- Transaction-scoped advisory lock makes the 24-hour rate limit check-and-insert strictly atomic
  perform pg_advisory_xact_lock(hashtext(v_student.person_id::text));

  -- Rate limit: Max 5 issue submissions per student in 24 hours
  select count(*)::int
  into v_recent_reports
  from public.attendance_issue_reports
  where person_id = v_student.person_id
    and created_at > now() - interval '24 hours';

  if v_recent_reports >= 5 then
    return jsonb_build_object('status', 'rate_limited', 'message', 'You have reached the maximum number of issue reports for today. Please try again tomorrow.');
  end if;

  insert into public.attendance_issue_reports (
    person_id,
    student_id,
    session_id,
    issue_type,
    details,
    status
  )
  values (
    v_student.person_id,
    v_student.student_id,
    p_session_id,
    v_clean_type,
    v_clean_details,
    'pending'
  )
  returning id into v_report_id;

  return jsonb_build_object(
    'status', 'ok',
    'report_id', v_report_id,
    'created_at', now()
  );
end;
$$;

revoke all on function public.student_portal_report_issue(text, uuid, text, text) from public;
grant execute on function public.student_portal_report_issue(text, uuid, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. RPC: student_portal_destroy_session (Explicit Exit / Revocation)
-- ---------------------------------------------------------------------------

create or replace function public.student_portal_destroy_session(
  p_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token_hash text;
begin
  if p_session_token is not null and length(p_session_token) = 64 and p_session_token ~ '^[0-9a-fA-F]{64}$' then
    v_token_hash := encode(extensions.digest(lower(p_session_token), 'sha256'::text), 'hex');
    delete from public.student_portal_sessions where token_hash = v_token_hash;
  end if;

  return jsonb_build_object('status', 'ok');
end;
$$;

revoke all on function public.student_portal_destroy_session(text) from public;
grant execute on function public.student_portal_destroy_session(text) to anon, authenticated;
