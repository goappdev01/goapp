create extension if not exists "btree_gist";

create type public.account_role as enum ('usuario', 'empresa', 'admin', 'trabajador', 'proveedor', 'partner', 'franquicia');
create type public.booking_status as enum ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.account_role not null default 'usuario',
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  description text,
  address text,
  timezone text not null default 'UTC',
  booking_enabled boolean not null default true,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  duration_minutes integer not null check (duration_minutes > 0 and duration_minutes <= 1440),
  price numeric(12,2) check (price is null or price >= 0),
  currency text not null default 'USD' check (char_length(currency) = 3),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.availability (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  staff_id uuid references public.staff(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  timezone text not null default 'UTC',
  active boolean not null default true,
  check (end_time > start_time)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  staff_id uuid references public.staff(id) on delete restrict,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.booking_status not null default 'PENDING',
  notes text,
  resource_id uuid generated always as (coalesce(staff_id, business_id)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index businesses_owner_id_idx on public.businesses(owner_id);
create index services_business_id_idx on public.services(business_id);
create index staff_business_id_idx on public.staff(business_id);
create index availability_lookup_idx on public.availability(business_id, staff_id, weekday, active);
create index bookings_customer_id_idx on public.bookings(customer_id, starts_at desc);
create index bookings_business_id_idx on public.bookings(business_id, starts_at);

alter table public.bookings add constraint bookings_no_overlap
  exclude using gist (resource_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
  where (status in ('PENDING', 'CONFIRMED'));

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger businesses_set_updated_at before update on public.businesses for each row execute function public.set_updated_at();
create trigger services_set_updated_at before update on public.services for each row execute function public.set_updated_at();
create trigger staff_set_updated_at before update on public.staff for each row execute function public.set_updated_at();
create trigger bookings_set_updated_at before update on public.bookings for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    case
      when new.raw_user_meta_data->>'role' in ('empresa', 'admin', 'trabajador', 'proveedor', 'partner', 'franquicia')
        then (new.raw_user_meta_data->>'role')::public.account_role
      else 'usuario'::public.account_role
    end
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.services enable row level security;
alter table public.staff enable row level security;
alter table public.availability enable row level security;
alter table public.bookings enable row level security;

create policy profiles_select_self on public.profiles for select using (id = auth.uid());
create policy profiles_update_self on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy businesses_public_read on public.businesses for select using (booking_enabled = true);
create policy businesses_owner_manage on public.businesses for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy services_public_read on public.services for select using (active = true and exists (
  select 1 from public.businesses b where b.id = business_id and b.booking_enabled = true
));
create policy services_owner_manage on public.services for all using (
  exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
) with check (
  exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
);

create policy staff_public_read on public.staff for select using (active = true and exists (
  select 1 from public.businesses b where b.id = business_id and b.booking_enabled = true
));
create policy staff_owner_manage on public.staff for all using (
  exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
) with check (
  exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
);

create policy availability_public_read on public.availability for select using (active = true and exists (
  select 1 from public.businesses b where b.id = business_id and b.booking_enabled = true
));
create policy availability_owner_manage on public.availability for all using (
  exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
) with check (
  exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
);

create policy bookings_customer_read on public.bookings for select using (customer_id = auth.uid());
create policy bookings_customer_create on public.bookings for insert with check (customer_id = auth.uid());
create policy bookings_customer_cancel on public.bookings for update using (customer_id = auth.uid()) with check (customer_id = auth.uid());
create policy bookings_business_manage on public.bookings for all using (
  exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
) with check (
  exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
);