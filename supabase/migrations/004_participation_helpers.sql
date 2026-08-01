begin;
create or replace function public.register_schedule_participation(target_schedule_id uuid)
returns public.schedule_participations
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  target_schedule public.schedules;
  active_count integer;
  created_participation public.schedule_participations;
begin
  if actor_id is null then raise exception 'UNAUTHENTICATED'; end if;

  if not exists (
    select 1 from public.profiles p
    where p.user_id = actor_id
      and p.account_status = 'active'
      and p.approval_status = 'approved'
      and p.role in ('guest','member','staff')
  ) then raise exception 'PARTICIPATION_FORBIDDEN'; end if;

  select * into target_schedule
  from public.schedules
  where schedule_id = target_schedule_id and deleted_at is null
  for update;

  if not found then raise exception 'SCHEDULE_NOT_FOUND'; end if;
  if target_schedule.status <> 'open' then raise exception 'SCHEDULE_NOT_OPEN'; end if;
  if target_schedule.registration_start_at is not null and now() < target_schedule.registration_start_at then raise exception 'REGISTRATION_NOT_STARTED'; end if;
  if now() > target_schedule.registration_end_at then raise exception 'REGISTRATION_CLOSED'; end if;

  if exists (
    select 1 from public.profiles p
    where p.user_id = actor_id and p.role = 'guest' and target_schedule.guest_allowed = false
  ) then raise exception 'GUEST_NOT_ALLOWED'; end if;

  if exists (
    select 1 from public.schedule_participations sp
    where sp.schedule_id = target_schedule_id and sp.user_id = actor_id
      and sp.status in ('registered','completed')
  ) then raise exception 'ALREADY_PARTICIPATING'; end if;

  select count(*)::integer into active_count
  from public.schedule_participations sp
  where sp.schedule_id = target_schedule_id and sp.status in ('registered','completed');

  if target_schedule.capacity is not null and active_count >= target_schedule.capacity then raise exception 'SCHEDULE_FULL'; end if;

  insert into public.schedule_participations(schedule_id,user_id,status,registration_source,registered_at)
  values(target_schedule_id,actor_id,'registered','user',now())
  returning * into created_participation;

  return created_participation;
end;
$$;

revoke all on function public.register_schedule_participation(uuid) from public, anon;
grant execute on function public.register_schedule_participation(uuid) to authenticated;

create or replace function public.cancel_schedule_participation(target_schedule_id uuid, reason_text text default null)
returns public.schedule_participations
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  target_schedule public.schedules;
  target_participation public.schedule_participations;
begin
  if actor_id is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into target_schedule from public.schedules
  where schedule_id = target_schedule_id and deleted_at is null;
  if not found then raise exception 'SCHEDULE_NOT_FOUND'; end if;

  select * into target_participation from public.schedule_participations
  where schedule_id = target_schedule_id and user_id = actor_id and status = 'registered'
  for update;
  if not found then raise exception 'ACTIVE_PARTICIPATION_NOT_FOUND'; end if;
  if target_participation.participation_locked then raise exception 'PARTICIPATION_LOCKED'; end if;
  if target_schedule.cancellation_deadline_at is not null and now() > target_schedule.cancellation_deadline_at then raise exception 'CANCELLATION_DEADLINE_PASSED'; end if;

  update public.schedule_participations
  set status='cancelled', cancelled_at=now(), cancelled_by=actor_id,
      cancellation_reason=nullif(trim(reason_text),''), updated_at=now()
  where participation_id=target_participation.participation_id
  returning * into target_participation;

  return target_participation;
end;
$$;
revoke all on function public.cancel_schedule_participation(uuid,text) from public, anon;
grant execute on function public.cancel_schedule_participation(uuid,text) to authenticated;
commit;
