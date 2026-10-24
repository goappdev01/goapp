-- Reviewable upgrade for existing installations. No data is deleted or repriced.
-- Apply only with separate authorization for the target database.
-- Existing confirmed catalog_snapshot values remain immutable.
begin;
alter table go_catalog_private.associations drop constraint associations_mode_check;
alter table go_catalog_private.associations add constraint associations_mode_check
 check (mode in ('included','optional','recommended','required'));
create or replace function go_catalog_private.manage(p_business uuid,p_operation text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item go_catalog_private.associations;
begin
 perform go_catalog_private.owner(p_business);
 if p_input ? 'mode' and p_input->>'mode' not in ('included','optional','recommended') then
  raise exception using errcode='PT422',message='CATALOG_INVALID_MODE';end if;
 if p_operation='list' then return coalesce((select jsonb_agg(to_jsonb(a) order by a.source_id,a.target_id)
  from go_catalog_private.associations a where business_id=p_business),'[]'::jsonb);end if;
 if p_operation='create' then
  insert into go_catalog_private.associations(business_id,source_id,target_id,mode)
  values(p_business,(p_input->>'sourceId')::uuid,(p_input->>'targetId')::uuid,p_input->>'mode') returning * into item;
 else
  select * into item from go_catalog_private.associations where id=(p_input->>'id')::uuid and business_id=p_business for update;
  if not found then raise exception using errcode='PT404',message='CATALOG_RELATION_NOT_FOUND';end if;
  if (p_input->>'revision')::integer is distinct from item.revision then
   raise exception using errcode='PT409',message='CATALOG_RELATION_STALE';end if;
  if p_operation='delete' then delete from go_catalog_private.associations where id=item.id;return jsonb_build_object('deleted',item.id);
  elsif p_operation='update' then update go_catalog_private.associations set mode=coalesce(p_input->>'mode',mode),
   active=coalesce((p_input->>'active')::boolean,active) where id=item.id returning * into item;
  else raise exception using errcode='PT422',message='CATALOG_INVALID_OPERATION';end if;
 end if;
 return to_jsonb(item);
end; $$;

create or replace function go_catalog_private.quote(p_business uuid,p_roots uuid[],p_selected uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ids uuid[]:=p_roots; processed uuid[]:='{}'; used uuid[]:='{}'; included uuid[]:='{}'; missing uuid[]:='{}';
 root uuid; current_id uuid; target public.services; item public.services; a go_catalog_private.associations;
 options jsonb:='[]'; lines jsonb:='[]'; revisions jsonb:='[]'; service_ids uuid[]:='{}'; total numeric:=0; money text;
begin
 perform go_catalog_private.readable(p_business);
 if p_roots is null or cardinality(p_roots) not between 1 and 32 or array_position(p_roots,null) is not null
 or cardinality(p_roots)<>(select count(distinct x) from unnest(p_roots) x)
 or p_selected is null or cardinality(p_selected)>64 or array_position(p_selected,null) is not null
 or cardinality(p_selected)<>(select count(distinct x) from unnest(p_selected) x) then
  raise exception using errcode='PT422',message='CATALOG_INVALID_SELECTION';end if;
 while exists(select 1 from unnest(ids) x where not x=any(processed)) loop
  if cardinality(ids)>64 then raise exception using errcode='PT422',message='CATALOG_SELECTION_TOO_LARGE';end if;
  select x into current_id from unnest(ids) with ordinality q(x,n) where not x=any(processed) order by n limit 1;
  processed:=array_append(processed,current_id);
  select * into item from public.services where id=current_id and business_id=p_business and active and coalesce(ui_metadata->>'archived','false')<>'true';
  if not found then raise exception using errcode='PT422',message='CATALOG_ITEM_UNAVAILABLE';end if;
  for a in select * from go_catalog_private.associations where business_id=p_business and source_id=current_id and active order by id loop
   select * into target from public.services where id=a.target_id and business_id=p_business and active and coalesce(ui_metadata->>'archived','false')<>'true';
   if not found then
    if a.mode in ('included','required') or a.id=any(p_selected) then raise exception using errcode='PT422',message='CATALOG_ITEM_UNAVAILABLE';end if;
    continue;
   end if;
   options:=options||jsonb_build_array(jsonb_build_object('associationId',a.id,'sourceId',a.source_id,'itemId',a.target_id,
    'mode',case when a.mode='required' then 'included' else a.mode end,'name',target.name,'kind',go_catalog_private.kind(target.ui_metadata),'price',target.price,'currency',target.currency,
    'selected',a.mode in ('included','required') or a.id=any(p_selected)));
   revisions:=revisions||jsonb_build_array(jsonb_build_object('id',a.id,'revision',a.revision));
   if a.mode in ('included','required') or a.id=any(p_selected) then
    used:=array_append(used,a.id);
    if a.mode in ('included','required') then included:=array_append(included,a.target_id);end if;
    if not a.target_id=any(ids) then ids:=array_append(ids,a.target_id);end if;
   end if;
  end loop;
 end loop;
 if exists(select 1 from unnest(p_selected) x where not x=any(used)) then
  raise exception using errcode='PT422',message='CATALOG_SELECTION_NOT_OFFERED';end if;
 foreach root in array ids loop
  select * into item from public.services where id=root and business_id=p_business;
  if item.price is null or item.price<0 then raise exception using errcode='PT422',message='CATALOG_PRICE_UNAVAILABLE';end if;
  if money is not null and money<>item.currency then raise exception using errcode='PT422',message='CATALOG_CURRENCY_MISMATCH';end if;
  money:=item.currency;
  if go_catalog_private.kind(item.ui_metadata)='product' and (item.ui_metadata ? 'stock' or item.ui_metadata ? 'inventory'
   or coalesce(item.ui_metadata->>'stockManaged','false')<>'false') then
   raise exception using errcode='PT422',message='CATALOG_STOCK_INTEGRATION_REQUIRED';end if;
  if go_catalog_private.kind(item.ui_metadata)='service' then service_ids:=array_append(service_ids,item.id);end if;
  lines:=lines||jsonb_build_array(jsonb_build_object('itemId',item.id,'name',item.name,'kind',go_catalog_private.kind(item.ui_metadata),
   'durationMinutes',item.duration_minutes,'quantity',1,'unitPrice',item.price,'currency',item.currency,
   'included',item.id=any(included),'charge',case when item.id=any(included) then 0 else item.price end));
  if not item.id=any(included) then total:=total+item.price;end if;
 end loop;
 return jsonb_build_object('version',1,'businessId',p_business,'rootIds',p_roots,'selectedAssociationIds',p_selected,
  'associationRevisions',revisions,'lines',lines,'options',options,'missingRequired',missing,'ready',cardinality(missing)=0,
  'serviceIds',service_ids,'totalPrice',total,'currency',money);
end; $$;

create or replace function go_catalog_private.create_booking(p_business uuid,p_roots uuid[],p_selected uuid[],p_start timestamptz,p_staff uuid,
 p_request text,p_expected_quote jsonb,p_expected_plan jsonb,p_expected_end timestamptz,p_notes text,p_customer uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid();customer uuid:=coalesce(p_customer,auth.uid());q jsonb;cmd jsonb;saved go_catalog_private.booking_commands;result jsonb;ids uuid[];
begin
 perform go_catalog_private.readable(p_business);
 if customer<>caller then perform go_catalog_private.owner(p_business);end if;
 if p_request is null or p_request!~'^[a-zA-Z0-9_-]{1,128}$' then raise exception using errcode='PT422',message='CATALOG_INVALID_COMMAND';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('go-booking:'||p_business::text,0));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('go-catalog-customer:'||customer::text,0));
 cmd:=jsonb_build_object('actor',caller,'business',p_business,'roots',p_roots,'selected',p_selected,'start',p_start,'staff',p_staff,
  'quote',p_expected_quote,'plan',p_expected_plan,'end',p_expected_end,'notes',p_notes,'customer',customer);
 select * into saved from go_catalog_private.booking_commands where customer_id=customer and request_key=p_request;
 if found then
  if saved.command is distinct from cmd then raise exception using errcode='PT409',message='CATALOG_REQUEST_REUSED';end if;
  return (select to_jsonb(b) from public.bookings b where id=saved.booking_id);
 end if;
 q:=go_catalog_private.quote(p_business,p_roots,p_selected);
 if p_expected_quote is null or q is distinct from p_expected_quote then raise exception using errcode='PT409',message='CATALOG_QUOTE_STALE';end if;
 select array_agg(value::uuid order by n) into ids from jsonb_array_elements_text(q->'serviceIds') with ordinality t(value,n);
 if cardinality(ids) is null then raise exception using errcode='PT422',message='CATALOG_SERVICE_REQUIRED_FOR_BOOKING';end if;
 insert into go_catalog_private.booking_commands(customer_id,request_key,business_id,actor_id,command,quote)
 values(customer,p_request,p_business,caller,cmd,q);
 result:=go_booking_timeline_private.create_booking(p_business,ids,p_start,p_staff,p_request,p_notes,'CONFIRMED',customer,p_expected_plan,p_expected_end);
 update go_catalog_private.booking_commands set booking_id=(result->>'id')::uuid where customer_id=customer and request_key=p_request;
 return result;
end; $$;
-- Existing function ownership, grants, RLS and request-key checks are preserved.
commit;
