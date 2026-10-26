-- Catalog buying and selling prices can be changed only by an administrator.
-- Stock deliveries keep their own line cost and no longer overwrite the product.
-- Paste in the Supabase SQL editor and Run.

drop trigger if exists stock_in_items_sync_product_cost on public.stock_in_items;

create or replace function public.products_prices_admin_only()
returns trigger
language plpgsql
as $$
begin
  if public.is_admin() then
    return new;
  end if;
  new.cost_price := old.cost_price;
  new.selling_price := old.selling_price;
  new.size_mode := old.size_mode;
  new.sizes := old.sizes;
  new.cup_price := old.cup_price;
  new.half_price := old.half_price;
  return new;
end;
$$;

drop trigger if exists products_prices_admin_only on public.products;
create trigger products_prices_admin_only
before update on public.products
for each row execute function public.products_prices_admin_only();

notify pgrst, 'reload schema';
