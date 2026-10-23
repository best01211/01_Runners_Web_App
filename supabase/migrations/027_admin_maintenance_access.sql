-- Approved, active administrators can test features during service restrictions.
-- Account restrictions and all existing action/ownership/RLS checks remain in place.
begin;
create or replace function public.service_feature_blocked(feature text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce((select setting_value->>'status'='restricted'
  and coalesce((setting_value->'blocked'->>feature)::boolean,false)
  from public.system_settings where setting_key='maintenance'),false)
 and not exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin'
  and p.account_status='active' and p.approval_status='approved'
  and not exists(select 1 from public.withdrawal_requests w where w.user_id=p.user_id and w.status='pending'));
$$;
notify pgrst,'reload schema';
commit;
