-- Apply before deploying the staff group management UI.
begin;
create or replace function public.manage_schedule_pace_group(target_schedule uuid, payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 s schedules; g pace_groups; entry schedule_participations;
 operation text:=payload->>'action'; gid uuid; pace integer; distance integer;
begin
 if not public.is_active_member() or not exists(select 1 from profiles where user_id=auth.uid() and role::text in ('staff','admin')) then raise exception 'FORBIDDEN'; end if;
 perform public.assert_service_feature('participation');
 -- Use the same schedule lock as registration, group changes and attendance opening.
 select * into s from schedules where schedule_id=target_schedule and deleted_at is null for update;
 if not found then raise exception 'SCHEDULE_NOT_FOUND'; end if;
 if s.schedule_type::text='event' then raise exception 'EVENT_NO_PACE_GROUP'; end if;
 if s.status::text<>'open' or s.attendance_opened_at is not null then raise exception 'PACE_CHANGE_LOCKED'; end if;
 if operation is null or operation not in ('edit','delete','move') then raise exception 'INVALID_ACTION'; end if;
 gid:=(payload->>'groupId')::uuid;
 select * into g from pace_groups where pace_group_id=gid and schedule_id=target_schedule for update;
 if not found then raise exception 'INVALID_PACE_GROUP'; end if;
 if operation='move' then
  select * into entry from schedule_participations where schedule_id=target_schedule and user_id=(payload->>'userId')::uuid and status='registered' for update;
  if not found then raise exception 'ACTIVE_PARTICIPATION_NOT_FOUND'; end if;
  if entry.pace_change_locked then raise exception 'PACE_CHANGE_LOCKED'; end if;
  -- Existing trigger enforces staff-only storage and schedule/group membership.
  update schedule_participations set pace_group_id=gid,updated_at=now() where participation_id=entry.participation_id;
 elsif operation='edit' then
  if g.group_kind<>'running' then raise exception 'SUPPORT_GROUP_FIXED'; end if;
  if exists(select 1 from schedule_participations where pace_group_id=gid and status in ('registered','completed') and pace_change_locked) then raise exception 'PACE_CHANGE_LOCKED'; end if;
  if jsonb_typeof(payload->'paceSeconds') is distinct from 'number' or jsonb_typeof(payload->'distanceKm') is distinct from 'number' then raise exception 'INVALID_GROUP_VALUES'; end if;
  if (payload->>'paceSeconds')::numeric<>trunc((payload->>'paceSeconds')::numeric) or (payload->>'distanceKm')::numeric<>trunc((payload->>'distanceKm')::numeric) then raise exception 'INVALID_GROUP_VALUES'; end if;
  pace:=(payload->>'paceSeconds')::integer; distance:=(payload->>'distanceKm')::integer;
  if pace<=0 or pace%30<>0 or distance<5 then raise exception 'INVALID_GROUP_VALUES'; end if;
  update pace_groups set pace_seconds=pace,distance_km=distance where pace_group_id=gid;
 else
  if g.group_kind<>'running' then raise exception 'SUPPORT_GROUP_FIXED'; end if;
  -- Preserve cancelled participation history too; never silently unassign members.
  if exists(select 1 from schedule_participations where pace_group_id=gid) or exists(select 1 from admin_schedule_tests where pace_group_id=gid) then raise exception 'GROUP_HAS_HISTORY'; end if;
  delete from pace_groups where pace_group_id=gid;
 end if;
 return jsonb_build_object('action',operation,'groupId',gid);
end $$;
revoke all on function public.manage_schedule_pace_group(uuid,jsonb) from public,anon;
grant execute on function public.manage_schedule_pace_group(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
