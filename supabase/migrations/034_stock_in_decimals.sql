-- Stock-in quantity and buying price can include a decimal (for example 1.5 or 1800.50).
-- Paste in the Supabase SQL editor and Run.

alter table public.stock_in_items
  alter column received_quantity type numeric(12,2) using received_quantity::numeric(12,2),
  alter column stock_quantity type numeric(12,2) using stock_quantity::numeric(12,2),
  alter column cost_per_stock_unit type numeric(12,2) using cost_per_stock_unit::numeric(12,2),
  alter column total_cost type numeric(14,2) using total_cost::numeric(14,2);

create or replace function public.submit_stock_in(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_code text;
  v_supplier uuid;
  v_supplier_name text;
  v_requested text;
  v_invoice text;
  v_notes text;
  v_date date;
  v_item jsonb;
  v_product public.products%rowtype;
  v_received numeric;
  v_cost numeric;
  v_stock numeric;
  v_size text;
begin
  if auth.uid() is null then raise exception 'You are not signed in'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'Your account is not active';
  end if;
  perform public.assert_correction('stock_in', nullif(p_payload ->> 'correctsId', '')::uuid);

  v_supplier_name := trim(coalesce(p_payload ->> 'supplierName', ''));
  v_requested := trim(coalesce(p_payload ->> 'invoiceRef', ''));
  v_notes := trim(coalesce(p_payload ->> 'notes', ''));
  if jsonb_typeof(p_payload -> 'items') <> 'array' or jsonb_array_length(p_payload -> 'items') < 1 then
    raise exception 'Add at least one product';
  end if;
  begin
    v_date := (p_payload ->> 'deliveryDate')::date;
  exception when others then
    raise exception 'Enter a delivery date that is today or earlier';
  end;
  if v_date is null or v_date > current_date then
    raise exception 'Enter a delivery date that is today or earlier';
  end if;
  if char_length(v_supplier_name) < 2 then raise exception 'Enter the supplier'; end if;
  if char_length(v_notes) > 400 then raise exception 'Notes are too long'; end if;

  if char_length(v_requested) between 1 and 60
     and not exists (
       select 1 from public.stock_in_transactions
       where lower(invoice_ref) = lower(v_requested)
     )
  then
    v_invoice := v_requested;
  else
    loop
      v_invoice := 'INV-' || to_char(nextval('public.invoice_ref_seq'), 'FM0000');
      exit when not exists (
        select 1 from public.stock_in_transactions
        where lower(invoice_ref) = lower(v_invoice)
      );
    end loop;
  end if;

  select id into v_supplier from public.suppliers where lower(name) = lower(v_supplier_name) limit 1;
  if v_supplier is null then
    insert into public.suppliers (name) values (v_supplier_name) returning id into v_supplier;
  end if;

  v_code := 'SI-' || to_char(nextval('public.stock_in_code_seq'), 'FM0000');
  insert into public.stock_in_transactions (
    id, code, supplier_id, supplier_name, delivery_date, invoice_ref, notes, status, submitted_by, corrects_id
  ) values (
    v_id, v_code, v_supplier, v_supplier_name, v_date, v_invoice, v_notes, 'pending', auth.uid(),
    nullif(p_payload ->> 'correctsId', '')::uuid
  );

  for v_item in select value from jsonb_array_elements(p_payload -> 'items') loop
    select * into v_product from public.products where id = (v_item ->> 'productId')::uuid and is_active;
    if not found then raise exception 'Choose an active product'; end if;
    v_received := (v_item ->> 'receivedQuantity')::numeric;
    v_cost := (v_item ->> 'costPerStockUnit')::numeric;
    v_size := lower(trim(coalesce(v_item ->> 'sizeName', 'one')));
    if v_size not in ('one', 'small', 'medium', 'big') then v_size := 'one'; end if;
    if v_received is null or v_received <= 0 or v_received > 100000 then
      raise exception 'Enter a valid quantity for %', v_product.name;
    end if;
    if v_cost is null or v_cost < 0 or v_cost > 100000000 then
      raise exception 'Enter a valid cost for %', v_product.name;
    end if;
    v_stock := v_received * v_product.conversion_factor;
    insert into public.stock_in_items (
      transaction_id, product_id, size_name, received_quantity, receive_unit_id, conversion_factor, stock_quantity, cost_per_stock_unit, total_cost
    ) values (
      v_id, v_product.id, v_size, v_received, v_product.receive_unit_id, v_product.conversion_factor, v_stock, v_cost, v_cost * v_stock
    );
  end loop;

  if public.is_admin() and v_invoice <> '' then
    perform public.finalize_stock_in(v_id);
  else
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (auth.uid(), 'stock_in.submit', 'stock_in', v_id::text, 'Submitted delivery ' || v_code || ' for approval.');
    perform public.notify_admins(
      'submission_pending',
      'Stock delivery waiting for review',
      v_code || ' was submitted. Confirmed stock will not change until you approve it.',
      '/admin/approvals'
    );
  end if;

  return v_id;
end;
$$;

create or replace function public.update_stock_in(p_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.stock_in_transactions%rowtype;
  v_supplier uuid;
  v_supplier_name text;
  v_notes text;
  v_date date;
  v_item jsonb;
  v_product public.products%rowtype;
  v_received numeric;
  v_cost numeric;
  v_stock numeric;
  v_size text;
  v_available numeric;
  v_old numeric;
  v_product_id uuid;
begin
  if not public.is_admin() then raise exception 'Only an administrator can do that'; end if;
  select * into v_tx from public.stock_in_transactions where id = p_id for update;
  if not found then raise exception 'Delivery not found'; end if;
  if v_tx.status not in ('pending', 'approved') then raise exception 'This delivery can no longer be edited'; end if;

  v_supplier_name := trim(coalesce(p_payload ->> 'supplierName', ''));
  v_notes := trim(coalesce(p_payload ->> 'notes', ''));
  if jsonb_typeof(p_payload -> 'items') <> 'array' or jsonb_array_length(p_payload -> 'items') < 1 then
    raise exception 'Add at least one product';
  end if;
  begin
    v_date := (p_payload ->> 'deliveryDate')::date;
  exception when others then
    raise exception 'Enter a delivery date that is today or earlier';
  end;
  if v_date is null or v_date > current_date then
    raise exception 'Enter a delivery date that is today or earlier';
  end if;
  if char_length(v_supplier_name) < 2 then raise exception 'Enter the supplier'; end if;
  if char_length(v_notes) > 400 then raise exception 'Notes are too long'; end if;

  perform 1 from public.products
  where id in (select (value ->> 'productId')::uuid from jsonb_array_elements(p_payload -> 'items'))
  order by id
  for update;

  if v_tx.status = 'approved' then
    for v_product_id in
      select product_id from (
        select product_id from public.stock_in_items where transaction_id = p_id
        union
        select (value ->> 'productId')::uuid from jsonb_array_elements(p_payload -> 'items')
      ) touched
    loop
      select coalesce(sum(stock_quantity), 0) into v_old
      from public.stock_in_items where transaction_id = p_id and product_id = v_product_id;
      select coalesce(sum((value ->> 'receivedQuantity')::numeric), 0) into v_received
      from jsonb_array_elements(p_payload -> 'items')
      where (value ->> 'productId')::uuid = v_product_id;
      select conversion_factor into v_stock from public.products where id = v_product_id;
      v_available := public.confirmed_qty(v_product_id) - v_old + (v_received * coalesce(v_stock, 1)) - public.reserved_qty(v_product_id);
      if v_available < 0 then
        raise exception 'That change would take confirmed stock below pending sales';
      end if;
    end loop;
    delete from public.inventory_movements
    where reference_type = 'stock_in' and reference_id = p_id::text;
  end if;

  delete from public.stock_in_items where transaction_id = p_id;
  for v_item in select value from jsonb_array_elements(p_payload -> 'items') loop
    select * into v_product from public.products where id = (v_item ->> 'productId')::uuid and is_active;
    if not found then raise exception 'Choose an active product'; end if;
    v_received := (v_item ->> 'receivedQuantity')::numeric;
    v_cost := (v_item ->> 'costPerStockUnit')::numeric;
    v_size := lower(trim(coalesce(v_item ->> 'sizeName', 'one')));
    if v_size not in ('one', 'small', 'medium', 'big') then v_size := 'one'; end if;
    if v_received is null or v_received <= 0 or v_received > 100000 then
      raise exception 'Enter a valid quantity for %', v_product.name;
    end if;
    if v_cost is null or v_cost < 0 or v_cost > 100000000 then
      raise exception 'Enter a valid cost for %', v_product.name;
    end if;
    v_stock := v_received * v_product.conversion_factor;
    insert into public.stock_in_items (
      transaction_id, product_id, size_name, received_quantity, receive_unit_id, conversion_factor, stock_quantity, cost_per_stock_unit, total_cost
    ) values (
      p_id, v_product.id, v_size, v_received, v_product.receive_unit_id, v_product.conversion_factor, v_stock, v_cost, v_cost * v_stock
    );
    if v_tx.status = 'approved' then
      insert into public.inventory_movements (product_id, type, quantity, unit_cost, reference_type, reference_id, note, created_by)
      values (v_product.id, 'stock_in', v_stock, round(v_cost)::integer, 'stock_in', p_id::text, 'Approved delivery ' || v_tx.code, auth.uid());
      update public.products set cost_price = round(v_cost)::integer where id = v_product.id;
    end if;
  end loop;

  select id into v_supplier from public.suppliers where lower(name) = lower(v_supplier_name) limit 1;
  if v_supplier is null then
    insert into public.suppliers (name) values (v_supplier_name) returning id into v_supplier;
  end if;

  update public.stock_in_transactions
  set supplier_id = v_supplier, supplier_name = v_supplier_name, delivery_date = v_date, notes = v_notes
  where id = p_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'stock_in.edit', 'stock_in', p_id::text, 'Edited delivery ' || v_tx.code || '. Invoice ' || v_tx.invoice_ref || ' was left unchanged.');
end;
$$;

create or replace function public.finalize_stock_in(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.stock_in_transactions%rowtype;
  v_item public.stock_in_items%rowtype;
  v_invoice text;
begin
  select * into v_tx from public.stock_in_transactions where id = p_id for update;
  if not found then raise exception 'Submission not found'; end if;
  if v_tx.status = 'approved' then return; end if;
  if v_tx.status <> 'pending' then raise exception 'This submission has already been reviewed'; end if;
  if v_tx.submitted_by is distinct from auth.uid() and not public.is_admin() then
    raise exception 'You cannot approve this delivery';
  end if;

  v_invoice := trim(coalesce(v_tx.invoice_ref, ''));
  if v_invoice = '' then return; end if;
  if not exists (select 1 from public.stock_in_items where transaction_id = p_id) then
    raise exception 'Add at least one product';
  end if;

  for v_item in select * from public.stock_in_items where transaction_id = p_id order by id loop
    insert into public.inventory_movements (product_id, type, quantity, unit_cost, reference_type, reference_id, note, created_by)
    values (
      v_item.product_id,
      'stock_in',
      v_item.stock_quantity,
      round(v_item.cost_per_stock_unit)::integer,
      'stock_in',
      p_id::text,
      'Approved delivery ' || v_tx.code,
      v_tx.submitted_by
    );
    update public.products set cost_price = round(v_item.cost_per_stock_unit)::integer where id = v_item.product_id;
  end loop;

  perform set_config('manyara.internal', 'on', true);
  update public.stock_in_transactions
  set status = 'approved', reviewed_by = v_tx.submitted_by, reviewed_at = now(), rejection_reason = null
  where id = p_id and status = 'pending';
  if not found then raise exception 'This submission has already been reviewed'; end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (
    v_tx.submitted_by,
    'stock_in.auto_approve',
    'stock_in',
    p_id::text,
    'Approved delivery ' || v_tx.code || ' automatically because invoice ' || v_invoice || ' was provided.'
  );
  insert into public.notifications (recipient_id, type, title, message, href)
  select id, 'submission_approved', v_tx.code || ' approved',
    v_tx.code || ' had invoice ' || v_invoice || ', so it was approved and added to confirmed stock.',
    '/admin/stock-in'
  from public.profiles where role = 'admin' and is_active;
end;
$$;

grant execute on function public.submit_stock_in(jsonb) to authenticated;
grant execute on function public.update_stock_in(uuid, jsonb) to authenticated;
grant execute on function public.finalize_stock_in(uuid) to authenticated;
