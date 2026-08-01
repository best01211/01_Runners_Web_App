-- 개발 환경에서 최초 1회만 실행한다.
update public.profiles
set role = 'admin',
    approval_status = 'approved',
    account_status = 'active',
    approved_by = user_id,
    approved_at = now(),
    updated_at = now()
where login_id = 'runner01'
  and role = 'pending'
  and approval_status = 'pending';

select user_id, login_id, role, approval_status, account_status
from public.profiles
where login_id = 'runner01';
