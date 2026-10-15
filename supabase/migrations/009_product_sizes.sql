-- Products can be one size or small, medium, and big, each with its own selling price.
-- A product can also be sold by the cup or by the half. The bill stores the size and serving.
-- Stock still drops by the quantity in the product's stock unit.

alter table public.products add column if not exists size_mode text;
alter table public.products add column if not exists sizes jsonb;
alter table public.products add column if not exists cup_price integer;
alter table public.products add column if not exists half_price integer;

update public.products set size_mode = 'one' where size_mode is null or size_mode not in ('one', 'many');
update public.products set sizes = '[]'::jsonb where sizes is null;

alter table public.products alter column size_mode set default 'one';
alter table public.products alter column size_mode set not null;
alter table public.products alter column sizes set default '[]'::jsonb;
alter table public.products alter column sizes set not null;

alter table public.products drop constraint if exists products_size_mode_check;
alter table public.products
  add constraint products_size_mode_check check (size_mode in ('one', 'many'));
alter table public.products drop constraint if exists products_cup_price_check;
alter table public.products
  add constraint products_cup_price_check check (cup_price is null or cup_price >= 0);
alter table public.products drop constraint if exists products_half_price_check;
alter table public.products
  add constraint products_half_price_check check (half_price is null or half_price >= 0);

alter table public.sales_items add column if not exists size_name text;
alter table public.sales_items add column if not exists portion text;
update public.sales_items set size_name = 'one' where size_name is null or size_name = '';
update public.sales_items set portion = 'full' where portion is null or portion not in ('full', 'cup', 'half');
alter table public.sales_items alter column size_name set default 'one';
alter table public.sales_items alter column size_name set not null;
alter table public.sales_items alter column portion set default 'full';
alter table public.sales_items alter column portion set not null;
alter table public.sales_items drop constraint if exists sales_items_portion_check;
alter table public.sales_items
  add constraint sales_items_portion_check check (portion in ('full', 'cup', 'half'));

create or replace function public.product_portion_price(p public.products, p_size text, p_portion text)
returns integer
language plpgsql
stable
as $$
declare
  v_size text := lower(trim(coalesce(p_size, 'one')));
  v_portion text := lower(trim(coalesce(p_portion, 'full')));
  v_elem jsonb;
  v_raw text;
begin
  if v_portion not in ('full', 'cup', 'half') then return null; end if;
  if coalesce(p.size_mode, 'one') = 'many' then
    if v_size not in ('small', 'medium', 'big') then return null; end if;
    select elem into v_elem
    from jsonb_array_elements(coalesce(p.sizes, '[]'::jsonb)) elem
    where lower(coalesce(elem ->> 'name', '')) = v_size
    limit 1;
    if v_elem is null then return null; end if;
    if v_portion = 'full' then v_raw := v_elem ->> 'price';
    elsif v_portion = 'cup' then v_raw := v_elem ->> 'cupPrice';
    else v_raw := v_elem ->> 'halfPrice';
    end if;
    if v_raw is null or v_raw !~ '^[0-9]+$' then return null; end if;
    return v_raw::integer;
  end if;
  if v_portion = 'full' then return p.selling_price; end if;
  if v_portion = 'cup' then return p.cup_price; end if;
  return p.half_price;
end;
$$;

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
    id, code, customer_name, payment_status, generated_at, notes, status, submitted_by, corrects_id
  ) values (
    v_id, v_code, v_customer, v_payment, v_generated, v_notes, 'pending', auth.uid(),
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
  set customer_name = v_customer, payment_status = v_payment, notes = v_notes
  where id = p_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'sale.edit', 'sale', p_id::text, 'Edited bill ' || v_tx.code || '. The generated time was left unchanged.');
end;
$$;

revoke all on function public.product_portion_price(public.products, text, text) from public;
