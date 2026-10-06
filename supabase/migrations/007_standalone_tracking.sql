begin;
create table public.tracking_races (
 race_id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 1 and 100),
 location text not null default '' check(length(location)<=200),
 status text not null default 'active' check(status in ('active','archived')),
 distance_meters double precision not null check(distance_meters between 1000 and 100000),
 points jsonb not null check(jsonb_typeof(points)='array' and jsonb_array_length(points) between 2 and 20000),
 start_at timestamptz not null,
 created_by uuid not null references public.profiles(user_id),
 updated_at timestamptz not null default now()
);
create table public.tracking_race_entries (
 entry_id uuid primary key default gen_random_uuid(),
 race_id uuid not null references public.tracking_races(race_id) on delete restrict,
 user_id uuid not null references public.profiles(user_id) on delete restrict,
 bib text not null check(bib ~ '^[A-Za-z0-9-]{1,20}$'),
 target_pace_seconds integer check(target_pace_seconds between 120 and 1200),
 status text not null default 'running' check(status in ('running','dnf','dns')),
 updated_at timestamptz not null default now(),
 unique(race_id,user_id), unique(race_id,bib)
);
create table public.tracking_checkpoints (
 checkpoint_id uuid primary key default gen_random_uuid(),
 entry_id uuid not null references public.tracking_race_entries(entry_id) on delete restrict,
 name text not null check(length(trim(name)) between 1 and 40),
 distance_meters double precision not null check(distance_meters >= 0),
 passed_at timestamptz not null,
 received_at timestamptz not null default now(),
 source text not null default 'manual' check(source='manual'),
 recorded_by uuid not null references public.profiles(user_id),
 unique(entry_id,distance_meters), check(passed_at <= received_at)
);
create index tracking_checkpoints_entry_time on public.tracking_checkpoints(entry_id,passed_at);

create or replace function public.is_tracking_admin()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.profiles where user_id=auth.uid() and role='admin' and account_status='active' and approval_status='approved');
$$;
create or replace function public.can_read_tracking_race(target_race uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.is_active_member() and exists(select 1 from public.tracking_races where race_id=target_race and status='active');
$$;
create or replace function public.can_read_tracking_entry(target_entry uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.tracking_race_entries e join public.profiles p on p.user_id=e.user_id where e.entry_id=target_entry and public.can_read_tracking_race(e.race_id) and p.account_status='active' and p.approval_status='approved');
$$;
alter table public.tracking_races enable row level security;
alter table public.tracking_race_entries enable row level security;
alter table public.tracking_checkpoints enable row level security;
create policy tracking_races_read on public.tracking_races for select to authenticated using(public.can_read_tracking_race(race_id));
create policy tracking_entries_read on public.tracking_race_entries for select to authenticated using(public.can_read_tracking_entry(entry_id));
create policy tracking_checkpoints_read on public.tracking_checkpoints for select to authenticated using(public.can_read_tracking_entry(entry_id));
revoke all on public.tracking_races,public.tracking_race_entries,public.tracking_checkpoints from anon,authenticated;
grant select on public.tracking_races,public.tracking_race_entries,public.tracking_checkpoints to authenticated,service_role;

create or replace function public.create_tracking_race(payload jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare d double precision; new_id uuid;
begin
 if not public.is_tracking_admin() then raise exception 'RACE_FORBIDDEN'; end if;
  d := (payload->>'distanceMeters')::double precision;
  if d is null or d not between 1000 and 100000 or jsonb_typeof(payload->'points')<>'array' or jsonb_array_length(payload->'points') not between 2 and 20000 then raise exception 'INVALID_COURSE'; end if;
  if exists(select 1 from jsonb_array_elements(payload->'points') p where jsonb_typeof(p->'latitude') is distinct from 'number' or jsonb_typeof(p->'longitude') is distinct from 'number' or (p->>'latitude')::double precision not between -90 and 90 or (p->>'longitude')::double precision not between -180 and 180) then raise exception 'INVALID_COURSE'; end if;
  if not exists(select 1 from jsonb_array_elements(payload->'points') p where p <> payload->'points'->0) then raise exception 'INVALID_COURSE'; end if;

 insert into public.tracking_races(name,location,distance_meters,points,start_at,created_by)
 values(payload->>'name',coalesce(payload->>'location',''),d,payload->'points',(payload->>'startAt')::timestamptz,auth.uid()) returning race_id into new_id;
 return new_id;
end;
$$;
create or replace function public.write_tracking_race(target_race uuid, payload jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
 actor uuid := auth.uid();
 manager boolean;
 action text := payload->>'action';
 course public.tracking_races%rowtype;
 entry public.tracking_race_entries%rowtype;
 target_user uuid;
 d double precision;
 t timestamptz;
 previous public.tracking_checkpoints%rowtype;
 pace integer;
begin
 if actor is null or not public.is_tracking_admin() then raise exception 'RACE_FORBIDDEN'; end if;
 perform 1 from public.tracking_races where race_id=target_race and status='active' for update;
 if not found then raise exception 'RACE_NOT_FOUND'; end if;
 manager := true;
 select * into course from public.tracking_races where race_id=target_race;
 if action='course' then
  if not manager then raise exception 'RACE_FORBIDDEN'; end if;
  if exists(select 1 from public.tracking_race_entries where race_id=target_race) then raise exception 'COURSE_LOCKED'; end if;
  d := (payload->>'distanceMeters')::double precision;
  if d is null or d not between 1000 and 100000 or jsonb_typeof(payload->'points')<>'array' or jsonb_array_length(payload->'points') not between 2 and 20000 then raise exception 'INVALID_COURSE'; end if;
  if exists(select 1 from jsonb_array_elements(payload->'points') p where jsonb_typeof(p->'latitude') is distinct from 'number' or jsonb_typeof(p->'longitude') is distinct from 'number' or (p->>'latitude')::double precision not between -90 and 90 or (p->>'longitude')::double precision not between -180 and 180) then raise exception 'INVALID_COURSE'; end if;
  if not exists(select 1 from jsonb_array_elements(payload->'points') p where p <> payload->'points'->0) then raise exception 'INVALID_COURSE'; end if;
  insert into public.tracking_races(race_id,name,distance_meters,points,start_at,created_by)
  values(target_race,payload->>'name',d,payload->'points',(payload->>'startAt')::timestamptz,actor)
  on conflict(race_id) do update set name=excluded.name,distance_meters=excluded.distance_meters,points=excluded.points,start_at=excluded.start_at,updated_at=now();
  return;
 end if;
 if course.race_id is null then raise exception 'COURSE_REQUIRED'; end if;
 if action='entry' then
  target_user := (payload->>'userId')::uuid;
  if target_user is null then raise exception 'RACE_FORBIDDEN'; end if;
  if not exists(select 1 from public.profiles where user_id=target_user and account_status='active' and approval_status='approved') then raise exception 'NOT_PARTICIPANT'; end if;
  select * into entry from public.tracking_race_entries where race_id=target_race and user_id=target_user;
  if entry.entry_id is null and (select count(*) from public.tracking_race_entries where race_id=target_race)>=500 then raise exception 'ENTRY_LIMIT'; end if;
  if exists(select 1 from public.tracking_checkpoints where entry_id=entry.entry_id) then raise exception 'ENTRY_LOCKED'; end if;
  pace := (payload->>'targetPaceSeconds')::integer;
  insert into public.tracking_race_entries(race_id,user_id,bib,target_pace_seconds)
  values(target_race,target_user,payload->>'bib',pace)
  on conflict(race_id,user_id) do update set bib=excluded.bib,target_pace_seconds=excluded.target_pace_seconds,updated_at=now();
  return;
 end if;
 if not manager then raise exception 'RACE_FORBIDDEN'; end if;
 select * into entry from public.tracking_race_entries where race_id=target_race and entry_id=(payload->>'entryId')::uuid;
 if entry.entry_id is null then raise exception 'ENTRY_NOT_FOUND'; end if;
 if action='status' then
  if payload->>'status' not in ('running','dnf','dns') then raise exception 'INVALID_STATUS'; end if;
  if exists(select 1 from public.tracking_checkpoints where entry_id=entry.entry_id and (distance_meters=course.distance_meters or payload->>'status'='dns')) then raise exception 'STATUS_LOCKED'; end if;
  update public.tracking_race_entries set status=payload->>'status',updated_at=now() where entry_id=entry.entry_id;
  return;
 end if;
 if (select count(*) from public.tracking_checkpoints where entry_id=entry.entry_id)>=100 then raise exception 'CHECKPOINT_LIMIT'; end if;
 if action<>'checkpoint' then raise exception 'INVALID_ACTION'; end if;
 if entry.status<>'running' then raise exception 'STATUS_LOCKED'; end if;
 d := (payload->>'distanceMeters')::double precision;
 t := (payload->>'passedAt')::timestamptz;
 if d is null or d not between 0 and course.distance_meters or t is null or t < course.start_at or t>now() then raise exception 'INVALID_CHECKPOINT'; end if;
 select * into previous from public.tracking_checkpoints where entry_id=entry.entry_id order by distance_meters desc limit 1;
 if previous.checkpoint_id is not null then
  if d<=previous.distance_meters or t<=previous.passed_at then raise exception 'CHECKPOINT_ORDER'; end if;
  if extract(epoch from t-previous.passed_at)/(d-previous.distance_meters)*1000 not between 120 and 1200 then raise exception 'CHECKPOINT_PACE'; end if;
 end if;
 insert into public.tracking_checkpoints(entry_id,name,distance_meters,passed_at,recorded_by)
 values(entry.entry_id,case when d=0 then 'START' when d=course.distance_meters then 'FINISH' else payload->>'name' end,d,t,actor);
end;
$$;

revoke all on function public.is_tracking_admin(),public.can_read_tracking_race(uuid),public.can_read_tracking_entry(uuid),public.create_tracking_race(jsonb),public.write_tracking_race(uuid,jsonb) from public,anon;
grant execute on function public.is_tracking_admin(),public.can_read_tracking_race(uuid),public.can_read_tracking_entry(uuid),public.create_tracking_race(jsonb),public.write_tracking_race(uuid,jsonb) to authenticated;
-- Retire the former staff/member writable schedule tracking RPC.
revoke execute on function public.write_race_tracking(uuid,jsonb) from authenticated;
commit;
