-- =============================================================================
-- 0000_migration.sql
-- Base schema for Titu Backpackers (compatible with an empty Supabase project)
-- =============================================================================

do $$ begin
  create type public.app_role as enum ('admin', 'student');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.reg_status as enum (
    'registration_started',
    'email_verified',
    'pending_verification',
    'confirmed',
    'rejected'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);

revoke all on public.user_roles from public, anon;
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

drop policy if exists "own roles readable" on public.user_roles;
create policy "own roles readable" on public.user_roles
  for select to authenticated
  using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default gen_random_uuid(),
  booking_id text not null unique default ('TB-COORG-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  full_name text not null,
  email text not null,
  phone text not null,
  cohort text,
  status public.reg_status not null default 'registration_started',
  session_token_hash text,
  session_expires_at timestamptz,
  terms_accepted_at timestamptz,
  refund_ack_accepted_at timestamptz,
  policy_version text,
  utr text,
  screenshot_path text,
  payment_submitted_at timestamptz,
  admin_note text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Revoke all direct table privileges from anon/public; only authenticated admins can select/update via RLS
revoke all on public.registrations from public, anon;
grant select, update on public.registrations to authenticated;
grant all on public.registrations to service_role;
alter table public.registrations enable row level security;

drop policy if exists "own registration readable" on public.registrations;
drop policy if exists "admins read registrations" on public.registrations;
create policy "admins read registrations" on public.registrations
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "admins update" on public.registrations;
create policy "admins update" on public.registrations
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin') and user_id <> auth.uid());

-- Create the private payment-screenshots bucket for empty Supabase projects
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-screenshots',
  'payment-screenshots',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

drop policy if exists "upload own screenshot" on storage.objects;
drop policy if exists "read own or admin screenshot" on storage.objects;
drop policy if exists "admins read screenshots" on storage.objects;
create policy "admins read screenshots" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-screenshots'
    and public.has_role(auth.uid(), 'admin')
  );
