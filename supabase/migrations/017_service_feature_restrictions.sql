-- Apply after 016. Feature restrictions and administrator-grade protection.
begin;
alter table public.profiles add column if not exists is_pacer boolean not null default false;
grant select(is_pacer) on public.profiles to authenticated;
create or replace function public.service_can_access(member_role text,pacer boolean default false)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare setting jsonb; state text;
begin
 select setting_value into setting from system_settings where setting_key='maintenance';
 state:=coalesce(setting->>'status','normal');
 if state='normal' or member_role='admin' then return true; end if;
 if state='maintenance' then return member_role='staff'; end if;
 if state<>'restricted' then return false; end if;
 if not coalesce((setting->'blocked'->>'access')::boolean,not (setting ? 'blocked')) then return true; end if;
 return (member_role='staff' and coalesce((setting->'allowedAccess'->>'staff')::boolean,true))
   or (coalesce(pacer,false) and coalesce((setting->'allowedAccess'->>'pacer')::boolean,false))
   or (member_role='member' and coalesce((setting->'allowedAccess'->>'member')::boolean,false))
   or (member_role='guest' and coalesce((setting->'allowedAccess'->>'guest')::boolean,false));
end $$;
create or replace function public.service_feature_blocked(feature text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce((select setting_value->>'status'='restricted' and coalesce((setting_value->'blocked'->>feature)::boolean,false) from system_settings where setting_key='maintenance'),false);
$$;
create or replace function public.assert_service_feature(feature text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if public.service_feature_blocked(feature) then raise exception 'SERVICE_FEATURE_BLOCKED: %',feature; end if;
end $$;
create or replace function public.can_read_member()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from profiles p where p.user_id=auth.uid() and p.account_status in ('active','restricted') and p.approval_status='approved' and p.role in ('guest','member','staff','admin')
   and not exists(select 1 from withdrawal_requests w where w.user_id=p.user_id and w.status='pending')
   and public.service_can_access(p.role::text,p.is_pacer));
$$;
-- Administrators remain administrators even through direct privileged UPDATEs.
create or replace function public.protect_administrator_role()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if old.role::text='admin' and new.role::text is distinct from 'admin' then raise exception 'ADMIN_ROLE_PROTECTED'; end if;
 return new;
end $$;
drop trigger if exists profiles_protect_admin_role on profiles;
create trigger profiles_protect_admin_role before update of role on profiles for each row execute function public.protect_administrator_role();
create or replace function public.check_schedule_service_access()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare actor profiles;
begin
 select * into actor from profiles where user_id=new.creator_id;
 if actor.user_id is null or actor.account_status<>'active' or actor.approval_status<>'approved' or not public.service_can_access(actor.role::text,actor.is_pacer) then raise exception 'SERVICE_ACCESS_BLOCKED'; end if;
 perform public.assert_service_feature('scheduleCreation');return new;
end $$;
drop trigger if exists schedules_service_creation on schedules;
create trigger schedules_service_creation before insert on schedules for each row execute function public.check_schedule_service_access();
create or replace function public.check_comment_service_access()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin perform public.assert_service_feature('comments');return new;end $$;
drop trigger if exists comments_service_write on comments;
create trigger comments_service_write before insert or update of content,kind on comments for each row execute function public.check_comment_service_access();
revoke all on function public.protect_administrator_role(),public.check_schedule_service_access(),public.check_comment_service_access() from public,anon,authenticated;
revoke all on function public.service_can_access(text,boolean),public.service_feature_blocked(text),public.assert_service_feature(text) from public,anon;
grant execute on function public.service_can_access(text,boolean),public.service_feature_blocked(text),public.assert_service_feature(text) to authenticated;
create or replace function public.manage_member(target_user_id uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare actor profiles; target profiles; changed profiles;
begin
 if not public.can_read_member() then raise exception 'FORBIDDEN'; end if;
 select * into actor from profiles where user_id=auth.uid();
 if actor.user_id is null or actor.role not in ('staff','admin') or actor.account_status is distinct from 'active' or actor.approval_status is distinct from 'approved' then raise exception 'FORBIDDEN'; end if;
 if target_user_id=actor.user_id then raise exception 'SELF_CHANGE'; end if;
 select * into target from profiles where user_id=target_user_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if target.role='admin' and payload ? 'role' and payload->>'role' is distinct from 'admin' then raise exception 'ADMIN_ROLE_PROTECTED'; end if;
 if target.account_status='withdrawn' or target.approval_status<>'approved' then raise exception 'INVALID_MEMBER_STATE'; end if;
 if exists(select 1 from withdrawal_requests where user_id=target_user_id and status='pending') then raise exception 'WITHDRAWAL_PENDING'; end if;
 if exists(select 1 from jsonb_object_keys(payload) k where k not in ('role','staff_position','account_status','ranking_excluded','is_pacer')) or payload='{}'::jsonb then raise exception 'INVALID_PATCH'; end if;
 if actor.role<>'admin' and (target.role not in ('guest','member') or payload ? 'account_status' or payload ? 'is_pacer' or (payload ? 'role' and payload->>'role' not in ('guest','member'))) then raise exception 'FORBIDDEN'; end if;
 if payload ? 'role' and (payload->>'role' is null or payload->>'role' not in ('guest','member','staff','admin')) then raise exception 'INVALID_ROLE'; end if;
 if payload ? 'account_status' and (payload->>'account_status' is null or payload->>'account_status' not in ('active','restricted','suspended')) then raise exception 'INVALID_STATUS'; end if;
 if payload ? 'is_pacer' and jsonb_typeof(payload->'is_pacer') is distinct from 'boolean' then raise exception 'INVALID_PATCH'; end if;
 changed:=jsonb_populate_record(target,payload);
 if changed.role='staff' then
  if changed.staff_position is null then changed.staff_position:='staff'; end if;
  if changed.staff_position not in ('staff','president','vice_president') then raise exception 'INVALID_POSITION'; end if;
 else changed.staff_position:=null; end if;
 update profiles set role=changed.role,staff_position=changed.staff_position,account_status=changed.account_status,ranking_excluded=changed.ranking_excluded,is_pacer=changed.is_pacer where user_id=target_user_id;
 insert into member_change_audits(actor_id,target_id,changes) values(actor.user_id,target_user_id,jsonb_build_object('before',jsonb_build_object('role',target.role,'staff_position',target.staff_position,'account_status',target.account_status,'ranking_excluded',target.ranking_excluded,'is_pacer',target.is_pacer),'after',payload));
 return jsonb_build_object('user_id',target_user_id,'role',changed.role,'staff_position',changed.staff_position,'account_status',changed.account_status,'ranking_excluded',changed.ranking_excluded,'is_pacer',changed.is_pacer);
end $$;
create or replace function public.register_schedule_participation_with_group(target_schedule_id uuid,target_pace_group_id uuid default null)
returns public.schedule_participations language plpgsql security definer set search_path=public as $$
declare p profiles; s schedules; result schedule_participations; active_count integer;
begin
 perform public.assert_service_feature('participation');
 select * into p from profiles where user_id=auth.uid();
 if p.user_id is null or p.account_status is distinct from 'active' or p.approval_status is distinct from 'approved' or p.role not in ('guest','member','staff') then raise exception 'PARTICIPATION_FORBIDDEN'; end if;
 if not public.is_active_member() then raise exception 'PARTICIPATION_FORBIDDEN'; end if;
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
create or replace function public.change_participation_group(target_schedule_id uuid,target_pace_group_id uuid)
returns public.schedule_participations language plpgsql security definer set search_path=public as $$
declare s schedules; result schedule_participations;
begin
 perform public.assert_service_feature('participation');
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
create or replace function public.update_own_profile(payload jsonb) returns void language plpgsql security definer set search_path=public as $$
begin
 perform public.assert_service_feature('profile');
 if not public.can_read_member() then raise exception 'FORBIDDEN'; end if;
 if length(coalesce(payload->>'phone',''))>30 or length(coalesce(payload->>'nickname',''))>50 then raise exception 'INVALID_PROFILE'; end if;
 update profiles set phone=nullif(payload->>'phone',''),nickname=nullif(payload->>'nickname',''),profile_image_url=nullif(payload->>'profile_image_url','') where user_id=auth.uid();
end $$;
create or replace function public.register_flash_creator() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if public.service_feature_blocked('participation') then return new; end if;
 if new.schedule_type='flash' and exists(select 1 from profiles where user_id=new.creator_id and role in ('member','staff') and account_status='active' and approval_status='approved') then
  insert into schedule_participations(schedule_id,user_id,status,registration_source,registered_at) values(new.schedule_id,new.creator_id,'registered','system',now());
 end if;
 return new;
end $$;
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
 if not public.can_read_member() then raise exception 'FORBIDDEN'; end if;
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

notify pgrst,'reload schema';
commit;
