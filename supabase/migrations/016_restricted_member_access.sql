-- Apply after 015. Restricted members can read and manage existing commitments.
begin;
alter table public.withdrawal_requests add column if not exists previous_account_status text not null default 'active';
alter table public.withdrawal_requests drop constraint if exists withdrawal_previous_status_valid;
alter table public.withdrawal_requests add constraint withdrawal_previous_status_valid check(previous_account_status in ('active','restricted'));
create or replace function public.can_read_member()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from profiles p where p.user_id=auth.uid() and p.account_status in ('active','restricted') and p.approval_status='approved' and p.role in ('guest','member','staff','admin')
 and not exists(select 1 from withdrawal_requests w where w.user_id=p.user_id and w.status='pending'));
$$;
create or replace function public.is_active_member()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.can_read_member() and exists(select 1 from profiles where user_id=auth.uid() and account_status='active');
$$;
grant execute on function public.can_read_member(),public.is_active_member() to authenticated;
-- Preserve existing SELECT predicates, widening only their membership-read gate.
-- No write policies or direct write grants are added.
do $$ declare rule record; expression text; begin
 for rule in select p.polname,p.polrelid,pg_get_expr(p.polqual,p.polrelid) qualification from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and p.polcmd='r' and pg_get_expr(p.polqual,p.polrelid) like '%is_active_member()%'
 loop
 expression:=replace(rule.qualification,'is_active_member()','can_read_member()');
 execute format('alter policy %I on %s using (%s)',rule.polname,rule.polrelid::regclass,expression);
 end loop;
end $$;
do $$ declare table_name text; begin
 foreach table_name in array array['schedules','schedule_participations','pace_groups','comments','seasons','regular_run_templates','system_settings','attendances','race_courses','race_entries','runner_checkpoints','tracking_races','tracking_race_entries','tracking_checkpoints'] loop
  if to_regclass('public.'||table_name) is not null then
   execute format('drop policy if exists restricted_access_membership_read on public.%I',table_name);
   execute format('create policy restricted_access_membership_read on public.%I as restrictive for select to authenticated using (public.can_read_member())',table_name);
  end if;
 end loop;
end $$;
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
  code:=lpad((floor(random()*900000)+100000)::text,6,'0');
  insert into attendances(schedule_id,user_id,status) select target_schedule_id,user_id,'not_checked' from schedule_participations where schedule_id=target_schedule_id and status='registered' on conflict(schedule_id,user_id) do nothing;
  update schedule_participations set participation_locked=true,pace_change_locked=true where schedule_id=target_schedule_id and status='registered';
  update schedules set attendance_code=code,attendance_opened_at=now(),status='in_progress' where schedule_id=target_schedule_id;
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
create or replace function public.cancel_schedule_participation(target_schedule_id uuid,reason_text text default null)
returns public.schedule_participations language plpgsql security definer set search_path=public as $$
declare s schedules; result schedule_participations;
begin
 if not public.can_read_member() then raise exception 'PARTICIPATION_FORBIDDEN'; end if;
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
create or replace function public.update_own_profile(payload jsonb) returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.can_read_member() then raise exception 'FORBIDDEN'; end if;
 if length(coalesce(payload->>'phone',''))>30 or length(coalesce(payload->>'nickname',''))>50 then raise exception 'INVALID_PROFILE'; end if;
 update profiles set phone=nullif(payload->>'phone',''),nickname=nullif(payload->>'nickname',''),profile_image_url=nullif(payload->>'profile_image_url','') where user_id=auth.uid();
end $$;
create or replace function public.request_withdrawal(reason_text text) returns jsonb language plpgsql security definer set search_path=public as $$
declare p profiles; result withdrawal_requests;
begin
 select * into p from profiles where user_id=auth.uid() for update;
 if p.user_id is null or p.role='admin' or not public.can_read_member() then raise exception 'FORBIDDEN'; end if;
 if length(coalesce(reason_text,''))>2000 then raise exception 'INVALID_REASON'; end if;
 -- Allow a new request after a previous rejection.
 insert into withdrawal_requests(user_id,reason,previous_account_status) values(p.user_id,nullif(trim(reason_text),''),p.account_status::text) returning * into result;
 update profiles set account_status='restricted' where user_id=p.user_id;
 return to_jsonb(result);
end $$;
create or replace function public.review_withdrawal(target_request_id uuid,decision text) returns uuid language plpgsql security definer set search_path=public as $$
declare actor profiles; req withdrawal_requests; anonymous text;
begin
 select * into actor from profiles where user_id=auth.uid();
 if actor.user_id is null or actor.role <> 'admin' or actor.account_status <> 'active' or actor.approval_status <> 'approved' then raise exception 'FORBIDDEN'; end if;
 select * into req from withdrawal_requests where request_id=target_request_id for update;
 if req.request_id is null then raise exception 'NOT_FOUND'; end if;
 if req.status='approved' and decision='approve' then return req.user_id; end if;
 if req.status <> 'pending' then raise exception 'ALREADY_REVIEWED'; end if;
 perform 1 from profiles where user_id=req.user_id for update;
 if decision='reject' then
  update profiles set account_status=(jsonb_populate_record(null::profiles,jsonb_build_object('account_status',req.previous_account_status))).account_status where user_id=req.user_id and account_status='restricted';
  update withdrawal_requests set status='rejected',reviewed_by=actor.user_id,reviewed_at=now() where request_id=target_request_id;
 elsif decision='approve' then
  anonymous:='withdrawn-'||req.user_id::text;
  update comments set author_id=null,author_name='탈퇴한 회원' where author_id=req.user_id;
  update profiles set login_id=anonymous,email=anonymous||'@deleted.invalid',name='탈퇴한 회원',nickname=null,phone=null,birth_date=null,profile_image_url=null,role='pending',staff_position=null,account_status='withdrawn',approval_status='cancelled',anonymized_at=now() where user_id=req.user_id;
  update withdrawal_requests set status='approved',reviewed_by=actor.user_id,reviewed_at=now() where request_id=target_request_id;
 else raise exception 'INVALID_DECISION'; end if;
 return req.user_id;
end $$;
create or replace function public.register_schedule_participation_with_group(target_schedule_id uuid,target_pace_group_id uuid default null)
returns public.schedule_participations language plpgsql security definer set search_path=public as $$
declare p profiles; s schedules; result schedule_participations; active_count integer;
begin
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
create or replace function public.can_read_race(target_schedule uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.can_read_member() and exists(select 1 from public.schedules where schedule_id=target_schedule and schedule_type='event' and status<>'cancelled' and deleted_at is null);
$$;
create or replace function public.can_read_race_entry(target_entry uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.race_entries e
 join public.profiles p on p.user_id=e.user_id
 where e.entry_id=target_entry and public.can_read_race(e.schedule_id)
 and p.account_status='active' and p.approval_status='approved'
 and exists(select 1 from public.schedule_participations sp where sp.schedule_id=e.schedule_id and sp.user_id=e.user_id and sp.status in ('registered','completed')));
$$;
create or replace function public.can_read_tracking_race(target_race uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.can_read_member() and exists(select 1 from public.tracking_races where race_id=target_race and status='active');
$$;
create or replace function public.can_read_tracking_entry(target_entry uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.tracking_race_entries e join public.profiles p on p.user_id=e.user_id where e.entry_id=target_entry and public.can_read_tracking_race(e.race_id) and p.account_status='active' and p.approval_status='approved');
$$;

revoke all on function public.can_read_member() from public,anon;
grant execute on function public.can_read_member() to authenticated;
notify pgrst,'reload schema';
commit;
