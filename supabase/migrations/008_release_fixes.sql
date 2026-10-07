-- Apply after 007. Atomic attendance/withdrawal writes and confirmed email sync.
begin;
create or replace function public.sync_confirmed_profile_email() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.email is distinct from old.email then update public.profiles set email=new.email where user_id=new.id and account_status <> 'withdrawn'; end if;
 return new;
end $$;
drop trigger if exists runners_confirmed_email on auth.users;
create trigger runners_confirmed_email after update of email on auth.users for each row execute function public.sync_confirmed_profile_email();
revoke all on function public.sync_confirmed_profile_email() from public,anon,authenticated;

create or replace function public.update_own_profile(payload jsonb) returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.is_active_member() then raise exception 'FORBIDDEN'; end if;
 if length(coalesce(payload->>'phone',''))>30 or length(coalesce(payload->>'nickname',''))>50 then raise exception 'INVALID_PROFILE'; end if;
 update profiles set phone=nullif(payload->>'phone',''),nickname=nullif(payload->>'nickname',''),profile_image_url=nullif(payload->>'profile_image_url','') where user_id=auth.uid();
end $$;

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
  if payload->>'status' not in ('attended','late','absent','not_checked') or payload->>'status' is null then raise exception 'INVALID_STATUS'; end if;
  target:=(payload->>'userId')::uuid;
  if not exists(select 1 from schedule_participations where schedule_id=target_schedule_id and user_id=target and status='registered') then raise exception 'NOT_PARTICIPANT'; end if;
  insert into attendances(schedule_id,user_id,status,method,checked_at,updated_by) values(target_schedule_id,target,(payload->>'status')::runners_attendance_status,'manual',case when payload->>'status'='not_checked' then null else now() end,p.user_id)
  on conflict(schedule_id,user_id) do update set status=excluded.status,method='manual',checked_at=excluded.checked_at,updated_by=p.user_id returning * into result;
  return jsonb_build_object('attendance',to_jsonb(result));
 end if;
 raise exception 'INVALID_ACTION';
end $$;

create or replace function public.request_withdrawal(reason_text text) returns jsonb language plpgsql security definer set search_path=public as $$
declare p profiles; result withdrawal_requests;
begin
 select * into p from profiles where user_id=auth.uid() for update;
 if p.user_id is null or p.role='admin' or p.account_status <> 'active' or p.approval_status <> 'approved' then raise exception 'FORBIDDEN'; end if;
 if length(coalesce(reason_text,''))>2000 then raise exception 'INVALID_REASON'; end if;
 -- Allow a new request after a previous rejection.
 insert into withdrawal_requests(user_id,reason) values(p.user_id,nullif(trim(reason_text),'')) returning * into result;
 update profiles set account_status='restricted' where user_id=p.user_id;
 return to_jsonb(result);
end $$;
-- Rejections are historical records; only pending requests must be unique.
alter table withdrawal_requests drop constraint if exists withdrawal_requests_user_id_status_key;
create unique index if not exists withdrawals_one_pending on withdrawal_requests(user_id) where status='pending';

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
  update profiles set account_status='active' where user_id=req.user_id and account_status='restricted';
  update withdrawal_requests set status='rejected',reviewed_by=actor.user_id,reviewed_at=now() where request_id=target_request_id;
 elsif decision='approve' then
  anonymous:='withdrawn-'||req.user_id::text;
  update comments set author_id=null,author_name='탈퇴한 회원' where author_id=req.user_id;
  update profiles set login_id=anonymous,email=anonymous||'@deleted.invalid',name='탈퇴한 회원',nickname=null,phone=null,birth_date=null,profile_image_url=null,role='pending',staff_position=null,account_status='withdrawn',approval_status='cancelled',anonymized_at=now() where user_id=req.user_id;
  update withdrawal_requests set status='approved',reviewed_by=actor.user_id,reviewed_at=now() where request_id=target_request_id;
 else raise exception 'INVALID_DECISION'; end if;
 return req.user_id;
end $$;
alter table withdrawal_requests add column if not exists auth_deleted_at timestamptz;
revoke all on function public.update_own_profile(jsonb),public.write_attendance(uuid,jsonb),public.request_withdrawal(text),public.review_withdrawal(uuid,text) from public,anon;
grant execute on function public.update_own_profile(jsonb),public.write_attendance(uuid,jsonb),public.request_withdrawal(text),public.review_withdrawal(uuid,text) to authenticated;
commit;
