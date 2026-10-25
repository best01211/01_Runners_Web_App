begin;
alter table public.tracking_race_entries add column if not exists deleted_at timestamptz;
alter table public.tracking_race_entries add column if not exists moved_to_entry_id uuid references public.tracking_race_entries(entry_id);
alter table public.tracking_race_entries drop constraint if exists tracking_race_entries_race_id_bib_key;
alter table public.tracking_race_entries drop constraint if exists tracking_race_entries_race_id_user_id_key;
create unique index if not exists tracking_active_bib on public.tracking_race_entries(race_id,bib) where deleted_at is null;
create unique index if not exists tracking_active_member on public.tracking_race_entries(race_id,user_id) where deleted_at is null;
alter table public.tracking_timing_sync add column if not exists last_attempt_at timestamptz;
update public.tracking_timing_sync set last_attempt_at=last_synced_at where last_attempt_at is null;
create or replace function public.write_tracking_race(target_race uuid,payload jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare root uuid; starts timestamptz; gid uuid; group_pace integer; target_user uuid;
 runner text; target_entry uuid; destination uuid; new_entry uuid; existing public.tracking_race_entries%rowtype;
begin

 if payload->>'action' not in ('entry','entry-delete','entry-move','group') then
  if payload->>'action' in ('checkpoint','status') and not exists(select 1 from public.tracking_race_entries where race_id=target_race and entry_id=(payload->>'entryId')::uuid and deleted_at is null) then raise exception 'ENTRY_NOT_FOUND';end if;
  perform public.write_tracking_race_manager(target_race,payload);return;
 end if;
 if not public.can_register_tracking_entry() then raise exception 'RACE_FORBIDDEN';end if;
 select coalesce(parent_race_id,race_id) into root from public.tracking_races where race_id=target_race and status='active';
 if root is null then raise exception 'RACE_NOT_FOUND';end if;
 perform 1 from public.tracking_races where race_id=root and status='active' for update;
 if not found then raise exception 'RACE_NOT_FOUND';end if;
 select start_at into starts from public.tracking_races where race_id=target_race and status='active' for update;
 if not found then raise exception 'RACE_NOT_FOUND';end if;

 if payload->>'action'='group' then
  if not public.is_tracking_admin() then raise exception 'RACE_FORBIDDEN';end if;
  destination:=coalesce((payload->>'courseId')::uuid,target_race);
  if not exists(select 1 from public.tracking_races where race_id=destination and coalesce(parent_race_id,race_id)=root and status='active') then raise exception 'INVALID_COURSE';end if;
  perform public.write_tracking_race_manager(destination,payload);return;
 end if;
 if payload->>'action' in ('entry-delete','entry-move') then
  select * into existing from public.tracking_race_entries where race_id=target_race and entry_id=(payload->>'entryId')::uuid and deleted_at is null for update;
  if not found then raise exception 'ENTRY_NOT_FOUND';end if;
  if payload->>'action'='entry-delete' then
   update public.tracking_race_entries set deleted_at=now(),updated_at=now() where entry_id=existing.entry_id;return;
  end if;
  destination:=(payload->>'courseId')::uuid;
  if destination=target_race or not exists(select 1 from public.tracking_races where race_id=destination and coalesce(parent_race_id,race_id)=root and status='active') then raise exception 'INVALID_COURSE';end if;
  perform 1 from public.tracking_races where race_id=destination for update;
  if (select count(*) from public.tracking_race_entries where race_id=destination and deleted_at is null)>=500 then raise exception 'ENTRY_LIMIT';end if;
  gid:=(payload->>'groupId')::uuid;
  group_pace:=null;
  if gid is not null then
   select pace_seconds into group_pace from public.tracking_pace_groups where race_id=destination and group_id=gid;
   if group_pace is null then raise exception 'GROUP_REQUIRED';end if;
  end if;
  update public.tracking_race_entries set deleted_at=now(),updated_at=now() where entry_id=existing.entry_id;
  insert into public.tracking_race_entries(race_id,user_id,runner_name,bib,group_id,target_pace_seconds)
   values(destination,existing.user_id,existing.runner_name,existing.bib,gid,group_pace) returning entry_id into new_entry;
  update public.tracking_race_entries set moved_to_entry_id=new_entry where entry_id=existing.entry_id;return;
 end if;
 if payload ? 'runnerName' and not (payload ? 'userId') then
  if jsonb_typeof(payload->'runnerName') is distinct from 'string' then raise exception 'INVALID_RUNNER_NAME';end if;
  runner:=trim(payload->>'runnerName');
 else
  -- Compatibility for older clients; new forms never select a member account.
  target_user:=(payload->>'userId')::uuid;
  select trim(p.name) into runner from public.profiles p where p.user_id=target_user
   and p.account_status='active' and p.approval_status='approved'
   and (p.role<>'admin' or exists(select 1 from public.profiles a where a.user_id=auth.uid() and a.role='admin'))
   and not exists(select 1 from public.withdrawal_requests w where w.user_id=p.user_id and w.status='pending');
  if not found then raise exception 'NOT_PARTICIPANT';end if;
 end if;
 if runner is null or length(runner) not between 1 and 50 or runner ~ '[[:cntrl:]]' then raise exception 'INVALID_RUNNER_NAME';end if;
 gid:=(payload->>'groupId')::uuid;
 if gid is not null then
  select pace_seconds into group_pace from public.tracking_pace_groups where race_id=target_race and group_id=gid;
  if group_pace is null then raise exception 'GROUP_REQUIRED';end if;
 end if;
 if payload->>'bib' is null or (payload->>'bib') !~ '^[A-Za-z0-9-]{1,20}$' then raise exception 'INVALID_BIB';end if;
 target_entry:=(payload->>'entryId')::uuid;
 if target_entry is not null then
  select * into existing from public.tracking_race_entries where race_id=target_race and entry_id=target_entry and deleted_at is null;
  if not found then raise exception 'ENTRY_NOT_FOUND';end if;
 elsif target_user is not null then
  select * into existing from public.tracking_race_entries where race_id=target_race and user_id=target_user and deleted_at is null;
 end if;
 if existing.entry_id is not null and exists(select 1 from public.tracking_checkpoints where entry_id=existing.entry_id) then raise exception 'ENTRY_LOCKED';end if;
 if target_user is not null and exists(select 1 from public.tracking_race_entries e join public.tracking_races r using(race_id) where e.deleted_at is null and e.user_id=target_user and e.race_id<>target_race and coalesce(r.parent_race_id,r.race_id)=root and r.status='active') then raise exception 'EVENT_ENTRY_EXISTS';end if;
 if existing.entry_id is null then
  if (select count(*) from public.tracking_race_entries where race_id=target_race and deleted_at is null)>=500 then raise exception 'ENTRY_LIMIT';end if;
  insert into public.tracking_race_entries(race_id,user_id,runner_name,bib,group_id,target_pace_seconds)
   values(target_race,target_user,runner,payload->>'bib',gid,group_pace);
 else
  update public.tracking_race_entries set runner_name=runner,bib=payload->>'bib',group_id=gid,target_pace_seconds=group_pace,updated_at=now() where entry_id=existing.entry_id;
 end if;
end;$$;
create or replace function public.can_read_tracking_entry(target_entry uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.tracking_race_entries e where e.entry_id=target_entry and e.deleted_at is null
  and public.can_read_tracking_race(e.race_id)
  and (e.user_id is null or exists(select 1 from public.profiles p where p.user_id=e.user_id and p.account_status='active' and p.approval_status='approved'
   and not exists(select 1 from public.withdrawal_requests w where w.user_id=p.user_id and w.status='pending'))));
$$;
create or replace function public.apply_tracking_sync(target_race uuid,token uuid,source_version uuid,records jsonb,next_cursor uuid,sync_status text,sync_message text) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
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
 update public.tracking_timing_sync set lease_token=null,lease_until=null,cursor_id=next_cursor,next_at=case when sync_status in ('rate-limit','auth-required') then now()+interval '5 minutes' else next_at end,last_synced_at=case when sync_status='synced' then now() else last_synced_at end,status=left(sync_status,30),message=left(sync_message,200) where race_id=target_race;
 return inserted;
end;$$;

drop function if exists public.claim_tracking_sync(uuid);
create or replace function public.claim_tracking_sync(target_race uuid,manual_refresh boolean default false) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.tracking_races%rowtype;s public.tracking_timing_sources%rowtype;sync public.tracking_timing_sync%rowtype;token uuid:=gen_random_uuid();
begin
 select * into c from public.tracking_races where race_id=target_race and status='active';
 perform 1 from public.tracking_races where race_id=coalesce(c.parent_race_id,c.race_id) and status='active' for update;
 if not found then raise exception 'RACE_NOT_FOUND';end if;
 perform 1 from public.tracking_races where race_id=target_race and status='active' for update;
 select * into c from public.tracking_races where race_id=target_race and status='active';
 select * into s from public.tracking_timing_sources where race_id=coalesce(c.parent_race_id,c.race_id) and enabled;
 if c.race_id is null or c.start_at>now() or s.race_id is null or c.timing_course_code='' or not exists(select 1 from public.tracking_races where race_id=s.race_id and status='active') then return null;end if;
 insert into public.tracking_timing_sync(race_id) values(target_race) on conflict do nothing;
 select * into sync from public.tracking_timing_sync where race_id=target_race for update;
 if sync.lease_until>now() or sync.last_attempt_at>now()-interval '1 minute' then return null;end if;
 if sync.next_at>now() and (not manual_refresh or sync.status in ('rate-limit','auth-required')) then return null;end if;
 update public.tracking_timing_sync set lease_token=token,lease_until=now()+interval '90 seconds',last_attempt_at=now(),next_at=c.start_at+(floor(extract(epoch from now()-c.start_at)/180)+1)*interval '3 minutes' where race_id=target_race;
 return jsonb_build_object('token',token,'version',s.version,'url',s.source_url,'code',c.timing_course_code,'cursor',sync.cursor_id,'recordedBy',s.updated_by);
end;$$;
revoke all on function public.claim_tracking_sync(uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_tracking_sync(uuid,boolean) to service_role;
notify pgrst,'reload schema';
commit;
