-- Booking messages extend GO Communication. No bookings, identities or roles are changed.
-- Apply after booking_negotiation_v1. One conversation per existing booking.
begin;
create table go_reservation_negotiation.messages (
  booking_id uuid not null references public.bookings(id),
  sender_id uuid not null references public.profiles(id),
  message_id uuid not null,
  body text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default clock_timestamp(),
  primary key (sender_id,message_id)
);
create index booking_messages_thread on go_reservation_negotiation.messages(booking_id,created_at,message_id);
alter table go_reservation_negotiation.messages enable row level security;
revoke all on go_reservation_negotiation.messages from public,anon,authenticated;

create function go_reservation_negotiation.conversations(p_booking_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED'; end if;
  if p_booking_id is not null and not exists(select 1 from public.bookings r join public.businesses b on b.id=r.business_id
    where r.id=p_booking_id and (r.customer_id=auth.uid() or (b.owner_id=auth.uid() and b.verified))) then
    raise exception using errcode='42501',message='BOOKING_FORBIDDEN';
  end if;
  return coalesce((select jsonb_agg(thread order by touched desc,booking_id) from (
    select r.id booking_id,coalesce(max(m.created_at),r.created_at) touched,jsonb_build_object(
      'id','booking:'||r.id::text,'bookingId',r.id,'businessId',r.business_id,
      'counterpartId',case when r.customer_id=auth.uid() then b.owner_id else r.customer_id end,
      'contactName',case when r.customer_id=auth.uid() then b.name else nullif(btrim(c.full_name),'') end,
      'lastUpdated',extract(epoch from coalesce(max(m.created_at),r.created_at))*1000,
      'messages',coalesce(jsonb_agg(jsonb_build_object('id',m.message_id,'text',m.body,
        'senderId',case when m.sender_id=auth.uid() then 'yo' else m.sender_id::text end,
        'createdAt',extract(epoch from m.created_at)*1000,'channel','go','linkedGoId',r.id)
        order by m.created_at,m.message_id) filter(where m.message_id is not null),'[]'::jsonb)) thread
    from public.bookings r join public.businesses b on b.id=r.business_id
    left join public.profiles c on c.id=r.customer_id
    left join go_reservation_negotiation.messages m on m.booking_id=r.id
    where (p_booking_id is null or r.id=p_booking_id)
      and (r.customer_id=auth.uid() or (b.owner_id=auth.uid() and b.verified))
      and (p_booking_id is not null or exists(select 1 from go_reservation_negotiation.messages x where x.booking_id=r.id))
    group by r.id,b.id,c.id
  ) authorized),'[]'::jsonb);
end;
$$;
revoke all on function go_reservation_negotiation.conversations(uuid) from public,anon,authenticated;
grant execute on function go_reservation_negotiation.conversations(uuid) to authenticated;

create function go_reservation_negotiation.send_message(p_booking_id uuid,p_message_id uuid,p_text text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous go_reservation_negotiation.messages;
begin
  perform go_reservation_negotiation.conversations(p_booking_id);
  if p_booking_id is null or p_message_id is null or p_text is null or length(btrim(p_text)) not between 1 and 1000 then
    raise exception using errcode='22023',message='INVALID_MESSAGE';
  end if;
  insert into go_reservation_negotiation.messages(booking_id,sender_id,message_id,body)
    values(p_booking_id,auth.uid(),p_message_id,btrim(p_text)) on conflict(sender_id,message_id) do nothing;
  select * into previous from go_reservation_negotiation.messages where sender_id=auth.uid() and message_id=p_message_id;
  if previous.booking_id<>p_booking_id or previous.body<>btrim(p_text) then
    raise exception using errcode='PT409',message='MESSAGE_REQUEST_REUSED';
  end if;
  return go_reservation_negotiation.conversations(p_booking_id)->0;
end;
$$;
revoke all on function go_reservation_negotiation.send_message(uuid,uuid,text) from public,anon,authenticated;
grant execute on function go_reservation_negotiation.send_message(uuid,uuid,text) to authenticated;

create function public.go_booking_conversations(p_booking_id uuid default null) returns jsonb
language sql security invoker set search_path='' as $$select go_reservation_negotiation.conversations(p_booking_id);$$;
create function public.go_send_booking_message(p_booking_id uuid,p_message_id uuid,p_text text) returns jsonb
language sql security invoker set search_path='' as $$select go_reservation_negotiation.send_message(p_booking_id,p_message_id,p_text);$$;
revoke all on function public.go_booking_conversations(uuid),public.go_send_booking_message(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.go_booking_conversations(uuid),public.go_send_booking_message(uuid,uuid,text) to authenticated;
commit;
