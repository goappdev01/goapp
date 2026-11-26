-- Extend the existing atomic, owner-checked import to reviewed products.
-- No existing rows are changed or removed.
create or replace function public.go_import_catalog_services(p_business_id uuid, p_items jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_services jsonb;
  v_item jsonb;
  v_added jsonb := '[]'::jsonb;
  v_name text;
  v_description text;
  v_category text;
  v_variant text;
  v_kind text;
  v_price numeric;
  v_duration integer;
  v_count integer := 0;
begin
  if auth.uid() is null or not exists (
    select 1 from public.businesses where id = p_business_id and owner_id = auth.uid() and verified = true
  ) then raise exception 'Empresa no autorizada' using errcode = '42501'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 40 then
    raise exception 'Lista de importación inválida' using errcode = '22023'; end if;
  select payload into v_payload from public.business_settings where business_id = p_business_id for update;
  if v_payload is null then raise exception 'Guarda primero la configuración de la empresa' using errcode = '22023'; end if;
  v_services := coalesce(v_payload -> 'services', '[]'::jsonb);
  if jsonb_typeof(v_services) <> 'array' then raise exception 'Catálogo existente inválido' using errcode = '22023'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' or not (v_item ? 'name') or not (v_item ? 'price')
      or not (v_item ? 'duration') or not (v_item ? 'description') or not (v_item ? 'capacity') then
      raise exception 'Entrada incompleta' using errcode = '22023'; end if;
    v_name := pg_catalog.btrim(v_item ->> 'name');
    v_description := v_item ->> 'description';
    v_category := coalesce(v_item ->> 'category', '');
    v_variant := coalesce(v_item ->> 'variant', '');
    v_kind := coalesce(v_item ->> 'kind', 'service');
    if pg_catalog.length(v_name) not between 2 and 120 or v_description is null
      or pg_catalog.length(v_description) > 1000 or pg_catalog.length(v_category) > 80
      or pg_catalog.length(v_variant) > 80 or v_kind not in ('service','product')
      or v_item ->> 'price' !~ '^\d{1,6}(\.\d{1,2})?$'
      or v_item ->> 'duration' !~ '^\d{1,4}$' or v_item ->> 'capacity' <> '1' then
      raise exception 'Revisa el catálogo antes de importar' using errcode = '22023'; end if;
    v_price := (v_item ->> 'price')::numeric;
    v_duration := (v_item ->> 'duration')::integer;
    if v_price > 100000 or (v_kind = 'service' and v_duration not between 1 and 1440)
      or (v_kind = 'product' and v_duration <> 0) then
      raise exception 'Precio o duración inválidos' using errcode = '22023'; end if;
    if exists(select 1 from jsonb_array_elements(v_services) existing
      where pg_catalog.lower(pg_catalog.btrim(existing ->> 'name')) = pg_catalog.lower(v_name))
      or exists(select 1 from public.services existing where existing.business_id = p_business_id
        and pg_catalog.lower(pg_catalog.btrim(existing.name)) = pg_catalog.lower(v_name)) then continue; end if;
    insert into public.services (business_id, name, description, duration_minutes, price, currency, active, ui_metadata)
    values (p_business_id, v_name, v_description, v_duration, v_price, 'EUR', true,
      jsonb_build_object('catalogKind', v_kind, 'type', case when v_kind = 'product' then 'product'
        else coalesce(nullif(v_payload ->> 'subId', ''), nullif(v_payload ->> 'sectorId', ''), 'service') end,
        'category', v_category, 'variant', v_variant, 'customerCapacity', 1,
        'unitQuantity', 1, 'paymentRequired', false, 'visible', true, 'description', v_description));
    if v_kind = 'service' then
      v_services := v_services || jsonb_build_array(jsonb_build_object('name', v_name,
        'description', v_description, 'duration', v_duration, 'price', v_price, 'capacity', 1));
    end if;
    v_added := v_added || jsonb_build_array(jsonb_build_object('name', v_name,
      'description', v_description, 'duration', v_duration, 'price', v_price,
      'capacity', 1, 'kind', v_kind, 'category', v_category, 'variant', v_variant));
    v_count := v_count + 1;
  end loop;
  if v_count > 0 then update public.business_settings
    set payload = jsonb_set(v_payload, '{services}', v_services, true) where business_id = p_business_id; end if;
  return jsonb_build_object('imported', v_count, 'services', v_added);
end;
$$;
revoke all on function public.go_import_catalog_services(uuid, jsonb) from public, anon;
grant execute on function public.go_import_catalog_services(uuid, jsonb) to authenticated;
