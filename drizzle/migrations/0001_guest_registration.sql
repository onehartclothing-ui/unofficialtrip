-- Guest registration & payment flow (no student login required)
-- Preserves existing records and keeps Row-Level Security enabled.

alter table public.registrations
  add column if not exists cohort text;

alter table public.registrations
  alter column status set default 'registration_started';

-- Extend create_registration for guest registrations (4 fields + policy acceptance)
create or replace function public.create_registration(
  _full_name text,
  _email text,
  _phone text,
  _cohort text,
  _policy_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(_email));
  v_name text := trim(_full_name);
  v_phone text := regexp_replace(trim(_phone), '[\s\-()]', '', 'g');
  v_cohort text := trim(_cohort);
  r public.registrations;
begin
  if length(v_name) < 2 or length(v_name) > 100 then
    raise exception 'Please enter your full name';
  end if;

  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
    raise exception 'Please enter a valid email address';
  end if;

  -- Normalize Indian mobile numbers to +91XXXXXXXXXX
  if v_phone ~ '^[6-9][0-9]{9}$' then
    v_phone := '+91' || v_phone;
  elsif v_phone ~ '^91[6-9][0-9]{9}$' then
    v_phone := '+' || v_phone;
  elsif v_phone ~ '^0[6-9][0-9]{9}$' then
    v_phone := '+91' || substr(v_phone, 2);
  end if;

  if v_phone !~ '^\+91[6-9][0-9]{9}$' then
    raise exception 'Please enter a valid 10-digit Indian mobile number';
  end if;

  if v_cohort is null or length(v_cohort) < 1 or length(v_cohort) > 100 then
    raise exception 'Please select your cohort';
  end if;

  -- Check if an existing registration matches this email or phone
  select * into r
  from public.registrations
  where email = v_email or phone = v_phone
  limit 1;

  if found then
    if r.status in ('pending_verification', 'confirmed') then
      raise exception 'A registration with this email or phone number has already submitted payment (Ref: %)', r.booking_id;
    end if;

    -- Ensure the other field does not conflict with a different registration
    if exists (
      select 1 from public.registrations
      where (email = v_email or phone = v_phone) and id <> r.id
    ) then
      raise exception 'Email or phone number is already registered with another booking';
    end if;

    update public.registrations
    set
      full_name = v_name,
      email = v_email,
      phone = v_phone,
      cohort = v_cohort,
      terms_accepted_at = now(),
      refund_ack_accepted_at = now(),
      policy_version = _policy_version,
      updated_at = now()
    where id = r.id
    returning * into r;
  else
    insert into public.registrations (
      user_id,
      full_name,
      email,
      phone,
      cohort,
      status,
      terms_accepted_at,
      refund_ack_accepted_at,
      policy_version
    )
    values (
      gen_random_uuid(),
      v_name,
      v_email,
      v_phone,
      v_cohort,
      'registration_started',
      now(),
      now(),
      _policy_version
    )
    returning * into r;
  end if;

  return jsonb_build_object(
    'id', r.id,
    'user_id', r.user_id,
    'booking_id', r.booking_id,
    'full_name', r.full_name,
    'email', r.email,
    'phone', r.phone,
    'cohort', r.cohort,
    'status', r.status,
    'utr', r.utr
  );
end $$;

-- Extend submit_payment for guest registrations using the secret registration id & user_id
create or replace function public.submit_payment(
  _registration_id uuid,
  _user_id uuid,
  _utr text,
  _screenshot_path text,
  _policy_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.registrations;
  v_utr text := upper(regexp_replace(trim(_utr), '\s+', '', 'g'));
begin
  select * into r
  from public.registrations
  where id = _registration_id and user_id = _user_id;

  if not found then
    raise exception 'Registration session not found. Please fill out the registration form first.';
  end if;

  if r.status in ('pending_verification', 'confirmed') then
    raise exception 'Payment has already been submitted for this registration.';
  end if;

  if v_utr !~ '^[A-Z0-9]{8,30}$' then
    raise exception 'Please enter a valid UTR / UPI Transaction ID (8–30 alphanumeric characters)';
  end if;

  if _screenshot_path is null or split_part(_screenshot_path, '/', 1) <> r.user_id::text then
    raise exception 'Please upload a valid payment screenshot';
  end if;

  if exists (
    select 1 from public.registrations
    where utr = v_utr and id <> r.id
  ) then
    raise exception 'This UTR / Transaction ID has already been submitted';
  end if;

  update public.registrations
  set
    utr = v_utr,
    screenshot_path = _screenshot_path,
    terms_accepted_at = coalesce(terms_accepted_at, now()),
    refund_ack_accepted_at = coalesce(refund_ack_accepted_at, now()),
    policy_version = coalesce(_policy_version, policy_version),
    payment_submitted_at = now(),
    status = 'pending_verification',
    updated_at = now()
  where id = r.id
  returning * into r;

  return jsonb_build_object(
    'id', r.id,
    'user_id', r.user_id,
    'booking_id', r.booking_id,
    'full_name', r.full_name,
    'email', r.email,
    'phone', r.phone,
    'cohort', r.cohort,
    'status', r.status,
    'utr', r.utr
  );
end $$;

grant execute on function public.create_registration(text, text, text, text, text) to anon, authenticated;
grant execute on function public.submit_payment(uuid, uuid, text, text, text) to anon, authenticated;

-- Allow guests to upload payment screenshots only into a folder matching an active registration's secret user_id
drop policy if exists "guest upload screenshot" on storage.objects;
create policy "guest upload screenshot" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'payment-screenshots'
    and exists (
      select 1 from public.registrations r
      where r.user_id::text = (storage.foldername(name))[1]
        and r.status not in ('pending_verification', 'confirmed')
    )
  );

