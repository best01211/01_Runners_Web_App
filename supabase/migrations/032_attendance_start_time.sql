-- Attendance writes are only available at or after the scheduled start.
begin;
create or replace function public.write_attendance(target_schedule_id uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.schedules; p public.profiles; manager boolean; action text:=payload->>'action'; target uuid; result public.attendances; code text;
begin
 select * into p from profiles where user_id=auth.uid();
 if p.user_id is null or not public.can_read_member() then raise exception 'FORBIDDEN'; end if;
 select * into s from schedules where schedule_id=target_schedule_id for update;
 if s.schedule_id is null or s.deleted_at is not null or s.status='cancelled' then raise exception 'SCHEDULE_UNAVAILABLE'; end if;
 if s.start_at is null or now()<s.start_at then raise exception 'SCHEDULE_NOT_STARTED'; end if;
 manager:=public.is_active_member() and (p.role in ('admin','staff') or (p.role='member' and s.schedule_type='flash' and s.creator_id=p.user_id));
 if p.account_status='restricted' and action<>'check' then raise exception 'FORBIDDEN'; end if;
 if action='open' then
  if not manager then raise exception 'FORBIDDEN'; end if;
  if s.attendance_opened_at is not null then raise exception 'ALREADY_OPENED'; end if;
  code:=lpad((floor(random()*9000)+1000)::text,4,'0');
  insert into attendances(schedule_id,user_id,status) select target_schedule_id,user_id,'not_checked' from schedule_participations where schedule_id=target_schedule_id and status='registered' on conflict(schedule_id,user_id) do nothing;
  update schedule_participations set participation_locked=true,pace_change_locked=true where schedule_id=target_schedule_id and status='registered';
  update schedules set attendance_code=code,attendance_opened_at=now(),status='in_progress' where schedule_id=target_schedule_id;
  return jsonb_build_object('code',code);
 elsif action='check' then
  if s.attendance_opened_at is null or s.attendance_closed_at is not null then raise exception 'ATTENDANCE_CLOSED'; end if;
 if payload->>'code' is null or (payload->>'code') !~ '^[0-9]{4}$' or payload->>'code' is distinct from s.attendance_code then raise exception 'INVALID_CODE'; end if;
  if not exists(select 1 from schedule_participations where schedule_id=target_schedule_id and user_id=p.user_id and status='registered') then raise exception 'NOT_PARTICIPANT'; end if;
  select * into result from attendances where schedule_id=target_schedule_id and user_id=p.user_id for update;
  if result.attendance_id is not null and (result.status <> 'not_checked' or result.method='manual') then raise exception 'ALREADY_CHECKED'; end if;
  insert into attendances(schedule_id,user_id,status,method,checked_at,updated_by) values(target_schedule_id,p.user_id,'attended','code',now(),p.user_id)
  on conflict(schedule_id,user_id) do update set status='attended',method='code',checked_at=now(),updated_by=p.user_id returning * into result;
  return jsonb_build_object('attendance',to_jsonb(result));
 elsif action='close' then
  if not manager then raise exception 'FORBIDDEN'; end if;
  if s.attendance_opened_at is null or s.attendance_closed_at is not null then raise exception 'ATTENDANCE_CLOSED'; end if;
  update attendances set status='absent',updated_by=p.user_id where schedule_id=target_schedule_id and status='not_checked';
  update schedules set attendance_closed_at=now(),status='completed' where schedule_id=target_schedule_id;
  return '{"closed":true}'::jsonb;
 elsif action='manual' then
  if not manager then raise exception 'FORBIDDEN'; end if;
  if s.attendance_opened_at is null then raise exception 'ATTENDANCE_CLOSED'; end if;
  if s.attendance_closed_at is not null and payload->>'status'='not_checked' then raise exception 'ATTENDANCE_CLOSED'; end if;
  if payload->>'status' not in ('attended','late','absent','not_checked') or payload->>'status' is null then raise exception 'INVALID_STATUS'; end if;
  target:=(payload->>'userId')::uuid;
  if not exists(select 1 from schedule_participations where schedule_id=target_schedule_id and user_id=target and status='registered') then raise exception 'NOT_PARTICIPANT'; end if;
  insert into attendances(schedule_id,user_id,status,method,checked_at,updated_by) values(target_schedule_id,target,(payload->>'status')::runners_attendance_status,'manual',case when payload->>'status'='not_checked' then null else now() end,p.user_id)
  on conflict(schedule_id,user_id) do update set status=excluded.status,method='manual',checked_at=excluded.checked_at,updated_by=p.user_id returning * into result;
  return jsonb_build_object('attendance',to_jsonb(result));
 end if;
 raise exception 'INVALID_ACTION';
end $$;
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
  if s.start_at is null or now()<s.start_at then raise exception 'SCHEDULE_NOT_STARTED'; end if;
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
notify pgrst,'reload schema';
commit;
