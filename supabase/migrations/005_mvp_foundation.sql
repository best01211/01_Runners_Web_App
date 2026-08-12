-- 01Runners MVP foundation. Apply after the existing profiles/schedules schema.
begin;

-- Prefix MVP enum names so this migration can coexist with an earlier schema
-- that already defines generic names such as attendance_status.
do $$ begin create type public.runners_staff_position as enum ('staff', 'vice_president', 'president'); exception when duplicate_object then null; end $$;
do $$ begin create type public.runners_withdrawal_status as enum ('pending', 'approved', 'rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type public.runners_attendance_status as enum ('not_checked', 'attended', 'late', 'absent'); exception when duplicate_object then null; end $$;
do $$ begin create type public.runners_attendance_method as enum ('code', 'manual'); exception when duplicate_object then null; end $$;
do $$ begin create type public.runners_comment_kind as enum ('normal', 'notice'); exception when duplicate_object then null; end $$;
do $$ begin create type public.runners_season_status as enum ('scheduled', 'active', 'closed', 'hidden'); exception when duplicate_object then null; end $$;

alter table public.profiles
  add column if not exists staff_position public.runners_staff_position,
  add column if not exists ranking_excluded boolean not null default false,
  add column if not exists is_test_account boolean not null default false,
  add column if not exists anonymized_at timestamptz;

alter table public.schedules
  add column if not exists end_at timestamptz,
  add column if not exists image_url text,
  add column if not exists course_image_url text,
  add column if not exists staff_in_capacity boolean not null default true,
  add column if not exists attendance_code text,
  add column if not exists attendance_opened_at timestamptz,
  add column if not exists attendance_closed_at timestamptz;

create table if not exists public.pace_groups (
  pace_group_id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules(schedule_id) on delete cascade,
  pace_seconds integer not null check (pace_seconds > 0 and pace_seconds % 30 = 0),
  distance_km integer not null check (distance_km >= 5 and distance_km % 5 = 0),
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  unique(schedule_id, pace_seconds, distance_km)
);

alter table public.schedule_participations
  add column if not exists pace_group_id uuid references public.pace_groups(pace_group_id) on delete set null,
  add column if not exists is_pacer boolean not null default false;

create table if not exists public.attendances (
  attendance_id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules(schedule_id) on delete restrict,
  user_id uuid references public.profiles(user_id) on delete set null,
  status public.runners_attendance_status not null default 'not_checked',
  method public.runners_attendance_method,
  checked_at timestamptz,
  updated_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(schedule_id, user_id)
);

create table if not exists public.comments (
  comment_id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules(schedule_id) on delete restrict,
  parent_comment_id uuid references public.comments(comment_id) on delete restrict,
  author_id uuid references public.profiles(user_id) on delete set null,
  author_name text not null,
  kind public.runners_comment_kind not null default 'normal',
  content text not null check (length(trim(content)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (parent_comment_id is null or kind = 'normal')
);

create table if not exists public.withdrawal_requests (
  request_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete restrict,
  reason text,
  status public.runners_withdrawal_status not null default 'pending',
  requested_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(user_id) on delete set null,
  reviewed_at timestamptz,
  unique(user_id, status)
);

create table if not exists public.seasons (
  season_id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_on date not null,
  ends_on date not null,
  status public.runners_season_status not null default 'scheduled',
  is_public boolean not null default true,
  is_default boolean not null default false,
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_on <= ends_on)
);
create unique index if not exists seasons_one_default on public.seasons(is_default) where is_default;

create table if not exists public.system_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  updated_by uuid references public.profiles(user_id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.system_settings(setting_key, setting_value) values
 ('score_policy', '{"attended":10,"late":7,"absent":0,"pacer":3,"minimumAttendance":3,"includeGuests":false}'),
 ('maintenance', '{"status":"normal","message":"","startsAt":null,"endsAt":null}')
on conflict (setting_key) do nothing;

create or replace function public.is_active_member()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where user_id=auth.uid() and account_status='active' and approval_status='approved' and role in ('guest','member','staff','admin'));
$$;
create or replace function public.can_manage_staff()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where user_id=auth.uid() and account_status='active' and approval_status='approved' and (role='admin' or (role='staff' and staff_position in ('president','vice_president'))));
$$;

alter table public.pace_groups enable row level security;
alter table public.attendances enable row level security;
alter table public.comments enable row level security;
alter table public.withdrawal_requests enable row level security;
alter table public.seasons enable row level security;
alter table public.system_settings enable row level security;

create policy pace_groups_read on public.pace_groups for select to authenticated using (public.is_active_member());
create policy attendances_self_read on public.attendances for select to authenticated using (user_id=auth.uid() or public.is_staff_or_admin());
create policy comments_read on public.comments for select to authenticated using (public.is_active_member());
create policy withdrawals_self_read on public.withdrawal_requests for select to authenticated using (user_id=auth.uid() or public.is_staff_or_admin());
create policy seasons_read on public.seasons for select to authenticated using (is_public or public.is_staff_or_admin());
create policy settings_read on public.system_settings for select to authenticated using (public.is_active_member());

grant select on public.pace_groups, public.attendances, public.comments, public.withdrawal_requests, public.seasons, public.system_settings to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('01runners-images','01runners-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;

commit;
