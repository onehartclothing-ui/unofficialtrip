-- =============================================================================
-- 0002_allow_repeat_registrations.sql
-- Safely removes UNIQUE constraints on email, phone, and utr in public.registrations
-- so students can register unlimited times without OTP/login while preserving
-- existing registration and payment records and flagging duplicate UTRs for admin review.
-- =============================================================================

alter table public.registrations
  drop constraint if exists registrations_email_key,
  drop constraint if exists registrations_phone_key,
  drop constraint if exists registrations_utr_key;

drop index if exists public.registrations_email_key;
drop index if exists public.registrations_phone_key;
drop index if exists public.registrations_utr_key;

create index if not exists idx_registrations_email
  on public.registrations (email);

create index if not exists idx_registrations_phone
  on public.registrations (phone);

create index if not exists idx_registrations_utr
  on public.registrations (utr)
  where utr is not null;

