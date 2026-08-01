begin;

create table if not exists public.member_approval_reviews (
  review_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete restrict,
  status public.approval_status not null,
  reason_text text,
  allow_reapplication boolean not null default true,
  reviewed_by uuid not null references public.profiles(user_id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint member_approval_reviews_final_status_chk
    check (status in ('approved', 'rejected'))
);

create index if not exists idx_member_approval_reviews_user
  on public.member_approval_reviews(user_id, reviewed_at desc);

alter table public.member_approval_reviews enable row level security;

drop policy if exists "approval_reviews_select_staff_admin"
  on public.member_approval_reviews;
create policy "approval_reviews_select_staff_admin"
on public.member_approval_reviews
for select to authenticated
using (public.is_staff_or_admin());

revoke all on table public.member_approval_reviews from anon, authenticated;
grant select on table public.member_approval_reviews to authenticated;

create or replace function public.review_pending_member(
  target_user_id uuid,
  decision text,
  reason_text text default null,
  allow_reapplication boolean default true
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role;
  target_profile public.profiles;
  normalized_decision text := lower(trim(decision));
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;

  select role into actor_role
  from public.profiles
  where user_id = actor_id
    and account_status = 'active'
    and approval_status = 'approved';

  if actor_role not in ('staff', 'admin') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if normalized_decision not in ('approve', 'reject') then
    raise exception using errcode = '22023', message = 'INVALID_DECISION';
  end if;

  select * into target_profile
  from public.profiles
  where user_id = target_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'MEMBER_NOT_FOUND';
  end if;

  if target_profile.approval_status <> 'pending'
     or target_profile.role <> 'pending' then
    raise exception using errcode = 'P0001', message = 'MEMBER_NOT_PENDING';
  end if;

  if normalized_decision = 'approve' then
    update public.profiles
    set role = 'member', approval_status = 'approved',
        approved_by = actor_id, approved_at = now(),
        rejected_by = null, rejected_at = null, updated_at = now()
    where user_id = target_user_id
    returning * into target_profile;

    insert into public.member_approval_reviews
      (user_id, status, reason_text, allow_reapplication, reviewed_by)
    values
      (target_user_id, 'approved', nullif(trim(reason_text), ''), false, actor_id);
  else
    update public.profiles
    set role = 'pending', approval_status = 'rejected',
        rejected_by = actor_id, rejected_at = now(),
        approved_by = null, approved_at = null, updated_at = now()
    where user_id = target_user_id
    returning * into target_profile;

    insert into public.member_approval_reviews
      (user_id, status, reason_text, allow_reapplication, reviewed_by)
    values
      (target_user_id, 'rejected', nullif(trim(reason_text), ''), allow_reapplication, actor_id);
  end if;

  return target_profile;
end;
$$;

revoke all on function public.review_pending_member(uuid, text, text, boolean)
  from public, anon;
grant execute on function public.review_pending_member(uuid, text, text, boolean)
  to authenticated;

commit;
