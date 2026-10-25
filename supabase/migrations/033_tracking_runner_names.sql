-- Keep member identity linked by UUID, and persist the member's real name.
-- Some deployed databases already have a required runner_name column.
begin;
alter table public.tracking_race_entries add column if not exists runner_name text;
update public.tracking_race_entries e set runner_name=trim(p.name)
 from public.profiles p where p.user_id=e.user_id and nullif(trim(e.runner_name),'') is null;

create or replace function public.write_tracking_race(target_race uuid,payload jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare root uuid; target_user uuid; gid uuid; group_pace integer; existing public.tracking_race_entries%rowtype; starts timestamptz; member_name text;
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
 select trim(p.name) into member_name from public.profiles p
  where p.user_id=target_user and p.account_status='active' and p.approval_status='approved'
   and (p.role<>'admin' or exists(select 1 from public.profiles a where a.user_id=auth.uid() and a.role='admin'))
   and not exists(select 1 from public.withdrawal_requests w where w.user_id=p.user_id and w.status='pending');
 if not found then raise exception 'NOT_PARTICIPANT';end if;
 if nullif(member_name,'') is null then raise exception 'INVALID_RUNNER_NAME';end if;
 select pace_seconds into group_pace from public.tracking_pace_groups where race_id=target_race and group_id=gid;
 if group_pace is null then raise exception 'GROUP_REQUIRED';end if;
 if exists(select 1 from public.tracking_race_entries e join public.tracking_races r using(race_id) where e.user_id=target_user and e.race_id<>target_race and coalesce(r.parent_race_id,r.race_id)=root and r.status='active') then raise exception 'EVENT_ENTRY_EXISTS';end if;
 select * into existing from public.tracking_race_entries where race_id=target_race and user_id=target_user;
 if existing.entry_id is not null and (now()>=starts or exists(select 1 from public.tracking_checkpoints where entry_id=existing.entry_id)) then raise exception 'ENTRY_LOCKED';end if;
 if existing.entry_id is null and (select count(*) from public.tracking_race_entries where race_id=target_race)>=500 then raise exception 'ENTRY_LIMIT';end if;
 insert into public.tracking_race_entries(race_id,user_id,runner_name,bib,group_id,target_pace_seconds)
 values(target_race,target_user,member_name,payload->>'bib',gid,group_pace)
 on conflict(race_id,user_id) do update set runner_name=excluded.runner_name,bib=excluded.bib,group_id=excluded.group_id,target_pace_seconds=excluded.target_pace_seconds,updated_at=now();
end;$$;
revoke all on function public.write_tracking_race(uuid,jsonb) from public,anon;
grant execute on function public.write_tracking_race(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
