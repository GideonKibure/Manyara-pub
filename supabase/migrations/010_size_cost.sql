-- Each product size keeps its own cost inside the sizes list.
-- A sale of that size uses this cost, so profit follows the size the employee selected.
-- Run 009 before this file.

create or replace function public.product_size_cost(p public.products, p_size text)
returns integer
language plpgsql
stable
as $$
declare
  v_size text := lower(trim(coalesce(p_size, 'one')));
  v_raw text;
begin
  if coalesce(p.size_mode, 'one') <> 'many' then
    return p.cost_price;
  end if;
  select elem ->> 'cost' into v_raw
  from jsonb_array_elements(coalesce(p.sizes, '[]'::jsonb)) elem
  where lower(coalesce(elem ->> 'name', '')) = v_size
  limit 1;
  if v_raw is null or v_raw !~ '^[0-9]+$' then
    return p.cost_price;
  end if;
  return v_raw::integer;
end;
$$;

create or replace function public.sales_items_apply_size_cost()
returns trigger
language plpgsql
as $$
declare
  v_product public.products%rowtype;
begin
  select * into v_product from public.products where id = new.product_id;
  if found then
    new.unit_cost := public.product_size_cost(v_product, new.size_name);
  end if;
  return new;
end;
$$;

drop trigger if exists sales_items_size_cost on public.sales_items;
create trigger sales_items_size_cost
before insert or update of product_id, size_name, unit_cost on public.sales_items
for each row execute function public.sales_items_apply_size_cost();

revoke all on function public.product_size_cost(public.products, text) from public;
revoke all on function public.sales_items_apply_size_cost() from public;
