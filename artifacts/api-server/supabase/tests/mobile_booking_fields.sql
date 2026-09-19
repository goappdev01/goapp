begin;
select set_config('go.test.owner', gen_random_uuid()::text, true);
select set_config('go.test.other', gen_random_uuid()::text, true);
select set_config('go.test.client', gen_random_uuid()::text, true);
insert into auth.users (id, email, raw_user_meta_data)
values (current_setting('go.test.owner')::uuid, 'owner-' || current_setting('go.test.owner') || '@example.invalid', '{"role":"empresa"}'),
       (current_setting('go.test.other')::uuid, 'other-' || current_setting('go.test.other') || '@example.invalid', '{"role":"empresa"}'),
       (current_setting('go.test.client')::uuid, 'client-' || current_setting('go.test.client') || '@example.invalid', '{"role":"admin"}');
select set_config('go.test.business', gen_random_uuid()::text, true);
select set_config('go.test.otherbusiness', gen_random_uuid()::text, true);
select set_config('go.test.service', gen_random_uuid()::text, true);
select set_config('go.test.foreignstaff', gen_random_uuid()::text, true);
insert into public.businesses(id,owner_id,name) values
(current_setting('go.test.business')::uuid,current_setting('go.test.owner')::uuid,'Temporary test A'),
(current_setting('go.test.otherbusiness')::uuid,current_setting('go.test.other')::uuid,'Temporary test B');
insert into public.services(id,business_id,name,duration_minutes,price,currency)
values(current_setting('go.test.service')::uuid,current_setting('go.test.business')::uuid,'Temporary service',30,25,'EUR');
insert into public.staff(id,business_id,display_name)
values(current_setting('go.test.foreignstaff')::uuid,current_setting('go.test.otherbusiness')::uuid,'Temporary foreign staff');
select set_config('request.jwt.claim.sub',current_setting('go.test.client'),true);
set local role authenticated;
do $$
begin
 if (select role from public.profiles where id=auth.uid()) <> 'usuario' then raise exception 'Privileged signup role was accepted'; end if;
 begin
  update public.profiles set role='admin' where id=auth.uid();
  raise exception 'Role escalation was allowed';
 exception when insufficient_privilege then null; end;
 begin
  update public.businesses set verified=true where id=current_setting('go.test.business')::uuid;
  raise exception 'Verification field was writable';
 exception when insufficient_privilege then null; end;
 update public.businesses set name='Forbidden' where id=current_setting('go.test.business')::uuid;
 if found then raise exception 'Foreign business was updated'; end if;
 begin
  insert into public.bookings(business_id,service_id,staff_id,customer_id,starts_at,ends_at,status)
  values(current_setting('go.test.business')::uuid,current_setting('go.test.service')::uuid,current_setting('go.test.foreignstaff')::uuid,auth.uid(),now()+interval '1 day',now()+interval '1 day 30 minutes','CONFIRMED');
  raise exception 'Cross-business staff was accepted';
 exception when foreign_key_violation then null; end;
 insert into public.bookings(business_id,service_id,customer_id,starts_at,ends_at,status)
 values(current_setting('go.test.business')::uuid,current_setting('go.test.service')::uuid,auth.uid(),now()+interval '1 day',now()+interval '1 day 30 minutes','CONFIRMED');
 begin
  insert into public.bookings(business_id,service_id,customer_id,starts_at,ends_at,status)
  values(current_setting('go.test.business')::uuid,current_setting('go.test.service')::uuid,auth.uid(),now()+interval '1 day',now()+interval '1 day 30 minutes','CONFIRMED');
  raise exception 'Overlap was accepted';
 exception when exclusion_violation then null; end;
 begin
  update public.bookings set status='COMPLETED' where customer_id=auth.uid();
  raise exception 'Customer completed own booking';
 exception when insufficient_privilege then null; end;
 update public.bookings set status='CANCELLED' where customer_id=auth.uid();
 if not found then raise exception 'Customer cancellation failed'; end if;
end;
$$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('go.test.other'),true);
set local role authenticated;
do $$
begin
 if exists(select 1 from public.bookings where business_id=current_setting('go.test.business')::uuid) then raise exception 'Other business can see customer booking'; end if;
end;
$$;
reset role;

select set_config('request.jwt.claim.sub',current_setting('go.test.owner'),true);
set local role authenticated;
do $$
begin
 insert into public.business_settings(business_id,payload)
 values(current_setting('go.test.business')::uuid,'{"businessName":"Cloud roundtrip", "activeDays":[0,1], "staffSchedules":{}}');
 update public.businesses set ui_metadata='{"phone":"123", "bookingColor":"#123456"}' where id=current_setting('go.test.business')::uuid;
 update public.services set ui_metadata='{"type":"hair","visible":true}' where id=current_setting('go.test.service')::uuid;
 if (select payload->>'businessName' from public.business_settings where business_id=current_setting('go.test.business')::uuid) <> 'Cloud roundtrip' then raise exception 'Config did not roundtrip'; end if;
 if (select ui_metadata->>'phone' from public.businesses where id=current_setting('go.test.business')::uuid) <> '123' then raise exception 'Metadata did not roundtrip'; end if;
end;
$$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('go.test.other'),true);
set local role authenticated;
do $$
begin
 if exists(select 1 from public.business_settings where business_id=current_setting('go.test.business')::uuid) then raise exception 'Foreign configuration leaked'; end if;
 begin
  insert into public.business_settings(business_id,payload) values(current_setting('go.test.business')::uuid,'{}');
  raise exception 'Foreign config write allowed';
 exception when insufficient_privilege then null; end;
end;
$$;
reset role;
rollback;
select 'PASS: configuration roundtrip, metadata, owner isolation, booking regression; fixtures rolled back' as result;
