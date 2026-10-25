-- Prioritize newly registered runners and preserve per-runner collection diagnostics.
begin;
alter table public.tracking_race_entries add column if not exists timing_checked_at timestamptz;
alter table public.tracking_race_entries add column if not exists timing_status text;
alter table public.tracking_race_entries add column if not exists timing_error_code text;
alter table public.tracking_race_entries add column if not exists timing_message text;
alter table public.tracking_race_entries add column if not exists provider_course_code text;
update public.tracking_race_entries e set timing_checked_at=p.checked
 from (select entry_id,max(received_at) checked from public.tracking_checkpoints group by entry_id) p
 where e.entry_id=p.entry_id and e.timing_checked_at is null;
create index if not exists tracking_entry_sync_queue on public.tracking_race_entries(race_id,timing_checked_at asc nulls first,entry_id) where deleted_at is null and status='running';
drop function if exists public.apply_tracking_sync(uuid,uuid,uuid,jsonb,uuid,text,text);
create or replace function public.apply_tracking_sync(target_race uuid,token uuid,source_version uuid,records jsonb,next_cursor uuid,sync_status text,sync_message text,entry_results jsonb default '[]'::jsonb) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.tracking_races%rowtype;s public.tracking_timing_sources%rowtype;r jsonb;d double precision;t timestamptz;e public.tracking_race_entries%rowtype;inserted integer:=0;n integer;
begin
 select * into c from public.tracking_races where race_id=target_race and status='active';
 perform 1 from public.tracking_races where race_id=coalesce(c.parent_race_id,c.race_id) and status='active' for update;
 if not found then raise exception 'RACE_NOT_FOUND';end if;
 perform 1 from public.tracking_races where race_id=target_race and status='active' for update;
 select * into c from public.tracking_races where race_id=target_race and status='active';
 select * into s from public.tracking_timing_sources where race_id=coalesce(c.parent_race_id,c.race_id) and enabled;
 if s.version is distinct from source_version or s.race_id is null then raise exception 'STALE_SOURCE';end if;
 perform 1 from public.tracking_timing_sync where race_id=target_race and lease_token=token and lease_until>now() for update;
 if not found then raise exception 'STALE_LEASE';end if;
 if jsonb_typeof(records) is distinct from 'array' or jsonb_array_length(records)>4000 then raise exception 'INVALID_RECORDS';end if;

 if jsonb_typeof(entry_results) is distinct from 'array' or jsonb_array_length(entry_results)>40 then raise exception 'INVALID_ENTRY_RESULTS';end if;
 for r in select value from jsonb_array_elements(entry_results) loop
  if jsonb_typeof(r) is distinct from 'object' or jsonb_typeof(r->'status') is distinct from 'string' or r->>'status' not in ('synced','waiting','error') then raise exception 'INVALID_ENTRY_RESULTS';end if;
  update public.tracking_race_entries set timing_checked_at=now(),timing_status=r->>'status',
   timing_message=left(coalesce(r->>'message',''),200),timing_error_code=case when r->>'status'='error' then left(r->>'code',50) else null end,
   provider_course_code=case when r->>'providerCourseCode' ~ '^[A-Za-z0-9_-]{1,40}$' then r->>'providerCourseCode' else null end
   where race_id=target_race and entry_id=(r->>'entryId')::uuid and deleted_at is null and status='running';
 end loop;
 for r in select value from jsonb_array_elements(records) loop
  select * into e from public.tracking_race_entries where race_id=target_race and entry_id=(r->>'entryId')::uuid and status='running' and deleted_at is null;
  if e.entry_id is null then continue;end if;
  if e.user_id is not null and (not exists(select 1 from public.profiles where user_id=e.user_id and account_status='active' and approval_status='approved') or exists(select 1 from public.withdrawal_requests where user_id=e.user_id and status='pending')) then continue;end if;
  d:=(r->>'distanceMeters')::double precision;t:=(r->>'passedAt')::timestamptz;
  if d is null or d not between 0 and c.distance_meters or t is null or t<c.start_at or t>now() then continue;end if;
  if exists(select 1 from public.tracking_checkpoints where entry_id=e.entry_id and distance_meters=d) then continue;end if;
  if (select count(*) from public.tracking_checkpoints where entry_id=e.entry_id)>=100 then continue;end if;
  -- Delayed/earlier observations are allowed; chronology and plausible pace are checked on both sides.
  if exists(select 1 from public.tracking_checkpoints p where p.entry_id=e.entry_id and ((p.distance_meters<d and (p.passed_at>=t or extract(epoch from t-p.passed_at)/(d-p.distance_meters)*1000 not between 120 and 1200)) or (p.distance_meters>d and (p.passed_at<=t or extract(epoch from p.passed_at-t)/(p.distance_meters-d)*1000 not between 120 and 1200)))) then continue;end if;
  insert into public.tracking_checkpoints(entry_id,name,distance_meters,passed_at,source,recorded_by) values(e.entry_id,left(r->>'name',40),d,t,'myresult',s.updated_by) on conflict(entry_id,distance_meters) do nothing;
  get diagnostics n=row_count;inserted:=inserted+n;
 end loop;
 update public.tracking_timing_sync set lease_token=null,lease_until=null,cursor_id=next_cursor,next_at=case when sync_status in ('rate-limit','auth-required') then now()+interval '5 minutes' else next_at end,last_synced_at=case when sync_status in ('synced','partial') then now() else last_synced_at end,status=left(sync_status,30),message=left(sync_message,200) where race_id=target_race;
 return inserted;
end;$$;
revoke all on function public.apply_tracking_sync(uuid,uuid,uuid,jsonb,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.apply_tracking_sync(uuid,uuid,uuid,jsonb,uuid,text,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
