-- Stored generated columns are recomputed after BEFORE triggers.
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
    or (to_jsonb(new) - 'status' - 'updated_at' - 'resource_id') is distinct from (to_jsonb(old) - 'status' - 'updated_at' - 'resource_id') then
    raise exception 'Customers may only cancel their own active bookings' using errcode = '42501';
  end if;
  return new;
end;
$$;
