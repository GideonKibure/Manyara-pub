-- Allow remaining stock of 0.5, editable buying price on remaining count,
-- and fix admin sale delete: movement_type has no value "bill".
-- Paste in the Supabase SQL editor and Run.

alter table public.sales_items
  alter column quantity type numeric(12,2) using quantity::numeric(12,2);

alter table public.inventory_movements
  alter column quantity type numeric(12,2) using quantity::numeric(12,2);

drop function if exists public.current_stock();
drop function if exists public.confirmed_qty(uuid);
drop function if exists public.reserved_qty(uuid);

create function public.confirmed_qty(p_product uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(quantity), 0)
  from public.inventory_movements
  where product_id = p_product;
$$;

create function public.reserved_qty(p_product uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(si.quantity), 0)
  from public.sales_items si
  join public.sales_transactions st on st.id = si.transaction_id
  where si.product_id = p_product
    and st.status = 'pending'
    and not exists (
      select 1 from public.inventory_movements m
      where m.reference_type = 'sale'
        and m.reference_id = st.id::text
        and m.quantity < 0
    );
$$;

create function public.current_stock()
returns table (product_id uuid, confirmed_qty numeric, reserved_qty numeric, available_qty numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'Your account is not active';
  end if;
  return query
  select
    p.id,
    public.confirmed_qty(p.id),
    public.reserved_qty(p.id),
    public.confirmed_qty(p.id) - public.reserved_qty(p.id)
  from public.products p;
end;
$$;

grant execute on function public.confirmed_qty(uuid) to authenticated;
grant execute on function public.reserved_qty(uuid) to authenticated;
grant execute on function public.current_stock() to authenticated;

create or replace function public.admin_delete_record(p_kind text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_label text;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can delete this record.';
  end if;

  if p_kind = 'stock_in' then
    select code into v_code from public.stock_in_transactions where id = p_id;
    if v_code is null then
      raise exception 'Delivery not found.';
    end if;
    delete from public.inventory_movements
      where id is not null
        and (
          reference_id = p_id::text
          or reference_id = v_code
          or (reference_type = 'stock_in' and reference_id = p_id::text)
        );
    delete from public.stock_in_items where transaction_id = p_id;
    delete from public.stock_in_transactions where id = p_id;
    v_label := 'Deleted stock in ' || v_code || '.';
  elsif p_kind = 'sale' then
    select code into v_code from public.sales_transactions where id = p_id;
    if v_code is null then
      raise exception 'Sale not found.';
    end if;
    delete from public.inventory_movements
      where id is not null
        and (
          reference_id = p_id::text
          or reference_id = v_code
          or (reference_type = 'sale' and reference_id = p_id::text)
        );
    delete from public.sales_items where transaction_id = p_id;
    delete from public.sales_transactions where id = p_id;
    v_label := 'Deleted sale or bill ' || v_code || '.';
  elsif p_kind = 'expense' then
    select code into v_code from public.expenses where id = p_id;
    if v_code is null then
      raise exception 'Expense not found.';
    end if;
    delete from public.expenses where id = p_id;
    v_label := 'Deleted expense ' || v_code || '.';
  else
    raise exception 'Unknown record type.';
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (auth.uid(), p_kind || '.delete', p_kind, p_id::text, v_label);
end;
$$;

revoke all on function public.admin_delete_record(text, uuid) from public;
grant execute on function public.admin_delete_record(text, uuid) to authenticated;

create or replace function public.submit_remaining_count(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_code text;
  v_line record;
  v_product public.products%rowtype;
  v_available numeric;
  v_remaining numeric;
  v_sold numeric;
  v_cost integer;
  v_allowed boolean := false;
  v_sold_items jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'You are not signed in'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'Your account is not active';
  end if;
  select coalesce(allow_remaining_count, false) into v_allowed from public.business_settings where id = 1;
  if not public.is_admin() and not v_allowed then
    raise exception 'The administrator has not opened remaining-stock count';
  end if;
  if jsonb_typeof(p_payload -> 'items') <> 'array' or jsonb_array_length(p_payload -> 'items') < 1 then
    raise exception 'Enter the remaining quantity for each product';
  end if;

  perform 1 from public.products
  where id in (select (value ->> 'productId')::uuid from jsonb_array_elements(p_payload -> 'items'))
  order by id
  for update;

  for v_line in
    select
      (value ->> 'productId')::uuid as product_id,
      (value ->> 'remaining')::numeric as remaining,
      (value ->> 'unitCost')::integer as unit_cost
    from jsonb_array_elements(p_payload -> 'items')
  loop
    if v_line.product_id is null then raise exception 'Choose an active product'; end if;
    select * into v_product from public.products where id = v_line.product_id and is_active;
    if not found then raise exception 'Choose an active product'; end if;
    v_remaining := v_line.remaining;
    if v_remaining is null or v_remaining < 0 or round(v_remaining * 2) <> v_remaining * 2 then
      raise exception 'Enter the remaining quantity for % as a whole number or a half (for example 10.5)', v_product.name;
    end if;
    v_available := public.confirmed_qty(v_product.id) - public.reserved_qty(v_product.id);
    if v_remaining > v_available then
      raise exception '% has % available. Remaining cannot be higher.', v_product.name, v_available;
    end if;
    v_sold := v_available - v_remaining;
    if v_sold <= 0 then continue; end if;
    v_cost := coalesce(v_line.unit_cost, v_product.cost_price);
    if v_cost < 0 then v_cost := v_product.cost_price; end if;
    v_sold_items := v_sold_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'quantity', v_sold,
      'unit_price', v_product.selling_price,
      'unit_cost', v_cost
    ));
  end loop;

  if jsonb_array_length(v_sold_items) < 1 then
    raise exception 'The remaining quantities match current stock. Nothing was sold.';
  end if;

  v_code := 'SL-' || to_char(nextval('public.sale_code_seq'), 'FM0000');
  insert into public.sales_transactions (
    id, code, customer_name, payment_status, record_kind, generated_at, notes, status,
    submitted_by, submitted_at, reviewed_by, reviewed_at
  ) values (
    v_id, v_code, '', 'paid', 'sale', now(), 'Remaining stock count', 'approved',
    auth.uid(), now(), auth.uid(), now()
  );

  insert into public.sales_items (transaction_id, product_id, quantity, unit_price, unit_cost, size_name, portion)
  select v_id, (value ->> 'product_id')::uuid, (value ->> 'quantity')::numeric,
    (value ->> 'unit_price')::integer, (value ->> 'unit_cost')::integer, 'one', 'full'
  from jsonb_array_elements(v_sold_items);

  for v_line in select * from public.sales_items where transaction_id = v_id loop
    insert into public.inventory_movements (product_id, type, quantity, unit_cost, reference_type, reference_id, note, created_by)
    values (v_line.product_id, 'sale', -v_line.quantity, v_line.unit_cost, 'sale', v_id::text, 'Remaining count ' || v_code, auth.uid());
  end loop;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'sale.remaining', 'sale', v_id::text, 'Recorded remaining stock as sale ' || v_code || '.');
  insert into public.notifications (recipient_id, type, title, message, href)
  select id, 'submission_approved', v_code || ' remaining stock report',
    'A remaining-stock report was recorded. Open Remaining stock to review and download it.', '/admin/remaining'
  from public.profiles where role = 'admin' and is_active and id is distinct from auth.uid();
  return v_id;
end;
$$;

grant execute on function public.submit_remaining_count(jsonb) to authenticated;

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
  v_kind text;
  v_generated timestamptz := now();
  v_line record;
  v_product public.products%rowtype;
  v_available numeric;
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
  v_kind := lower(trim(coalesce(p_payload ->> 'recordKind', 'sale')));
  if v_kind not in ('sale', 'bill') then v_kind := 'sale'; end if;
  if v_kind = 'bill' and (char_length(v_customer) < 2 or char_length(v_customer) > 80) then
    raise exception 'Enter the customer name';
  end if;
  if v_kind <> 'bill' then v_customer := ''; end if;
  if v_payment not in ('paid', 'unpaid') then raise exception 'Mark the bill paid or unpaid'; end if;
  if v_kind = 'bill' and v_payment = 'paid' then v_kind := 'sale'; end if;
  if v_kind <> 'bill' and v_payment <> 'paid' then raise exception 'A sale can be recorded only when it is paid'; end if;
  if v_kind <> 'bill' then v_payment := 'paid'; end if;
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
    select (value ->> 'productId')::uuid as product_id, sum((value ->> 'quantity')::numeric) as quantity
    from jsonb_array_elements(p_payload -> 'items')
    group by 1
  loop
    if v_line.quantity is null or v_line.quantity < 1 or v_line.quantity > 100000 then
      raise exception 'Enter a valid quantity';
    end if;
    select name into v_name from public.products where id = v_line.product_id and is_active;
    if v_name is null then raise exception 'Choose an active product'; end if;
    v_available := public.confirmed_qty(v_line.product_id) - public.reserved_qty(v_line.product_id);
    if v_line.quantity > v_available then
      raise exception 'Only % of % can be sold.', v_available, v_name;
    end if;
  end loop;

  for v_line in
    select
      (value ->> 'productId')::uuid as product_id,
      lower(coalesce(nullif(value ->> 'sizeName', ''), 'one')) as size_name,
      lower(coalesce(nullif(value ->> 'portion', ''), 'full')) as portion
    from jsonb_array_elements(p_payload -> 'items')
    group by 1, 2, 3
  loop
    select * into v_product from public.products where id = v_line.product_id;
    if public.product_portion_price(v_product, v_line.size_name, v_line.portion) is null then
      raise exception 'Choose a size and serving that % is sold in.', v_product.name;
    end if;
  end loop;

  v_code := 'SL-' || to_char(nextval('public.sale_code_seq'), 'FM0000');
  insert into public.sales_transactions (
    id, code, customer_name, payment_status, record_kind, generated_at, notes, status,
    submitted_by, submitted_at, reviewed_by, reviewed_at, corrects_id
  ) values (
    v_id, v_code, v_customer, v_payment, v_kind, v_generated, v_notes,
    case when v_kind = 'bill' then 'pending' else 'approved' end,
    auth.uid(), now(),
    case when v_kind = 'bill' then null else auth.uid() end,
    case when v_kind = 'bill' then null else now() end,
    nullif(p_payload ->> 'correctsId', '')::uuid
  );

  insert into public.sales_items (transaction_id, product_id, quantity, unit_price, unit_cost, size_name, portion)
  select v_id, lines.product_id, lines.quantity, public.product_portion_price(p, lines.size_name, lines.portion), p.cost_price,
    case when coalesce(p.size_mode, 'one') = 'many' then lines.size_name else 'one' end,
    lines.portion
  from (
    select
      (value ->> 'productId')::uuid as product_id,
      lower(coalesce(nullif(value ->> 'sizeName', ''), 'one')) as size_name,
      lower(coalesce(nullif(value ->> 'portion', ''), 'full')) as portion,
      sum((value ->> 'quantity')::numeric) as quantity
    from jsonb_array_elements(p_payload -> 'items')
    group by 1, 2, 3
  ) lines
  join public.products p on p.id = lines.product_id;

  for v_line in select * from public.sales_items where transaction_id = v_id loop
    insert into public.inventory_movements (product_id, type, quantity, unit_cost, reference_type, reference_id, note, created_by)
    values (
      v_line.product_id, 'sale', -v_line.quantity, v_line.unit_cost, 'sale', v_id::text,
      case when v_kind = 'bill' then 'Bill ' else 'Sale ' end || v_code,
      auth.uid()
    );
  end loop;

  if v_kind <> 'bill' then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (auth.uid(), 'sale.approve', 'sale', v_id::text, 'Recorded sale ' || v_code || '. Confirmed stock was updated.');
  elsif public.is_admin() then
    perform set_config('manyara.internal', 'on', true);
    update public.sales_transactions
    set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = null
    where id = v_id;
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (auth.uid(), 'sale.approve', 'sale', v_id::text, 'Recorded and approved bill ' || v_code || ' for ' || v_customer || ' (' || v_payment || ').');
  else
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (auth.uid(), 'sale.submit', 'sale', v_id::text, 'Saved bill ' || v_code || ' for ' || v_customer || '. Stock was updated. It stays a bill until it is marked sold.');
  end if;
  return v_id;
end;
$$;

grant execute on function public.submit_sale(jsonb) to authenticated;
