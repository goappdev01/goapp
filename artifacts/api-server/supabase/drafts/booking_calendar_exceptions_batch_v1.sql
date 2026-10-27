-- REVIEW / LOCAL ACTIVATION ONLY. Requires booking_calendar_exceptions_v1.
-- Groups real per-professional rules atomically; no second availability engine.
begin;
create table go_booking_timeline_private.calendar_exception_batches (
 business_id uuid not null references public.businesses(id),
 actor_id uuid not null references public.profiles(id),
 request_key text not null,
 command jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(business_id,actor_id,request_key)
);
alter table go_booking_timeline_private.calendar_exception_batches enable row level security;
revoke all on go_booking_timeline_private.calendar_exception_batches from public,anon,authenticated;

create function go_booking_timeline_private.calendar_staff_selection(p_business uuid,p_staff uuid[])
returns uuid[] language plpgsql stable set search_path='' as $$
declare selected uuid[];
begin
 if p_staff is null or cardinality(p_staff) not between 1 and 100 or array_position(p_staff,null) is not null then
  raise exception using errcode='PT422',message='BOOKING_STAFF_UNAVAILABLE';end if;
 select array_agg(distinct s order by s) into selected from unnest(p_staff) s;
 if cardinality(selected)<>cardinality(p_staff) or exists(select 1 from unnest(selected) chosen(id) where not exists(
  select 1 from public.staff s where s.id=chosen.id and s.business_id=p_business and s.active
   and coalesce(s.ui_metadata->>'archived','false')<>'true')) then
  raise exception using errcode='PT422',message='BOOKING_STAFF_UNAVAILABLE';end if;
 return selected;
end; $$;

create function go_booking_timeline_private.calendar_batch_list(p_business uuid,p_date date,p_staff uuid[],p_from date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare selected uuid[];member uuid;result jsonb;days jsonb:='[]';
begin
 -- Authenticate/authorize before disclosing whether professional IDs exist.
 result:=go_booking_timeline_private.calendar_list(p_business,p_date,null,p_from);
 selected:=go_booking_timeline_private.calendar_staff_selection(p_business,p_staff);
 foreach member in array selected loop
  result:=go_booking_timeline_private.calendar_list(p_business,p_date,member,p_from);
  days:=days||jsonb_build_array(result->'day');
 end loop;
 return result||jsonb_build_object('staffIds',to_jsonb(selected),'days',days);
end; $$;

create function go_booking_timeline_private.calendar_batch_save(p_business uuid,p_date date,p_staff uuid[],p_intervals jsonb,
 p_revisions jsonb,p_request text,p_delete boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare selected uuid[];member uuid;command jsonb;previous jsonb;result jsonb;zone text;revision integer;changed integer:=0;
begin
 result:=go_booking_timeline_private.calendar_batch_list(p_business,p_date,p_staff,p_date);
 selected:=go_booking_timeline_private.calendar_staff_selection(p_business,p_staff);
 if p_request is null or p_request!~'^[A-Za-z0-9_-]{1,128}$' or p_delete is null
  or jsonb_typeof(p_revisions) is distinct from 'object'
  or (select count(*) from jsonb_object_keys(p_revisions))<>cardinality(selected)
  or exists(select 1 from unnest(selected) chosen(member_id) where jsonb_typeof(p_revisions->chosen.member_id::text) is distinct from 'number'
   or (p_revisions->>chosen.member_id::text)!~'^[0-9]+$' or (p_revisions->>chosen.member_id::text)::numeric>2147483647) then
  raise exception using errcode='PT422',message='BOOKING_INVALID_COMMAND';end if;
 command:=jsonb_build_object('dateISO',p_date,'staffIds',to_jsonb(selected),'intervals',
  case when p_delete then '[]'::jsonb else go_booking_timeline_private.calendar_intervals(p_intervals) end,
  'expectedRevisions',p_revisions,'delete',p_delete);
 select b.command into previous from go_booking_timeline_private.calendar_exception_batches b
  where b.business_id=p_business and b.actor_id=auth.uid() and b.request_key=p_request;
 if found then
  if previous is distinct from command then raise exception using errcode='PT409',message='BOOKING_REQUEST_REUSED';end if;
 else
  foreach member in array selected loop
   revision:=(p_revisions->>member::text)::integer;
   -- A mixed selection can delete its existing rules without inventing missing ones.
   if p_delete and revision=0 then
    if exists(select 1 from public.booking_calendar_exceptions e where e.business_id=p_business and e.staff_id=member
      and e.local_date=p_date and e.active) then raise exception using errcode='PT409',message='BOOKING_CALENDAR_CHANGED';end if;
   else
    perform go_booking_timeline_private.calendar_save(p_business,member,p_date,p_intervals,revision,
     'batch_'||md5(p_request||':'||member::text),p_delete);
    changed:=changed+1;
   end if;
  end loop;
  if changed=0 then raise exception using errcode='PT409',message='BOOKING_CALENDAR_CHANGED';end if;
  insert into go_booking_timeline_private.calendar_exception_batches(business_id,actor_id,request_key,command)
   values(p_business,auth.uid(),p_request,command);
 end if;
 zone:=result->>'timezone';
 return go_booking_timeline_private.calendar_batch_list(p_business,p_date,selected,(now() at time zone zone)::date);
end; $$;

create function public.go_booking_calendar_exceptions_batch(p_business_id uuid,p_date_iso date,p_staff_ids uuid[],p_from_date date default null)
returns jsonb language sql security invoker set search_path='' as $$
 select go_booking_timeline_private.calendar_batch_list(p_business_id,p_date_iso,p_staff_ids,coalesce(p_from_date,p_date_iso));
$$;
create function public.go_save_booking_calendar_exceptions_batch(p_business_id uuid,p_date_iso date,p_staff_ids uuid[],p_intervals jsonb,
 p_expected_revisions jsonb,p_request_key text,p_delete boolean default false)
returns jsonb language sql security invoker set search_path='' as $$
 select go_booking_timeline_private.calendar_batch_save(p_business_id,p_date_iso,p_staff_ids,p_intervals,p_expected_revisions,p_request_key,p_delete);
$$;
revoke all on function go_booking_timeline_private.calendar_staff_selection(uuid,uuid[]),
 go_booking_timeline_private.calendar_batch_list(uuid,date,uuid[],date),
 go_booking_timeline_private.calendar_batch_save(uuid,date,uuid[],jsonb,jsonb,text,boolean),
 public.go_booking_calendar_exceptions_batch(uuid,date,uuid[],date),
 public.go_save_booking_calendar_exceptions_batch(uuid,date,uuid[],jsonb,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function go_booking_timeline_private.calendar_batch_list(uuid,date,uuid[],date),
 go_booking_timeline_private.calendar_batch_save(uuid,date,uuid[],jsonb,jsonb,text,boolean),
 public.go_booking_calendar_exceptions_batch(uuid,date,uuid[],date),
 public.go_save_booking_calendar_exceptions_batch(uuid,date,uuid[],jsonb,jsonb,text,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
