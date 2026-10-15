-- Employee profile photos. An administrator uploads them.
-- The photo is shown on that person's account and on the records they submit.
-- Run this after 015.

alter table public.profiles
  add column if not exists avatar_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-images', 'profile-images', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_images_read on storage.objects;
drop policy if exists profile_images_insert on storage.objects;
drop policy if exists profile_images_update on storage.objects;
drop policy if exists profile_images_delete on storage.objects;

create policy profile_images_read on storage.objects
for select to public
using (bucket_id = 'profile-images');

create policy profile_images_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'profile-images' and public.is_admin());

create policy profile_images_update on storage.objects
for update to authenticated
using (bucket_id = 'profile-images' and public.is_admin())
with check (bucket_id = 'profile-images' and public.is_admin());

create policy profile_images_delete on storage.objects
for delete to authenticated
using (bucket_id = 'profile-images' and public.is_admin());
