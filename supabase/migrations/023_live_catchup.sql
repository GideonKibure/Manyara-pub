-- Manyara Pub live catch-up. Paste this whole file in the Supabase SQL editor and Run.
-- Requires 001_initial (tables, RLS, approve_stock_in, submit_activity, etc.).
-- Safe to run again: columns use IF NOT EXISTS, functions are replaced.

-- 1) Columns and tables the app reads and writes.

alter table public.profiles add column if not exists avatar_url text;

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
alter table public.products add constraint products_size_mode_check check (size_mode in ('one', 'many'));
alter table public.products drop constraint if exists products_cup_price_check;
alter table public.products add constraint products_cup_price_check check (cup_price is null or cup_price >= 0);
alter table public.products drop constraint if exists products_half_price_check;
alter table public.products add constraint products_half_price_check check (half_price is null or half_price >= 0);

alter table public.sales_transactions add column if not exists customer_name text;
alter table public.sales_transactions add column if not exists payment_status text;
alter table public.sales_transactions add column if not exists generated_at timestamptz;
alter table public.sales_transactions add column if not exists record_kind text;
alter table public.sales_transactions add column if not exists is_loss boolean not null default false;
alter table public.sales_transactions add column if not exists amount_paid integer;
alter table public.sales_transactions add column if not exists settled_amount integer;
alter table public.sales_transactions add column if not exists source_bill_id uuid;
update public.sales_transactions set customer_name = coalesce(customer_name, '');
update public.sales_transactions set payment_status = 'unpaid' where payment_status is null or payment_status not in ('paid', 'unpaid');
update public.sales_transactions set generated_at = coalesce(generated_at, submitted_at, now());
update public.sales_transactions set record_kind = case when payment_status = 'paid' then 'sale' else 'bill' end
  where record_kind is null or record_kind not in ('sale', 'bill');
update public.sales_transactions set amount_paid = 0 where amount_paid is null;
alter table public.sales_transactions alter column customer_name set default '';
alter table public.sales_transactions alter column customer_name set not null;
alter table public.sales_transactions alter column payment_status set default 'unpaid';
alter table public.sales_transactions alter column payment_status set not null;
alter table public.sales_transactions alter column generated_at set default now();
alter table public.sales_transactions alter column generated_at set not null;
alter table public.sales_transactions alter column record_kind set default 'sale';
alter table public.sales_transactions alter column record_kind set not null;
alter table public.sales_transactions alter column amount_paid set default 0;
alter table public.sales_transactions alter column amount_paid set not null;
alter table public.sales_transactions drop constraint if exists sales_payment_status_check;
alter table public.sales_transactions add constraint sales_payment_status_check check (payment_status in ('paid', 'unpaid'));
alter table public.sales_transactions drop constraint if exists sales_record_kind_check;
alter table public.sales_transactions add constraint sales_record_kind_check check (record_kind in ('sale', 'bill'));
alter table public.sales_transactions drop constraint if exists sales_amount_paid_check;
alter table public.sales_transactions add constraint sales_amount_paid_check check (amount_paid >= 0);
alter table public.sales_transactions drop constraint if exists sales_settled_amount_check;
alter table public.sales_transactions add constraint sales_settled_amount_check check (settled_amount is null or settled_amount >= 0);

alter table public.sales_items add column if not exists size_name text;
alter table public.sales_items add column if not exists portion text;
update public.sales_items set size_name = 'one' where size_name is null or size_name = '';
update public.sales_items set portion = 'full' where portion is null or portion not in ('full', 'cup', 'half');
alter table public.sales_items alter column size_name set default 'one';
alter table public.sales_items alter column size_name set not null;
alter table public.sales_items alter column portion set default 'full';
alter table public.sales_items alter column portion set not null;
alter table public.sales_items drop constraint if exists sales_items_portion_check;
alter table public.sales_items add constraint sales_items_portion_check check (portion in ('full', 'cup', 'half'));

alter table public.stock_in_items add column if not exists size_name text;
update public.stock_in_items set size_name = 'one' where size_name is null or size_name = '';
alter table public.stock_in_items alter column size_name set default 'one';
alter table public.stock_in_items alter column size_name set not null;
alter table public.stock_in_items drop constraint if exists stock_in_items_size_name_check;
alter table public.stock_in_items add constraint stock_in_items_size_name_check check (size_name in ('one', 'small', 'medium', 'big'));

create sequence if not exists public.expense_code_seq;
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text not null,
  amount integer not null check (amount > 0 and amount <= 100000000),
  spent_on date not null,
  notes text not null default '',
  status public.approval_status not null default 'pending',
  submitted_by uuid not null references public.profiles (id),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  rejection_reason text,
  corrects_id uuid references public.expenses (id)
);
create index if not exists expenses_status_idx on public.expenses (status, submitted_at desc);
alter table public.expenses enable row level security;
drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses for select to authenticated
using (submitted_by = auth.uid() or public.is_admin());
grant select, insert, update, delete on public.expenses to authenticated;
grant usage on sequence public.expense_code_seq to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-images', 'profile-images', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 2) Price helpers, stock, sales, bills, and overdue-bill no-op.

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

create or replace function public.product_size_cost(p public.products, p_size text)
returns integer
language plpgsql
stable
as $$
declare
  v_size text := lower(trim(coalesce(p_size, 'one')));
  v_raw text;
begin
  if coalesce(p.size_mode, 'one') <> 'many' then return p.cost_price; end if;
  select elem ->> 'cost' into v_raw
  from jsonb_array_elements(coalesce(p.sizes, '[]'::jsonb)) elem
  where lower(coalesce(elem ->> 'name', '')) = v_size
  limit 1;
  if v_raw is null or v_raw !~ '^[0-9]+$' then return p.cost_price; end if;
  return v_raw::integer;
end;
$$;

create or replace function public.reserved_qty(p_product uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(si.quantity)::integer, 0)
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

create or replace function public.current_stock()
returns table (product_id uuid, confirmed_qty integer, reserved_qty integer, available_qty integer)
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
    select (value ->> 'productId')::uuid as product_id, sum((value ->> 'quantity')::integer) as quantity
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
    id, code, customer_name, payment_status, record_kind, generated_at, notes, status, submitted_by, corrects_id
  ) values (
    v_id, v_code, v_customer, v_payment, v_kind, v_generated, v_notes, 'pending', auth.uid(),
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

  if v_kind = 'bill' then
    for v_line in select * from public.sales_items where transaction_id = v_id loop
      insert into public.inventory_movements (product_id, type, quantity, unit_cost, reference_type, reference_id, note, created_by)
      values (v_line.product_id, 'sale', -v_line.quantity, v_line.unit_cost, 'sale', v_id::text, 'Bill ' || v_code, auth.uid());
    end loop;
  end if;

  if v_kind <> 'bill' then
    for v_line in select * from public.sales_items where transaction_id = v_id loop
      if public.confirmed_qty(v_line.product_id) < v_line.quantity then
        raise exception 'Not enough confirmed stock. Nothing was changed.';
      end if;
    end loop;
    for v_line in select * from public.sales_items where transaction_id = v_id loop
      insert into public.inventory_movements (product_id, type, quantity, unit_cost, reference_type, reference_id, note, created_by)
      values (v_line.product_id, 'sale', -v_line.quantity, v_line.unit_cost, 'sale', v_id::text, 'Sale ' || v_code, auth.uid());
    end loop;
    perform set_config('manyara.internal', 'on', true);
    update public.sales_transactions
    set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = null
    where id = v_id;
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

create or replace function public.set_bill_payment(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.sales_transactions%rowtype;
  v_item public.sales_items%rowtype;
  v_status text := lower(trim(coalesce(p_status, '')));
begin
  if auth.uid() is null then raise exception 'You are not signed in'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'Your account is not active';
  end if;
  if v_status <> 'paid' then raise exception 'Mark the bill sold when the customer has paid'; end if;
  select * into v_tx from public.sales_transactions where id = p_id for update;
  if not found then raise exception 'Bill not found'; end if;
  if v_tx.record_kind <> 'bill' then raise exception 'This is already a sale'; end if;
  if v_tx.status in ('rejected', 'cancelled') then raise exception 'This bill can no longer be changed'; end if;
  if not public.is_admin() and v_tx.submitted_by is distinct from auth.uid() then
    raise exception 'Bill not found';
  end if;
  if not exists (
    select 1 from public.inventory_movements
    where reference_type = 'sale' and reference_id = p_id::text and quantity < 0
  ) then
    for v_item in select * from public.sales_items where transaction_id = p_id loop
      insert into public.inventory_movements (product_id, type, quantity, unit_cost, reference_type, reference_id, note, created_by)
      values (v_item.product_id, 'sale', -v_item.quantity, v_item.unit_cost, 'sale', p_id::text, 'Sale ' || v_tx.code, auth.uid());
    end loop;
  end if;
  perform set_config('manyara.internal', 'on', true);
  update public.sales_transactions
  set record_kind = 'sale', payment_status = 'paid', status = 'approved', is_loss = false,
      reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = null
  where id = p_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'sale.payment', 'sale', p_id::text, 'Marked ' || v_tx.code || ' as sold. It is now a sale.');
end;
$$;

create or replace function public.notify_overdue_bills()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  return;
end;
$$;

-- 3) Partial bill payment and adding a product to an open bill.

create or replace function public.record_bill_payment(p_id uuid, p_amount integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.sales_transactions%rowtype;
  v_total integer;
  v_paid integer;
  v_id uuid := gen_random_uuid();
  v_code text;
begin
  if auth.uid() is null then raise exception 'You are not signed in'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'Your account is not active';
  end if;
  if p_amount is null or p_amount < 1 then raise exception 'Enter the amount paid'; end if;
  select * into v_tx from public.sales_transactions where id = p_id for update;
  if not found then raise exception 'Bill not found'; end if;
  if v_tx.record_kind <> 'bill' then raise exception 'This is already a sale'; end if;
  if v_tx.status in ('rejected', 'cancelled') then raise exception 'This bill can no longer be changed'; end if;
  if not public.is_admin() and v_tx.submitted_by is distinct from auth.uid() then
    raise exception 'Bill not found';
  end if;
  select coalesce(sum(quantity * unit_price), 0)::integer into v_total
  from public.sales_items where transaction_id = p_id;
  v_paid := coalesce(v_tx.amount_paid, 0);
  if p_amount > v_total - v_paid then
    raise exception 'The amount is more than the remaining balance';
  end if;

  v_code := 'SL-' || to_char(nextval('public.sale_code_seq'), 'FM0000');
  insert into public.sales_transactions (
    id, code, customer_name, payment_status, record_kind, generated_at, notes, status,
    submitted_by, submitted_at, reviewed_by, reviewed_at, settled_amount, source_bill_id
  ) values (
    v_id, v_code, v_tx.customer_name, 'paid', 'sale', now(),
    'Payment toward ' || v_tx.code, 'approved',
    auth.uid(), now(), auth.uid(), now(), p_amount, p_id
  );

  update public.sales_transactions
  set amount_paid = v_paid + p_amount
  where id = p_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (
    auth.uid(), 'sale.payment', 'sale', v_id::text,
    'Recorded ' || p_amount || ' paid on ' || v_tx.code || '. ' || (v_total - v_paid - p_amount) || ' remains on the bill.'
  );
  return v_id;
end;
$$;

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

grant execute on function public.product_portion_price(public.products, text, text) to authenticated;
grant execute on function public.reserved_qty(uuid) to authenticated;
grant execute on function public.current_stock() to authenticated;
grant execute on function public.submit_sale(jsonb) to authenticated;
grant execute on function public.set_bill_payment(uuid, text) to authenticated;
grant execute on function public.notify_overdue_bills() to authenticated;
grant execute on function public.record_bill_payment(uuid, integer) to authenticated;
grant execute on function public.append_bill_item(uuid, uuid, integer, text, text) to authenticated;
