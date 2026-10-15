-- Customer bills keep a generated time, a paid or unpaid mark, and can be sent for approval either way.
-- Administrators can add and edit sales and stock deliveries.

alter table public.sales_transactions add column if not exists customer_name text;
alter table public.sales_transactions add column if not exists payment_status text;
alter table public.sales_transactions add column if not exists generated_at timestamptz;

update public.sales_transactions set customer_name = '' where customer_name is null;
update public.sales_transactions set payment_status = 'unpaid' where payment_status is null or payment_status not in ('paid', 'unpaid');
update public.sales_transactions set generated_at = submitted_at where generated_at is null;

alter table public.sales_transactions alter column customer_name set default '';
alter table public.sales_transactions alter column customer_name set not null;
alter table public.sales_transactions alter column payment_status set default 'unpaid';
alter table public.sales_transactions alter column payment_status set not null;
alter table public.sales_transactions alter column generated_at set default now();
alter table public.sales_transactions alter column generated_at set not null;

alter table public.sales_transactions drop constraint if exists sales_payment_status_check;
alter table public.sales_transactions
  add constraint sales_payment_status_check check (payment_status in ('paid', 'unpaid'));

create or replace function public.submit_sale(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_code text;
  v_notes text;
  v_customer text;
  v_payment text;
  v_generated timestamptz := now();
  v_line record;
  v_available integer;
  v_name text;
begin
  if auth.uid() is null then raise exception 'You are not signed in'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'Your account is not active';
  end if;
  perform public.assert_correction('sale', nullif(p_payload ->> 'correctsId', '')::uuid);
  v_notes := trim(coalesce(p_payload ->> 'notes', ''));
  v_customer := trim(coalesce(p_payload ->> 'customerName', ''));
  v_payment := lower(trim(coalesce(p_payload ->> 'paymentStatus', 'unpaid')));
  if char_length(v_notes) > 400 then raise exception 'Notes are too long'; end if;
  if char_length(v_customer) < 2 or char_length(v_customer) > 80 then raise exception 'Enter the customer name'; end if;
  if v_payment not in ('paid', 'unpaid') then raise exception 'Mark the bill paid or unpaid'; end if;
  begin
    if coalesce(p_payload ->> 'generatedAt', '') <> '' then
      v_generated := (p_payload ->> 'generatedAt')::timestamptz;
    end if;
  exception when others then
    v_generated := now();
  end;
  if v_generated is null or v_generated > now() + interval '1 minute' or v_generated < now() - interval '12 hours' then
    v_generated := now();
  end if;
  if jsonb_typeof(p_payload -> 'items') <> 'array' or jsonb_array_length(p_payload -> 'items') < 1 then
    raise exception 'Add at least one product';
  end if;

  perform 1 from public.products
  where id in (select (value ->> 'productId')::uuid from jsonb_array_elements(p_payload -> 'items'))
  order by id
  for update;

  for v_line in
    select (value ->> 'productId')::uuid as product_id, sum((value ->> 'quantity')::integer) as quantity
    from jsonb_array_elements(p_payload -> 'items')
    group by 1
  loop
    if v_line.quantity is null or v_line.quantity < 1 or v_line.quantity > 100000 then
      raise exception 'Enter a valid quantity';
    end if;
    select name into v_name from public.products where id = v_line.product_id and is_active;
    if v_name is null then raise exception 'Choose an active product'; end if;
    v_available := public.confirmed_qty(v_line.product_id) - coalesce((
      select sum(si.quantity)::integer
      from public.sales_items si
      join public.sales_transactions st on st.id = si.transaction_id
      where si.product_id = v_line.product_id and st.status = 'pending'
    ), 0);
    if v_line.quantity > v_available then
      raise exception 'Only % of % can be sold.', v_available, v_name;
    end if;
  end loop;

  v_code := 'SL-' || to_char(nextval('public.sale_code_seq'), 'FM0000');
  insert into public.sales_transactions (
    id, code, customer_name, payment_status, generated_at, notes, status, submitted_by, corrects_id
  ) values (
    v_id, v_code, v_customer, v_payment, v_generated, v_notes, 'pending', auth.uid(),
    nullif(p_payload ->> 'correctsId', '')::uuid
  );

  insert into public.sales_items (transaction_id, product_id, quantity, unit_price, unit_cost)
  select v_id, lines.product_id, lines.quantity, p.selling_price, p.cost_price
  from (
    select (value ->> 'productId')::uuid as product_id, sum((value ->> 'quantity')::integer) as quantity
    from jsonb_array_elements(p_payload -> 'items')
    group by 1
  ) lines
  join public.products p on p.id = lines.product_id;

  if public.is_admin() then
    for v_line in select * from public.sales_items where transaction_id = v_id loop
      if public.confirmed_qty(v_line.product_id) < v_line.quantity then
        raise exception 'Not enough confirmed stock. Nothing was changed.';
      end if;
    end loop;
    for v_line in select * from public.sales_items where transaction_id = v_id loop
      insert into public.inventory_movements (product_id, type, quantity, unit_cost, reference_type, reference_id, note, created_by)
      values (v_line.product_id, 'sale', -v_line.quantity, v_line.unit_cost, 'sale', v_id::text, 'Approved sale ' || v_code, auth.uid());
    end loop;
    perform set_config('manyara.internal', 'on', true);
    update public.sales_transactions
    set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = null
    where id = v_id;
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (auth.uid(), 'sale.approve', 'sale', v_id::text, 'Recorded and approved bill ' || v_code || ' for ' || v_customer || ' (' || v_payment || ').');
  else
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (auth.uid(), 'sale.submit', 'sale', v_id::text, 'Submitted bill ' || v_code || ' for ' || v_customer || ' (' || v_payment || ').');
    perform public.notify_admins(
      'submission_pending',
      'Bill waiting for review',
      v_code || ' for ' || v_customer || ' is ' || v_payment || ' and is waiting for approval.',
      '/admin/approvals'
    );
  end if;
  return v_id;
end;
$$;

create or replace function public.set_bill_payment(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.sales_transactions%rowtype;
  v_status text := lower(trim(coalesce(p_status, '')));
begin
  if auth.uid() is null then raise exception 'You are not signed in'; end if;
  if v_status not in ('paid', 'unpaid') then raise exception 'Mark the bill paid or unpaid'; end if;
  select * into v_tx from public.sales_transactions where id = p_id for update;
  if not found then raise exception 'Bill not found'; end if;
  if v_tx.status in ('rejected', 'cancelled') then raise exception 'This bill can no longer be changed'; end if;
  if not public.is_admin() then
    if v_tx.submitted_by is distinct from auth.uid() then raise exception 'Bill not found'; end if;
    if v_tx.status <> 'pending' then raise exception 'Payment can be changed until the administrator reviews the bill'; end if;
  end if;
  update public.sales_transactions set payment_status = v_status where id = p_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'sale.payment', 'sale', p_id::text, 'Marked ' || v_tx.code || ' as ' || v_status || '.');
end;
$$;

create or replace function public.update_sale(p_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.sales_transactions%rowtype;
  v_notes text;
  v_customer text;
  v_payment text;
  v_line record;
  v_available integer;
  v_name text;
begin
  if not public.is_admin() then raise exception 'Only an administrator can do that'; end if;
  select * into v_tx from public.sales_transactions where id = p_id for update;
  if not found then raise exception 'Bill not found'; end if;
  if v_tx.status not in ('pending', 'approved') then raise exception 'This bill can no longer be edited'; end if;
  v_notes := trim(coalesce(p_payload ->> 'notes', ''));
  v_customer := trim(coalesce(p_payload ->> 'customerName', ''));
  v_payment := lower(trim(coalesce(p_payload ->> 'paymentStatus', '')));
  if char_length(v_notes) > 400 then raise exception 'Notes are too long'; end if;
  if char_length(v_customer) < 2 or char_length(v_customer) > 80 then raise exception 'Enter the customer name'; end if;
  if v_payment not in ('paid', 'unpaid') then raise exception 'Mark the bill paid or unpaid'; end if;
  if jsonb_typeof(p_payload -> 'items') <> 'array' or jsonb_array_length(p_payload -> 'items') < 1 then
    raise exception 'Add at least one product';
  end if;

  perform 1 from public.products
  where id in (select (value ->> 'productId')::uuid from jsonb_array_elements(p_payload -> 'items'))
  order by id
  for update;

  for v_line in
    select (value ->> 'productId')::uuid as product_id, sum((value ->> 'quantity')::integer) as quantity
    from jsonb_array_elements(p_payload -> 'items')
    group by 1
  loop
    if v_line.quantity is null or v_line.quantity < 1 or v_line.quantity > 100000 then
      raise exception 'Enter a valid quantity';
    end if;
    select name into v_name from public.products where id = v_line.product_id and is_active;
    if v_name is null then raise exception 'Choose an active product'; end if;
    v_available := public.confirmed_qty(v_line.product_id) - coalesce((
      select sum(si.quantity)::integer
      from public.sales_items si
      join public.sales_transactions st on st.id = si.transaction_id
      where si.product_id = v_line.product_id
        and st.status = 'pending'
        and st.id <> p_id
    ), 0);
    if v_tx.status = 'approved' then
      v_available := v_available + coalesce((
        select sum(-m.quantity)::integer
        from public.inventory_movements m
        where m.product_id = v_line.product_id and m.reference_type = 'sale' and m.reference_id = p_id::text
      ), 0);
    end if;
    if v_line.quantity > v_available then
      raise exception 'Only % of % can be sold.', v_available, v_name;
    end if;
  end loop;

  if v_tx.status = 'approved' then
    delete from public.inventory_movements
    where reference_type = 'sale' and reference_id = p_id::text;
  end if;
  delete from public.sales_items where transaction_id = p_id;
  insert into public.sales_items (transaction_id, product_id, quantity, unit_price, unit_cost)
  select p_id, lines.product_id, lines.quantity, p.selling_price, p.cost_price
  from (
    select (value ->> 'productId')::uuid as product_id, sum((value ->> 'quantity')::integer) as quantity
    from jsonb_array_elements(p_payload -> 'items')
    group by 1
  ) lines
  join public.products p on p.id = lines.product_id;

  if v_tx.status = 'approved' then
    for v_line in select * from public.sales_items where transaction_id = p_id loop
      insert into public.inventory_movements (product_id, type, quantity, unit_cost, reference_type, reference_id, note, created_by)
      values (v_line.product_id, 'sale', -v_line.quantity, v_line.unit_cost, 'sale', p_id::text, 'Approved sale ' || v_tx.code, auth.uid());
    end loop;
  end if;

  update public.sales_transactions
  set customer_name = v_customer, payment_status = v_payment, notes = v_notes
  where id = p_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'sale.edit', 'sale', p_id::text, 'Edited bill ' || v_tx.code || '. The generated time was left unchanged.');
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
  v_received integer;
  v_cost integer;
  v_stock integer;
  v_available integer;
  v_old integer;
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
      select coalesce(sum((value ->> 'receivedQuantity')::integer), 0) into v_received
      from jsonb_array_elements(p_payload -> 'items')
      where (value ->> 'productId')::uuid = v_product_id;
      select conversion_factor into v_stock from public.products where id = v_product_id;
      v_available := public.confirmed_qty(v_product_id) - v_old + (v_received * coalesce(v_stock, 1)) - coalesce((
        select sum(si.quantity)::integer
        from public.sales_items si
        join public.sales_transactions st on st.id = si.transaction_id
        where si.product_id = v_product_id and st.status = 'pending'
      ), 0);
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
    v_received := (v_item ->> 'receivedQuantity')::integer;
    v_cost := (v_item ->> 'costPerStockUnit')::integer;
    if v_received is null or v_received < 1 or v_received > 100000 then
      raise exception 'Enter a valid quantity for %', v_product.name;
    end if;
    if v_cost is null or v_cost < 0 or v_cost > 100000000 then
      raise exception 'Enter a valid cost for %', v_product.name;
    end if;
    v_stock := v_received * v_product.conversion_factor;
    insert into public.stock_in_items (
      transaction_id, product_id, received_quantity, receive_unit_id, conversion_factor, stock_quantity, cost_per_stock_unit, total_cost
    ) values (
      p_id, v_product.id, v_received, v_product.receive_unit_id, v_product.conversion_factor, v_stock, v_cost, v_cost * v_stock
    );
    if v_tx.status = 'approved' then
      insert into public.inventory_movements (product_id, type, quantity, unit_cost, reference_type, reference_id, note, created_by)
      values (v_product.id, 'stock_in', v_stock, v_cost, 'stock_in', p_id::text, 'Approved delivery ' || v_tx.code, auth.uid());
      update public.products set cost_price = v_cost where id = v_product.id;
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

revoke all on function public.submit_sale(jsonb) from public;
revoke all on function public.set_bill_payment(uuid, text) from public;
revoke all on function public.update_sale(uuid, jsonb) from public;
revoke all on function public.update_stock_in(uuid, jsonb) from public;
grant execute on function public.submit_sale(jsonb) to authenticated;
grant execute on function public.set_bill_payment(uuid, text) to authenticated;
grant execute on function public.update_sale(uuid, jsonb) to authenticated;
grant execute on function public.update_stock_in(uuid, jsonb) to authenticated;
