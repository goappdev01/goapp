-- Caller-editable auth metadata is only an initial choice of public account type.
-- Privileged roles must be assigned through trusted administration.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email),
    case when new.raw_user_meta_data->>'role' = 'empresa'
      then 'empresa'::public.account_role else 'usuario'::public.account_role end);
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- RLS restricts rows, column grants protect ownership and privileged fields.
revoke all on public.profiles, public.businesses, public.services, public.staff,
  public.availability, public.bookings from public, anon, authenticated;
grant select on public.businesses, public.services, public.staff, public.availability to anon;
grant select on public.profiles, public.businesses, public.services, public.staff,
  public.availability, public.bookings to authenticated;
grant update (full_name, phone, avatar_url) on public.profiles to authenticated;
grant insert (owner_id, name, description, address, timezone, booking_enabled) on public.businesses to authenticated;
grant update (name, description, address, timezone, booking_enabled) on public.businesses to authenticated;
grant insert (business_id, name, description, duration_minutes, price, currency, active) on public.services to authenticated;
grant update (name, description, duration_minutes, price, currency, active) on public.services to authenticated;
grant insert (business_id, display_name, active) on public.staff to authenticated;
grant update (display_name, active) on public.staff to authenticated;
grant insert (business_id, staff_id, weekday, start_time, end_time, timezone, active) on public.availability to authenticated;
grant update (staff_id, weekday, start_time, end_time, timezone, active) on public.availability to authenticated;
grant insert (business_id, service_id, staff_id, customer_id, starts_at, ends_at, status, notes) on public.bookings to authenticated;
grant update (status, notes) on public.bookings to authenticated;

-- Enforce tenant consistency even for calls that bypass the GO API.
alter table public.services add constraint services_id_business_unique unique (id, business_id);
alter table public.staff add constraint staff_id_business_unique unique (id, business_id);
alter table public.bookings add constraint bookings_service_business_fk foreign key (service_id, business_id) references public.services(id, business_id);
alter table public.bookings add constraint bookings_staff_business_fk foreign key (staff_id, business_id) references public.staff(id, business_id);
alter table public.availability add constraint availability_staff_business_fk foreign key (staff_id, business_id) references public.staff(id, business_id);

create or replace function public.guard_customer_booking_update()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  -- Trusted maintenance connections are unaffected; API callers always have a UID.
  if auth.uid() is null then return new; end if;
  if exists (select 1 from public.businesses b where b.id = old.business_id and b.owner_id = auth.uid()) then
    return new;
  end if;
  if old.customer_id <> auth.uid()
    or old.status not in ('PENDING', 'CONFIRMED', 'CANCELLED')
    or new.status <> 'CANCELLED'
    or (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
    raise exception 'Customers may only cancel their own active bookings' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_customer_booking_update() from public, anon, authenticated;
create trigger bookings_customer_update_guard before update on public.bookings
for each row execute function public.guard_customer_booking_update();
