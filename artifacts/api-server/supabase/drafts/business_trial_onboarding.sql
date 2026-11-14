-- GO Empresa V1: borrador NO APLICADO. Antes de ejecutar: preflight del esquema
-- alojado, respaldo restaurable probado y autorización específica del propietario.
-- No ejecutar sobre DEMO ni modificar negocios de prueba locales.
begin;

create table public.registration_consents (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  privacy_version text not null,
  privacy_accepted_at timestamptz not null,
  contact_authorized_at timestamptz not null,
  marketing_opt_in boolean not null default false
);
alter table public.registration_consents enable row level security;
revoke all on public.registration_consents from public, anon, authenticated;
grant select on public.registration_consents to authenticated;
create policy registration_consent_owner on public.registration_consents for select to authenticated
  using (user_id = (select auth.uid()));

-- El teléfono y los consentimientos se reciben solo durante el alta en Auth.
-- La aprobación de una empresa NUNCA procede de metadatos de Auth.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  registration_phone text := new.raw_user_meta_data->>'phone';
begin
  if new.raw_user_meta_data->>'privacy_accepted' is distinct from 'true'
     or new.raw_user_meta_data->>'contact_authorized' is distinct from 'true'
     or new.raw_user_meta_data->>'privacy_version' is distinct from 'go-registration-v1'
     or registration_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Registration data incomplete' using errcode = '22023';
  end if;
  insert into public.profiles(id,full_name,phone,role)
  values(new.id, nullif(trim(new.raw_user_meta_data->>'full_name'),''), registration_phone,
    case when new.raw_user_meta_data->>'role' = 'empresa' then 'empresa'::public.account_role
         else 'usuario'::public.account_role end);
  insert into public.registration_consents(user_id,privacy_version,privacy_accepted_at,contact_authorized_at,marketing_opt_in)
  values(new.id,'go-registration-v1',now(),now(),new.raw_user_meta_data->>'marketing_opt_in' = 'true');
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public,anon,authenticated;

create table public.business_trial_requests (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  terms_version text not null check (terms_version = 'go-trial-v1'),
  accepted_at timestamptz not null default now(),
  status text not null default 'documents_pending'
    check (status in ('documents_pending','pending_review','needs_changes','rejected','approved')),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  review_notes text,
  trial_starts_at timestamptz,
  trial_ends_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint trial_dates_together check ((trial_starts_at is null) = (trial_ends_at is null)),
  constraint trial_approval_dates check ((status = 'approved') = (trial_starts_at is not null))
);
create index business_trial_review_queue on public.business_trial_requests(status,updated_at);
alter table public.business_trial_requests enable row level security;
revoke all on public.business_trial_requests from public,anon,authenticated;
grant select on public.business_trial_requests to authenticated;
create policy trial_owner_read on public.business_trial_requests for select to authenticated
  using (owner_id = (select auth.uid()));
create policy trial_admin_read on public.business_trial_requests for select to authenticated
  using (exists(select 1 from public.admin_memberships m where m.user_id=(select auth.uid())
    and m.active and (m.level='owner' or 'ownership.manage'=any(m.permissions))));
create policy verification_admin_review on public.business_verification_requests for select to authenticated
  using(exists(select 1 from public.admin_memberships m where m.user_id=(select auth.uid())
    and m.active and (m.level='owner' or 'ownership.manage'=any(m.permissions))));

create table public.business_trial_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_trial_requests(business_id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  kind text not null check(kind in ('identidad','fiscal','actividad','otro')),
  file_name text not null check(char_length(file_name) between 1 and 180),
  mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png')),
  byte_size integer not null check(byte_size between 1 and 5242880),
  object_path text not null unique,
  created_at timestamptz not null default now()
);
create index business_trial_document_business_idx on public.business_trial_documents(business_id);
alter table public.business_trial_documents enable row level security;
revoke all on public.business_trial_documents from public,anon,authenticated;
grant select on public.business_trial_documents to authenticated;
create policy document_owner_read on public.business_trial_documents for select to authenticated
  using(owner_id=(select auth.uid()));
create policy document_admin_read on public.business_trial_documents for select to authenticated
  using(exists(select 1 from public.admin_memberships m where m.user_id=(select auth.uid())
    and m.active and (m.level='owner' or 'ownership.manage'=any(m.permissions))));

-- Cubo privado: nunca se exponen URL públicas, claves de servicio ni documentos DEMO.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('go-business-documents','go-business-documents',false,5242880,
  array['application/pdf','image/jpeg','image/png']) on conflict(id) do nothing;
create policy go_docs_upload on storage.objects for insert to authenticated
  with check(bucket_id='go-business-documents' and (storage.foldername(name))[1]=(select auth.uid())::text
    and exists(select 1 from public.business_trial_requests t
      where t.business_id::text=(storage.foldername(name))[2] and t.owner_id=(select auth.uid())
        and t.status in ('documents_pending','needs_changes','rejected')));
create policy go_docs_owner_read on storage.objects for select to authenticated
  using(bucket_id='go-business-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy go_docs_admin_read on storage.objects for select to authenticated
  using(bucket_id='go-business-documents' and exists(select 1 from public.admin_memberships m
    where m.user_id=(select auth.uid()) and m.active
      and (m.level='owner' or 'ownership.manage'=any(m.permissions))));

-- Notificaciones transaccionales; la integración del proveedor queda desconectada.
create table public.go_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id),
  event_type text not null check(event_type in ('business_approved','business_changes_requested','business_rejected')),
  business_id uuid not null references public.businesses(id),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  provider text,
  unique(event_type,business_id,created_at)
);
alter table public.go_notification_outbox enable row level security;
revoke all on public.go_notification_outbox from public,anon,authenticated;
grant select on public.go_notification_outbox to authenticated;
create policy notification_owner_read on public.go_notification_outbox for select to authenticated
  using(recipient_id=(select auth.uid()));

create or replace function public.accept_business_trial(p_terms_version text)
returns setof public.businesses language plpgsql security definer set search_path='' as $$
declare caller uuid := auth.uid(); target public.businesses;
begin
  if caller is null or p_terms_version <> 'go-trial-v1' or not exists(
    select 1 from public.profiles p where p.id=caller and p.role='empresa') then
    raise exception 'Not allowed' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text,0));
  select * into target from public.businesses where owner_id=caller order by created_at desc limit 1 for update;
  if not found then
    insert into public.businesses(owner_id,name,timezone,verified,booking_enabled)
    values(caller,coalesce((select nullif(trim(full_name),'') from public.profiles where id=caller),'Empresa en alta'),
      'Europe/Madrid',false,false) returning * into target;
  end if;
  if target.verified then raise exception 'Business already verified' using errcode='42501'; end if;
  insert into public.business_trial_requests(business_id,owner_id,terms_version)
  values(target.id,caller,p_terms_version) on conflict(business_id) do nothing;
  return next target;
end;
$$;
revoke all on function public.accept_business_trial(text) from public,anon;
grant execute on function public.accept_business_trial(text) to authenticated;

-- Reemplaza el RPC existente: requiere prueba aceptada y documentación privada.
create or replace function public.submit_business_verification(
  p_business_id uuid,p_legal_name text,p_tax_id text,p_trading_name text,p_address text
) returns setof public.businesses language plpgsql security definer set search_path='' as $$
declare caller uuid := auth.uid(); target public.businesses; current_status text;
begin
  if caller is null or p_business_id is null then raise exception 'Trial required' using errcode='42501'; end if;
  if p_legal_name is null or char_length(trim(p_legal_name)) not between 2 and 200
    or p_tax_id is null or char_length(trim(p_tax_id)) not between 3 and 32
    or p_address is null or char_length(trim(p_address)) not between 1 and 4000
    or char_length(coalesce(p_trading_name,'')) > 200 then
    raise exception 'Invalid enrollment' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text,0));
  select * into target from public.businesses where id=p_business_id and owner_id=caller for update;
  select status into current_status from public.business_trial_requests
    where business_id=p_business_id and owner_id=caller for update;
  if not found or target.id is null or target.verified
     or current_status not in ('documents_pending','needs_changes','rejected')
     or not exists(select 1 from public.business_trial_documents where business_id=p_business_id and kind='identidad')
     or not exists(select 1 from public.business_trial_documents where business_id=p_business_id and kind='fiscal') then
    raise exception 'Trial and documents required' using errcode='42501';
  end if;
  update public.businesses set name=coalesce(nullif(trim(p_trading_name),''),trim(p_legal_name)),
    address=trim(p_address),booking_enabled=false,verified=false where id=target.id returning * into target;
  insert into public.business_verification_requests(business_id,legal_name,tax_id,trading_name,address,status)
  values(target.id,trim(p_legal_name),trim(p_tax_id),trim(coalesce(p_trading_name,'')),trim(p_address),'pending')
  on conflict(business_id) do update set legal_name=excluded.legal_name,tax_id=excluded.tax_id,
    trading_name=excluded.trading_name,address=excluded.address,status='pending',rejection_reason=null,updated_at=now();
  update public.business_trial_requests set status='pending_review',review_notes=null,updated_at=now()
    where business_id=target.id;
  return next target;
end;
$$;

-- Los archivos pasan a registro solo después de comprobar su almacenamiento.
create or replace function public.register_business_document(
  p_business_id uuid,p_kind text,p_file_name text,p_mime_type text,p_byte_size integer,p_object_path text
) returns setof public.business_trial_documents language plpgsql security definer set search_path='' as $$
declare caller uuid := auth.uid(); doc public.business_trial_documents;
begin
  if caller is null or p_kind not in ('identidad','fiscal','actividad','otro')
    or p_mime_type not in ('application/pdf','image/jpeg','image/png')
    or p_byte_size not between 1 and 5242880 or char_length(p_file_name) not between 1 and 180
    or not (p_object_path like caller::text||'/'||p_business_id::text||'/%')
    or not exists(select 1 from public.business_trial_requests t
      where t.business_id=p_business_id and t.owner_id=caller
        and t.status in ('documents_pending','needs_changes','rejected'))
    or not exists(select 1 from storage.objects o where o.bucket_id='go-business-documents' and o.name=p_object_path) then
    raise exception 'Invalid private document' using errcode='42501';
  end if;
  insert into public.business_trial_documents(business_id,owner_id,kind,file_name,mime_type,byte_size,object_path)
  values(p_business_id,caller,p_kind,p_file_name,p_mime_type,p_byte_size,p_object_path) returning * into doc;
  return next doc;
end;
$$;
revoke all on function public.register_business_document(uuid,text,text,text,integer,text) from public,anon;
grant execute on function public.register_business_document(uuid,text,text,text,integer,text) to authenticated;

-- La aprobación se decide dentro de una transacción que revalida OWNER.
create or replace function public.review_business_trial(p_business_id uuid,p_action text,p_reason text)
returns setof public.business_trial_requests language plpgsql security definer set search_path='' as $$
declare reviewer uuid := auth.uid(); target public.business_trial_requests; recipient uuid; event_name text;
begin
  if reviewer is null or not exists(select 1 from public.admin_memberships m
      where m.user_id=reviewer and m.active and (m.level='owner' or 'ownership.manage'=any(m.permissions))) then
    raise exception 'Admin required' using errcode='42501';
  end if;
  if p_action not in ('approve','changes','reject') or char_length(coalesce(p_reason,''))>1000
    or (p_action<>'approve' and char_length(trim(coalesce(p_reason,'')))<3) then
    raise exception 'Invalid decision' using errcode='22023';
  end if;
  select * into target from public.business_trial_requests where business_id=p_business_id for update;
  if not found or target.status<>'pending_review' or not exists(
    select 1 from public.business_trial_documents where business_id=p_business_id and kind='identidad')
    or not exists(select 1 from public.business_trial_documents where business_id=p_business_id and kind='fiscal') then
    raise exception 'Application not reviewable' using errcode='42501';
  end if;
  recipient:=target.owner_id;
  if p_action='approve' then
    update public.businesses set verified=true,booking_enabled=false where id=p_business_id;
    update public.business_trial_requests set status='approved',reviewed_at=now(),reviewed_by=reviewer,
      review_notes=null,trial_starts_at=now(),trial_ends_at=now()+interval '30 days',updated_at=now()
      where business_id=p_business_id returning * into target;
    event_name:='business_approved';
  else
    update public.business_verification_requests set status='rejected',rejection_reason=trim(p_reason),updated_at=now()
      where business_id=p_business_id;
    update public.business_trial_requests set status=case when p_action='changes' then 'needs_changes' else 'rejected' end,
      reviewed_at=now(),reviewed_by=reviewer,review_notes=trim(p_reason),updated_at=now()
      where business_id=p_business_id returning * into target;
    event_name:=case when p_action='changes' then 'business_changes_requested' else 'business_rejected' end;
  end if;
  insert into public.go_notification_outbox(recipient_id,event_type,business_id)
  values(recipient,event_name,p_business_id);
  return next target;
end;
$$;
revoke all on function public.review_business_trial(uuid,text,text) from public,anon;
grant execute on function public.review_business_trial(uuid,text,text) to authenticated;

-- La prueba caducada no puede utilizar el catálogo ni crear reservas.
-- Empresas reales verificadas ANTES de esta migración, sin prueba asociada,
-- conservan su acceso (no se les impone una fecha retroactiva).
create or replace function public.business_trial_active(p_business_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select not exists(select 1 from public.business_trial_requests t where t.business_id=p_business_id)
    or exists(select 1 from public.business_trial_requests t where t.business_id=p_business_id
      and t.status='approved' and now()<t.trial_ends_at);
$$;
revoke all on function public.business_trial_active(uuid) from public;
grant execute on function public.business_trial_active(uuid) to anon,authenticated;
alter policy businesses_public_read on public.businesses
  using(booking_enabled=true and verified=true and public.business_trial_active(id));
alter policy services_public_read on public.services using(active=true and exists(
  select 1 from public.businesses b where b.id=business_id and b.booking_enabled=true and b.verified=true
    and public.business_trial_active(b.id)));
alter policy staff_public_read on public.staff using(active=true and exists(
  select 1 from public.businesses b where b.id=business_id and b.booking_enabled=true and b.verified=true
    and public.business_trial_active(b.id)));
alter policy availability_public_read on public.availability using(active=true and exists(
  select 1 from public.businesses b where b.id=business_id and b.booking_enabled=true and b.verified=true
    and public.business_trial_active(b.id)));
alter policy bookings_customer_create on public.bookings with check(customer_id=auth.uid() and exists(
  select 1 from public.businesses b where b.id=business_id and b.booking_enabled=true and b.verified=true
    and public.business_trial_active(b.id)));
alter policy services_owner_manage on public.services
  using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()
    and b.verified and public.business_trial_active(b.id)))
  with check(exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()
    and b.verified and public.business_trial_active(b.id)));
alter policy staff_owner_manage on public.staff
  using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()
    and b.verified and public.business_trial_active(b.id)))
  with check(exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()
    and b.verified and public.business_trial_active(b.id)));
alter policy availability_owner_manage on public.availability
  using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()
    and b.verified and public.business_trial_active(b.id)))
  with check(exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()
    and b.verified and public.business_trial_active(b.id)));
alter policy business_settings_owner on public.business_settings
  using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()
    and b.verified and public.business_trial_active(b.id)))
  with check(exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()
    and b.verified and public.business_trial_active(b.id)));
alter policy bookings_business_manage on public.bookings
  using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()
    and b.verified and public.business_trial_active(b.id)))
  with check(exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()
    and b.verified and public.business_trial_active(b.id)));
commit;
