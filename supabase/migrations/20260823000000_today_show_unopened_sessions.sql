-- =============================================================================
-- Migration: 20260823000000_today_show_unopened_sessions.sql
-- Description:
--   student_portal_get_today_attendance now ALSO returns today's sessions that
--   are still in 'Draft' (created by checkers but not yet opened for scanning).
--   Students always see every session targeted at them for today, even before
--   scanning starts:
--     Draft  -> portal_status 'Not Open Yet'
--     Open   -> portal_status 'Awaiting Scan'
--     Closed -> portal_status 'Not Recorded'
-- Safety: Replacement of a single student-portal RPC only. No checker tables
--         or checker RPCs are modified.
-- =============================================================================

drop function if exists public.student_portal_get_today_attendance(text) cascade;

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
        when s.status = 'Draft' then 'Not Open Yet'
        when s.status = 'Open' then 'Awaiting Scan'
        else 'Not Recorded'
      end as portal_status,
      false as is_late,
      null::text as late_label
    from public.attendance_sessions s
    left join public.main_sessions ms on ms.id = s.main_session_id
    where s.date = v_today
      -- Draft included so students always see today's targeted schedule,
      -- even before a checker opens the session for scanning.
      and s.status in ('Draft', 'Open', 'Closed')
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
    ) order by c.start_time asc nulls last
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
