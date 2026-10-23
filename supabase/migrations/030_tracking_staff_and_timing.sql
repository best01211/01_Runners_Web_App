-- Staff may register entries only. Course/group/timing administration stays unchanged.
begin;
create function public.can_register_tracking_entry() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.can_read_member() and not public.service_feature_blocked('liveTracking') and exists(select 1 from public.profiles where user_id=auth.uid() and role in ('admin','staff') and account_status='active' and approval_status='approved');
$$;
alter function public.write_tracking_race(uuid,jsonb) rename to write_tracking_race_manager;
revoke all on function public.write_tracking_race_manager(uuid,jsonb) from public,anon,authenticated;
create function public.write_tracking_race(target_race uuid,payload jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare root uuid; target_user uuid; gid uuid; group_pace integer; existing public.tracking_race_entries%rowtype; starts timestamptz;
begin
 if payload->>'action' is distinct from 'entry' then perform public.write_tracking_race_manager(target_race,payload);return;end if;
 if not public.can_register_tracking_entry() then raise exception 'RACE_FORBIDDEN';end if;
 select coalesce(parent_race_id,race_id),start_at into root,starts from public.tracking_races where race_id=target_race and status='active';
 if root is null then raise exception 'RACE_NOT_FOUND';end if;
 perform 1 from public.tracking_races where race_id=root and status='active' for update;
 if not found then raise exception 'RACE_NOT_FOUND';end if;
 perform 1 from public.tracking_races where race_id=target_race and status='active' for update;
 if not found then raise exception 'RACE_NOT_FOUND';end if;
 select start_at into starts from public.tracking_races where race_id=target_race;
 target_user:=(payload->>'userId')::uuid;gid:=(payload->>'groupId')::uuid;
 if not exists(select 1 from public.profiles p where p.user_id=target_user and p.account_status='active' and p.approval_status='approved' and (p.role<>'admin' or exists(select 1 from public.profiles a where a.user_id=auth.uid() and a.role='admin')) and not exists(select 1 from public.withdrawal_requests w where w.user_id=p.user_id and w.status='pending')) then raise exception 'NOT_PARTICIPANT';end if;
 select pace_seconds into group_pace from public.tracking_pace_groups where race_id=target_race and group_id=gid;
 if group_pace is null then raise exception 'GROUP_REQUIRED';end if;
 if exists(select 1 from public.tracking_race_entries e join public.tracking_races r using(race_id) where e.user_id=target_user and e.race_id<>target_race and coalesce(r.parent_race_id,r.race_id)=root and r.status='active') then raise exception 'EVENT_ENTRY_EXISTS';end if;
 select * into existing from public.tracking_race_entries where race_id=target_race and user_id=target_user;
 if existing.entry_id is not null and (now()>=starts or exists(select 1 from public.tracking_checkpoints where entry_id=existing.entry_id)) then raise exception 'ENTRY_LOCKED';end if;
 if existing.entry_id is null and (select count(*) from public.tracking_race_entries where race_id=target_race)>=500 then raise exception 'ENTRY_LIMIT';end if;
 insert into public.tracking_race_entries(race_id,user_id,bib,group_id,target_pace_seconds) values(target_race,target_user,payload->>'bib',gid,group_pace)
 on conflict(race_id,user_id) do update set bib=excluded.bib,group_id=excluded.group_id,target_pace_seconds=excluded.target_pace_seconds,updated_at=now();
end;$$;
revoke all on function public.can_register_tracking_entry(),public.write_tracking_race(uuid,jsonb) from public,anon;
grant execute on function public.can_register_tracking_entry(),public.write_tracking_race(uuid,jsonb) to authenticated;

alter table public.tracking_races add column timing_course_code text not null default '' check(length(timing_course_code)<=40);
create table public.tracking_timing_sources(
 race_id uuid primary key references public.tracking_races(race_id) on delete restrict,
 source_url text not null check(source_url ~ '^https://myresult[.]co[.]kr/[1-9][0-9]{0,8}$'),
 enabled boolean not null default false,
 updated_by uuid not null references public.profiles(user_id),
 version uuid not null default gen_random_uuid()
);
create table public.tracking_timing_sync(
 race_id uuid primary key references public.tracking_races(race_id) on delete restrict,
 lease_token uuid,lease_until timestamptz,next_at timestamptz not null default now(),cursor_id uuid,
 last_synced_at timestamptz,status text not null default 'ready',message text not null default ''
);
alter table public.tracking_timing_sources enable row level security;
alter table public.tracking_timing_sync enable row level security;
create policy tracking_sources_read on public.tracking_timing_sources for select to authenticated using(public.can_read_tracking_race(race_id));
-- Sync internals and lease tokens are server-only.
revoke all on public.tracking_timing_sources,public.tracking_timing_sync from public,anon,authenticated;
grant select on public.tracking_timing_sources to authenticated;
grant select,insert,update on public.tracking_timing_sources,public.tracking_timing_sync to service_role;
alter table public.tracking_checkpoints drop constraint tracking_checkpoints_source_check;
alter table public.tracking_checkpoints add constraint tracking_checkpoints_source_check check(source in ('manual','myresult'));
create function public.configure_tracking_source(target_race uuid,url text,code text,active boolean) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare root uuid;current_url text;current_code text;
begin
 if not public.is_tracking_admin() then raise exception 'RACE_FORBIDDEN';end if;
 if url is null or url !~ '^https://myresult[.]co[.]kr/[1-9][0-9]{0,8}$' or code is null or code !~ '^[A-Za-z0-9_-]{1,40}$' or active is null then raise exception 'INVALID_SOURCE';end if;
 select coalesce(parent_race_id,race_id),timing_course_code into root,current_code from public.tracking_races where race_id=target_race and status='active';
 if root is null then raise exception 'RACE_NOT_FOUND';end if;
 perform 1 from public.tracking_races where race_id=root and status='active' for update;
 if not found then raise exception 'RACE_NOT_FOUND';end if;
 perform 1 from public.tracking_races where race_id=target_race and status='active' for update;
 if not found then raise exception 'RACE_NOT_FOUND';end if;
 select timing_course_code into current_code from public.tracking_races where race_id=target_race;
 select source_url into current_url from public.tracking_timing_sources where race_id=root;
 if current_url is distinct from url and exists(select 1 from public.tracking_checkpoints c join public.tracking_race_entries e using(entry_id) join public.tracking_races r using(race_id) where coalesce(r.parent_race_id,r.race_id)=root and c.source='myresult') then raise exception 'SOURCE_LOCKED';end if;
 if current_code is distinct from code and exists(select 1 from public.tracking_checkpoints c join public.tracking_race_entries e using(entry_id) where e.race_id=target_race and c.source='myresult') then raise exception 'SOURCE_LOCKED';end if;
 insert into public.tracking_timing_sources(race_id,source_url,enabled,updated_by) values(root,url,active,auth.uid())
 on conflict(race_id) do update set source_url=excluded.source_url,enabled=excluded.enabled,updated_by=excluded.updated_by,version=gen_random_uuid();
 update public.tracking_races set timing_course_code=code where race_id=target_race;
 update public.tracking_timing_sync set lease_token=null,lease_until=null,cursor_id=null,next_at=now() where race_id in(select race_id from public.tracking_races where coalesce(parent_race_id,race_id)=root);
end;$$;
revoke all on function public.configure_tracking_source(uuid,text,text,boolean) from public,anon;
grant execute on function public.configure_tracking_source(uuid,text,text,boolean) to authenticated;

-- Serialize provider polls across Vercel instances/viewers. Cursor bounds provider load.
create function public.claim_tracking_sync(target_race uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.tracking_races%rowtype;s public.tracking_timing_sources%rowtype;sync public.tracking_timing_sync%rowtype;token uuid:=gen_random_uuid();
begin
 select * into c from public.tracking_races where race_id=target_race and status='active';
 perform 1 from public.tracking_races where race_id=coalesce(c.parent_race_id,c.race_id) and status='active' for update;
 if not found then raise exception 'RACE_NOT_FOUND';end if;
 perform 1 from public.tracking_races where race_id=target_race and status='active' for update;
 select * into c from public.tracking_races where race_id=target_race and status='active';
 select * into s from public.tracking_timing_sources where race_id=coalesce(c.parent_race_id,c.race_id) and enabled;
 if c.race_id is null or s.race_id is null or c.timing_course_code='' or not exists(select 1 from public.tracking_races where race_id=s.race_id and status='active') then return null;end if;
 insert into public.tracking_timing_sync(race_id) values(target_race) on conflict do nothing;
 select * into sync from public.tracking_timing_sync where race_id=target_race for update;
 if sync.next_at>now() or sync.lease_until>now() then return null;end if;
 update public.tracking_timing_sync set lease_token=token,lease_until=now()+interval '90 seconds',next_at=now()+interval '30 seconds' where race_id=target_race;
 return jsonb_build_object('token',token,'version',s.version,'url',s.source_url,'code',c.timing_course_code,'cursor',sync.cursor_id,'recordedBy',s.updated_by);
end;$$;
create function public.apply_tracking_sync(target_race uuid,token uuid,source_version uuid,records jsonb,next_cursor uuid,sync_status text,sync_message text) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
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
  select * into e from public.tracking_race_entries where race_id=target_race and entry_id=(r->>'entryId')::uuid and status='running';
  if e.entry_id is null or not exists(select 1 from public.profiles where user_id=e.user_id and account_status='active' and approval_status='approved') or exists(select 1 from public.withdrawal_requests where user_id=e.user_id and status='pending') then continue;end if;
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
revoke all on function public.claim_tracking_sync(uuid),public.apply_tracking_sync(uuid,uuid,uuid,jsonb,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_tracking_sync(uuid),public.apply_tracking_sync(uuid,uuid,uuid,jsonb,uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
