-- Read-only diagnostic. Does not delete users, profiles, files, or activity records.
-- Screenshot-selected test account. To inspect another account, replace the UUID
-- in queries 1 and 4 with that account's Authentication UID.

-- 1. Current profile and Auth presence.
select p.user_id, p.name, p.role, p.account_status, p.approval_status,
       exists(select 1 from auth.users u where u.id = p.user_id) as auth_user_exists
from public.profiles p
where p.user_id = '283fc661-534e-4d2e-96d6-3615db06c5b0'::uuid;

-- 2. Foreign keys that can block Auth deletion or a cascading profile deletion.
select c.conrelid::regclass as referencing_table,
       c.conname as constraint_name,
       c.confrelid::regclass as referenced_table,
       pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.contype = 'f'
  and c.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
order by c.confrelid::regclass::text, c.conrelid::regclass::text, c.conname;

-- 3. Custom triggers involved in deleting/updating Auth or profiles.
select t.tgrelid::regclass as table_name,
       t.tgname as trigger_name,
       t.tgenabled as enabled,
       pg_get_triggerdef(t.oid) as trigger_definition,
       pg_get_functiondef(t.tgfoid) as function_definition
from pg_trigger t
where not t.tgisinternal
  and t.tgrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
order by t.tgrelid::regclass::text, t.tgname;

-- 4. Owned Storage objects and files placed in the user's profile directory.
-- JSON extraction supports Storage versions exposing owner and/or owner_id.
select o.bucket_id, o.name,
       to_jsonb(o)->>'owner' as owner,
       to_jsonb(o)->>'owner_id' as owner_id,
       (to_jsonb(o)->>'owner' = '283fc661-534e-4d2e-96d6-3615db06c5b0'
        or to_jsonb(o)->>'owner_id' = '283fc661-534e-4d2e-96d6-3615db06c5b0') as owned_by_user
from storage.objects o
where to_jsonb(o)->>'owner' = '283fc661-534e-4d2e-96d6-3615db06c5b0'
   or to_jsonb(o)->>'owner_id' = '283fc661-534e-4d2e-96d6-3615db06c5b0'
   or o.name like '283fc661-534e-4d2e-96d6-3615db06c5b0/%'
order by o.bucket_id, o.name;
