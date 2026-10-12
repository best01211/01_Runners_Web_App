-- Apply after 008, before deploying the corresponding application.
begin;

create or replace function public.review_pending_member(
  target_user_id uuid,
  decision text,
  reason_text text default null,
  allow_reapplication boolean default true
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role;
  target_profile public.profiles;
  normalized_decision text := lower(trim(decision));
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;

  select role into actor_role
  from public.profiles
  where user_id = actor_id
    and account_status = 'active'
    and approval_status = 'approved';

  if actor_role is null or actor_role not in ('staff', 'admin') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if normalized_decision is null or normalized_decision not in ('approve', 'reject') then
    raise exception using errcode = '22023', message = 'INVALID_DECISION';
  end if;

  select * into target_profile
  from public.profiles
  where user_id = target_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'MEMBER_NOT_FOUND';
  end if;

  if target_profile.approval_status is distinct from 'pending'
     or target_profile.role is distinct from 'pending' then
    raise exception using errcode = 'P0001', message = 'MEMBER_NOT_PENDING';
  end if;

  if normalized_decision = 'approve' then
    update public.profiles
    set role = 'member', approval_status = 'approved',
        approved_by = actor_id, approved_at = now(),
        rejected_by = null, rejected_at = null, updated_at = now()
    where user_id = target_user_id
    returning * into target_profile;

    insert into public.member_approval_reviews
      (user_id, status, reason_text, allow_reapplication, reviewed_by)
    values
      (target_user_id, 'approved', nullif(trim(reason_text), ''), false, actor_id);
  else
    update public.profiles
    set role = 'pending', approval_status = 'rejected',
        rejected_by = actor_id, rejected_at = now(),
        approved_by = null, approved_at = null, updated_at = now()
    where user_id = target_user_id
    returning * into target_profile;

    insert into public.member_approval_reviews
      (user_id, status, reason_text, allow_reapplication, reviewed_by)
    values
      (target_user_id, 'rejected', nullif(trim(reason_text), ''), allow_reapplication, actor_id);
  end if;

  return target_profile;
end;
$$;

create or replace function public.write_attendance(target_schedule_id uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.schedules; p public.profiles; manager boolean; action text:=payload->>'action'; target uuid; result public.attendances; code text;
begin
 select * into p from profiles where user_id=auth.uid();
 if p.user_id is null or p.account_status <> 'active' or p.approval_status <> 'approved' then raise exception 'FORBIDDEN'; end if;
 select * into s from schedules where schedule_id=target_schedule_id for update;
 if s.schedule_id is null or s.deleted_at is not null or s.status='cancelled' then raise exception 'SCHEDULE_UNAVAILABLE'; end if;
 manager:=p.role in ('admin','staff') or (p.role='member' and s.schedule_type='flash' and s.creator_id=p.user_id);
 if action='open' then
  if not manager then raise exception 'FORBIDDEN'; end if;
  if s.attendance_opened_at is not null then raise exception 'ALREADY_OPENED'; end if;
  code:=lpad((floor(random()*900000)+100000)::text,6,'0');
  insert into attendances(schedule_id,user_id,status) select target_schedule_id,user_id,'not_checked' from schedule_participations where schedule_id=target_schedule_id and status='registered' on conflict(schedule_id,user_id) do nothing;
  update schedule_participations set participation_locked=true,pace_change_locked=true where schedule_id=target_schedule_id and status='registered';
  update schedules set attendance_code=code,attendance_opened_at=now(),status='attendance_open' where schedule_id=target_schedule_id;
  return jsonb_build_object('code',code);
 elsif action='check' then
  if s.attendance_opened_at is null or s.attendance_closed_at is not null then raise exception 'ATTENDANCE_CLOSED'; end if;
 if payload->>'code' is null or payload->>'code' is distinct from s.attendance_code then raise exception 'INVALID_CODE'; end if;
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
  update schedules set attendance_closed_at=now(),status='attendance_closed' where schedule_id=target_schedule_id;
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

create or replace function public.register_schedule_participation_with_group(target_schedule_id uuid,target_pace_group_id uuid default null)
returns public.schedule_participations language plpgsql security definer set search_path=public as $$
declare p profiles; s schedules; result schedule_participations; active_count integer;
begin
 select * into p from profiles where user_id=auth.uid();
 if p.user_id is null or p.account_status is distinct from 'active' or p.approval_status is distinct from 'approved' or p.role not in ('guest','member','staff') then raise exception 'PARTICIPATION_FORBIDDEN'; end if;
 select * into s from schedules where schedule_id=target_schedule_id and deleted_at is null for update;
 if not found then raise exception 'SCHEDULE_NOT_FOUND'; end if;
 if s.status <> 'open' or s.attendance_opened_at is not null then raise exception 'SCHEDULE_NOT_OPEN'; end if;
 if s.registration_start_at is not null and now()<s.registration_start_at then raise exception 'REGISTRATION_NOT_STARTED'; end if;
 if now()>s.registration_end_at then raise exception 'REGISTRATION_CLOSED'; end if;
 if p.role='guest' and not s.guest_allowed then raise exception 'GUEST_NOT_ALLOWED'; end if;
 if s.schedule_type='regular' and target_pace_group_id is null then raise exception 'PACE_GROUP_REQUIRED'; end if;
 if target_pace_group_id is not null and not exists(select 1 from pace_groups where pace_group_id=target_pace_group_id and schedule_id=target_schedule_id) then raise exception 'INVALID_PACE_GROUP'; end if;
 if exists(select 1 from schedule_participations where schedule_id=target_schedule_id and user_id=p.user_id and status in ('registered','completed')) then raise exception 'ALREADY_PARTICIPATING'; end if;
 select count(*) into active_count from schedule_participations sp join profiles participant on participant.user_id=sp.user_id where sp.schedule_id=target_schedule_id and sp.status in ('registered','completed') and (s.staff_in_capacity or participant.role<>'staff');
 if s.capacity is not null and (s.staff_in_capacity or p.role<>'staff') and active_count>=s.capacity then raise exception 'SCHEDULE_FULL'; end if;
 insert into schedule_participations(schedule_id,user_id,status,registration_source,registered_at,pace_group_id)
 values(target_schedule_id,p.user_id,'registered','user',now(),target_pace_group_id) returning * into result;
 return result;
end $$;

-- Align existing open/closed attendance sessions with the new UI locks.
update schedule_participations sp set participation_locked=true,pace_change_locked=true
from schedules s where s.schedule_id=sp.schedule_id and s.attendance_opened_at is not null and sp.status='registered';

-- Keep the legacy entry point safe for clients calling it directly.
create or replace function public.register_schedule_participation(target_schedule_id uuid)
returns public.schedule_participations language sql security definer set search_path=public as $$
 select public.register_schedule_participation_with_group(target_schedule_id,null);
$$;

create or replace function public.cancel_schedule_participation(target_schedule_id uuid,reason_text text default null)
returns public.schedule_participations language plpgsql security definer set search_path=public as $$
declare s schedules; result schedule_participations;
begin
 if not public.is_active_member() then raise exception 'PARTICIPATION_FORBIDDEN'; end if;
 select * into s from schedules where schedule_id=target_schedule_id and deleted_at is null for update;
 if not found then raise exception 'SCHEDULE_NOT_FOUND'; end if;
 if s.attendance_opened_at is not null then raise exception 'PARTICIPATION_LOCKED'; end if;
 if s.cancellation_deadline_at is not null and now()>s.cancellation_deadline_at then raise exception 'CANCELLATION_DEADLINE_PASSED'; end if;
 select * into result from schedule_participations where schedule_id=target_schedule_id and user_id=auth.uid() and status='registered' for update;
 if not found then raise exception 'ACTIVE_PARTICIPATION_NOT_FOUND'; end if;
 if result.participation_locked then raise exception 'PARTICIPATION_LOCKED'; end if;
 if length(coalesce(reason_text,''))>2000 then raise exception 'INVALID_REASON'; end if;
 update schedule_participations set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancellation_reason=nullif(trim(reason_text),''),updated_at=now() where participation_id=result.participation_id returning * into result;
 return result;
end $$;

create or replace function public.change_participation_group(target_schedule_id uuid,target_pace_group_id uuid)
returns public.schedule_participations language plpgsql security definer set search_path=public as $$
declare s schedules; result schedule_participations;
begin
 if not public.is_active_member() then raise exception 'PARTICIPATION_FORBIDDEN'; end if;
 select * into s from schedules where schedule_id=target_schedule_id and deleted_at is null for update;
 if not found or s.status='cancelled' then raise exception 'SCHEDULE_NOT_FOUND'; end if;
 if s.attendance_opened_at is not null then raise exception 'PACE_CHANGE_LOCKED'; end if;
 if not exists(select 1 from pace_groups where pace_group_id=target_pace_group_id and schedule_id=target_schedule_id) then raise exception 'INVALID_PACE_GROUP'; end if;
 select * into result from schedule_participations where schedule_id=target_schedule_id and user_id=auth.uid() and status='registered' for update;
 if not found then raise exception 'ACTIVE_PARTICIPATION_NOT_FOUND'; end if;
 if result.pace_change_locked then raise exception 'PACE_CHANGE_LOCKED'; end if;
 update schedule_participations set pace_group_id=target_pace_group_id,updated_at=now() where participation_id=result.participation_id returning * into result;
 return result;
end $$;

create or replace function public.register_flash_creator() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.schedule_type='flash' and exists(select 1 from profiles where user_id=new.creator_id and role in ('member','staff') and account_status='active' and approval_status='approved') then
  insert into schedule_participations(schedule_id,user_id,status,registration_source,registered_at) values(new.schedule_id,new.creator_id,'registered','creator',now());
 end if;
 return new;
end $$;
drop trigger if exists runners_flash_creator on schedules;
create trigger runners_flash_creator after insert on schedules for each row execute function public.register_flash_creator();

create or replace function public.create_season(payload jsonb) returns public.seasons language plpgsql security definer set search_path=public as $$
declare result seasons;
begin
 if not exists(select 1 from profiles where user_id=auth.uid() and role='admin' and account_status='active' and approval_status='approved') then raise exception 'FORBIDDEN'; end if;
 -- Serialize all default-season transitions, including an initially empty table.
 perform pg_advisory_xact_lock(109,9);
 if coalesce((payload->>'isDefault')::boolean,false) then
  if not coalesce((payload->>'isPublic')::boolean,true) or payload->>'status'='hidden' then raise exception 'INVALID_DEFAULT_SEASON'; end if;
  update seasons set is_default=false where is_default;
 end if;
 if length(trim(coalesce(payload->>'name','')))=0 or (payload->>'startsOn')::date>(payload->>'endsOn')::date then raise exception 'INVALID_PERIOD'; end if;
 insert into seasons(name,starts_on,ends_on,status,is_public,is_default,created_by)
 values(trim(payload->>'name'),(payload->>'startsOn')::date,(payload->>'endsOn')::date,coalesce(payload->>'status','scheduled')::runners_season_status,coalesce((payload->>'isPublic')::boolean,true),coalesce((payload->>'isDefault')::boolean,false),auth.uid()) returning * into result;
 return result;
end $$;

create table if not exists member_change_audits (
 audit_id uuid primary key default gen_random_uuid(),actor_id uuid not null,target_id uuid not null,
 changes jsonb not null,created_at timestamptz not null default now()
);
alter table member_change_audits enable row level security;
revoke all on member_change_audits from anon,authenticated;

create or replace function public.manage_member(target_user_id uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare actor profiles; target profiles; changed profiles;
begin
 select * into actor from profiles where user_id=auth.uid();
 if actor.user_id is null or actor.role not in ('staff','admin') or actor.account_status is distinct from 'active' or actor.approval_status is distinct from 'approved' then raise exception 'FORBIDDEN'; end if;
 if target_user_id=actor.user_id then raise exception 'SELF_CHANGE'; end if;
 select * into target from profiles where user_id=target_user_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if target.account_status='withdrawn' or target.approval_status<>'approved' then raise exception 'INVALID_MEMBER_STATE'; end if;
 if exists(select 1 from withdrawal_requests where user_id=target_user_id and status='pending') then raise exception 'WITHDRAWAL_PENDING'; end if;
 if exists(select 1 from jsonb_object_keys(payload) k where k not in ('role','staff_position','account_status','ranking_excluded')) or payload='{}'::jsonb then raise exception 'INVALID_PATCH'; end if;
 if actor.role<>'admin' and (target.role not in ('guest','member') or payload ? 'account_status' or (payload ? 'role' and payload->>'role' not in ('guest','member'))) then raise exception 'FORBIDDEN'; end if;
 if payload ? 'role' and (payload->>'role' is null or payload->>'role' not in ('guest','member','staff','admin')) then raise exception 'INVALID_ROLE'; end if;
 if payload ? 'account_status' and (payload->>'account_status' is null or payload->>'account_status' not in ('active','restricted','suspended')) then raise exception 'INVALID_STATUS'; end if;
 changed:=jsonb_populate_record(target,payload);
 if changed.role='staff' then
  if changed.staff_position is null then changed.staff_position:='staff'; end if;
  if changed.staff_position not in ('staff','president','vice_president') then raise exception 'INVALID_POSITION'; end if;
 else changed.staff_position:=null; end if;
 update profiles set role=changed.role,staff_position=changed.staff_position,account_status=changed.account_status,ranking_excluded=changed.ranking_excluded where user_id=target_user_id;
 insert into member_change_audits(actor_id,target_id,changes) values(actor.user_id,target_user_id,jsonb_build_object('before',jsonb_build_object('role',target.role,'staff_position',target.staff_position,'account_status',target.account_status,'ranking_excluded',target.ranking_excluded),'after',payload));
 return jsonb_build_object('user_id',target_user_id,'role',changed.role,'staff_position',changed.staff_position,'account_status',changed.account_status,'ranking_excluded',changed.ranking_excluded);
end $$;

-- Block direct column updates that bypass attendance/participation RPC locks.
revoke insert,update,delete on schedule_participations,schedules,profiles,comments,seasons,attendances,pace_groups from authenticated,anon;
do $$ declare c record; begin
 for c in select a.attname,t.relname from pg_attribute a join pg_class t on t.oid=a.attrelid join pg_namespace n on n.oid=t.relnamespace
 where n.nspname='public' and t.relname in ('schedule_participations','schedules','profiles','comments','seasons','attendances','pace_groups') and a.attnum>0 and not a.attisdropped loop
  execute format('revoke update (%I),insert (%I) on public.%I from authenticated,anon',c.attname,c.attname,c.relname);
 end loop;
 -- Table SELECT grants include secrets; replace them with safe column grants.
 revoke select on public.schedules from authenticated,anon;
 for c in select attname from pg_attribute where attrelid='public.schedules'::regclass and attnum>0 and not attisdropped loop
  execute format('revoke select (%I) on public.schedules from authenticated,anon',c.attname);
  if c.attname<>'attendance_code' then execute format('grant select (%I) on public.schedules to authenticated',c.attname); end if;
 end loop;
end $$;
drop policy if exists comments_hide_deleted on comments;
create policy comments_hide_deleted on comments as restrictive for select to authenticated using (deleted_at is null and public.is_active_member());
drop policy if exists seasons_hide_private on seasons;
create policy seasons_hide_private on seasons as restrictive for select to authenticated using (public.is_staff_or_admin() or (is_public and status<>'hidden'));

revoke all on function public.register_schedule_participation_with_group(uuid,uuid),public.register_schedule_participation(uuid),public.cancel_schedule_participation(uuid,text),public.change_participation_group(uuid,uuid),public.create_season(jsonb),public.manage_member(uuid,jsonb),public.register_flash_creator(),public.review_pending_member(uuid,text,text,boolean),public.write_attendance(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.register_schedule_participation_with_group(uuid,uuid),public.register_schedule_participation(uuid),public.cancel_schedule_participation(uuid,text),public.change_participation_group(uuid,uuid),public.create_season(jsonb),public.manage_member(uuid,jsonb),public.review_pending_member(uuid,text,text,boolean),public.write_attendance(uuid,jsonb) to authenticated;

commit;
