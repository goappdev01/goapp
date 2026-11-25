insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('go-catalog-photos', 'go-catalog-photos', false, 270000, array['image/jpeg','image/png'])
on conflict (id) do nothing;
