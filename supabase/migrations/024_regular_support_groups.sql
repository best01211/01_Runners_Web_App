-- Apply before deploying the matching application. No RLS policy changes.
begin;
alter table public.pace_groups add column if not exists group_kind text not null default 'running';
alter table public.pace_groups drop constraint if exists pace_groups_pace_seconds_check;
alter table public.pace_groups drop constraint if exists pace_groups_distance_km_check;
alter table public.pace_groups drop constraint if exists pace_groups_schedule_id_pace_seconds_distance_km_key;
alter table public.pace_groups drop constraint if exists pace_groups_kind_values;
alter table public.pace_groups add constraint pace_groups_kind_values check (
 (group_kind='running' and pace_seconds>0 and pace_seconds%30=0 and distance_km>=5)
 or (group_kind in ('storage','photo') and pace_seconds=0 and distance_km=0)
);
create unique index if not exists pace_groups_kind_unique on public.pace_groups(schedule_id,group_kind,pace_seconds,distance_km);
create or replace function public.valid_template_pace_groups(groups jsonb)
returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare item jsonb; pace integer; distance integer; seen text[]:='{}'; key text;
begin
  if groups is null or jsonb_typeof(groups)<>'array' then return false; end if;
  if jsonb_array_length(groups)>20 then return false; end if;
  for item in select value from jsonb_array_elements(groups) loop
    if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'paceSeconds') is distinct from 'number' or jsonb_typeof(item->'distanceKm') is distinct from 'number' then return false; end if;
    if (item->>'paceSeconds')::numeric<>trunc((item->>'paceSeconds')::numeric) or (item->>'distanceKm')::numeric<>trunc((item->>'distanceKm')::numeric) then return false; end if;
    pace:=(item->>'paceSeconds')::numeric::integer; distance:=(item->>'distanceKm')::numeric::integer;
    if pace<=0 or pace%30<>0 or distance<5 then return false; end if;
    key:=pace::text||':'||distance::text;
    if key=any(seen) then return false; end if;
    seen:=array_append(seen,key);
  end loop;
  return true;
exception when others then return false;
end $$;

-- Both support choices are ordinary participation groups: existing cancellation,
-- attendance locking, attendance checks and ranking use the same participant row.
create or replace function public.add_regular_support_groups()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.schedule_type::text='regular' then
  insert into public.pace_groups(schedule_id,group_kind,pace_seconds,distance_km,created_by)
  values(new.schedule_id,'storage',0,0,new.creator_id),(new.schedule_id,'photo',0,0,new.creator_id)
  on conflict do nothing;
 elsif exists(select 1 from public.schedule_participations sp join public.pace_groups g on g.pace_group_id=sp.pace_group_id
  where sp.schedule_id=new.schedule_id and sp.status in ('registered','completed') and g.group_kind in ('storage','photo')) then
  raise exception 'SUPPORT_TYPE_HAS_PARTICIPANTS';
 end if;
 return new;
end $$;
revoke all on function public.add_regular_support_groups() from public,anon,authenticated;
drop trigger if exists schedules_add_support_groups on public.schedules;
create trigger schedules_add_support_groups after insert or update of schedule_type on public.schedules
 for each row execute function public.add_regular_support_groups();
insert into public.pace_groups(schedule_id,group_kind,pace_seconds,distance_km,created_by)
select s.schedule_id,k.kind,0,0,s.creator_id from public.schedules s
cross join (values ('storage'),('photo')) k(kind)
where s.schedule_type::text='regular' and s.deleted_at is null
on conflict do nothing;

-- Validate at the DB boundary, including direct RPC calls and group changes.
create or replace function public.validate_participation_pace_group()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare kind text;
begin
 if new.pace_group_id is not null then
  select pg.group_kind into kind from public.pace_groups pg
   where pg.pace_group_id=new.pace_group_id and pg.schedule_id=new.schedule_id;
  if not found then raise exception 'PACE_GROUP_SCHEDULE_MISMATCH'; end if;
  if kind in ('storage','photo') and not exists(select 1 from public.schedules s
   where s.schedule_id=new.schedule_id and s.schedule_type::text='regular') then raise exception 'SUPPORT_REGULAR_ONLY'; end if;
  if kind='storage' and not exists(select 1 from public.profiles p where p.user_id=new.user_id
   and p.role::text in ('staff','admin') and p.account_status::text='active' and p.approval_status::text='approved'
   and not exists(select 1 from public.withdrawal_requests w where w.user_id=p.user_id and w.status='pending'))
   then raise exception 'STORAGE_STAFF_ONLY'; end if;
 end if;
 return new;
end $$;
drop trigger if exists trg_validate_participation_pace_group on public.schedule_participations;
create trigger trg_validate_participation_pace_group before insert or update of schedule_id,user_id,pace_group_id
on public.schedule_participations for each row execute function public.validate_participation_pace_group();
notify pgrst,'reload schema';
commit;
