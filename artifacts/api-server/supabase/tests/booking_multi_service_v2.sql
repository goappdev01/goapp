-- Prepared, NOT EXECUTED. Run only in a disposable database after reviewing
-- and applying the draft there. Never run against GO real.
begin;
do $$ begin
 if current_setting('go.booking_test_environment',true) is distinct from 'isolated' then
   raise exception 'Requires explicitly isolated booking test environment';
 end if;
end; $$;
select set_config('go.test.owner',gen_random_uuid()::text,true),
 set_config('go.test.customer',gen_random_uuid()::text,true),
 set_config('go.test.other',gen_random_uuid()::text,true),
 set_config('go.test.business',gen_random_uuid()::text,true),
 set_config('go.test.business2',gen_random_uuid()::text,true),
 set_config('go.test.cut',gen_random_uuid()::text,true),
 set_config('go.test.colour',gen_random_uuid()::text,true),
 set_config('go.test.foreign',gen_random_uuid()::text,true),
 set_config('go.test.staff',gen_random_uuid()::text,true),
 set_config('go.test.staff2',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data) values
 (current_setting('go.test.owner')::uuid,'owner-'||current_setting('go.test.owner')||'@example.invalid','{}'),
 (current_setting('go.test.customer')::uuid,'client-'||current_setting('go.test.customer')||'@example.invalid','{}'),
 (current_setting('go.test.other')::uuid,'other-'||current_setting('go.test.other')||'@example.invalid','{}');
insert into public.businesses(id,owner_id,name,verified,booking_enabled) values
 (current_setting('go.test.business')::uuid,current_setting('go.test.owner')::uuid,'Fictional salon',true,true),
 (current_setting('go.test.business2')::uuid,current_setting('go.test.owner')::uuid,'Fictional clinic',true,true);
insert into public.services(id,business_id,name,duration_minutes,price,currency) values
 (current_setting('go.test.cut')::uuid,current_setting('go.test.business')::uuid,'Cut',30,12.10,'EUR'),
 (current_setting('go.test.colour')::uuid,current_setting('go.test.business')::uuid,'Colour',60,20.20,'EUR'),
 (current_setting('go.test.foreign')::uuid,current_setting('go.test.business2')::uuid,'Other business service',60,50,'EUR');
insert into public.staff(id,business_id,display_name,ui_metadata) values
 (current_setting('go.test.staff')::uuid,current_setting('go.test.business')::uuid,'Qualified professional','{}'),
 (current_setting('go.test.staff2')::uuid,current_setting('go.test.business')::uuid,'Cut only',jsonb_build_object('serviceIds',jsonb_build_array(current_setting('go.test.cut'))));
insert into public.availability(business_id,weekday,start_time,end_time,timezone)
 select current_setting('go.test.business')::uuid,day,'09:00','18:00','Europe/Madrid' from generate_series(0,6) day;
select set_config('request.jwt.claim.sub',current_setting('go.test.customer'),true);
set local role authenticated;
do $$
declare
 biz uuid:=current_setting('go.test.business')::uuid;
 cut uuid:=current_setting('go.test.cut')::uuid;
 colour uuid:=current_setting('go.test.colour')::uuid;
 pro uuid:=current_setting('go.test.staff')::uuid;
 first jsonb; retry jsonb; another jsonb;
 starts timestamptz:='2035-01-01 10:00 Europe/Madrid';
begin
 if public.go_booking_contract() <> '{"version":2,"multiService":true}'::jsonb then raise exception 'Wrong capability'; end if;
 first:=public.go_create_service_booking(biz,array[cut,colour],pro,starts,starts+interval '90 minutes',null,'CONFIRMED','test_retry');
 if first->>'total_price'<>'32.30' or (first->>'total_duration_minutes')::int<>90
   or jsonb_array_length(first->'service_details')<>2 or first->>'service_id'<>cut::text then
   raise exception 'Totals/snapshots wrong: %',first;
 end if;
 retry:=public.go_create_service_booking(biz,array[cut,colour],pro,starts,starts+interval '90 minutes',null,'CONFIRMED','test_retry');
 if retry->>'id'<>first->>'id' or (select count(*) from public.bookings where request_key='test_retry')<>1 then raise exception 'Duplicate retry'; end if;
 begin
   perform public.go_create_service_booking(biz,array[cut,colour],pro,starts+interval '60 minutes',starts+interval '150 minutes',null,'CONFIRMED','test_overlap');
   raise exception 'Overlap accepted';
 exception when exclusion_violation then null; end;
 begin
   perform public.go_create_service_booking(biz,array[cut,colour],pro,starts+interval '2 hours',starts+interval '150 minutes',null,'CONFIRMED','test_short');
   raise exception 'Shortened duration accepted';
 exception when invalid_parameter_value then null; end;
 begin
   perform public.go_create_service_booking(biz,array[cut,cut],pro,starts+interval '2 hours',starts+interval '3 hours',null,'CONFIRMED','test_duplicate');
   raise exception 'Duplicate service accepted';
 exception when invalid_parameter_value then null; end;
 begin
   perform public.go_create_service_booking(biz,array[cut,current_setting('go.test.foreign')::uuid],pro,starts+interval '2 hours',starts+interval '210 minutes',null,'CONFIRMED','test_foreign');
   raise exception 'Cross-company selection accepted';
 exception when invalid_parameter_value then null; end;
 begin
   perform public.go_create_service_booking(biz,array[cut,colour],current_setting('go.test.staff2')::uuid,starts+interval '2 hours',starts+interval '210 minutes',null,'CONFIRMED','test_specialties');
   raise exception 'Unqualified professional accepted';
 exception when invalid_parameter_value then null; end;
 begin
   perform public.go_create_service_booking(biz,array[cut,colour],pro,'2035-01-01 17:30 Europe/Madrid','2035-01-01 19:00 Europe/Madrid',null,'CONFIRMED','test_shift');
   raise exception 'Booking outside full shift accepted';
 exception when invalid_parameter_value then null; end;
 begin
   update public.bookings set service_details='[]' where id=(first->>'id')::uuid;
   raise exception 'Snapshot tampering accepted';
 exception when insufficient_privilege then null; end;
 -- Cancellation keeps service history and releases exactly the original interval.
 update public.bookings set status='CANCELLED' where id=(first->>'id')::uuid;
 if (select jsonb_array_length(service_details) from public.bookings where id=(first->>'id')::uuid)<>2 then raise exception 'Cancellation erased history'; end if;
 another:=public.go_create_service_booking(biz,array[cut,colour],null,starts,starts+interval '90 minutes',null,'CONFIRMED','test_no_preference');
 if another->>'staff_id'<>pro::text then raise exception 'No-preference did not choose qualified professional'; end if;
 -- Legacy one-service insert remains valid, with no fabricated historical price.
 insert into public.bookings(business_id,service_id,staff_id,customer_id,starts_at,ends_at,status)
 values(biz,cut,pro,auth.uid(),starts+interval '2 hours',starts+interval '150 minutes','CONFIRMED');
 if not exists(select 1 from public.bookings where service_ids is null and service_id=cut) then raise exception 'Legacy row changed'; end if;
end; $$;
reset role;
-- Another customer's busy interval must block even though customer RLS hides it.
select set_config('request.jwt.claim.sub',current_setting('go.test.other'),true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.bookings where request_key='test_no_preference') then raise exception 'RLS leaked another customer booking'; end if;
 begin
   perform public.go_create_service_booking(current_setting('go.test.business')::uuid,
    array[current_setting('go.test.cut')::uuid,current_setting('go.test.colour')::uuid],current_setting('go.test.staff')::uuid,
    '2035-01-01 10:00 Europe/Madrid','2035-01-01 11:30 Europe/Madrid',null,'CONFIRMED','test_other_customer_overlap');
   raise exception 'Hidden customer overlap accepted';
 exception when exclusion_violation then null; end;
end; $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.go_booking_contract();raise exception 'Anonymous execution allowed';
 exception when insufficient_privilege then null;end;
end; $$;
reset role;
rollback;
select 'PASS only if executed: totals, snapshots, idempotency, shifts, specialties, tenant isolation, RLS, cancellation, legacy path' as result;
