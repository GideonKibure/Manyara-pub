-- Per-product received status on saved restock orders, plus mark-all.
-- Paste in the Supabase SQL editor and Run after 043_restock_orders.sql.

alter table public.restock_order_items
  add column if not exists received boolean not null default false,
  add column if not exists received_at timestamptz;

alter table public.restock_orders drop constraint if exists restock_orders_status_check;
alter table public.restock_orders
  add constraint restock_orders_status_check
  check (status in ('not_received', 'partial', 'received'));

update public.restock_order_items as item
set received = true, received_at = coalesce(item.received_at, header.received_at, now())
from public.restock_orders as header
where item.order_id = header.id
  and header.status = 'received'
  and item.received is not true;

create or replace function public.sync_restock_order_status(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_got int;
begin
  select count(*)::int, count(*) filter (where received)::int
    into v_total, v_got
  from public.restock_order_items
  where order_id = p_id;
  if coalesce(v_got, 0) = 0 then
    update public.restock_orders
      set status = 'not_received', received_at = null, received_by = null
      where id = p_id;
  elsif v_got = v_total then
    update public.restock_orders
      set status = 'received',
          received_at = coalesce(received_at, now()),
          received_by = coalesce(received_by, auth.uid())
      where id = p_id;
  else
    update public.restock_orders set status = 'partial' where id = p_id;
  end if;
end;
$$;

create or replace function public.set_restock_item_received(p_item_id uuid, p_received boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.restock_order_items%rowtype;
  v_order public.restock_orders%rowtype;
  v_product public.products%rowtype;
  v_stock_id uuid;
  v_code text;
  v_invoice text;
  v_supplier uuid;
  v_qty numeric;
  v_stock numeric;
  v_cost integer;
  v_confirmed numeric;
  v_left int;
begin
  if auth.uid() is null then raise exception 'You are not signed in'; end if;
  select * into v_item from public.restock_order_items where id = p_item_id for update;
  if not found then raise exception 'Order item not found'; end if;
  select * into v_order from public.restock_orders where id = v_item.order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.submitted_by is distinct from auth.uid() and not public.is_admin() then
    raise exception 'You can only change your own orders';
  end if;
  if v_item.received is not distinct from p_received then return; end if;

  if not p_received then
    if v_order.stock_in_id is not null then
      v_confirmed := public.confirmed_qty(v_item.product_id);
      select stock_quantity into v_stock
      from public.stock_in_items
      where transaction_id = v_order.stock_in_id and product_id = v_item.product_id
      limit 1;
      if coalesce(v_stock, v_item.stock_quantity) > v_confirmed then
        raise exception 'Not enough remaining stock to reverse %. Sell or count first, or leave this product as received', (
          select name from public.products where id = v_item.product_id
        );
      end if;
      delete from public.inventory_movements
        where reference_type = 'stock_in'
          and product_id = v_item.product_id
          and (reference_id = v_order.stock_in_id::text or reference_id = (
            select code from public.stock_in_transactions where id = v_order.stock_in_id
          ));
      delete from public.stock_in_items
        where transaction_id = v_order.stock_in_id and product_id = v_item.product_id;
      select count(*)::int into v_left from public.stock_in_items where transaction_id = v_order.stock_in_id;
      if coalesce(v_left, 0) = 0 then
        delete from public.stock_in_transactions where id = v_order.stock_in_id;
        update public.restock_orders set stock_in_id = null where id = v_order.id;
      end if;
    end if;
    update public.restock_order_items
      set received = false, received_at = null
      where id = v_item.id;
    perform public.sync_restock_order_status(v_order.id);
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (
      auth.uid(),
      'restock.unreceive_item',
      'restock_order',
      v_order.id::text,
      'Marked a product not received on ' || v_order.code
    );
    return;
  end if;

  select * into v_product from public.products where id = v_item.product_id and is_active;
  if not found then raise exception 'Choose an active product'; end if;
  v_qty := v_item.received_quantity;
  v_stock := round(v_qty * v_product.conversion_factor, 2);
  v_cost := round(v_product.cost_price)::integer;
  if v_stock <= 0 then raise exception 'Enter a valid quantity for %', v_product.name; end if;

  v_stock_id := v_order.stock_in_id;
  if v_stock_id is not null and not exists (
    select 1 from public.stock_in_transactions where id = v_stock_id
  ) then
    v_stock_id := null;
  end if;

  if v_stock_id is null then
    v_stock_id := gen_random_uuid();
    v_code := 'SI-' || to_char(nextval('public.stock_in_code_seq'), 'FM0000');
    loop
      v_invoice := 'INV-' || to_char(nextval('public.invoice_ref_seq'), 'FM0000');
      exit when not exists (select 1 from public.stock_in_transactions where lower(invoice_ref) = lower(v_invoice));
    end loop;
    select id into v_supplier from public.suppliers where lower(name) = 'restock order' limit 1;
    if v_supplier is null then
      insert into public.suppliers (name) values ('Restock order') returning id into v_supplier;
    end if;
    insert into public.stock_in_transactions (
      id, code, supplier_id, supplier_name, delivery_date, invoice_ref, notes, status, submitted_by, reviewed_by, reviewed_at
    ) values (
      v_stock_id, v_code, v_supplier, 'Restock order', current_date, v_invoice, 'Restock ' || v_order.code,
      'approved', auth.uid(), auth.uid(), now()
    );
    update public.restock_orders set stock_in_id = v_stock_id, received_at = now(), received_by = auth.uid()
      where id = v_order.id;
  else
    select code into v_code from public.stock_in_transactions where id = v_stock_id;
  end if;

  if not exists (
    select 1 from public.stock_in_items where transaction_id = v_stock_id and product_id = v_product.id
  ) then
    insert into public.stock_in_items (
      transaction_id, product_id, size_name, received_quantity, receive_unit_id, conversion_factor, stock_quantity, cost_per_stock_unit, total_cost
    ) values (
      v_stock_id, v_product.id, 'one', v_qty, v_product.receive_unit_id, v_product.conversion_factor, v_stock, v_cost, v_cost * v_stock
    );
    insert into public.inventory_movements (product_id, type, quantity, unit_cost, reference_type, reference_id, note, created_by)
    values (
      v_product.id,
      'stock_in',
      v_stock,
      v_cost,
      'stock_in',
      v_stock_id::text,
      'Received restock ' || v_order.code || ' as ' || v_code,
      auth.uid()
    );
  end if;

  update public.restock_order_items
    set received = true,
        received_at = now(),
        conversion_factor = v_product.conversion_factor,
        stock_quantity = v_stock,
        receive_unit_id = v_product.receive_unit_id
    where id = v_item.id;
  perform public.sync_restock_order_status(v_order.id);
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'restock.receive_item', 'restock_order', v_order.id::text, 'Received a product on ' || v_order.code);
end;
$$;

create or replace function public.set_restock_order_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.restock_orders%rowtype;
  v_item public.restock_order_items%rowtype;
begin
  if auth.uid() is null then raise exception 'You are not signed in'; end if;
  if p_status not in ('received', 'not_received') then raise exception 'Unknown order status'; end if;
  select * into v_order from public.restock_orders where id = p_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.submitted_by is distinct from auth.uid() and not public.is_admin() then
    raise exception 'You can only change your own orders';
  end if;

  if p_status = 'received' then
    for v_item in
      select * from public.restock_order_items where order_id = p_id and not received order by id
    loop
      perform public.set_restock_item_received(v_item.id, true);
    end loop;
    return;
  end if;

  for v_item in
    select * from public.restock_order_items where order_id = p_id and received order by id
  loop
    perform public.set_restock_item_received(v_item.id, false);
  end loop;
end;
$$;

create or replace function public.save_restock_order(p_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text;
  v_notes text;
  v_item jsonb;
  v_product public.products%rowtype;
  v_qty numeric;
  v_stock numeric;
  v_existing public.restock_orders%rowtype;
begin
  if auth.uid() is null then raise exception 'You are not signed in'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'Your account is not active';
  end if;
  v_notes := trim(coalesce(p_payload ->> 'notes', ''));
  if char_length(v_notes) > 400 then raise exception 'Notes are too long'; end if;
  if jsonb_typeof(p_payload -> 'items') <> 'array' then
    raise exception 'Enter a quantity for at least one product';
  end if;

  if p_id is not null then
    select * into v_existing from public.restock_orders where id = p_id for update;
    if not found then raise exception 'Order not found'; end if;
    if v_existing.submitted_by is distinct from auth.uid() and not public.is_admin() then
      raise exception 'You can only change your own orders';
    end if;
    if exists (select 1 from public.restock_order_items where order_id = p_id and received) then
      raise exception 'Received orders cannot be edited. Mark them not received first';
    end if;
    v_id := v_existing.id;
    delete from public.restock_order_items where order_id = v_id;
    update public.restock_orders set notes = v_notes where id = v_id;
  else
    v_id := gen_random_uuid();
    v_code := 'RO-' || to_char(nextval('public.restock_order_code_seq'), 'FM0000');
    insert into public.restock_orders (id, code, notes, status, submitted_by)
    values (v_id, v_code, v_notes, 'not_received', auth.uid());
  end if;

  for v_item in select value from jsonb_array_elements(p_payload -> 'items') loop
    v_qty := (v_item ->> 'receivedQuantity')::numeric;
    if v_qty is null or v_qty <= 0 then continue; end if;
    select * into v_product from public.products where id = (v_item ->> 'productId')::uuid and is_active;
    if not found then raise exception 'Choose an active product'; end if;
    if v_qty > 100000 then raise exception 'Enter a valid quantity for %', v_product.name; end if;
    v_stock := round(v_qty * v_product.conversion_factor, 2);
    if v_stock <= 0 then raise exception 'Enter a valid quantity for %', v_product.name; end if;
    insert into public.restock_order_items (
      order_id, product_id, received_quantity, receive_unit_id, conversion_factor, stock_quantity, received
    ) values (
      v_id, v_product.id, v_qty, v_product.receive_unit_id, v_product.conversion_factor, v_stock, false
    );
  end loop;

  if not exists (select 1 from public.restock_order_items where order_id = v_id) then
    if p_id is null then
      delete from public.restock_orders where id = v_id;
    end if;
    raise exception 'Enter a quantity for at least one product';
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (
    auth.uid(),
    case when p_id is null then 'restock.submit' else 'restock.update' end,
    'restock_order',
    v_id::text,
    case when p_id is null then 'Saved restock order' else 'Updated restock order' end
  );
  return v_id;
end;
$$;

grant execute on function public.sync_restock_order_status(uuid) to authenticated;
grant execute on function public.set_restock_item_received(uuid, boolean) to authenticated;
grant execute on function public.set_restock_order_status(uuid, text) to authenticated;
grant execute on function public.save_restock_order(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
