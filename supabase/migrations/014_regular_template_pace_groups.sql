-- Apply after 013. Template groups are copied atomically only on schedule creation.
begin;
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
    if pace<=0 or pace%30<>0 or distance<5 or distance%5<>0 then return false; end if;
    key:=pace::text||':'||distance::text;
    if key=any(seen) then return false; end if;
    seen:=array_append(seen,key);
  end loop;
  return true;
exception when others then return false;
end $$;
alter table public.regular_run_templates add column if not exists pace_groups jsonb not null default '[]';
alter table public.regular_run_templates drop constraint if exists regular_templates_pace_groups_valid;
alter table public.regular_run_templates add constraint regular_templates_pace_groups_valid check(public.valid_template_pace_groups(pace_groups));
create or replace function public.copy_regular_template_pace_groups()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare groups jsonb;
begin
  if new.schedule_type::text='regular' and new.regular_template_id is not null then
    select t.pace_groups into groups from regular_run_templates t where t.template_id=new.regular_template_id and t.deleted_at is null for share;
    if not found then raise exception 'REGULAR_TEMPLATE_UNAVAILABLE'; end if;
    insert into pace_groups(schedule_id,pace_seconds,distance_km,created_by)
    select new.schedule_id,(item->>'paceSeconds')::numeric::integer,(item->>'distanceKm')::numeric::integer,new.creator_id
    from jsonb_array_elements(groups) item;
  end if;
  return new;
end $$;
revoke all on function public.copy_regular_template_pace_groups() from public,anon,authenticated;
drop trigger if exists schedules_copy_template_pace_groups on public.schedules;
create trigger schedules_copy_template_pace_groups after insert on public.schedules for each row execute function public.copy_regular_template_pace_groups();
notify pgrst,'reload schema';
commit;
