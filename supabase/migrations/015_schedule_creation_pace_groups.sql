-- Apply after 014. Per-schedule group overrides are saved atomically at creation.
begin;
alter table public.schedules add column if not exists creation_pace_groups jsonb;
alter table public.schedules drop constraint if exists schedules_creation_pace_groups_valid;
alter table public.schedules add constraint schedules_creation_pace_groups_valid
  check(creation_pace_groups is null or public.valid_template_pace_groups(creation_pace_groups));
create or replace function public.copy_regular_template_pace_groups()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare groups jsonb;
begin
  if new.creation_pace_groups is not null then
    groups:=new.creation_pace_groups;
  elsif new.schedule_type::text='regular' and new.regular_template_id is not null then
    select t.pace_groups into groups from regular_run_templates t where t.template_id=new.regular_template_id and t.deleted_at is null for share;
    if not found then raise exception 'REGULAR_TEMPLATE_UNAVAILABLE'; end if;
  else
    groups:='[]';
  end if;
  insert into pace_groups(schedule_id,pace_seconds,distance_km,created_by)
  select new.schedule_id,(item->>'paceSeconds')::numeric::integer,(item->>'distanceKm')::numeric::integer,new.creator_id
  from jsonb_array_elements(groups) item;
  return new;
end $$;
revoke all on function public.copy_regular_template_pace_groups() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
