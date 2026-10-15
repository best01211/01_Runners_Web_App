-- Four-digit attendance codes. Existing attendance and locks are preserved.
begin;
create or replace function public.write_attendance(target_schedule_id uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.schedules; p public.profiles; manager boolean; action text:=payload->>'action'; target uuid; result public.attendances; code text;
begin
 select * into p from profiles where user_id=auth.uid();
 if p.user_id is null or not public.can_read_member() then raise exception 'FORBIDDEN'; end if;
 select * into s from schedules where schedule_id=target_schedule_id for update;
 if s.schedule_id is null or s.deleted_at is not null or s.status='cancelled' then raise exception 'SCHEDULE_UNAVAILABLE'; end if;
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

-- Open sessions use the last four digits after this migration.
update public.schedules set attendance_code=right(attendance_code,4)
where attendance_opened_at is not null and attendance_closed_at is null and attendance_code ~ '^[0-9]{6}$';
revoke all on function public.write_attendance(uuid,jsonb) from public,anon;
grant execute on function public.write_attendance(uuid,jsonb) to authenticated;
commit;

