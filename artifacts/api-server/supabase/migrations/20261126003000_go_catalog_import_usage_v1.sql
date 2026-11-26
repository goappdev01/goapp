-- Aggregate only. No original document, business identifier or personal content is stored.
create table if not exists public.go_catalog_import_usage_daily (
  day date not null default current_date,
  method text not null check (method in ('direct','ocr','mixed','pdf')),
  outcome text not null check (outcome in ('success','insufficient','error')),
  count integer not null default 0 check (count >= 0),
  primary key (day, method, outcome)
);
alter table public.go_catalog_import_usage_daily enable row level security;
revoke all on public.go_catalog_import_usage_daily from public, anon, authenticated;

create or replace function public.go_catalog_import_record(p_business_id uuid, p_method text, p_outcome text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.businesses
    where id = p_business_id and owner_id = auth.uid() and verified = true) then
    raise exception 'Empresa no autorizada' using errcode = '42501'; end if;
  if p_method not in ('direct','ocr','mixed','pdf') or p_outcome not in ('success','insufficient','error') then
    raise exception 'Métrica inválida' using errcode = '22023'; end if;
  insert into public.go_catalog_import_usage_daily (day,method,outcome,count)
    values (current_date,p_method,p_outcome,1)
    on conflict (day,method,outcome) do update
    set count = public.go_catalog_import_usage_daily.count + 1;
end;
$$;
revoke all on function public.go_catalog_import_record(uuid,text,text) from public, anon;
grant execute on function public.go_catalog_import_record(uuid,text,text) to authenticated;

create or replace function public.go_catalog_import_usage()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not exists (select 1 from public.admin_memberships
    where user_id = auth.uid() and active = true and 'admin.access' = any(permissions)) then
    raise exception 'ADMIN no autorizado' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('day',day,'method',method,'outcome',outcome,'count',count)
    order by day desc,method,outcome),'[]'::jsonb) into v_result
    from public.go_catalog_import_usage_daily where day >= current_date - 30;
  return v_result;
end;
$$;
revoke all on function public.go_catalog_import_usage() from public, anon;
grant execute on function public.go_catalog_import_usage() to authenticated;
