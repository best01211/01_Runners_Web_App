-- Apply after 009. Reusable regular-run templates; existing schedules are preserved.
begin;
create table if not exists public.regular_run_templates (
  template_id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 100),
  description text not null default '' check (length(description) <= 10000),
  location text not null check (length(trim(location)) between 2 and 200),
  capacity integer check (capacity is null or capacity > 0),
  image_url text,
  created_by uuid references public.profiles(user_id) on delete set null,
  updated_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.schedules add column if not exists regular_template_id uuid references public.regular_run_templates(template_id) on delete restrict;
alter table public.regular_run_templates enable row level security;
drop policy if exists regular_templates_read on public.regular_run_templates;
create policy regular_templates_read on public.regular_run_templates for select to authenticated
  using (public.is_active_member() and (deleted_at is null or exists (
    select 1 from public.schedules s where s.regular_template_id = regular_run_templates.template_id and s.deleted_at is null
  )));
revoke all on public.regular_run_templates from anon, authenticated;
grant select on public.regular_run_templates to authenticated;
grant all on public.regular_run_templates to service_role;
grant select (regular_template_id) on public.schedules to authenticated;

create or replace function public.check_regular_run_template()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.schedule_type::text <> 'regular' then
    new.regular_template_id := null;
  elsif new.regular_template_id is not null then
    -- An existing schedule may keep a retired template. New assignments must be active.
    if tg_op = 'INSERT' then
      perform 1 from regular_run_templates where template_id = new.regular_template_id and deleted_at is null for share;
      if not found then raise exception '정기런 양식을 찾을 수 없습니다.'; end if;
    elsif new.regular_template_id is distinct from old.regular_template_id then
      perform 1 from regular_run_templates where template_id = new.regular_template_id and deleted_at is null for share;
      if not found then raise exception '정기런 양식을 찾을 수 없습니다.'; end if;
    end if;
  end if;
  new.image_url := null;
  new.course_image_url := null;
  return new;
end;
$$;
revoke all on function public.check_regular_run_template() from public;
drop trigger if exists schedules_regular_template_check on public.schedules;
create trigger schedules_regular_template_check before insert or update on public.schedules
for each row execute function public.check_regular_run_template();
notify pgrst, 'reload schema';
commit;
