-- Apply after 012. Align the existing legacy trigger/FK with the app's pace_groups.
-- No participation rows or legacy tables are deleted. All steps are atomic.
begin;
lock table public.schedule_participations in share row exclusive mode;
lock table public.pace_groups in share row exclusive mode;
create temporary table runners_pace_group_mapping(old_id uuid primary key,new_id uuid not null) on commit drop;

-- Preserve any older participation references. Import the referenced legacy groups
-- or map identical groups to the canonical ID. Unsupported legacy fields fail safely.
do $$
declare legacy record; source jsonb; pace integer; distance integer; canonical uuid; source_schedule uuid;
begin
  for legacy in select distinct sp.pace_group_id from public.schedule_participations sp
    where sp.pace_group_id is not null and not exists(select 1 from public.pace_groups g where g.pace_group_id=sp.pace_group_id)
  loop
    if to_regclass('public.schedule_pace_groups') is null then raise exception 'LEGACY_PACE_GROUP_NOT_FOUND: %',legacy.pace_group_id; end if;
    execute 'select to_jsonb(g) from public.schedule_pace_groups g where g.pace_group_id=$1' into source using legacy.pace_group_id;
    if source is null then raise exception 'LEGACY_PACE_GROUP_NOT_FOUND: %',legacy.pace_group_id; end if;
    if coalesce(source->>'pace_seconds','') !~ '^[0-9]+(\.0+)?$' or coalesce(source->>'distance_km','') !~ '^[0-9]+(\.0+)?$' then
      raise exception 'LEGACY_PACE_GROUP_FIELDS_UNSUPPORTED: %. Inspect legacy columns before migrating.',legacy.pace_group_id;
    end if;
    pace:=(source->>'pace_seconds')::numeric::integer; distance:=(source->>'distance_km')::numeric::integer;
    source_schedule:=(source->>'schedule_id')::uuid;
    if source_schedule is null or pace<=0 or pace%30<>0 or distance<5 or distance%5<>0 then raise exception 'INVALID_LEGACY_PACE_GROUP: %',legacy.pace_group_id; end if;
    select g.pace_group_id into canonical from public.pace_groups g where g.schedule_id=source_schedule and g.pace_seconds=pace and g.distance_km=distance;
    if canonical is null then
      insert into public.pace_groups(pace_group_id,schedule_id,pace_seconds,distance_km) values(legacy.pace_group_id,source_schedule,pace,distance) returning pace_group_id into canonical;
    end if;
    insert into runners_pace_group_mapping values(legacy.pace_group_id,canonical);
  end loop;
end $$;

create or replace function public.validate_participation_pace_group()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.pace_group_id is not null and not exists(
    select 1 from public.pace_groups pg where pg.pace_group_id=new.pace_group_id and pg.schedule_id=new.schedule_id
  ) then raise exception 'PACE_GROUP_SCHEDULE_MISMATCH'; end if;
  return new;
end $$;
drop trigger if exists trg_validate_participation_pace_group on public.schedule_participations;
create trigger trg_validate_participation_pace_group before insert or update of schedule_id,pace_group_id
on public.schedule_participations for each row execute function public.validate_participation_pace_group();

do $$ declare fk record; begin
  for fk in select c.conname from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
    where c.contype='f' and c.conrelid='public.schedule_participations'::regclass
      and a.attname='pace_group_id' and array_length(c.conkey,1)=1
  loop execute format('alter table public.schedule_participations drop constraint %I',fk.conname); end loop;
end $$;
update public.schedule_participations sp set pace_group_id=m.new_id
from runners_pace_group_mapping m where sp.pace_group_id=m.old_id and m.old_id<>m.new_id;

do $$ begin
  if exists(select 1 from public.schedule_participations sp left join public.pace_groups g on g.pace_group_id=sp.pace_group_id
    where sp.pace_group_id is not null and (g.pace_group_id is null or g.schedule_id is distinct from sp.schedule_id)) then
    raise exception 'EXISTING_PACE_GROUP_SCHEDULE_MISMATCH';
  end if;
end $$;
alter table public.schedule_participations add constraint schedule_participations_pace_group_id_fkey
  foreign key(pace_group_id) references public.pace_groups(pace_group_id) on delete restrict;
notify pgrst,'reload schema';
commit;
