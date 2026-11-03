-- =============================================================================
-- 0003_optional_student_email.sql
-- Makes the email column in public.registrations nullable to allow students to
-- register with their name, mobile number, and cohort only, while allowing
-- optional email addresses.
-- =============================================================================

alter table public.registrations
  alter column email drop not null;
