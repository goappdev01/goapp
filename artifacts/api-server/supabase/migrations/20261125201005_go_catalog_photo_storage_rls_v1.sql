create policy go_catalog_photos_insert_owner on storage.objects
  for insert to authenticated with check (
    bucket_id = 'go-catalog-photos' and exists (
      select 1 from public.businesses b where b.id::text = (storage.foldername(storage.objects.name))[1]
        and b.owner_id = (select auth.uid()) and b.verified = true
    )
  );
create policy go_catalog_photos_read_authorized on storage.objects
  for select to authenticated using (
    bucket_id = 'go-catalog-photos' and (
      exists (select 1 from public.businesses b where b.id::text = (storage.foldername(storage.objects.name))[1]
        and b.owner_id = (select auth.uid()) and b.verified = true)
      or exists (select 1 from public.services s join public.businesses b on b.id = s.business_id
        where s.business_id::text = (storage.foldername(storage.objects.name))[1]
          and s.ui_metadata->>'photoUri' = 'go-storage:' || storage.objects.name
          and s.active = true and b.verified = true and b.booking_enabled = true)
    )
  );
