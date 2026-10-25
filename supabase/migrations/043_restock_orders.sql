-- Employee restock orders: write quantities for low or extra stock,
-- then mark received to create an approved stock-in and update confirmed stock.
-- Paste in the Supabase SQL editor and Run.

create sequence if not exists public.restock_order_code_seq;

create table if not exists public.restock_orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  notes text not null default '',
  status text not null default 'not_received' check (status in ('not_received', 'received')),
  submitted_by uuid not null references public.profiles (id),
  submitted_at timestamptz not null default now(),
  received_at timestamptz,
  received_by uuid references public.profiles (id),
  stock_in_id uuid references public.stock_in_transactions (id) on delete set null
);

create table if not exists public.restock_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.restock_orders (id) on delete cascade,
  product_id uuid not null references public.products (id),
  received_quantity numeric(12,2) not null check (received_quantity > 0),
  receive_unit_id uuid not null references public.units (id),
  conversion_factor integer not null check (conversion_factor > 0),
  stock_quantity numeric(12,2) not null check (stock_quantity > 0)
);

create index if not exists restock_orders_submitted_idx on public.restock_orders (submitted_by, submitted_at desc);
create index if not exists restock_order_items_order_idx on public.restock_order_items (order_id);

alter table public.restock_orders enable row level security;
alter table public.restock_order_items enable row level security;

drop policy if exists restock_orders_select on public.restock_orders;
create policy restock_orders_select on public.restock_orders for select to authenticated using (true);

drop policy if exists restock_order_items_select on public.restock_order_items;
create policy restock_order_items_select on public.restock_order_items for select to authenticated using (true);

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
    if v_existing.status = 'received' then
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
      order_id, product_id, received_quantity, receive_unit_id, conversion_factor, stock_quantity
    ) values (
      v_id, v_product.id, v_qty, v_product.receive_unit_id, v_product.conversion_factor, v_stock
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

create or replace function public.set_restock_order_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.restock_orders%rowtype;
  v_item public.restock_order_items%rowtype;
  v_product public.products%rowtype;
  v_stock_id uuid;
  v_code text;
  v_invoice text;
  v_supplier uuid;
  v_qty numeric;
  v_stock numeric;
  v_cost integer;
  v_confirmed numeric;
begin
  if auth.uid() is null then raise exception 'You are not signed in'; end if;
  if p_status not in ('received', 'not_received') then raise exception 'Unknown order status'; end if;
  select * into v_order from public.restock_orders where id = p_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.submitted_by is distinct from auth.uid() and not public.is_admin() then
    raise exception 'You can only change your own orders';
  end if;
  if v_order.status = p_status then return; end if;

  if p_status = 'not_received' then
    if v_order.stock_in_id is not null then
      for v_item in select * from public.restock_order_items where order_id = p_id loop
        v_confirmed := public.confirmed_qty(v_item.product_id);
        select stock_quantity into v_stock
        from public.stock_in_items
        where transaction_id = v_order.stock_in_id and product_id = v_item.product_id
        limit 1;
        if coalesce(v_stock, v_item.stock_quantity) > v_confirmed then
          raise exception 'Not enough remaining stock to reverse %. Sell or count first, or leave this order as received', (
            select name from public.products where id = v_item.product_id
          );
        end if;
      end loop;
      delete from public.inventory_movements
        where reference_type = 'stock_in'
          and (reference_id = v_order.stock_in_id::text or reference_id = (
            select code from public.stock_in_transactions where id = v_order.stock_in_id
          ));
      delete from public.stock_in_items where transaction_id = v_order.stock_in_id;
      delete from public.stock_in_transactions where id = v_order.stock_in_id;
    end if;
    update public.restock_orders
      set status = 'not_received', received_at = null, received_by = null, stock_in_id = null
      where id = p_id;
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (auth.uid(), 'restock.unreceive', 'restock_order', p_id::text, 'Marked ' || v_order.code || ' not received and reversed stock in.');
    return;
  end if;

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

  for v_item in select * from public.restock_order_items where order_id = p_id order by id loop
    select * into v_product from public.products where id = v_item.product_id and is_active;
    if not found then raise exception 'Choose an active product'; end if;
    v_qty := v_item.received_quantity;
    v_stock := round(v_qty * v_product.conversion_factor, 2);
    v_cost := round(v_product.cost_price)::integer;
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
    update public.restock_order_items
      set conversion_factor = v_product.conversion_factor, stock_quantity = v_stock, receive_unit_id = v_product.receive_unit_id
      where id = v_item.id;
  end loop;

  update public.restock_orders
    set status = 'received', received_at = now(), received_by = auth.uid(), stock_in_id = v_stock_id
    where id = p_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'restock.receive', 'restock_order', p_id::text, 'Received ' || v_order.code || '. Stock in ' || v_code || ' updated confirmed stock.');
end;
$$;

grant execute on function public.save_restock_order(uuid, jsonb) to authenticated;
grant execute on function public.set_restock_order_status(uuid, text) to authenticated;

create or replace function public.clear_business_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can clear business data.';
  end if;

  perform set_config('manyara.internal', 'on', true);

  if to_regclass('public.restock_order_items') is not null then
    delete from public.restock_order_items where id is not null;
  end if;
  if to_regclass('public.restock_orders') is not null then
    delete from public.restock_orders where id is not null;
  end if;
  if to_regclass('public.day_closes') is not null then
    delete from public.day_closes where id is not null;
  end if;
  if to_regclass('public.product_price_changes') is not null then
    delete from public.product_price_changes where id is not null;
  end if;

  update public.sales_transactions
    set source_bill_id = null, corrects_id = null
    where id is not null;
  update public.stock_in_transactions
    set corrects_id = null
    where id is not null;
  update public.activity_transactions
    set corrects_id = null
    where id is not null;
  update public.expenses
    set corrects_id = null
    where id is not null;

  delete from public.sales_items where id is not null;
  delete from public.stock_in_items where id is not null;
  delete from public.sales_transactions where id is not null;
  delete from public.stock_in_transactions where id is not null;
  delete from public.inventory_movements where id is not null;
  delete from public.expenses where id is not null;
  delete from public.activity_transactions where id is not null;
  delete from public.notifications where id is not null;
  delete from public.products where id is not null;
  delete from public.suppliers where id is not null;
  delete from public.audit_logs where id is not null;

  if exists (select 1 from pg_class where relname = 'restock_order_code_seq' and relkind = 'S') then
    perform setval('public.restock_order_code_seq', 1, false);
  end if;
  if exists (select 1 from pg_class where relname = 'stock_in_code_seq' and relkind = 'S') then
    perform setval('public.stock_in_code_seq', 1, false);
  end if;
  if exists (select 1 from pg_class where relname = 'sale_code_seq' and relkind = 'S') then
    perform setval('public.sale_code_seq', 1, false);
  end if;
  if exists (select 1 from pg_class where relname = 'activity_code_seq' and relkind = 'S') then
    perform setval('public.activity_code_seq', 1, false);
  end if;
  if exists (select 1 from pg_class where relname = 'expense_code_seq' and relkind = 'S') then
    perform setval('public.expense_code_seq', 1, false);
  end if;
  if exists (select 1 from pg_class where relname = 'adjustment_code_seq' and relkind = 'S') then
    perform setval('public.adjustment_code_seq', 1, false);
  end if;
  if exists (select 1 from pg_class where relname = 'invoice_ref_seq' and relkind = 'S') then
    perform setval('public.invoice_ref_seq', 1, false);
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'business.clear', 'settings', 'all', 'Cleared business operational data.');
end;
$$;

notify pgrst, 'reload schema';
