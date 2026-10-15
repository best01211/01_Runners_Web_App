begin;
-- Apply after 020. Automatic regular-run close and comment deletion provenance.

alter table public.comments add column if not exists deleted_by uuid;
alter table public.comments add column if not exists deleted_by_author boolean not null default false;
-- No foreign key: deleting an account must not lose the deletion provenance.
create or replace function public.close_due_regular_attendance() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare target uuid; closed_count integer:=0;
begin
 for target in select schedule_id from public.schedules
 where schedule_type='regular' and deleted_at is null and status<>'cancelled'
 and attendance_opened_at is not null and attendance_closed_at is null and end_at<=now()
 order by schedule_id for update skip locked loop
  update public.attendances set status='absent' where schedule_id=target and status='not_checked';
  update public.schedules set attendance_closed_at=now(),status='completed' where schedule_id=target;
  closed_count:=closed_count+1;
 end loop;
 return closed_count;
end $$;
revoke all on function public.close_due_regular_attendance() from public,anon,authenticated;
grant execute on function public.close_due_regular_attendance() to service_role;



create or replace function public.configure_season(target_season uuid,payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result public.seasons; starts date; ends date; current_flag boolean:=coalesce((payload->>'makeCurrent')::boolean,false);
begin
 if not public.can_administer() then raise exception 'FORBIDDEN'; end if;
 perform pg_advisory_xact_lock(hashtext('runners-season-settings'));
 starts:=(payload->>'startsOn')::date;ends:=(payload->>'endsOn')::date;
 if starts>ends or length(trim(coalesce(payload->>'name','')))=0 or length(payload->>'name')>100
 or payload->>'status' not in ('scheduled','active','closed','hidden') then raise exception 'INVALID_SEASON'; end if;
 select * into result from public.seasons where season_id=target_season for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if result.is_default and (not (payload->>'isPublic')::boolean or payload->>'status'='hidden') then raise exception 'INVALID_DEFAULT';end if;
 if current_flag then
  if not (payload->>'isPublic')::boolean or (now() at time zone 'Asia/Seoul')::date not between starts and ends then raise exception 'INVALID_CURRENT';end if;
  update public.seasons set status='scheduled' where status='active' and season_id<>target_season;
 end if;
 update public.seasons set name=trim(payload->>'name'),starts_on=starts,ends_on=ends,
 status=(case when current_flag then 'active' else payload->>'status' end)::runners_season_status,
 is_public=(payload->>'isPublic')::boolean where season_id=target_season returning * into result;
 return to_jsonb(result);
end $$;
revoke all on function public.configure_season(uuid,jsonb) from public,anon;
grant execute on function public.configure_season(uuid,jsonb) to authenticated;



create or replace function public.guard_regular_attendance_deadline() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_table_name='schedules' then
  if old.attendance_opened_at is null and new.attendance_opened_at is not null and new.schedule_type='regular' and new.end_at<=now() then raise exception 'ATTENDANCE_CLOSED';end if;
 else
  if new.method='code' and exists(select 1 from public.schedules where schedule_id=new.schedule_id and schedule_type='regular' and end_at<=now()) then raise exception 'ATTENDANCE_CLOSED';end if;
 end if;
 return new;
end $$;
drop trigger if exists schedules_attendance_deadline on public.schedules;
create trigger schedules_attendance_deadline before update of attendance_opened_at on public.schedules for each row execute function public.guard_regular_attendance_deadline();
drop trigger if exists attendances_regular_deadline on public.attendances;
create trigger attendances_regular_deadline before insert or update of checked_at,method on public.attendances for each row execute function public.guard_regular_attendance_deadline();
revoke all on function public.guard_regular_attendance_deadline() from public,anon,authenticated;



create or replace function public.is_actual_administrator() returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from profiles where user_id=auth.uid() and role='admin' and account_status='active' and approval_status='approved');
$$;
revoke all on function public.is_actual_administrator() from public,anon;
grant execute on function public.is_actual_administrator() to authenticated;
drop policy if exists profiles_hide_administrators on public.profiles;
create policy profiles_hide_administrators on public.profiles as restrictive for select to authenticated
using (role<>'admin' or user_id=auth.uid() or public.is_actual_administrator());
commit;
