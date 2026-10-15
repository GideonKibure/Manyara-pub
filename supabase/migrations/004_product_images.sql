-- Public product photos. Admins upload them; every signed-in user can read the product record,
-- and the image file itself can be shown on sales and stock-in screens.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists product_images_read on storage.objects;
drop policy if exists product_images_insert on storage.objects;
drop policy if exists product_images_update on storage.objects;
drop policy if exists product_images_delete on storage.objects;

create policy product_images_read on storage.objects
for select to public
using (bucket_id = 'product-images');

create policy product_images_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'product-images' and public.is_admin());

create policy product_images_update on storage.objects
for update to authenticated
using (bucket_id = 'product-images' and public.is_admin())
with check (bucket_id = 'product-images' and public.is_admin());

create policy product_images_delete on storage.objects
for delete to authenticated
using (bucket_id = 'product-images' and public.is_admin());
