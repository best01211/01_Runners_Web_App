-- Apply after 022. Event enrolment is separate from running pace groups.
begin;
alter table public.schedules add column if not exists event_kind text;
alter table public.schedules add column if not exists event_registration_locked boolean not null default false;
alter table public.schedule_participations add column if not exists event_role text;
alter table public.schedule_participations add column if not exists event_added_by uuid;
update schedules set event_kind='gathering' where schedule_type='event' and event_kind is null;
update schedule_participations p set event_role='attendee',pace_group_id=null from schedules s where s.schedule_id=p.schedule_id and s.schedule_type='event' and p.event_role is null;
update schedules s set event_registration_locked=true where s.schedule_type='event' and s.event_kind='gathering' and s.capacity is not null and (select count(*) from schedule_participations p where p.schedule_id=s.schedule_id and p.user_id is not null and p.status in ('registered','completed'))>=s.capacity;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='runners_event_kind_check' and conrelid='public.schedules'::regclass) then alter table public.schedules add constraint runners_event_kind_check check(event_kind is null or event_kind in ('race','gathering')); end if;
 if not exists(select 1 from pg_constraint where conname='runners_event_role_check' and conrelid='public.schedule_participations'::regclass) then alter table public.schedule_participations add constraint runners_event_role_check check(event_role is null or event_role in ('runner','cheer','attendee')); end if;
end $$;

create or replace function public.guard_event_schedule() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare active_count integer; changed boolean;
begin
 if tg_op='UPDATE' then
  if (old.schedule_type='event' or new.schedule_type='event') and (old.schedule_type is distinct from new.schedule_type or old.event_kind is distinct from new.event_kind) and exists(select 1 from schedule_participations where schedule_id=old.schedule_id and user_id is not null and status in ('registered','completed')) then raise exception 'EVENT_TYPE_HAS_PARTICIPANTS'; end if;
  if old.event_registration_locked then new.event_registration_locked:=true; end if;
  changed:=old.schedule_type is distinct from new.schedule_type or old.event_kind is distinct from new.event_kind or old.capacity is distinct from new.capacity or old.registration_start_at is distinct from new.registration_start_at;
 else changed:=true; new.event_registration_locked:=false; end if;
 if new.schedule_type='event' then
  new.event_kind:=coalesce(new.event_kind,'gathering');new.staff_in_capacity:=true;
  if changed and new.registration_start_at is null then raise exception 'EVENT_REGISTRATION_START_REQUIRED'; end if;
  if new.event_kind='race' then new.capacity:=null;
  elsif changed then
   if new.capacity is null or new.capacity<1 then raise exception 'EVENT_CAPACITY_REQUIRED'; end if;
   select count(*) into active_count from schedule_participations where schedule_id=new.schedule_id and user_id is not null and status in ('registered','completed');
   if new.capacity<active_count then raise exception 'EVENT_CAPACITY_BELOW_COUNT'; end if;
   if new.capacity=active_count then new.event_registration_locked:=true; end if;
  end if;
 else new.event_kind:=null; end if;
 return new;
end $$;
drop trigger if exists runners_guard_event_schedule on public.schedules;
create trigger runners_guard_event_schedule before insert or update on public.schedules for each row execute function public.guard_event_schedule();

-- Validate every event participation write, including legacy RPCs and direct writes.
create or replace function public.guard_event_participation() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare s schedules; actor profiles; target profiles; manual_add boolean; active_count integer; joining boolean;
begin
 if tg_op='UPDATE' and new.schedule_id=old.schedule_id and old.user_id is not null and new.user_id is null and not exists(select 1 from profiles where user_id=old.user_id) then return new; end if;
 if tg_op='UPDATE' and (new.schedule_id is distinct from old.schedule_id or new.user_id is distinct from old.user_id) then
  if exists(select 1 from schedules where schedule_id in (old.schedule_id,new.schedule_id) and schedule_type='event') then raise exception 'EVENT_PARTICIPATION_IMMUTABLE'; end if;
 end if;
 select * into s from schedules where schedule_id=new.schedule_id for update;
 if s.schedule_type<>'event' then
  if new.event_role is not null then raise exception 'INVALID_EVENT_ROLE'; end if;return new;
 end if;
 if new.status not in ('registered','completed') then return new; end if;
 joining:=tg_op='INSERT';
 if tg_op='UPDATE' then
  joining:=old.status not in ('registered','completed');
  if not joining and new.event_role is not distinct from old.event_role and new.pace_group_id is not distinct from old.pace_group_id then return new; end if;
 end if;
 perform public.assert_service_feature('participation');
 if not public.is_active_member() then raise exception 'PARTICIPATION_FORBIDDEN'; end if;
 select * into actor from profiles where user_id=auth.uid();
 manual_add:=new.registration_source::text='system' and actor.role in ('staff','admin');
 if not manual_add and (new.user_id is distinct from auth.uid() or new.registration_source::text<>'user') then raise exception 'PARTICIPATION_FORBIDDEN'; end if;
 select * into target from profiles where user_id=new.user_id;
 if target.user_id is null or target.role not in ('member','staff','guest') or target.account_status<>'active' or target.approval_status<>'approved' or exists(select 1 from withdrawal_requests where user_id=new.user_id and status='pending') then raise exception 'INVALID_EVENT_MEMBER'; end if;
 if target.role='guest' and not s.guest_allowed then raise exception 'GUEST_NOT_ALLOWED'; end if;
 if s.deleted_at is not null or s.status='cancelled' then raise exception 'SCHEDULE_NOT_FOUND'; end if;
 if new.pace_group_id is not null or (s.event_kind='race' and coalesce(new.event_role,'') not in ('runner','cheer')) or (s.event_kind='gathering' and new.event_role is distinct from 'attendee') then raise exception 'INVALID_EVENT_ROLE'; end if;
 if not manual_add then
  if s.status<>'open' or s.attendance_opened_at is not null or (s.end_at is not null and now()>=s.end_at) then raise exception 'SCHEDULE_NOT_OPEN'; end if;
  if s.registration_start_at is not null and now()<s.registration_start_at then raise exception 'REGISTRATION_NOT_STARTED'; end if;
  if now()>s.registration_end_at then raise exception 'REGISTRATION_CLOSED'; end if;
  if s.event_kind='gathering' and s.event_registration_locked then raise exception 'EVENT_REGISTRATION_LOCKED'; end if;
 end if;
 if joining then
  if new.status<>'registered' then raise exception 'INVALID_EVENT_ROLE'; end if;
  if exists(select 1 from schedule_participations where schedule_id=new.schedule_id and user_id=new.user_id and user_id is not null and status in ('registered','completed') and participation_id is distinct from new.participation_id) then raise exception 'ALREADY_PARTICIPATING'; end if;
  select count(*) into active_count from schedule_participations where schedule_id=new.schedule_id and user_id is not null and status in ('registered','completed');
  if s.event_kind='gathering' then
   if s.capacity is null then raise exception 'EVENT_CAPACITY_REQUIRED'; end if;
   if active_count>=s.capacity then raise exception 'SCHEDULE_FULL'; end if;
  end if;
  new.registered_at:=now();new.event_added_by:=case when manual_add then auth.uid() else null end;
  new.participation_locked:=s.attendance_opened_at is not null;new.pace_change_locked:=s.attendance_opened_at is not null;
 end if;
 return new;
end $$;
drop trigger if exists runners_guard_event_participation on public.schedule_participations;
create trigger runners_guard_event_participation before insert or update on public.schedule_participations for each row execute function public.guard_event_participation();

create or replace function public.after_event_participation() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare s schedules; active_count integer; attendance_row attendances;
begin
 select * into s from schedules where schedule_id=new.schedule_id;
 if new.user_id is null or s.schedule_type<>'event' or new.status not in ('registered','completed') then return new; end if;
 if s.event_kind='gathering' and not s.event_registration_locked and s.capacity is not null then
  select count(*) into active_count from schedule_participations where schedule_id=new.schedule_id and user_id is not null and status in ('registered','completed');
  if active_count>=s.capacity then update schedules set event_registration_locked=true where schedule_id=s.schedule_id; end if;
 end if;
 if s.attendance_opened_at is not null then
  attendance_row:=jsonb_populate_record(null::attendances,jsonb_build_object('status',case when s.attendance_closed_at is null then 'not_checked' else 'absent' end));
  insert into attendances(schedule_id,user_id,status) values(new.schedule_id,new.user_id,attendance_row.status) on conflict(schedule_id,user_id) do nothing;
 end if;
 return new;
end $$;
drop trigger if exists runners_after_event_participation on public.schedule_participations;
create trigger runners_after_event_participation after insert or update on public.schedule_participations for each row execute function public.after_event_participation();

create or replace function public.register_event_participation(target_schedule_id uuid,target_event_role text,target_user_id uuid default null,manager_add boolean default false,change_only boolean default false)
returns public.schedule_participations language plpgsql security definer set search_path=public,pg_temp as $$
declare actor profiles; s schedules; target uuid:=coalesce(target_user_id,auth.uid()); result schedule_participations; source schedule_participations;
begin
 perform public.assert_service_feature('participation');
 if not public.is_active_member() then raise exception 'PARTICIPATION_FORBIDDEN'; end if;
 select * into actor from profiles where user_id=auth.uid();
 source:=jsonb_populate_record(null::schedule_participations,jsonb_build_object('registration_source',case when manager_add then 'system' else 'user' end));
 if manager_add then
  if actor.role not in ('staff','admin') then raise exception 'PARTICIPATION_FORBIDDEN'; end if;
 elsif target is distinct from auth.uid() then raise exception 'PARTICIPATION_FORBIDDEN'; end if;
 select * into s from schedules where schedule_id=target_schedule_id and deleted_at is null for update;
 if not found or s.schedule_type<>'event' then raise exception 'SCHEDULE_NOT_FOUND'; end if;
 if change_only then
  if s.event_kind<>'race' then raise exception 'INVALID_EVENT_ROLE'; end if;
  select * into result from schedule_participations where schedule_id=target_schedule_id and user_id=target and status='registered' for update;
  if not found then raise exception 'ACTIVE_PARTICIPATION_NOT_FOUND'; end if;
  if result.pace_change_locked then raise exception 'PACE_CHANGE_LOCKED'; end if;
  update schedule_participations set event_role=target_event_role,pace_group_id=null,registration_source=source.registration_source,updated_at=now() where participation_id=result.participation_id returning * into result;
 else
  select * into result from schedule_participations where schedule_id=target_schedule_id and user_id=target and status='cancelled' order by registered_at desc,participation_id limit 1 for update;
  if found then
   update schedule_participations set status='registered',registration_source=source.registration_source,registered_at=now(),event_role=target_event_role,pace_group_id=null,cancelled_at=null,cancelled_by=null,cancellation_reason=null,updated_at=now() where participation_id=result.participation_id returning * into result;
  else
   insert into schedule_participations(schedule_id,user_id,status,registration_source,registered_at,event_role,pace_group_id)
   values(target_schedule_id,target,'registered',source.registration_source,now(),target_event_role,null) returning * into result;
  end if;
 end if;
 return result;
end $$;
revoke all on function public.register_event_participation(uuid,text,uuid,boolean,boolean) from public,anon;
grant execute on function public.register_event_participation(uuid,text,uuid,boolean,boolean) to authenticated;
revoke all on function public.guard_event_schedule(),public.guard_event_participation(),public.after_event_participation() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
