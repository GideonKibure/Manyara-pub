-- Receive is one-way. A received restock order can be edited once.
-- Paste in the Supabase SQL editor and Run after 044_restock_item_received.sql.

alter table public.restock_orders
  add column if not exists received_edit_used boolean not null default false;

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
    raise exception 'Received products cannot be unmarked. Edit the order once if the quantity is wrong';
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
  if p_status <> 'received' then
    raise exception 'Received orders cannot be unmarked. Edit the order once if the quantity is wrong';
  end if;
  select * into v_order from public.restock_orders where id = p_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.submitted_by is distinct from auth.uid() and not public.is_admin() then
    raise exception 'You can only change your own orders';
  end if;

  for v_item in
    select * from public.restock_order_items where order_id = p_id and not received order by id
  loop
    perform public.set_restock_item_received(v_item.id, true);
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
  v_old public.restock_order_items%rowtype;
  v_had_received boolean := false;
  v_merged jsonb := '{}'::jsonb;
  v_pid text;
  v_delta numeric;
  v_cost integer;
  v_payload_ids uuid[] := '{}';
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

  for v_item in select value from jsonb_array_elements(p_payload -> 'items') loop
    v_qty := (v_item ->> 'receivedQuantity')::numeric;
    v_pid := v_item ->> 'productId';
    if v_pid is null or v_qty is null or v_qty <= 0 then continue; end if;
    v_merged := v_merged || jsonb_build_object(v_pid, coalesce((v_merged ->> v_pid)::numeric, 0) + v_qty);
  end loop;

  if p_id is not null then
    select * into v_existing from public.restock_orders where id = p_id for update;
    if not found then raise exception 'Order not found'; end if;
    if v_existing.submitted_by is distinct from auth.uid() and not public.is_admin() then
      raise exception 'You can only change your own orders';
    end if;
    v_had_received := exists (select 1 from public.restock_order_items where order_id = p_id and received)
      or v_existing.status is distinct from 'not_received';
    if v_had_received and v_existing.received_edit_used then
      raise exception 'This received order was already edited once';
    end if;
    v_id := v_existing.id;
    update public.restock_orders
      set notes = v_notes, received_edit_used = case when v_had_received then true else received_edit_used end
      where id = v_id;
  else
    v_id := gen_random_uuid();
    v_code := 'RO-' || to_char(nextval('public.restock_order_code_seq'), 'FM0000');
    insert into public.restock_orders (id, code, notes, status, submitted_by)
    values (v_id, v_code, v_notes, 'not_received', auth.uid());
  end if;

  for v_pid, v_qty in
    select key, value::numeric from jsonb_each_text(v_merged)
  loop
    select * into v_product from public.products where id = v_pid::uuid and is_active;
    if not found then raise exception 'Choose an active product'; end if;
    if v_qty > 100000 then raise exception 'Enter a valid quantity for %', v_product.name; end if;
    v_stock := round(v_qty * v_product.conversion_factor, 2);
    if v_stock <= 0 then raise exception 'Enter a valid quantity for %', v_product.name; end if;
    v_payload_ids := array_append(v_payload_ids, v_product.id);
    select * into v_old from public.restock_order_items where order_id = v_id and product_id = v_product.id;

    if found then
      if v_old.received and v_existing.stock_in_id is not null then
        v_delta := v_stock - v_old.stock_quantity;
        if v_delta <> 0 then
          if v_delta < 0 and public.confirmed_qty(v_product.id) + v_delta < 0 then
            raise exception 'Not enough remaining stock to reduce %. Sell or count first', v_product.name;
          end if;
          v_cost := round(v_product.cost_price)::integer;
          update public.stock_in_items
            set received_quantity = v_qty,
                receive_unit_id = v_product.receive_unit_id,
                conversion_factor = v_product.conversion_factor,
                stock_quantity = v_stock,
                cost_per_stock_unit = v_cost,
                total_cost = v_cost * v_stock
            where transaction_id = v_existing.stock_in_id and product_id = v_product.id;
          update public.inventory_movements
            set quantity = quantity + v_delta
            where id = (
              select id from public.inventory_movements
              where reference_type = 'stock_in'
                and product_id = v_product.id
                and (
                  reference_id = v_existing.stock_in_id::text
                  or reference_id = (select code from public.stock_in_transactions where id = v_existing.stock_in_id)
                )
              order by created_at
              limit 1
            );
        end if;
      end if;
      update public.restock_order_items
        set received_quantity = v_qty,
            receive_unit_id = v_product.receive_unit_id,
            conversion_factor = v_product.conversion_factor,
            stock_quantity = v_stock
        where id = v_old.id;
    else
      insert into public.restock_order_items (
        order_id, product_id, received_quantity, receive_unit_id, conversion_factor, stock_quantity, received
      ) values (
        v_id, v_product.id, v_qty, v_product.receive_unit_id, v_product.conversion_factor, v_stock, false
      );
    end if;
  end loop;

  if exists (
    select 1 from public.restock_order_items
    where order_id = v_id and received and (cardinality(v_payload_ids) = 0 or product_id <> all (v_payload_ids))
  ) then
    raise exception 'Received products cannot be removed';
  end if;

  if cardinality(v_payload_ids) > 0 then
    delete from public.restock_order_items
      where order_id = v_id and not received and product_id <> all (v_payload_ids);
  else
    delete from public.restock_order_items where order_id = v_id and not received;
  end if;

  if not exists (select 1 from public.restock_order_items where order_id = v_id) then
    if p_id is null then
      delete from public.restock_orders where id = v_id;
    end if;
    raise exception 'Enter a quantity for at least one product';
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (
    auth.uid(),
    case when p_id is null then 'restock.submit' when v_had_received then 'restock.edit_received' else 'restock.update' end,
    'restock_order',
    v_id::text,
    case when p_id is null then 'Saved restock order' else 'Updated restock order' end
  );
  return v_id;
end;
$$;

grant execute on function public.set_restock_item_received(uuid, boolean) to authenticated;
grant execute on function public.set_restock_order_status(uuid, text) to authenticated;
grant execute on function public.save_restock_order(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
