-- Buying prices are stored in whole thousands of TZS so stock-in, restock,
-- and product records use the same amount. Paste in the SQL editor and Run.

create or replace function public.round_buying_price(p_amount numeric)
returns integer
language sql
immutable
as $$
  select case
    when p_amount is null or p_amount <= 0 then 0
    when round(p_amount / 1000.0) * 1000 = 0 then 1000
    else (round(p_amount / 1000.0) * 1000)::integer
  end;
$$;

create or replace function public.stock_in_item_round_cost()
returns trigger
language plpgsql
as $$
begin
  new.cost_per_stock_unit := public.round_buying_price(new.cost_per_stock_unit);
  new.total_cost := round(new.cost_per_stock_unit * new.stock_quantity, 2);
  return new;
end;
$$;

drop trigger if exists stock_in_items_round_cost on public.stock_in_items;
create trigger stock_in_items_round_cost
before insert or update on public.stock_in_items
for each row execute function public.stock_in_item_round_cost();

create or replace function public.product_round_buying_price()
returns trigger
language plpgsql
as $$
begin
  new.cost_price := public.round_buying_price(new.cost_price);
  return new;
end;
$$;

drop trigger if exists products_round_buying_price on public.products;
create trigger products_round_buying_price
before insert or update on public.products
for each row execute function public.product_round_buying_price();

create or replace function public.stock_in_item_sync_product_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.stock_in_transactions
    where id = new.transaction_id and status = 'approved'
  ) then
    update public.products
      set cost_price = public.round_buying_price(new.cost_per_stock_unit)
      where id = new.product_id;
  end if;
  return new;
end;
$$;

drop trigger if exists stock_in_items_sync_product_cost on public.stock_in_items;
create trigger stock_in_items_sync_product_cost
after insert or update on public.stock_in_items
for each row execute function public.stock_in_item_sync_product_cost();

update public.stock_in_items
  set cost_per_stock_unit = public.round_buying_price(cost_per_stock_unit),
      total_cost = public.round_buying_price(cost_per_stock_unit) * stock_quantity;

update public.products
  set cost_price = public.round_buying_price(cost_price);

update public.inventory_movements
  set unit_cost = public.round_buying_price(unit_cost)
  where type = 'stock_in';

grant execute on function public.round_buying_price(numeric) to authenticated;

notify pgrst, 'reload schema';
