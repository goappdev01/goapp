create table if not exists public.go_catalog_photo_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  show_photos boolean not null default false,
  updated_at timestamptz not null default now()
);
