-- Apply after 024, before deploying the matching application.
begin;
create table if not exists public.admin_schedule_tests (
 schedule_id uuid not null references public.schedules(schedule_id) on delete cascade,
 user_id uuid not null references public.profiles(user_id) on delete cascade,
 pace_group_id uuid references public.pace_groups(pace_group_id) on delete cascade,
 event_role text check(event_role in ('runner','cheer','attendee')),
 attendance_status text not null default 'not_checked' check(attendance_status in ('not_checked','attended')),
 primary key(schedule_id,user_id)
);
alter table public.admin_schedule_tests enable row level security;
revoke all on public.admin_schedule_tests from public,anon,authenticated;
grant select on public.admin_schedule_tests to authenticated,service_role;
drop policy if exists admin_test_self_read on public.admin_schedule_tests;
create policy admin_test_self_read on public.admin_schedule_tests for select to authenticated using(
 user_id=auth.uid() and public.is_active_member() and exists(select 1 from public.profiles where user_id=auth.uid() and role='admin'));

create or replace function public.write_admin_schedule_test(target_schedule uuid,payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s schedules; result admin_schedule_tests; action text:=payload->>'action'; group_id uuid; event_choice text;
begin
 if not public.is_active_member() or not exists(select 1 from profiles where user_id=auth.uid() and role='admin') then raise exception 'FORBIDDEN'; end if;
 select * into s from schedules where schedule_id=target_schedule and deleted_at is null for update;
 if not found or s.status='cancelled' then raise exception 'SCHEDULE_UNAVAILABLE'; end if;
 select * into result from admin_schedule_tests where schedule_id=target_schedule and user_id=auth.uid() for update;
 if action='cancel' then
  if s.attendance_opened_at is not null or (s.cancellation_deadline_at is not null and now()>s.cancellation_deadline_at) then raise exception 'PARTICIPATION_LOCKED'; end if;
  delete from admin_schedule_tests where schedule_id=target_schedule and user_id=auth.uid();return 'null'::jsonb;
 elsif action='check' then
  if result.user_id is null then raise exception 'NOT_PARTICIPANT'; end if;
  if s.attendance_opened_at is null or s.attendance_closed_at is not null or (s.schedule_type='regular' and s.end_at<=now()) then raise exception 'ATTENDANCE_CLOSED'; end if;
  if coalesce(payload->>'code','') !~ '^[0-9]{4}$' or payload->>'code' is distinct from s.attendance_code then raise exception 'INVALID_CODE'; end if;
  update admin_schedule_tests set attendance_status='attended' where schedule_id=target_schedule and user_id=auth.uid() returning * into result;
 elsif action='join' then
  perform public.assert_service_feature('participation');
  if s.status<>'open' or s.attendance_opened_at is not null then raise exception 'SCHEDULE_NOT_OPEN'; end if;
  if s.registration_start_at is not null and now()<s.registration_start_at then raise exception 'REGISTRATION_NOT_STARTED'; end if;
  if now()>s.registration_end_at then raise exception 'REGISTRATION_CLOSED'; end if;
  group_id:=nullif(payload->>'paceGroupId','')::uuid;event_choice:=payload->>'eventRole';
  if s.schedule_type='event' then
   if (s.event_kind='race' and coalesce(event_choice,'') not in ('runner','cheer')) or (s.event_kind='gathering' and event_choice is distinct from 'attendee') then raise exception 'INVALID_EVENT_ROLE'; end if;
   group_id:=null;
  else
   event_choice:=null;
   if s.schedule_type='regular' and group_id is null then raise exception 'PACE_GROUP_REQUIRED'; end if;
   if group_id is not null and not exists(select 1 from pace_groups where pace_group_id=group_id and schedule_id=target_schedule) then raise exception 'INVALID_PACE_GROUP'; end if;
  end if;
  insert into admin_schedule_tests(schedule_id,user_id,pace_group_id,event_role) values(target_schedule,auth.uid(),group_id,event_choice)
  on conflict(schedule_id,user_id) do update set pace_group_id=excluded.pace_group_id,event_role=excluded.event_role returning * into result;
 else raise exception 'INVALID_ACTION'; end if;
 return to_jsonb(result);
end $$;
revoke all on function public.write_admin_schedule_test(uuid,jsonb) from public,anon;
grant execute on function public.write_admin_schedule_test(uuid,jsonb) to authenticated;

-- Delete only FK descendants of this schedule, with an explicit table allowlist.
-- Unknown schemas/dependencies abort the whole transaction instead of orphaning data.
create or replace function public.delete_schedule_tree(target_table oid,row_filter text,depth integer default 0)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare name text; relation_name text; fk record; amount bigint; child_filter text;
begin
 if depth>12 then raise exception 'DELETE_DEPENDENCY_TOO_DEEP'; end if;
 select format('%I.%I',n.nspname,c.relname),c.relname into name,relation_name from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.oid=target_table and n.nspname='public';
 if relation_name is null or relation_name not in ('schedules','pace_groups','schedule_pace_groups','schedule_participations','attendances','attendance_records','attendance_record_history','attendance_record_audits','comments','schedule_comments','race_courses','race_entries','runner_checkpoints','admin_schedule_tests') then raise exception 'UNSUPPORTED_SCHEDULE_DEPENDENCY'; end if;
 execute format('select count(*) from %s where %s',name,row_filter) into amount;
 if amount=0 then return; end if;
 for fk in select c.conrelid,c.conkey,n.nspname,t.relname,a.attname,p.attname parent_column
  from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
  join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
  join pg_attribute p on p.attrelid=c.confrelid and p.attnum=c.confkey[1]
  where c.contype='f' and c.confrelid=target_table loop
  if fk.nspname<>'public' or array_length(fk.conkey,1)<>1 then raise exception 'UNSUPPORTED_SCHEDULE_DEPENDENCY'; end if;
  child_filter:=format('%I in (select %I from %s where %s)',fk.attname,fk.parent_column,name,row_filter);
  perform public.delete_schedule_tree(fk.conrelid,child_filter,depth+1);
 end loop;
 execute format('delete from %s where %s',name,row_filter);
end $$;
revoke all on function public.delete_schedule_tree(oid,text,integer) from public,anon,authenticated,service_role;
create or replace function public.delete_cancelled_schedule(target_schedule uuid,confirmation text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare s schedules;
begin
 if not public.is_active_member() or not exists(select 1 from profiles where user_id=auth.uid() and role='admin') then raise exception 'FORBIDDEN'; end if;
 if confirmation is distinct from '영구 삭제' then raise exception 'CONFIRMATION_REQUIRED'; end if;
 select * into s from schedules where schedule_id=target_schedule for update;
 if not found then raise exception 'SCHEDULE_NOT_FOUND'; end if;
 if s.status<>'cancelled' then raise exception 'CANCELLED_ONLY'; end if;
 perform public.delete_schedule_tree('public.schedules'::regclass,format('schedule_id=%L::uuid',target_schedule));
end $$;
revoke all on function public.delete_cancelled_schedule(uuid,text) from public,anon;
grant execute on function public.delete_cancelled_schedule(uuid,text) to authenticated;

-- Preserve existing authorization and RLS policies, add the new feature gate.
create or replace function public.is_tracking_admin()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.can_administer() and public.can_read_member() and not public.service_feature_blocked('liveTracking');
$$;
create or replace function public.can_read_tracking_race(target_race uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.can_read_member() and not public.service_feature_blocked('liveTracking') and exists(select 1 from public.tracking_races where race_id=target_race and status='active');
$$;
create or replace function public.can_read_race(target_schedule uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.can_read_member() and not public.service_feature_blocked('liveTracking') and exists(select 1 from public.schedules where schedule_id=target_schedule and schedule_type='event' and status<>'cancelled' and deleted_at is null);
$$;
notify pgrst,'reload schema';
commit;
