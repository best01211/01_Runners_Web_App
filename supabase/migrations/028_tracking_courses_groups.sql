-- A root race is the event's first course. Existing IDs, records and policies stay intact.
begin;
alter table public.tracking_races add column parent_race_id uuid references public.tracking_races(race_id) on delete restrict;
alter table public.tracking_races add column course_name text not null default '기본 코스' check(length(trim(course_name)) between 1 and 60);
create index tracking_races_parent on public.tracking_races(parent_race_id);
create table public.tracking_pace_groups (
 group_id uuid primary key default gen_random_uuid(),
 race_id uuid not null references public.tracking_races(race_id) on delete restrict,
 name text not null check(length(trim(name)) between 1 and 40),
 pace_seconds integer not null check(pace_seconds between 120 and 1200),
 unique(race_id,name), unique(race_id,group_id)
);
alter table public.tracking_race_entries add column group_id uuid;
alter table public.tracking_race_entries add constraint tracking_entry_group_course foreign key(race_id,group_id) references public.tracking_pace_groups(race_id,group_id);
-- Preserve legacy pace assignments; new registrations must explicitly choose a group.
insert into public.tracking_pace_groups(race_id,name,pace_seconds)
 select distinct race_id,'기존 '||coalesce(target_pace_seconds,360)||'초 그룹',coalesce(target_pace_seconds,360) from public.tracking_race_entries;
update public.tracking_race_entries e set group_id=g.group_id from public.tracking_pace_groups g
 where e.race_id=g.race_id and g.pace_seconds=coalesce(e.target_pace_seconds,360);
alter table public.tracking_pace_groups enable row level security;
create policy tracking_groups_read on public.tracking_pace_groups for select to authenticated using(public.can_read_tracking_race(race_id));
revoke all on public.tracking_pace_groups from public,anon,authenticated;
grant select on public.tracking_pace_groups to authenticated,service_role;

-- Wrap proven course/checkpoint validation. Private helpers cannot bypass the wrapper.
alter function public.create_tracking_race(jsonb) rename to create_tracking_race_legacy;
alter function public.write_tracking_race(uuid,jsonb) rename to write_tracking_race_legacy;
revoke all on function public.create_tracking_race_legacy(jsonb),public.write_tracking_race_legacy(uuid,jsonb) from public,anon,authenticated;
create function public.create_tracking_race(payload jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare parent uuid; result uuid; event_name text; event_location text; label text;
begin
 if not public.is_tracking_admin() then raise exception 'RACE_FORBIDDEN'; end if;
 label:=trim(payload->>'courseName');
 if label is null or length(label) not between 1 and 60 then raise exception 'INVALID_COURSE'; end if;
 parent:=(payload->>'parentRaceId')::uuid;
 if parent is not null then
  select name,location into event_name,event_location from public.tracking_races where race_id=parent and parent_race_id is null and status='active' for update;
  if not found then raise exception 'RACE_NOT_FOUND'; end if;
  if (select count(*) from public.tracking_races where parent_race_id=parent)>=19 then raise exception 'COURSE_LIMIT'; end if;
  if exists(select 1 from public.tracking_races where (race_id=parent or parent_race_id=parent) and course_name=label and status='active') then raise exception 'DUPLICATE_COURSE'; end if;
  payload:=payload||jsonb_build_object('name',event_name,'location',event_location);
 end if;
 result:=public.create_tracking_race_legacy(payload);
 update public.tracking_races set parent_race_id=parent,course_name=label where race_id=result;
 return result;
end; $$;
create function public.write_tracking_race(target_race uuid,payload jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare g public.tracking_pace_groups%rowtype; gid uuid; root uuid; target_user uuid; label text; event_name text;
begin
 if not public.is_tracking_admin() then raise exception 'RACE_FORBIDDEN'; end if;
 select coalesce(parent_race_id,race_id) into root from public.tracking_races where race_id=target_race and status='active';
 if root is null then raise exception 'RACE_NOT_FOUND'; end if;
 perform 1 from public.tracking_races where race_id=root and status='active' for update;
 if not found then raise exception 'RACE_NOT_FOUND'; end if;
 perform 1 from public.tracking_races where race_id=target_race and status='active' for update;
 if payload->>'action'='group' then
  if (select count(*) from public.tracking_pace_groups where race_id=target_race)>=50 then raise exception 'GROUP_LIMIT'; end if;
  insert into public.tracking_pace_groups(race_id,name,pace_seconds) values(target_race,trim(payload->>'name'),(payload->>'paceSeconds')::integer);
  return;
 end if;
 if payload->>'action'='entry' then
  gid:=(payload->>'groupId')::uuid; target_user:=(payload->>'userId')::uuid;
  select * into g from public.tracking_pace_groups where group_id=gid and race_id=target_race;
  if g.group_id is null then raise exception 'GROUP_REQUIRED'; end if;
  if exists(select 1 from public.tracking_race_entries e join public.tracking_races r using(race_id)
   where e.user_id=target_user and e.race_id<>target_race and coalesce(r.parent_race_id,r.race_id)=root and r.status='active') then raise exception 'EVENT_ENTRY_EXISTS'; end if;
  if exists(select 1 from public.tracking_race_entries e join public.tracking_races r using(race_id) where e.race_id=target_race and e.user_id=target_user and now()>=r.start_at) then raise exception 'ENTRY_LOCKED'; end if;
  perform public.write_tracking_race_legacy(target_race,payload||jsonb_build_object('targetPaceSeconds',g.pace_seconds));
  update public.tracking_race_entries set group_id=gid where race_id=target_race and user_id=target_user;
  return;
 end if;
 if payload->>'action'='course' then
  label:=trim(payload->>'name');
  if label is null or length(label) not between 1 and 60 then raise exception 'INVALID_COURSE'; end if;
  if exists(select 1 from public.tracking_races where coalesce(parent_race_id,race_id)=root and race_id<>target_race and course_name=label and status='active') then raise exception 'DUPLICATE_COURSE'; end if;
  select name into event_name from public.tracking_races where race_id=root;
  perform public.write_tracking_race_legacy(target_race,payload||jsonb_build_object('name',event_name));
  update public.tracking_races set course_name=label where race_id=target_race;
  return;
 end if;
 perform public.write_tracking_race_legacy(target_race,payload);
end; $$;
revoke all on function public.create_tracking_race(jsonb),public.write_tracking_race(uuid,jsonb) from public,anon;
grant execute on function public.create_tracking_race(jsonb),public.write_tracking_race(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
