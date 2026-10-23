-- Preserve administrator identity while operating with ordinary staff privileges.
-- Existing RLS policies are unchanged: profiles.role is the effective DB role.
begin;
alter table public.profiles add column admin_account boolean not null default false;
alter table public.profiles add column admin_mode_normal boolean not null default false;
update public.profiles set admin_account=true where role='admin';
create or replace function public.protect_administrator_role()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='INSERT' then
  new.admin_account:=new.role::text='admin';new.admin_mode_normal:=false;return new;
 end if;
 if old.admin_account or old.role::text='admin' then
  if new.admin_account is distinct from true then raise exception 'ADMIN_ROLE_PROTECTED';end if;
  if new.admin_mode_normal is distinct from old.admin_mode_normal then
   if auth.uid() is distinct from old.user_id or old.account_status::text<>'active' or old.approval_status::text<>'approved' or exists(select 1 from public.withdrawal_requests where user_id=old.user_id and status='pending') then raise exception 'FORBIDDEN';end if;
   if new.admin_mode_normal then new.role:='staff';new.staff_position:='staff';else new.role:='admin';new.staff_position:=null;end if;
  elsif new.role is distinct from old.role or new.staff_position is distinct from old.staff_position then raise exception 'ADMIN_ROLE_PROTECTED';end if;
  if auth.uid() is not null and auth.uid()<>old.user_id and not exists(select 1 from public.profiles where user_id=auth.uid() and role='admin' and account_status='active' and approval_status='approved') then raise exception 'ADMIN_ACCOUNT_PROTECTED';end if;
 else
  if new.admin_mode_normal then raise exception 'FORBIDDEN';end if;
  new.admin_account:=new.role::text='admin';
 end if;
 return new;
end;$$;
drop trigger if exists profiles_protect_admin_role on public.profiles;
create trigger profiles_protect_admin_role before insert or update on public.profiles for each row execute function public.protect_administrator_role();
-- No direct write grants for these flags. Existing profile RPCs whitelist writable fields.
grant select(admin_account,admin_mode_normal) on public.profiles to authenticated;
create function public.set_administrator_mode(normal_mode boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.profiles%rowtype;
begin
 select * into p from public.profiles where user_id=auth.uid() for update;
 if normal_mode is null or p.user_id is null or not p.admin_account or p.account_status::text<>'active' or p.approval_status::text<>'approved' or exists(select 1 from public.withdrawal_requests where user_id=p.user_id and status='pending') then raise exception 'FORBIDDEN';end if;
 update public.profiles set admin_mode_normal=normal_mode where user_id=p.user_id returning * into p;
 return jsonb_build_object('mode',case when p.admin_mode_normal then 'normal' else 'admin' end,'role',p.role,'staff_position',p.staff_position);
end;$$;
revoke all on function public.set_administrator_mode(boolean),public.protect_administrator_role() from public,anon;
grant execute on function public.set_administrator_mode(boolean) to authenticated;
-- Keep protected administrator accounts out of withdrawal/deletion even in staff mode.
create function public.protect_admin_account_lifecycle() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' then if old.admin_account then raise exception 'ADMIN_DELETE_PROTECTED';end if;return old;end if;
 if exists(select 1 from public.profiles where user_id=new.user_id and admin_account) then raise exception 'ADMIN_ACCOUNT_PROTECTED';end if;
 return new;
end;$$;
create trigger profiles_protect_admin_deletion before delete on public.profiles for each row execute function public.protect_admin_account_lifecycle();
create trigger withdrawal_protect_admin_account before insert on public.withdrawal_requests for each row execute function public.protect_admin_account_lifecycle();
revoke all on function public.protect_admin_account_lifecycle() from public,anon,authenticated;
-- Existing administrator test RPC remains administrator-mode only.
-- Normal-mode participation uses the ordinary staff RPCs and real attendance tables.
notify pgrst,'reload schema';
commit;
