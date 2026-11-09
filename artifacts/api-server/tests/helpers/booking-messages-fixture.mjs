// Synthetic schemas/identities only. Never apply to an existing database.
export const ids={owner:'11111111-1111-4111-8111-111111111111',customer:'22222222-2222-4222-8222-222222222222',third:'33333333-3333-4333-8333-333333333333',
 business:'44444444-4444-4444-8444-444444444444',booking:'55555555-5555-4555-8555-555555555555',otherBusiness:'66666666-6666-4666-8666-666666666666',
 otherBooking:'77777777-7777-4777-8777-777777777777',employee:'88888888-8888-4888-8888-888888888888'};
export const schema=`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create table public.profiles(id uuid primary key,full_name text);
 create table public.businesses(id uuid primary key,owner_id uuid,verified boolean,name text,booking_enabled boolean default true);
 create table public.bookings(id uuid primary key,business_id uuid references public.businesses(id),customer_id uuid references public.profiles(id),
  status text,created_at timestamptz default now(),starts_at timestamptz default now()+interval '1 day',ends_at timestamptz default now()+interval '1 day 30 minutes');
 create table public.staff(id uuid primary key,business_id uuid,profile_id uuid,active boolean);
 create schema go_reservation_negotiation;
 revoke all on schema go_reservation_negotiation from public,anon,authenticated;
 grant usage on schema go_reservation_negotiation to authenticated;
 create table go_reservation_negotiation.requests(actor_id uuid,request_id uuid,booking_id uuid,command jsonb);
 alter table go_reservation_negotiation.requests enable row level security;
 revoke all on go_reservation_negotiation.requests from public,anon,authenticated;
 alter table public.businesses enable row level security;alter table public.bookings enable row level security;
 grant select on public.businesses,public.bookings to authenticated;
 create policy business_read on public.businesses for select to authenticated using(verified and booking_enabled);
 create policy booking_read on public.bookings for select to authenticated using(customer_id=auth.uid());
 insert into public.profiles values('${ids.owner}','Synthetic owner'),('${ids.customer}','Synthetic customer'),('${ids.third}','Synthetic outsider'),('${ids.employee}','Synthetic employee');
 insert into public.businesses(id,owner_id,verified,name) values('${ids.business}','${ids.owner}',true,'Synthetic salon'),('${ids.otherBusiness}','${ids.third}',true,'Other salon');
 insert into public.bookings(id,business_id,customer_id,status) values('${ids.booking}','${ids.business}','${ids.customer}','CONFIRMED'),('${ids.otherBooking}','${ids.otherBusiness}','${ids.customer}','PENDING');
 insert into public.staff values('${ids.employee}','${ids.business}','${ids.employee}',true);`;
