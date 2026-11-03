create type public.app_role as enum ('admin','student');
create type public.reg_status as enum ('registration_started','email_verified','pending_verification','confirmed','rejected');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "own roles readable" on public.user_roles for select to authenticated using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  booking_id text not null unique default ('TB-COORG-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6))),
  full_name text not null,
  email text not null unique,
  phone text not null unique,
  status public.reg_status not null default 'email_verified',
  terms_accepted_at timestamptz,
  refund_ack_accepted_at timestamptz,
  policy_version text,
  utr text unique,
  screenshot_path text,
  payment_submitted_at timestamptz,
  admin_note text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, update on public.registrations to authenticated;
grant all on public.registrations to service_role;
alter table public.registrations enable row level security;
create policy "own registration readable" on public.registrations for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "admins update" on public.registrations for update to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin') and user_id <> auth.uid());

create or replace function public.create_registration(_full_name text, _phone text)
returns public.registrations language plpgsql security definer set search_path = public
as $$
declare u record; r public.registrations;
begin
  select id, email, email_confirmed_at into u from auth.users where id = auth.uid();
  if u.id is null then raise exception 'Not signed in'; end if;
  if u.email_confirmed_at is null then raise exception 'Please verify your email first'; end if;
  if length(trim(_full_name)) < 2 or length(trim(_full_name)) > 100 then raise exception 'Please enter your full name'; end if;
  if _phone !~ '^\+?[0-9]{10,13}$' then raise exception 'Please enter a valid phone number'; end if;
  select * into r from public.registrations where user_id = u.id;
  if found then return r; end if;
  if exists (select 1 from public.registrations where phone = _phone) then raise exception 'This phone number is already registered'; end if;
  insert into public.registrations (user_id, full_name, email, phone, status)
  values (u.id, trim(_full_name), lower(u.email), _phone, 'email_verified') returning * into r;
  return r;
end $$;

create or replace function public.submit_payment(_utr text, _screenshot_path text, _policy_version text)
returns public.registrations language plpgsql security definer set search_path = public
as $$
declare r public.registrations;
begin
  select * into r from public.registrations where user_id = auth.uid();
  if not found then raise exception 'Register first'; end if;
  if r.status in ('pending_verification','confirmed') then raise exception 'Payment already submitted'; end if;
  if _utr !~ '^[A-Za-z0-9]{8,30}$' then raise exception 'Enter a valid UTR / transaction ID'; end if;
  if _screenshot_path is null or split_part(_screenshot_path,'/',1) <> auth.uid()::text then raise exception 'Upload your payment screenshot'; end if;
  if exists (select 1 from public.registrations where utr = upper(_utr) and id <> r.id) then raise exception 'This UTR has already been used'; end if;
  update public.registrations set utr = upper(_utr), screenshot_path = _screenshot_path,
    terms_accepted_at = now(), refund_ack_accepted_at = now(), policy_version = _policy_version,
    payment_submitted_at = now(), status = 'pending_verification', updated_at = now()
  where id = r.id returning * into r;
  return r;
end $$;

revoke execute on function public.create_registration(text,text) from public, anon;
revoke execute on function public.submit_payment(text,text,text) from public, anon;
grant execute on function public.create_registration(text,text) to authenticated;
grant execute on function public.submit_payment(text,text,text) to authenticated;

create policy "upload own screenshot" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "read own or admin screenshot" on storage.objects for select to authenticated
  using (bucket_id = 'payment-screenshots' and ((storage.foldername(name))[1] = auth.uid()::text or public.has_role(auth.uid(),'admin')));