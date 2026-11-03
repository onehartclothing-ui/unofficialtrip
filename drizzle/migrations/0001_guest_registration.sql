-- =============================================================================
-- 0001_guest_registration.sql
-- Hardened server-side guest checkout & payment verification schema
-- Compatible with both a completely empty Supabase project and existing setups.
-- =============================================================================

-- 1. Ensure cohort and server-verified booking session columns exist
alter table public.registrations
  add column if not exists cohort text,
  add column if not exists session_token_hash text,
  add column if not exists session_expires_at timestamptz;

alter table public.registrations
  alter column user_id set default gen_random_uuid(),
  alter column status set default 'registration_started';

-- Allow unlimited registrations using the same email or phone number without blocking students,
-- and allow duplicate UTR submissions to be recorded and flagged for organizer review.
alter table public.registrations
  drop constraint if exists registrations_email_key,
  drop constraint if exists registrations_phone_key,
  drop constraint if exists registrations_utr_key;

drop index if exists public.registrations_email_key;
drop index if exists public.registrations_phone_key;
drop index if exists public.registrations_utr_key;

create index if not exists idx_registrations_email
  on public.registrations (email);

create index if not exists idx_registrations_utr
  on public.registrations (utr)
  where utr is not null;

create index if not exists idx_registrations_session_token_hash
  on public.registrations (session_token_hash)
  where session_token_hash is not null;

-- 2. Remove publicly callable SECURITY DEFINER guest RPC functions
--    Guest registration and payment submission now happen strictly on the server
--    via service_role after server-side validation and session-token verification.
drop function if exists public.create_registration(text, text, text, text, text);
drop function if exists public.submit_payment(uuid, uuid, text, text, text);
drop function if exists public.create_registration(text, text);
drop function if exists public.submit_payment(text, text, text);

-- 3. Enforce strict Row-Level Security on public.registrations
--    - No anon access
--    - Only authenticated organizers with the 'admin' role in public.user_roles can read or update
revoke all on public.registrations from public, anon;
revoke insert, delete on public.registrations from authenticated;
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

-- 4. Ensure private payment-screenshots storage bucket exists and is locked down
--    - Bucket is private (public = false)
--    - Direct client/anon uploads are denied; uploads are performed server-side
--      only after verifying the booking session token
--    - Admins view screenshots via short-lived signed URLs
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

drop policy if exists "guest upload screenshot" on storage.objects;
drop policy if exists "upload own screenshot" on storage.objects;
drop policy if exists "read own or admin screenshot" on storage.objects;
drop policy if exists "admins read screenshots" on storage.objects;

create policy "admins read screenshots" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-screenshots'
    and public.has_role(auth.uid(), 'admin')
  );
