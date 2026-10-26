-- Price changes must also update size buying/selling prices on the product,
-- and admins can write the history table if the RPC is missing.
-- Paste in the Supabase SQL editor and Run.

drop policy if exists product_price_changes_write on public.product_price_changes;
create policy product_price_changes_write on public.product_price_changes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

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
  v_latest_cost integer;
  v_latest_selling integer;
  v_close record;
  v_lines jsonb;
  v_sizes jsonb;
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

  select cost_price, selling_price
    into v_latest_cost, v_latest_selling
    from public.product_price_changes
    where product_id = p_product
    order by effective_date desc, created_at desc
    limit 1;

  select coalesce(jsonb_agg(
    case
      when jsonb_typeof(elem) = 'object' then elem || jsonb_build_object('cost', v_latest_cost, 'price', v_latest_selling)
      else elem
    end
  ), '[]'::jsonb)
    into v_sizes
    from jsonb_array_elements(coalesce((select sizes from public.products where id = p_product), '[]'::jsonb)) elem;

  update public.products
    set cost_price = v_latest_cost,
        selling_price = v_latest_selling,
        sizes = case when size_mode = 'many' then v_sizes else sizes end,
        updated_at = now()
    where id = p_product;

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
