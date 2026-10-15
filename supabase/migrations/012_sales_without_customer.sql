-- Sales do not store a customer name. Bills still require one.
-- Run this if 011 was already applied. A first run of the updated 011 already includes the same change.

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
  v_kind := lower(trim(coalesce(p_payload ->> 'recordKind', 'sale')));
  if v_kind not in ('sale', 'bill') then v_kind := 'sale'; end if;
  if v_kind = 'bill' and (char_length(v_customer) < 2 or char_length(v_customer) > 80) then
    raise exception 'Enter the customer name';
  end if;
  if v_kind <> 'bill' then v_customer := ''; end if;
if v_payment <> 'paid' then
  if v_kind = 'bill' then raise exception 'Mark the bill paid before submitting'; end if;
  raise exception 'A sale can be recorded only when it is paid';
end if;
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
    id, code, customer_name, payment_status, record_kind, generated_at, notes, status, submitted_by, corrects_id
  ) values (
    v_id, v_code, v_customer, 'paid', v_kind, v_generated, v_notes, 'pending', auth.uid(),
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
      sum((value ->> 'quantity')::integer) as quantity
    from jsonb_array_elements(p_payload -> 'items')
    group by 1, 2, 3
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
  v_kind text;
  v_line record;
  v_product public.products%rowtype;
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
  v_kind := lower(trim(coalesce(nullif(p_payload ->> 'recordKind', ''), v_tx.record_kind)));
  if v_kind not in ('sale', 'bill') then v_kind := 'sale'; end if;
  if v_kind = 'bill' and (char_length(v_customer) < 2 or char_length(v_customer) > 80) then
    raise exception 'Enter the customer name';
  end if;
  if v_kind <> 'bill' then v_customer := ''; end if;
  if v_payment <> 'paid' then
    if v_kind = 'bill' then raise exception 'Mark the bill paid before submitting'; end if;
    raise exception 'A sale can be recorded only when it is paid';
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

  if v_tx.status = 'approved' then
    delete from public.inventory_movements
    where reference_type = 'sale' and reference_id = p_id::text;
  end if;
  delete from public.sales_items where transaction_id = p_id;
  insert into public.sales_items (transaction_id, product_id, quantity, unit_price, unit_cost, size_name, portion)
  select p_id, lines.product_id, lines.quantity, public.product_portion_price(p, lines.size_name, lines.portion), p.cost_price,
    case when coalesce(p.size_mode, 'one') = 'many' then lines.size_name else 'one' end,
    lines.portion
  from (
    select
      (value ->> 'productId')::uuid as product_id,
      lower(coalesce(nullif(value ->> 'sizeName', ''), 'one')) as size_name,
      lower(coalesce(nullif(value ->> 'portion', ''), 'full')) as portion,
      sum((value ->> 'quantity')::integer) as quantity
    from jsonb_array_elements(p_payload -> 'items')
    group by 1, 2, 3
  ) lines
  join public.products p on p.id = lines.product_id;

  if v_tx.status = 'approved' then
    for v_line in select * from public.sales_items where transaction_id = p_id loop
      insert into public.inventory_movements (product_id, type, quantity, unit_cost, reference_type, reference_id, note, created_by)
      values (v_line.product_id, 'sale', -v_line.quantity, v_line.unit_cost, 'sale', p_id::text, 'Approved sale ' || v_tx.code, auth.uid());
    end loop;
  end if;

  update public.sales_transactions
  set customer_name = v_customer, payment_status = 'paid', record_kind = v_kind, notes = v_notes
  where id = p_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'sale.edit', 'sale', p_id::text, 'Edited bill ' || v_tx.code || '. The generated time was left unchanged.');
end;
$$;


