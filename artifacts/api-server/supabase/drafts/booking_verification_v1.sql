-- REVIEW DRAFT. Apply ONLY after booking_negotiation_v1, in an isolated database.
-- Nelson must review pgcrypto namespace, trusted staff/profile assignments,
-- verification windows and retention before generating a real migration.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $$ begin
  if not exists(select 1 from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto' and n.nspname='extensions') then
    raise exception 'Review pgcrypto namespace before applying this draft';
  end if;
end $$;
create schema go_reservation_verification;
revoke all on schema go_reservation_verification from public,anon,authenticated;
grant usage on schema go_reservation_verification to authenticated;

-- ONE entitlement, ONE canonical booking. Original purchaser/customer_id and
-- all financial columns remain untouched by delegation and by verification.
create table go_reservation_verification.rights (
  booking_id uuid primary key references public.bookings(id),
  holder_id uuid not null references public.profiles(id),
  version bigint not null default 0,
  token_hash bytea, manual_hash bytea, expires_at timestamptz,
  invite_hash bytea, invite_expires_at timestamptz,
  arrived_at timestamptz, arrived_by uuid references public.profiles(id),
  arrival_request_hash bytea
);
create table go_reservation_verification.challenges (
  secret_hash bytea primary key,
  booking_id uuid not null references public.bookings(id),
  actor_id uuid not null references public.profiles(id),
  version bigint not null, expires_at timestamptz not null,
  used_at timestamptz
);
create table go_reservation_verification.events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings(id),
  actor_id uuid references public.profiles(id),
  action text not null, at timestamptz not null default now(),
  previous_holder uuid, new_holder uuid
);
create table go_reservation_verification.throttle (
  actor_id uuid not null references public.profiles(id),
  bucket timestamptz not null, attempts integer not null,
  primary key(actor_id,bucket)
);
alter table go_reservation_verification.rights enable row level security;
alter table go_reservation_verification.challenges enable row level security;
alter table go_reservation_verification.events enable row level security;
alter table go_reservation_verification.throttle enable row level security;
revoke all on all tables in schema go_reservation_verification from public,anon,authenticated;
revoke all on all sequences in schema go_reservation_verification from public,anon,authenticated;
create unique index verification_token_unique on go_reservation_verification.rights(token_hash) where token_hash is not null;
create unique index verification_manual_unique on go_reservation_verification.rights(manual_hash) where manual_hash is not null;
create unique index verification_invite_unique on go_reservation_verification.rights(invite_hash) where invite_hash is not null;
create index verification_challenges_booking on go_reservation_verification.challenges(booking_id);
create index verification_events_booking on go_reservation_verification.events(booking_id,at);

create function go_reservation_verification.digest(p_value text) returns bytea
language sql immutable security invoker set search_path='' as $$
  select extensions.digest('go-reservation-v1:'||p_value,'sha256');
$$;
create function go_reservation_verification.can_verify(p_booking public.bookings,p_actor uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select p_actor is not null and exists(select 1 from public.businesses b
   where b.id=p_booking.business_id and b.verified and
     (b.owner_id=p_actor or exists(select 1 from public.staff s where s.id=p_booking.staff_id
       and s.business_id=b.id and s.active and s.profile_id=p_actor)));
$$;
-- Called only inside authorized core. No email, phone, notes, prices, raw IDs,
-- identity-document claims or general access to the profiles table.
create function go_reservation_verification.summary(p_booking public.bookings,p_right go_reservation_verification.rights) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('customerName',case when c.full_name not like '%@%' then nullif(pg_catalog.btrim(c.full_name),'') else null end,
   'authorizedPersonName',case when p_right.holder_id<>p_booking.customer_id then case when h.full_name not like '%@%' then nullif(pg_catalog.btrim(h.full_name),'') else null end else null end,
   'businessName',b.name,'serviceName',coalesce((select string_agg(x->>'title',' · ') from jsonb_array_elements(coalesce(nullif(to_jsonb(p_booking)->'service_details','null'::jsonb),'[]'::jsonb)) x),s.name),
   'startsAt',p_booking.starts_at,'endsAt',p_booking.ends_at,'timezone',b.timezone,
   'bookingStatus',p_booking.status,'arrivalVerified',p_right.arrived_at is not null,
   'arrivalAt',p_right.arrived_at,'civilIdentityVerified',false,'servicePerformed',p_booking.status='COMPLETED')
 from public.businesses b join public.services s on s.id=p_booking.service_id
 left join public.profiles c on c.id=p_booking.customer_id
 left join public.profiles h on h.id=p_right.holder_id where b.id=p_booking.business_id;
$$;

create function go_reservation_verification.invalidate() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at
   or new.staff_id is distinct from old.staff_id or new.customer_id is distinct from old.customer_id
   or new.business_id is distinct from old.business_id or new.service_id is distinct from old.service_id
   or new.status is distinct from old.status or (to_jsonb(new)->'service_ids') is distinct from(to_jsonb(old)->'service_ids')
   or (to_jsonb(new)->'timing_snapshot') is distinct from(to_jsonb(old)->'timing_snapshot') then
   update go_reservation_verification.rights set version=version+1,token_hash=null,manual_hash=null,expires_at=null,
     invite_hash=null,invite_expires_at=null,arrived_at=null,arrived_by=null,arrival_request_hash=null,
     holder_id=case when new.customer_id is distinct from old.customer_id then new.customer_id else holder_id end
     where booking_id=new.id;
   delete from go_reservation_verification.challenges where booking_id=new.id;
   insert into go_reservation_verification.events(booking_id,actor_id,action) values(new.id,auth.uid(),'booking_changed_credentials_revoked');
 end if;
 return new;
end;
$$;
create trigger z_go_booking_verification_invalidate after update on public.bookings
 for each row execute function go_reservation_verification.invalidate();

-- Failure responses are values, not exceptions, so failed guesses still count
-- toward the durable per-identity throttle. This also protects direct RPC calls.
create function go_reservation_verification.act(p_operation text,p_booking_id uuid default null,
 p_business_id uuid default null,p_secret text default null,p_challenge text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 caller uuid:=auth.uid(); b public.bookings; r go_reservation_verification.rights;
 c go_reservation_verification.challenges; raw text; manual text; code_hash bytea;
 count_attempts integer; slot timestamptz:=date_trunc('minute',clock_timestamp());
 result jsonb; booking_uuid uuid; expiry timestamptz;
begin
 if caller is null then return jsonb_build_object('error','AUTHENTICATION_REQUIRED','httpStatus',401); end if;
 if p_operation is null or p_operation not in ('issue','preview','arrive','invite','claim','revoke','wallet')
   or coalesce(length(p_secret),0)>160 or coalesce(length(p_challenge),0)>80 then
   return jsonb_build_object('error','VERIFICATION_INVALID_COMMAND','httpStatus',400); end if;
 insert into go_reservation_verification.throttle values(caller,slot,1)
 on conflict(actor_id,bucket) do update set attempts=go_reservation_verification.throttle.attempts+1 returning attempts into count_attempts;
 if count_attempts>30 then return jsonb_build_object('error','VERIFICATION_RATE_LIMIT','httpStatus',429); end if;
 -- Bounded housekeeping; no secrets or history are deleted from booking rows.
 delete from go_reservation_verification.throttle where actor_id=caller and bucket<slot-interval '1 day';
 delete from go_reservation_verification.challenges where actor_id=caller and expires_at<now()-interval '1 day';
 if p_operation='wallet' then
   select coalesce(jsonb_agg(jsonb_build_object('bookingId',b0.id,'summary',go_reservation_verification.summary(b0,r0))), '[]') into result
   from go_reservation_verification.rights r0 join public.bookings b0 on b0.id=r0.booking_id
   where r0.holder_id=caller and b0.status='CONFIRMED' and b0.ends_at>now();
   return jsonb_build_object('items',result);
 end if;
 if p_operation in ('preview','claim') then
   if p_operation='preview' then
     if p_secret ~ '^GO:RESERVATION:1:[A-Za-z0-9_-]{43}$' then code_hash:=go_reservation_verification.digest(p_secret);
     elsif upper(regexp_replace(coalesce(p_secret,''),'[ -]','','g')) ~ '^[0-9A-F]{32}$' then
       code_hash:=go_reservation_verification.digest('MANUAL:'||upper(regexp_replace(p_secret,'[ -]','','g')));
     else return jsonb_build_object('error','VERIFICATION_INVALID','httpStatus',404); end if;
     select booking_id into booking_uuid from go_reservation_verification.rights where (token_hash=code_hash or manual_hash=code_hash) and expires_at>now();
   else
     if p_secret !~ '^GO:HANDOVER:1:[A-Za-z0-9_-]{43}$' then return jsonb_build_object('error','VERIFICATION_INVALID','httpStatus',404); end if;
     code_hash:=go_reservation_verification.digest(p_secret);
     select booking_id into booking_uuid from go_reservation_verification.rights where invite_hash=code_hash and invite_expires_at>now();
   end if;
 elsif p_operation='arrive' then
   if p_challenge !~ '^[A-Za-z0-9_-]{43}$' then return jsonb_build_object('error','VERIFICATION_INVALID','httpStatus',404); end if;
   select booking_id into booking_uuid from go_reservation_verification.challenges
     where secret_hash=go_reservation_verification.digest('CHALLENGE:'||p_challenge) and actor_id=caller and expires_at>now();
 else booking_uuid:=p_booking_id;
 end if;
 select * into b from public.bookings where id=booking_uuid;
 if not found then return jsonb_build_object('error','VERIFICATION_INVALID','httpStatus',404); end if;
 -- Same business -> booking -> entitlement lock order as negotiation. Recheck
 -- every authorization and secret AFTER obtaining locks, including reassignment.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('go-booking:'||b.business_id::text,0));
 select * into b from public.bookings where id=booking_uuid for update;
 if p_operation in ('issue','invite','revoke') then
   if not exists(select 1 from go_reservation_verification.rights where booking_id=b.id) then
     if b.customer_id<>caller then return jsonb_build_object('error','VERIFICATION_INVALID','httpStatus',404); end if;
     insert into go_reservation_verification.rights(booking_id,holder_id) values(b.id,b.customer_id);
   end if;
 end if;
 perform 1 from public.businesses where id=b.business_id for share;
 perform 1 from public.staff where id=b.staff_id for share;
 select * into r from go_reservation_verification.rights where booking_id=b.id for update;
 if not found then return jsonb_build_object('error','VERIFICATION_INVALID','httpStatus',404); end if;
 if p_operation in ('preview','arrive') then
   if p_business_id is distinct from b.business_id or not go_reservation_verification.can_verify(b,caller) then
     return jsonb_build_object('error','VERIFICATION_INVALID','httpStatus',404); end if;
 elsif p_operation in ('issue','invite') then
   if r.holder_id<>caller then return jsonb_build_object('error','VERIFICATION_INVALID','httpStatus',404); end if;
 elsif p_operation='revoke' and caller not in (r.holder_id,b.customer_id) then
   return jsonb_build_object('error','VERIFICATION_INVALID','httpStatus',404);
 end if;
 if b.status<>'CONFIRMED' or b.ends_at<=now() then return jsonb_build_object('error','VERIFICATION_NOT_ACTIVE','httpStatus',409); end if;
 if p_operation='preview' then
   if r.expires_at<=now() or (r.token_hash is distinct from code_hash and r.manual_hash is distinct from code_hash) then
     return jsonb_build_object('error','VERIFICATION_INVALID','httpStatus',404); end if;
   result:=go_reservation_verification.summary(b,r);
   if r.arrived_at is not null then return result||jsonb_build_object('valid',true,'arrivalAlreadyVerified',true); end if;
   raw:=translate(rtrim(encode(extensions.gen_random_bytes(32),'base64'),'='),'+/','-_');
   expiry:=least(r.expires_at,now()+interval '2 minutes');
   insert into go_reservation_verification.challenges values(go_reservation_verification.digest('CHALLENGE:'||raw),b.id,caller,r.version,expiry,null);
   return result||jsonb_build_object('valid',true,'challenge',raw,'expiresAt',expiry,
     'canConfirmArrival',now()>=b.starts_at-interval '2 hours');
 elsif p_operation='arrive' then
   select * into c from go_reservation_verification.challenges
     where secret_hash=go_reservation_verification.digest('CHALLENGE:'||p_challenge) and actor_id=caller for update;
   if not found or c.version<>r.version or c.expires_at<=now() or r.expires_at<=now() then
     return jsonb_build_object('error','VERIFICATION_INVALID','httpStatus',404); end if;
   if r.arrived_at is not null then return go_reservation_verification.summary(b,r)||jsonb_build_object('valid',true,'arrivalAlreadyVerified',true); end if;
   if c.used_at is not null or now()<b.starts_at-interval '2 hours' then
     return jsonb_build_object('error','VERIFICATION_OUTSIDE_ARRIVAL_WINDOW','httpStatus',409); end if;
   update go_reservation_verification.rights set arrived_at=now(),arrived_by=caller,arrival_request_hash=c.secret_hash where booking_id=b.id returning * into r;
   update go_reservation_verification.challenges set used_at=now() where secret_hash=c.secret_hash;
   insert into go_reservation_verification.events(booking_id,actor_id,action) values(b.id,caller,'arrival_verified');
   return go_reservation_verification.summary(b,r)||jsonb_build_object('valid',true,'arrivalAlreadyVerified',false);
 elsif p_operation='claim' then
   if r.invite_hash is distinct from code_hash or r.invite_expires_at<=now() or r.arrived_at is not null or r.holder_id=caller then
     return jsonb_build_object('error','VERIFICATION_INVALID','httpStatus',404); end if;
   insert into go_reservation_verification.events(booking_id,actor_id,action,previous_holder,new_holder) values(b.id,caller,'right_transferred',r.holder_id,caller);
   update go_reservation_verification.rights set holder_id=caller,version=version+1,token_hash=null,manual_hash=null,expires_at=null,invite_hash=null,invite_expires_at=null where booking_id=b.id returning * into r;
   delete from go_reservation_verification.challenges where booking_id=b.id;
   return jsonb_build_object('bookingId',b.id,'summary',go_reservation_verification.summary(b,r));
 elsif p_operation='invite' then
   if r.arrived_at is not null then return jsonb_build_object('error','VERIFICATION_ALREADY_ARRIVED','httpStatus',409); end if;
   raw:='GO:HANDOVER:1:'||translate(rtrim(encode(extensions.gen_random_bytes(32),'base64'),'='),'+/','-_');
   update go_reservation_verification.rights set invite_hash=go_reservation_verification.digest(raw),invite_expires_at=least(now()+interval '30 minutes',b.ends_at) where booking_id=b.id returning * into r;
   insert into go_reservation_verification.events(booking_id,actor_id,action) values(b.id,caller,'transfer_invitation_issued');
   return jsonb_build_object('invitation',raw,'expiresAt',r.invite_expires_at);
 elsif p_operation='revoke' then
   if r.arrived_at is not null then return jsonb_build_object('error','VERIFICATION_ALREADY_ARRIVED','httpStatus',409); end if;
   update go_reservation_verification.rights set holder_id=b.customer_id,version=version+1,token_hash=null,manual_hash=null,expires_at=null,invite_hash=null,invite_expires_at=null where booking_id=b.id;
   delete from go_reservation_verification.challenges where booking_id=b.id;
   insert into go_reservation_verification.events(booking_id,actor_id,action,previous_holder,new_holder) values(b.id,caller,'credentials_revoked',r.holder_id,b.customer_id);
   return jsonb_build_object('revoked',true);
 end if;
 -- issue: rotate both credentials and every pending preview. No persistent raw
 -- secrets. Codes live ten minutes (never beyond the booking), only in memory.
 if r.arrived_at is not null then return jsonb_build_object('error','VERIFICATION_ALREADY_ARRIVED','httpStatus',409); end if;
 raw:='GO:RESERVATION:1:'||translate(rtrim(encode(extensions.gen_random_bytes(32),'base64'),'='),'+/','-_');
 manual:=upper(encode(extensions.gen_random_bytes(16),'hex'));
 update go_reservation_verification.rights set version=version+1,token_hash=go_reservation_verification.digest(raw),
   manual_hash=go_reservation_verification.digest('MANUAL:'||manual),expires_at=least(now()+interval '10 minutes',b.ends_at) where booking_id=b.id returning * into r;
 delete from go_reservation_verification.challenges where booking_id=b.id;
 insert into go_reservation_verification.events(booking_id,actor_id,action) values(b.id,caller,'credentials_rotated');
 return jsonb_build_object('qrPayload',raw,'manualCode',manual,'expiresAt',r.expires_at,'summary',go_reservation_verification.summary(b,r));
end;
$$;

revoke all on all functions in schema go_reservation_verification from public,anon,authenticated;
grant execute on function go_reservation_verification.act(text,uuid,uuid,text,text) to authenticated;
create function public.go_verify_booking(p_operation text,p_booking_id uuid default null,p_business_id uuid default null,p_secret text default null,p_challenge text default null)
returns jsonb language sql security invoker set search_path='' as $$
 select go_reservation_verification.act(p_operation,p_booking_id,p_business_id,p_secret,p_challenge);
$$;
revoke all on function public.go_verify_booking(text,uuid,uuid,text,text) from public,anon;
grant execute on function public.go_verify_booking(text,uuid,uuid,text,text) to authenticated;
commit;
