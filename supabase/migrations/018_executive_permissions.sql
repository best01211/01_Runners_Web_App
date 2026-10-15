-- Apply after 017. Executive access and president administration.
begin;
create or replace function public.can_administer(target_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from profiles p where p.user_id=target_user and p.account_status='active' and p.approval_status='approved'
 and (p.role='admin' or (p.role='staff' and p.staff_position='president'))
 and not exists(select 1 from withdrawal_requests w where w.user_id=p.user_id and w.status='pending'));
$$;
revoke all on function public.can_administer(uuid) from public,anon;
grant execute on function public.can_administer(uuid) to authenticated,service_role;


create or replace function public.service_can_access(member_role text,pacer boolean,member_position text)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare setting jsonb; state text;
begin
 select setting_value into setting from system_settings where setting_key='maintenance';
 state:=coalesce(setting->>'status','normal');
 if state='normal' or (member_role='admin' or (member_role='staff' and member_position='president')) then return true; end if;
 if state='maintenance' then return member_role='staff' and member_position='vice_president'; end if;
 if state<>'restricted' then return false; end if;
 if not coalesce((setting->'blocked'->>'access')::boolean,not (setting ? 'blocked')) then return true; end if;
 return (member_role='staff' and coalesce((setting->'allowedAccess'->>'staff')::boolean,true))
   or (coalesce(pacer,false) and coalesce((setting->'allowedAccess'->>'pacer')::boolean,false))
   or (member_role='member' and coalesce((setting->'allowedAccess'->>'member')::boolean,false))
   or (member_role='guest' and coalesce((setting->'allowedAccess'->>'guest')::boolean,false));
end $$;

create or replace function public.service_can_access(member_role text,pacer boolean default false)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.service_can_access(member_role,pacer,(select staff_position::text from profiles where user_id=auth.uid() and role::text=member_role));
$$;
revoke all on function public.service_can_access(text,boolean,text) from public,anon;
grant execute on function public.service_can_access(text,boolean,text) to authenticated,service_role;


create or replace function public.can_read_member()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from profiles p where p.user_id=auth.uid() and p.account_status in ('active','restricted') and p.approval_status='approved' and p.role in ('guest','member','staff','admin')
   and not exists(select 1 from withdrawal_requests w where w.user_id=p.user_id and w.status='pending')
   and public.service_can_access(p.role::text,p.is_pacer,p.staff_position::text));
$$;

create or replace function public.check_schedule_service_access()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare actor profiles;
begin
 select * into actor from profiles where user_id=new.creator_id;
 if actor.user_id is null or actor.account_status<>'active' or actor.approval_status<>'approved' or not public.service_can_access(actor.role::text,actor.is_pacer,actor.staff_position::text) then raise exception 'SERVICE_ACCESS_BLOCKED'; end if;
 perform public.assert_service_feature('scheduleCreation');return new;
end $$;

create or replace function public.manage_member(target_user_id uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare actor profiles; target profiles; changed profiles;
begin
 if not public.can_read_member() then raise exception 'FORBIDDEN'; end if;
 select * into actor from profiles where user_id=auth.uid();
 if actor.user_id is null or actor.role not in ('staff','admin') or actor.account_status is distinct from 'active' or actor.approval_status is distinct from 'approved' then raise exception 'FORBIDDEN'; end if;
 if target_user_id=actor.user_id then raise exception 'SELF_CHANGE'; end if;
 select * into target from profiles where user_id=target_user_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if target.role='admin' and payload ? 'role' and payload->>'role' is distinct from 'admin' then raise exception 'ADMIN_ROLE_PROTECTED'; end if;
 if actor.role<>'admin' and (target.role='admin' or payload->>'role'='admin') then raise exception 'ADMIN_ACCOUNT_PROTECTED'; end if;
 if target.account_status='withdrawn' or target.approval_status<>'approved' then raise exception 'INVALID_MEMBER_STATE'; end if;
 if exists(select 1 from withdrawal_requests where user_id=target_user_id and status='pending') then raise exception 'WITHDRAWAL_PENDING'; end if;
 if exists(select 1 from jsonb_object_keys(payload) k where k not in ('role','staff_position','account_status','ranking_excluded','is_pacer')) or payload='{}'::jsonb then raise exception 'INVALID_PATCH'; end if;
 if not public.can_administer(actor.user_id) and (target.role not in ('guest','member') or payload ? 'account_status' or payload ? 'is_pacer' or (payload ? 'role' and payload->>'role' not in ('guest','member'))) then raise exception 'FORBIDDEN'; end if;
 if payload ? 'role' and (payload->>'role' is null or payload->>'role' not in ('guest','member','staff','admin')) then raise exception 'INVALID_ROLE'; end if;
 if payload ? 'account_status' and (payload->>'account_status' is null or payload->>'account_status' not in ('active','restricted','suspended')) then raise exception 'INVALID_STATUS'; end if;
 if payload ? 'is_pacer' and jsonb_typeof(payload->'is_pacer') is distinct from 'boolean' then raise exception 'INVALID_PATCH'; end if;
 changed:=jsonb_populate_record(target,payload);
 if changed.role='staff' then
  if changed.staff_position is null then changed.staff_position:='staff'; end if;
  if changed.staff_position not in ('staff','president','vice_president') then raise exception 'INVALID_POSITION'; end if;
 else changed.staff_position:=null; end if;
 update profiles set role=changed.role,staff_position=changed.staff_position,account_status=changed.account_status,ranking_excluded=changed.ranking_excluded,is_pacer=changed.is_pacer where user_id=target_user_id;
 insert into member_change_audits(actor_id,target_id,changes) values(actor.user_id,target_user_id,jsonb_build_object('before',jsonb_build_object('role',target.role,'staff_position',target.staff_position,'account_status',target.account_status,'ranking_excluded',target.ranking_excluded,'is_pacer',target.is_pacer),'after',payload));
 return jsonb_build_object('user_id',target_user_id,'role',changed.role,'staff_position',changed.staff_position,'account_status',changed.account_status,'ranking_excluded',changed.ranking_excluded,'is_pacer',changed.is_pacer);
end $$;

create or replace function public.create_season(payload jsonb) returns public.seasons language plpgsql security definer set search_path=public as $$
declare result seasons;
begin
 if not public.can_administer() or not public.can_read_member() then raise exception 'FORBIDDEN'; end if;
 -- Serialize all default-season transitions, including an initially empty table.
 perform pg_advisory_xact_lock(109,9);
 if coalesce((payload->>'isDefault')::boolean,false) then
  if not coalesce((payload->>'isPublic')::boolean,true) or payload->>'status'='hidden' then raise exception 'INVALID_DEFAULT_SEASON'; end if;
  update seasons set is_default=false where is_default;
 end if;
 if length(trim(coalesce(payload->>'name','')))=0 or (payload->>'startsOn')::date>(payload->>'endsOn')::date then raise exception 'INVALID_PERIOD'; end if;
 insert into seasons(name,starts_on,ends_on,status,is_public,is_default,created_by)
 values(trim(payload->>'name'),(payload->>'startsOn')::date,(payload->>'endsOn')::date,coalesce(payload->>'status','scheduled')::runners_season_status,coalesce((payload->>'isPublic')::boolean,true),coalesce((payload->>'isDefault')::boolean,false),auth.uid()) returning * into result;
 return result;
end $$;

create or replace function public.review_withdrawal(target_request_id uuid,decision text) returns uuid language plpgsql security definer set search_path=public as $$
declare actor profiles; req withdrawal_requests; anonymous text;
begin
 select * into actor from profiles where user_id=auth.uid();
 if not public.can_administer(actor.user_id) or not public.can_read_member() then raise exception 'FORBIDDEN'; end if;
 select * into req from withdrawal_requests where request_id=target_request_id for update;
 if req.request_id is null then raise exception 'NOT_FOUND'; end if;
 if req.status='approved' and decision='approve' then return req.user_id; end if;
 if req.status <> 'pending' then raise exception 'ALREADY_REVIEWED'; end if;
 perform 1 from profiles where user_id=req.user_id for update;
 if decision='reject' then
  update profiles set account_status=(jsonb_populate_record(null::profiles,jsonb_build_object('account_status',req.previous_account_status))).account_status where user_id=req.user_id and account_status='restricted';
  update withdrawal_requests set status='rejected',reviewed_by=actor.user_id,reviewed_at=now() where request_id=target_request_id;
 elsif decision='approve' then
  anonymous:='withdrawn-'||req.user_id::text;
  update comments set author_id=null,author_name='탈퇴한 회원' where author_id=req.user_id;
  update profiles set login_id=anonymous,email=anonymous||'@deleted.invalid',name='탈퇴한 회원',nickname=null,phone=null,birth_date=null,profile_image_url=null,role='pending',staff_position=null,account_status='withdrawn',approval_status='cancelled',anonymized_at=now() where user_id=req.user_id;
  update withdrawal_requests set status='approved',reviewed_by=actor.user_id,reviewed_at=now() where request_id=target_request_id;
 else raise exception 'INVALID_DECISION'; end if;
 return req.user_id;
end $$;

create or replace function public.inspect_member_deletion(actor_user_id uuid,target_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor profiles; target profiles; job member_deletion_jobs; ref record; amount bigint; counts jsonb:='{}'; shared jsonb:='{}'; files jsonb;
begin
  select * into actor from profiles where user_id=actor_user_id;
  if not public.can_administer(actor.user_id) then raise exception 'FORBIDDEN'; end if;
  if actor_user_id=target_user_id then raise exception 'SELF_DELETE'; end if;
  select * into job from member_deletion_jobs j where j.target_user_id=inspect_member_deletion.target_user_id;
  select * into target from profiles where user_id=target_user_id;
  if target.user_id is null then
    if job.job_id is null then raise exception 'MEMBER_NOT_FOUND'; end if;
    return jsonb_build_object('jobId',job.job_id,'loginId',job.confirmation_login_id,'status',job.status,'counts',job.counts,'shared','{}'::jsonb,'storageFiles',job.storage_files);
  end if;
  if target.role::text='admin' then raise exception 'ADMIN_DELETE_PROTECTED'; end if;
  for ref in
    select c.conrelid,n.nspname,t.relname,a.attname,a.attnotnull,c.conkey
    from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
    where c.contype='f' and c.confrelid='public.profiles'::regclass and n.nspname='public'
  loop
    if array_length(ref.conkey,1)<>1 then raise exception 'UNSUPPORTED_MEMBER_REFERENCE'; end if;
    execute format('select count(*) from %I.%I where %I=$1',ref.nspname,ref.relname,ref.attname) into amount using target_user_id;
    if ref.attname in ('user_id','author_id','target_user_id','target_id') then
      counts := counts || jsonb_build_object(ref.relname||'.'||ref.attname,amount);
    else
      shared := shared || jsonb_build_object(ref.relname||'.'||ref.attname,amount);
    end if;
  end loop;
  if to_regclass('public.member_change_audits') is not null then
    execute 'select count(*) from public.member_change_audits where target_id=$1 or actor_id=$1' into amount using target_user_id;
    counts := counts || jsonb_build_object('member_change_audits.target_id',amount);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('bucket',o.bucket_id,'name',o.name)),'[]') into files from storage.objects o
  where to_jsonb(o)->>'owner'=target_user_id::text or to_jsonb(o)->>'owner_id'=target_user_id::text
    or (o.bucket_id='01runners-images' and o.name like target_user_id::text||'/%');
  return jsonb_build_object('loginId',target.login_id,'name',target.name,'status','ready','counts',counts,'shared',shared,'storageFiles',files);
end $$;

create or replace function public.prepare_member_deletion(actor_user_id uuid,target_user_id uuid,confirmation_login_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor profiles; target profiles; job member_deletion_jobs; preview jsonb; ref record; nested jsonb; counts jsonb:='{}'; amount bigint; item record;
begin
  -- Serialize admin deletions so reassignment cannot race another deletion.
  perform pg_advisory_xact_lock(110013);
  select * into actor from profiles where user_id=actor_user_id for update;
  if not public.can_administer(actor.user_id) then raise exception 'FORBIDDEN'; end if;
  if actor_user_id=target_user_id then raise exception 'SELF_DELETE'; end if;
  select * into job from member_deletion_jobs j where j.target_user_id=prepare_member_deletion.target_user_id for update;
  if job.job_id is not null then
    if job.status<>'completed' and job.confirmation_login_id is distinct from confirmation_login_id then raise exception 'CONFIRMATION_MISMATCH'; end if;
    return to_jsonb(job);
  end if;
  select * into target from profiles where user_id=target_user_id for update;
  if target.user_id is null then raise exception 'MEMBER_NOT_FOUND'; end if;
  if target.role::text='admin' then raise exception 'ADMIN_DELETE_PROTECTED'; end if;
  if target.login_id is distinct from confirmation_login_id then raise exception 'CONFIRMATION_MISMATCH'; end if;
  preview := public.inspect_member_deletion(actor_user_id,target_user_id);

  for ref in
    select c.conrelid,n.nspname,t.relname,a.attname,a.attnotnull,c.conkey
    from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
    where c.contype='f' and c.confrelid='public.profiles'::regclass and n.nspname='public'
  loop
    if array_length(ref.conkey,1)<>1 then raise exception 'UNSUPPORTED_MEMBER_REFERENCE'; end if;
    if ref.attname in ('user_id','author_id','target_user_id','target_id') then
      nested := public.delete_owned_member_rows(ref.conrelid,format('%I=%L::uuid',ref.attname,target_user_id));
      for item in select key,value from jsonb_each(nested) loop
        counts := jsonb_set(counts,array[item.key],to_jsonb(coalesce((counts->>item.key)::bigint,0)+(item.value::text)::bigint));
      end loop;
    elsif ref.attname in ('creator_id','created_by','updated_by','reviewed_by','approved_by','rejected_by','cancelled_by','deleted_by','recorded_by','changed_by','started_by','closed_by','finalized_by','actor_id') then
      execute format('update %I.%I set %I=$1 where %I=$2',ref.nspname,ref.relname,ref.attname,ref.attname)
      using case when ref.attnotnull then actor_user_id else null::uuid end,target_user_id;
    else
      execute format('select count(*) from %I.%I where %I=$1',ref.nspname,ref.relname,ref.attname) into amount using target_user_id;
      if amount>0 then raise exception 'UNSUPPORTED_MEMBER_REFERENCE: %.%',ref.relname,ref.attname; end if;
    end if;
  end loop;
  -- The role-change audit intentionally has UUIDs without foreign keys.
  if to_regclass('public.member_change_audits') is not null then
    execute 'delete from public.member_change_audits where target_id=$1 or actor_id=$1' using target_user_id;
    get diagnostics amount=row_count;
    counts := counts || jsonb_build_object('public.member_change_audits',amount);
  end if;
  delete from profiles where user_id=target_user_id;
  counts := counts || '{"public.profiles":1}'::jsonb;
  insert into member_deletion_jobs(target_user_id,actor_id,confirmation_login_id,counts,storage_files)
    values(target_user_id,actor_user_id,confirmation_login_id,counts,preview->'storageFiles') returning * into job;
  return to_jsonb(job);
end $$;

create or replace function public.is_tracking_admin()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.can_administer() and public.can_read_member();
$$;
notify pgrst, 'reload schema';
commit;
