-- Stop other jobs from overwriting catalog prices, and let an administrator
-- save buying/selling prices on the product row.
-- Paste in the Supabase SQL editor and Run.

drop trigger if exists stock_in_items_sync_product_cost on public.stock_in_items;

create or replace function public.products_prices_admin_only()
returns trigger
language plpgsql
security definer
set search_path = public
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

create or replace function public.admin_apply_price_change(
  p_product uuid,
  p_day date,
  p_cost integer,
  p_selling integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_until date;
  v_close record;
  v_lines jsonb;
  v_updated integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can change product prices.';
  end if;
  if p_day > current_date then
    raise exception 'The price-change date cannot be in the future.';
  end if;
  if p_cost is null or p_cost < 0 or p_selling is null or p_selling < 0 then
    raise exception 'Buying and selling prices must be zero or more.';
  end if;

  select name into v_name from public.products where id = p_product;
  if v_name is null then
    raise exception 'Product not found.';
  end if;

  insert into public.product_price_changes (product_id, effective_date, cost_price, selling_price, created_by)
    values (p_product, p_day, p_cost, p_selling, auth.uid())
  on conflict (product_id, effective_date) do update
    set cost_price = excluded.cost_price,
        selling_price = excluded.selling_price,
        created_by = excluded.created_by,
        created_at = now();

  if not exists (
    select 1 from public.product_price_changes
    where product_id = p_product and effective_date > p_day
  ) then
    update public.products
      set cost_price = p_cost,
          selling_price = p_selling,
          updated_at = now()
      where id = p_product;
  end if;

  select min(effective_date) into v_until
    from public.product_price_changes
    where product_id = p_product and effective_date > p_day;

  for v_close in
    select id, lines
    from public.day_closes
    where day >= p_day
      and (v_until is null or day < v_until)
  loop
    select coalesce(jsonb_agg(new_elem order by ordinality), '[]'::jsonb)
      into v_lines
      from (
        select ordinality,
          case
            when coalesce(elem->>'productId', elem->>'product_id', '') = p_product::text
              or lower(elem->>'name') = lower(v_name)
            then elem || jsonb_build_object(
              'productId', p_product::text,
              'amount', round(coalesce(nullif(elem->>'sold', '')::numeric, 0) * p_selling),
              'profit', round(coalesce(nullif(elem->>'sold', '')::numeric, 0) * (p_selling - p_cost))
            )
            else elem
          end as new_elem
        from jsonb_array_elements(coalesce(v_close.lines, '[]'::jsonb)) with ordinality as t(elem, ordinality)
      ) rebuilt;
    update public.day_closes set lines = v_lines where id = v_close.id;
    v_updated := v_updated + 1;
  end loop;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (
      auth.uid(),
      'product.price_change',
      'product',
      p_product::text,
      'Price change from ' || p_day::text || '. ' || v_updated::text || ' COGS sheets updated.'
    );

  return v_updated;
end;
$$;

revoke all on function public.admin_apply_price_change(uuid, date, integer, integer) from public;
grant execute on function public.admin_apply_price_change(uuid, date, integer, integer) to authenticated;

notify pgrst, 'reload schema';
