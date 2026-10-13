-- Apply after 010. No existing users or records are deleted by this migration.
begin;
create table if not exists public.member_deletion_jobs (
  job_id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null unique,
  actor_id uuid,
  confirmation_login_id text,
  status text not null default 'database_cleaned' check(status in ('database_cleaned','storage_cleaned','completed')),
  counts jsonb not null default '{}',
  storage_files jsonb not null default '[]',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.member_deletion_jobs enable row level security;
revoke all on public.member_deletion_jobs from public, anon, authenticated;
grant all on public.member_deletion_jobs to service_role;

-- Internal helper: delete owned rows, preserve nullable links (including replies),
-- and remove only known dependent personal-record tables. Unknown dependencies
-- fail the entire transaction instead of silently deleting unrelated records.
create or replace function public.delete_owned_member_rows(target_table oid, row_filter text, recursion_depth integer default 0)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare fk record; table_name text; changes jsonb := '{}'; removed bigint; nested jsonb; child_filter text; item record;
begin
  if recursion_depth > 8 then raise exception 'DELETE_DEPENDENCY_TOO_DEEP'; end if;
  select format('%I.%I',n.nspname,c.relname) into table_name from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.oid=target_table and n.nspname='public';
  if table_name is null then raise exception 'UNSUPPORTED_DELETE_TABLE'; end if;
  for fk in
    select con.conrelid,con.conkey,con.confkey,n.nspname,c.relname,a.attname,a.attnotnull,p.attname parent_column
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=con.conrelid and a.attnum=con.conkey[1]
    join pg_attribute p on p.attrelid=con.confrelid and p.attnum=con.confkey[1]
    where con.contype='f' and con.confrelid=target_table
  loop
    if fk.nspname <> 'public' or array_length(fk.conkey,1) <> 1 then raise exception 'UNSUPPORTED_DELETE_DEPENDENCY'; end if;
    child_filter := format('%I in (select %I from %s where %s)',fk.attname,fk.parent_column,table_name,row_filter);
    if fk.relname in ('tracking_checkpoints','runner_checkpoints','tracking_checkpoint_audit','attendances','attendance_records','attendance_record_history','attendance_record_audits') then
      nested := public.delete_owned_member_rows(fk.conrelid,child_filter,recursion_depth+1);
      for item in select key,value from jsonb_each(nested) loop
        changes := jsonb_set(changes,array[item.key],to_jsonb(coalesce((changes->>item.key)::bigint,0)+(item.value::text)::bigint));
      end loop;
    elsif not fk.attnotnull then
      execute format('update %I.%I set %I=null where %s',fk.nspname,fk.relname,fk.attname,child_filter);
    else
      execute format('select count(*) from %I.%I where %s',fk.nspname,fk.relname,child_filter) into removed;
      if removed > 0 then raise exception 'UNSUPPORTED_DELETE_DEPENDENCY: %.%',fk.relname,fk.attname; end if;
    end if;
  end loop;
  execute format('delete from %s where %s',table_name,row_filter);
  get diagnostics removed = row_count;
  changes := jsonb_set(changes,array[table_name],to_jsonb(coalesce((changes->>table_name)::bigint,0)+removed));
  return changes;
end $$;
revoke all on function public.delete_owned_member_rows(oid,text,integer) from public,anon,authenticated,service_role;

create or replace function public.inspect_member_deletion(actor_user_id uuid,target_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor profiles; target profiles; job member_deletion_jobs; ref record; amount bigint; counts jsonb:='{}'; shared jsonb:='{}'; files jsonb;
begin
  select * into actor from profiles where user_id=actor_user_id;
  if actor.user_id is null or actor.role::text <> 'admin' or actor.account_status::text <> 'active' or actor.approval_status::text <> 'approved' then raise exception 'FORBIDDEN'; end if;
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
  if actor.user_id is null or actor.role::text <> 'admin' or actor.account_status::text <> 'active' or actor.approval_status::text <> 'approved' then raise exception 'FORBIDDEN'; end if;
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
revoke all on function public.inspect_member_deletion(uuid,uuid),public.prepare_member_deletion(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.inspect_member_deletion(uuid,uuid),public.prepare_member_deletion(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
