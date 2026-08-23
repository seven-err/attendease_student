-- =============================================================================
-- Migration: 20260822000000_history_unattended_and_semester_penalty.sql
-- Description:
--   1. Attendance history now ALSO returns targeted sessions the student never
--      attended (no attendance log) so missed sessions are visible and their
--      penalties can be tracked.
--   2. Every history record carries a computed `penalty_php`.
--   3. New RPC: student_portal_get_semester_penalty_summary -> totals for the
--      current semester (absences, lates, total penalty in PHP).
-- Safety: 100% Additive/Replacement of student-portal RPCs only. No checker
--         tables or checker RPCs are modified.
-- =============================================================================

-- Helpful index for the unattended-session scan (additive, safe if exists)
create index if not exists idx_attendance_sessions_portal_history
  on public.attendance_sessions (date desc, status);

-- -----------------------------------------------------------------------------
-- 1. Internal Helper: Penalty Rate Card (single source of truth)
--    Absent (never checked in, session already ended): PHP 50.00
--    Late (unexcused):                                 PHP 20.00
--    Late (Excused) / everything else:                 PHP  0.00
-- -----------------------------------------------------------------------------

create or replace function public.internal_student_portal_penalty_rates()
returns table (absent_rate numeric, late_rate numeric)
language sql
stable
set search_path = public, pg_temp
as $$
  select 50.00::numeric as absent_rate, 20.00::numeric as late_rate;
$$;

revoke all on function public.internal_student_portal_penalty_rates() from public, anon, authenticated;

create or replace function public.internal_student_portal_record_penalty(
  p_raw_status text,
  p_has_log boolean,
  p_scanned_at timestamptz,
  p_time_out_at timestamptz
)
returns numeric
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_absent numeric;
  v_late numeric;
begin
  select absent_rate, late_rate
  into v_absent, v_late
  from public.internal_student_portal_penalty_rates();

  -- No attendance log at all => counted as an absence
  if not p_has_log then
    return v_absent;
  end if;

  if p_raw_status = 'Absent' then
    return v_absent;
  end if;

  if p_raw_status = 'Late' then
    return v_late;
  end if;

  return 0.00;
end;
$$;

revoke all on function public.internal_student_portal_record_penalty(text, boolean, timestamptz, timestamptz) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Internal Helper: Current Semester Window (Asia/Manila)
--    1st Semester : August  - December
--    2nd Semester : January - May
--    Summer       : June    - July
-- -----------------------------------------------------------------------------

create or replace function public.internal_student_portal_semester_window()
returns table (
  period_start date,
  period_end date,
  semester_label text,
  academic_year text
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_today date := (timezone('Asia/Manila', now()))::date;
  v_month int := extract(month from v_today)::int;
  v_year int := extract(year from v_today)::int;
begin
  if v_month between 8 and 12 then
    return query
      select
        make_date(v_year, 8, 1),
        make_date(v_year, 12, 31),
        '1st Semester',
        v_year || '-' || (v_year + 1);
  elsif v_month between 1 and 5 then
    return query
      select
        make_date(v_year, 1, 1),
        make_date(v_year, 5, 31),
        '2nd Semester',
        (v_year - 1) || '-' || v_year;
  else
    return query
      select
        make_date(v_year, 6, 1),
        make_date(v_year, 7, 31),
        'Summer',
        (v_year - 1) || '-' || v_year;
  end if;
end;
$$;

revoke all on function public.internal_student_portal_semester_window() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. RPC: student_portal_get_attendance_history (now includes unattended
--    sessions the student was targeted for, each with penalty_php)
-- -----------------------------------------------------------------------------

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
  v_today date := (timezone('Asia/Manila', now()))::date;
begin
  select * into v_student from public.internal_validate_student_portal_session(p_session_token);
  if v_student.person_id is null then
    return jsonb_build_object('status', 'session_expired');
  end if;

  with attended_rows as (
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
      end as late_label,
      public.internal_student_portal_record_penalty(
        l.attendance_status, true, l.scanned_at, l.time_out_at
      ) as penalty_amount,
      false as is_unattended
    from public.attendance_logs l
    inner join public.attendance_sessions s on s.id = l.session_id
    left join public.main_sessions ms on ms.id = s.main_session_id
    where (l.person_id = v_student.person_id or l.student_id = v_student.person_id)
      and s.status in ('Open', 'Closed', 'Archived')
      and s.trashed_at is null
      and (ms.id is null or ms.trashed_at is null)
  ),
  unattended_rows as (
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
      'Absent' as portal_status,
      false as is_late,
      null::text as late_label,
      public.internal_student_portal_record_penalty(null, false, null, null) as penalty_amount,
      true as is_unattended
    from public.attendance_sessions s
    left join public.main_sessions ms on ms.id = s.main_session_id
    where s.date < v_today
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
      and not exists (
        select 1 from public.attendance_logs l
        where l.session_id = s.id
          and (l.person_id = v_student.person_id or l.student_id = v_student.person_id)
      )
  ),
  combined_history as (
    select * from attended_rows
    union all
    select * from unattended_rows
  ),
  ranked_history as (
    select *
    from combined_history
    order by session_date desc, start_time desc nulls last, session_id
    limit v_limit
    offset v_offset
  )
  select
    (select count(*)::int from combined_history),
    coalesce(jsonb_agg(
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
        'late_label', h.late_label,
        'is_unattended', h.is_unattended,
        'penalty_php', h.penalty_amount
      )
    ), '[]'::jsonb)
  into v_total_count, v_records
  from ranked_history h;

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

-- -----------------------------------------------------------------------------
-- 4. RPC: student_portal_get_semester_penalty_summary
--    Totals for the CURRENT semester window (see helper #2).
-- -----------------------------------------------------------------------------

create or replace function public.student_portal_get_semester_penalty_summary(
  p_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student record;
  v_period_start date;
  v_period_end date;
  v_semester_label text;
  v_computed_academic_year text;
  v_totals record;
begin
  select * into v_student from public.internal_validate_student_portal_session(p_session_token);
  if v_student.person_id is null then
    return jsonb_build_object('status', 'session_expired');
  end if;

  select period_start, period_end, semester_label, academic_year
  into v_period_start, v_period_end, v_semester_label, v_computed_academic_year
  from public.internal_student_portal_semester_window();

  with attended_rows as (
    select
      l.attendance_status as raw_status,
      public.internal_student_portal_record_penalty(
        l.attendance_status, true, l.scanned_at, l.time_out_at
      ) as penalty_amount,
      false as is_unattended
    from public.attendance_logs l
    inner join public.attendance_sessions s on s.id = l.session_id
    left join public.main_sessions ms on ms.id = s.main_session_id
    where (l.person_id = v_student.person_id or l.student_id = v_student.person_id)
      and s.date between v_period_start and v_period_end
      and s.status in ('Open', 'Closed', 'Archived')
      and s.trashed_at is null
      and (ms.id is null or ms.trashed_at is null)
  ),
  unattended_rows as (
    select
      null::text as raw_status,
      public.internal_student_portal_record_penalty(null, false, null, null) as penalty_amount,
      true as is_unattended
    from public.attendance_sessions s
    left join public.main_sessions ms on ms.id = s.main_session_id
    where s.date between v_period_start and v_period_end
      and s.date < (timezone('Asia/Manila', now()))::date
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
      and not exists (
        select 1 from public.attendance_logs l
        where l.session_id = s.id
          and (l.person_id = v_student.person_id or l.student_id = v_student.person_id)
      )
  ),
  combined as (
    select * from attended_rows
    union all
    select * from unattended_rows
  )
  select
    coalesce(sum(penalty_amount), 0)::numeric as total_penalty,
    count(*) filter (where coalesce(raw_status, 'Absent') = 'Absent')::int as absent_total,
    count(*) filter (where raw_status = 'Late')::int as late_total,
    count(*) filter (where not is_unattended and penalty_amount = 0)::int as clean_total,
    count(*)::int as sessions_total
  into v_totals
  from combined;

  return jsonb_build_object(
    'status', 'ok',
    'summary', jsonb_build_object(
      'total_penalty_php', coalesce(v_totals.total_penalty, 0),
      'absent_count', coalesce(v_totals.absent_total, 0),
      'late_count', coalesce(v_totals.late_total, 0),
      'recorded_sessions_count', coalesce(v_totals.clean_total, 0),
      'total_sessions_count', coalesce(v_totals.sessions_total, 0),
      'semester_label', v_semester_label,
      'academic_year', coalesce(nullif(trim(coalesce(v_student.academic_year, '')), ''), v_computed_academic_year),
      'period_start', to_char(v_period_start, 'YYYY-MM-DD'),
      'period_end', to_char(v_period_end, 'YYYY-MM-DD'),
      'currency', 'PHP'
    )
  );
end;
$$;

revoke all on function public.student_portal_get_semester_penalty_summary(text) from public;
grant execute on function public.student_portal_get_semester_penalty_summary(text) to anon, authenticated;