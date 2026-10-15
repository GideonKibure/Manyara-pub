-- An employee can add another product and quantity to an open bill.
-- Only the new quantity comes off stock. Run this after 021.

create or replace function public.append_bill_item(
  p_id uuid,
  p_product uuid,
  p_quantity integer,
  p_size text,
  p_portion text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.sales_transactions%rowtype;
  v_product public.products%rowtype;
  v_size text := lower(trim(coalesce(p_size, 'one')));
  v_portion text := lower(trim(coalesce(p_portion, 'full')));
  v_price integer;
  v_available integer;
begin
  if auth.uid() is null then raise exception 'You are not signed in'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'Your account is not active';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 100000 then
    raise exception 'Enter a valid quantity';
  end if;
  select * into v_tx from public.sales_transactions where id = p_id for update;
  if not found then raise exception 'Bill not found'; end if;
  if v_tx.record_kind <> 'bill' then raise exception 'This is already a sale'; end if;
  if v_tx.status in ('rejected', 'cancelled') then raise exception 'This bill can no longer be changed'; end if;
  if not public.is_admin() and v_tx.submitted_by is distinct from auth.uid() then
    raise exception 'Bill not found';
  end if;
  select * into v_product from public.products where id = p_product and is_active for update;
  if not found then raise exception 'Choose an active product'; end if;
  v_price := public.product_portion_price(v_product, v_size, v_portion);
  if v_price is null then raise exception 'Choose a size and serving that % is sold in.', v_product.name; end if;
  v_available := public.confirmed_qty(p_product) - public.reserved_qty(p_product);
  if p_quantity > v_available then
    if v_available < 1 then raise exception '% is not in stock.', v_product.name; end if;
    raise exception 'Only % of % can be added.', v_available, v_product.name;
  end if;

  insert into public.sales_items (transaction_id, product_id, quantity, unit_price, unit_cost, size_name, portion)
  values (
    p_id,
    p_product,
    p_quantity,
    v_price,
    v_product.cost_price,
    case when coalesce(v_product.size_mode, 'one') = 'many' then v_size else 'one' end,
    v_portion
  );

  insert into public.inventory_movements (product_id, type, quantity, unit_cost, reference_type, reference_id, note, created_by)
  values (p_product, 'sale', -p_quantity, v_product.cost_price, 'sale', p_id::text, 'Bill ' || v_tx.code, auth.uid());

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (
    auth.uid(), 'sale.edit', 'sale', p_id::text,
    'Added ' || p_quantity || ' of ' || v_product.name || ' to bill ' || v_tx.code || '. Stock was updated.'
  );
end;
$$;

grant execute on function public.append_bill_item(uuid, uuid, integer, text, text) to authenticated;
