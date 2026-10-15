-- Manyara Pub schema, row level security, and transactional approvals.
-- Run this in the Supabase SQL editor or with the Supabase CLI.
-- Never put the service-role key in the frontend. These functions use the signed-in user.

create extension if not exists pgcrypto;

create type public.user_role as enum ('admin', 'employee');
create type public.approval_status as enum ('pending', 'approved', 'rejected', 'cancelled');
create type public.movement_type as enum ('opening', 'stock_in', 'sale', 'adjustment');
create type public.payment_method as enum ('cash', 'mobile_money', 'card', 'other');
create type public.pricing_mode as enum ('per_game', 'per_session', 'per_play', 'flat');
create type public.notification_type as enum (
  'low_stock', 'out_of_stock', 'submission_pending', 'submission_approved',
  'submission_rejected', 'submission_cancelled', 'adjustment'
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) >= 2),
  username text not null unique,
  email text not null unique,
  phone text not null default '',
  role public.user_role not null default 'employee',
  is_active boolean not null default true,
  can_submit_activities boolean not null default false,
  can_view_stock boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  abbreviation text not null check (char_length(abbreviation) between 1 and 8)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category_id uuid not null references public.categories (id),
  image_url text,
  sku text not null default '',
  stock_unit_id uuid not null references public.units (id),
  receive_unit_id uuid not null references public.units (id),
  conversion_factor integer not null check (conversion_factor >= 1 and conversion_factor <= 10000),
  cost_price integer not null check (cost_price >= 0),
  selling_price integer not null check (selling_price >= 0),
  min_stock integer not null default 0 check (min_stock >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (stock_unit_id <> receive_unit_id or conversion_factor = 1)
);

create unique index products_name_unique on public.products (lower(name));

create unique index products_sku_unique on public.products (lower(sku)) where sku <> '';

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  phone text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.stock_in_transactions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  supplier_id uuid references public.suppliers (id),
  supplier_name text not null,
  delivery_date date not null,
  invoice_ref text not null default '',
  notes text not null default '',
  status public.approval_status not null default 'pending',
  submitted_by uuid not null references public.profiles (id),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  rejection_reason text,
  corrects_id uuid references public.stock_in_transactions (id)
);

create table public.stock_in_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.stock_in_transactions (id) on delete cascade,
  product_id uuid not null references public.products (id),
  received_quantity integer not null check (received_quantity > 0),
  receive_unit_id uuid not null references public.units (id),
  conversion_factor integer not null check (conversion_factor >= 1),
  stock_quantity integer not null check (stock_quantity > 0),
  cost_per_stock_unit integer not null check (cost_per_stock_unit >= 0),
  total_cost integer not null check (total_cost >= 0)
);

create table public.sales_transactions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  customer_name text not null default '',
  payment_status text not null default 'unpaid' check (payment_status in ('paid', 'unpaid')),
  generated_at timestamptz not null default now(),
  notes text not null default '',
  status public.approval_status not null default 'pending',
  submitted_by uuid not null references public.profiles (id),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  rejection_reason text,
  corrects_id uuid references public.sales_transactions (id)
);

create table public.sales_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.sales_transactions (id) on delete cascade,
  product_id uuid not null references public.products (id),
  quantity integer not null check (quantity > 0),
  unit_price integer not null check (unit_price >= 0),
  unit_cost integer not null check (unit_cost >= 0)
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  type public.movement_type not null,
  quantity integer not null check (quantity <> 0),
  unit_cost integer not null default 0 check (unit_cost >= 0),
  reference_type public.movement_type not null,
  reference_id text not null,
  note text not null default '',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.activity_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique,
  pricing_mode public.pricing_mode not null,
  unit_price integer not null check (unit_price >= 0),
  unit_label text not null,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.activity_transactions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  activity_type_id uuid not null references public.activity_types (id),
  quantity integer not null check (quantity > 0),
  unit_price integer not null check (unit_price >= 0),
  amount integer not null check (amount >= 0),
  payment_method public.payment_method not null,
  notes text not null default '',
  occurred_at timestamptz not null,
  status public.approval_status not null default 'pending',
  submitted_by uuid not null references public.profiles (id),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  rejection_reason text,
  corrects_id uuid references public.activity_transactions (id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  message text not null,
  href text not null default '/',
  read boolean not null default false,
  created_at timestamptz not null default now(),
  dedupe_key text,
  resolved_at timestamptz,
  channels text[] not null default array['in_app']::text[]
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  summary text not null,
  created_at timestamptz not null default now()
);

create table public.business_settings (
  id integer primary key default 1 check (id = 1),
  business_name text not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  currency_symbol text not null,
  low_stock_alerts boolean not null default true,
  updated_at timestamptz not null default now()
);

create index stock_in_status_idx on public.stock_in_transactions (status, submitted_at desc);
create index sales_status_idx on public.sales_transactions (status, submitted_at desc);
create index sales_items_product_idx on public.sales_items (product_id);
create index movements_product_idx on public.inventory_movements (product_id, created_at desc);
create index activities_status_idx on public.activity_transactions (status, occurred_at desc);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index audit_created_idx on public.audit_logs (created_at desc);

drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at before update on public.products
for each row execute function public.set_updated_at();
create trigger categories_updated_at before update on public.categories
for each row execute function public.set_updated_at();
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, username, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, 'staff'), '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'username', split_part(coalesce(new.email, 'staff'), '@', 1)),
    'employee'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.protect_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'admin' and old.role is distinct from 'admin' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Administrator access can only be granted from the database console';
  end if;
  if current_user not in ('postgres', 'supabase_admin') and not public.is_admin() then
    if new.role is distinct from old.role
      or new.is_active is distinct from old.is_active
      or new.can_submit_activities is distinct from old.can_submit_activities
      or new.can_view_stock is distinct from old.can_view_stock
      or new.email is distinct from old.email
      or new.username is distinct from old.username
    then
      raise exception 'You cannot change account privileges';
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_profile_trigger
before update on public.profiles
for each row execute function public.protect_profile();

create or replace function public.prevent_negative_stock()
returns trigger
language plpgsql
as $$
declare
  balance integer;
begin
  select coalesce(sum(quantity), 0) into balance
  from public.inventory_movements
  where product_id = new.product_id;
  if balance < 0 then
    raise exception 'Stock cannot become negative';
  end if;
  return new;
end;
$$;

create trigger prevent_negative_stock_trigger
after insert on public.inventory_movements
for each row execute function public.prevent_negative_stock();

create or replace function public.block_direct_status_change()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status and current_setting('manyara.internal', true) is distinct from 'on' then
    raise exception 'Status changes must go through an approval function';
  end if;
  return new;
end;
$$;

create trigger stock_in_status_guard before update on public.stock_in_transactions
for each row execute function public.block_direct_status_change();
create trigger sales_status_guard before update on public.sales_transactions
for each row execute function public.block_direct_status_change();
create trigger activity_status_guard before update on public.activity_transactions
for each row execute function public.block_direct_status_change();

create sequence if not exists public.adjustment_code_seq;

create or replace function public.protect_notification()
returns trigger
language plpgsql
as $$
begin
  if new.recipient_id is distinct from old.recipient_id
    or new.type is distinct from old.type
    or new.title is distinct from old.title
    or new.message is distinct from old.message
    or new.href is distinct from old.href
    or new.dedupe_key is distinct from old.dedupe_key
  then
    raise exception 'Only the read state of a notification can be changed';
  end if;
  return new;
end;
$$;

create trigger protect_notification_trigger
before update on public.notifications
for each row execute function public.protect_notification();

create or replace function public.confirmed_qty(p_product uuid)
returns integer
language sql
stable
as $$
  select coalesce(sum(quantity), 0)::integer from public.inventory_movements where product_id = p_product;
$$;

create or replace function public.approve_stock_in(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.stock_in_transactions%rowtype;
  v_item public.stock_in_items%rowtype;
begin
  if not public.is_admin() then raise exception 'Only an administrator can do that'; end if;
  select * into v_tx from public.stock_in_transactions where id = p_id for update;
  if not found then raise exception 'Submission not found'; end if;
  if v_tx.status <> 'pending' then raise exception 'This submission has already been reviewed'; end if;
  if v_tx.submitted_by = auth.uid() then raise exception 'You cannot review a submission you created'; end if;

  for v_item in select * from public.stock_in_items where transaction_id = p_id loop
    insert into public.inventory_movements (product_id, type, quantity, unit_cost, reference_type, reference_id, note, created_by)
    values (v_item.product_id, 'stock_in', v_item.stock_quantity, v_item.cost_per_stock_unit, 'stock_in', p_id::text, 'Approved delivery ' || v_tx.code, auth.uid());
    update public.products set cost_price = v_item.cost_per_stock_unit where id = v_item.product_id;
  end loop;

  perform set_config('manyara.internal', 'on', true);
  update public.stock_in_transactions
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = null
  where id = p_id and status = 'pending';
  if not found then raise exception 'This submission has already been reviewed'; end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'stock_in.approve', 'stock_in', p_id::text, 'Approved delivery ' || v_tx.code);
  insert into public.notifications (recipient_id, type, title, message, href)
  values (v_tx.submitted_by, 'submission_approved', v_tx.code || ' approved', 'Your stock delivery was approved and added to confirmed inventory.', '/employee/submissions');
end;
$$;

create or replace function public.reject_stock_in(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.stock_in_transactions%rowtype;
begin
  if not public.is_admin() then raise exception 'Only an administrator can do that'; end if;
  if char_length(trim(p_reason)) < 3 then raise exception 'Enter a rejection reason'; end if;
  select * into v_tx from public.stock_in_transactions where id = p_id for update;
  if not found then raise exception 'Submission not found'; end if;
  if v_tx.status <> 'pending' then raise exception 'This submission has already been reviewed'; end if;
  if v_tx.submitted_by = auth.uid() then raise exception 'You cannot review a submission you created'; end if;
  perform set_config('manyara.internal', 'on', true);
  update public.stock_in_transactions
  set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = trim(p_reason)
  where id = p_id and status = 'pending';
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'stock_in.reject', 'stock_in', p_id::text, 'Rejected delivery ' || v_tx.code);
  insert into public.notifications (recipient_id, type, title, message, href)
  values (v_tx.submitted_by, 'submission_rejected', v_tx.code || ' was rejected', trim(p_reason), '/employee/submissions');
end;
$$;

create or replace function public.approve_sale(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.sales_transactions%rowtype;
  v_item public.sales_items%rowtype;
begin
  if not public.is_admin() then raise exception 'Only an administrator can do that'; end if;
  select * into v_tx from public.sales_transactions where id = p_id for update;
  if not found then raise exception 'Submission not found'; end if;
  if v_tx.status <> 'pending' then raise exception 'This submission has already been reviewed'; end if;
  if v_tx.submitted_by = auth.uid() then raise exception 'You cannot review a submission you created'; end if;

  perform 1 from public.products
  where id in (select product_id from public.sales_items where transaction_id = p_id)
  order by id
  for update;

  for v_item in select * from public.sales_items where transaction_id = p_id loop
    if public.confirmed_qty(v_item.product_id) < v_item.quantity then
      raise exception 'Not enough confirmed stock. Nothing was changed.';
    end if;
  end loop;

  for v_item in select * from public.sales_items where transaction_id = p_id loop
    insert into public.inventory_movements (product_id, type, quantity, unit_cost, reference_type, reference_id, note, created_by)
    values (v_item.product_id, 'sale', -v_item.quantity, v_item.unit_cost, 'sale', p_id::text, 'Approved sale ' || v_tx.code, auth.uid());
  end loop;

  perform set_config('manyara.internal', 'on', true);
  update public.sales_transactions
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = null
  where id = p_id and status = 'pending';

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'sale.approve', 'sale', p_id::text, 'Approved sale ' || v_tx.code);
  insert into public.notifications (recipient_id, type, title, message, href)
  values (v_tx.submitted_by, 'submission_approved', v_tx.code || ' approved', 'Your sale was approved and removed from confirmed stock.', '/employee/submissions');
end;
$$;

create or replace function public.reject_sale(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.sales_transactions%rowtype;
begin
  if not public.is_admin() then raise exception 'Only an administrator can do that'; end if;
  if char_length(trim(p_reason)) < 3 then raise exception 'Enter a rejection reason'; end if;
  select * into v_tx from public.sales_transactions where id = p_id for update;
  if not found then raise exception 'Submission not found'; end if;
  if v_tx.status <> 'pending' then raise exception 'This submission has already been reviewed'; end if;
  if v_tx.submitted_by = auth.uid() then raise exception 'You cannot review a submission you created'; end if;
  perform set_config('manyara.internal', 'on', true);
  update public.sales_transactions
  set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = trim(p_reason)
  where id = p_id and status = 'pending';
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'sale.reject', 'sale', p_id::text, 'Rejected sale ' || v_tx.code || '. Reserved stock was released.');
  insert into public.notifications (recipient_id, type, title, message, href)
  values (v_tx.submitted_by, 'submission_rejected', v_tx.code || ' was rejected', trim(p_reason), '/employee/submissions');
end;
$$;

create or replace function public.approve_activity(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.activity_transactions%rowtype;
begin
  if not public.is_admin() then raise exception 'Only an administrator can do that'; end if;
  select * into v_tx from public.activity_transactions where id = p_id for update;
  if not found then raise exception 'Submission not found'; end if;
  if v_tx.status <> 'pending' then raise exception 'This submission has already been reviewed'; end if;
  if v_tx.submitted_by = auth.uid() then raise exception 'You cannot review a submission you created'; end if;
  perform set_config('manyara.internal', 'on', true);
  update public.activity_transactions
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = null
  where id = p_id and status = 'pending';
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'activity.approve', 'activity', p_id::text, 'Approved income ' || v_tx.code || '. Beverage stock was not changed.');
  insert into public.notifications (recipient_id, type, title, message, href)
  values (v_tx.submitted_by, 'submission_approved', v_tx.code || ' approved', 'Your income record was approved. Beverage stock was not changed.', '/employee/submissions');
end;
$$;

create or replace function public.reject_activity(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.activity_transactions%rowtype;
begin
  if not public.is_admin() then raise exception 'Only an administrator can do that'; end if;
  if char_length(trim(p_reason)) < 3 then raise exception 'Enter a rejection reason'; end if;
  select * into v_tx from public.activity_transactions where id = p_id for update;
  if not found then raise exception 'Submission not found'; end if;
  if v_tx.status <> 'pending' then raise exception 'This submission has already been reviewed'; end if;
  if v_tx.submitted_by = auth.uid() then raise exception 'You cannot review a submission you created'; end if;
  perform set_config('manyara.internal', 'on', true);
  update public.activity_transactions
  set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = trim(p_reason)
  where id = p_id and status = 'pending';
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'activity.reject', 'activity', p_id::text, 'Rejected income ' || v_tx.code);
  insert into public.notifications (recipient_id, type, title, message, href)
  values (v_tx.submitted_by, 'submission_rejected', v_tx.code || ' was rejected', trim(p_reason), '/employee/submissions');
end;
$$;

create or replace function public.adjust_inventory(p_product uuid, p_delta integer, p_reason text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_confirmed integer;
  v_reserved integer;
begin
  if not public.is_admin() then raise exception 'Only an administrator can do that'; end if;
  if p_delta = 0 then raise exception 'Enter a non-zero adjustment'; end if;
  if char_length(trim(p_reason)) < 3 then raise exception 'Enter the reason for this adjustment'; end if;
  perform 1 from public.products where id = p_product for update;
  if not found then raise exception 'Product not found'; end if;
  v_confirmed := public.confirmed_qty(p_product);
  select coalesce(sum(si.quantity), 0)::integer into v_reserved
  from public.sales_items si
  join public.sales_transactions st on st.id = si.transaction_id
  where si.product_id = p_product and st.status = 'pending';
  if v_confirmed + p_delta < 0 then raise exception 'This adjustment would make confirmed stock negative'; end if;
  if v_confirmed + p_delta < v_reserved then
    raise exception 'This adjustment would drop confirmed stock below quantities reserved for pending sales';
  end if;
  v_code := 'ADJ-' || to_char(nextval('public.adjustment_code_seq'), 'FM0000');
  insert into public.inventory_movements (product_id, type, quantity, unit_cost, reference_type, reference_id, note, created_by)
  select p_product, 'adjustment', p_delta, cost_price, 'adjustment', v_code, trim(p_reason), auth.uid()
  from public.products where id = p_product;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'inventory.adjust', 'adjustment', v_code, 'Adjusted stock by ' || p_delta || '. ' || trim(p_reason));
  return v_code;
end;
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
    coalesce((
      select sum(si.quantity)::integer
      from public.sales_items si
      join public.sales_transactions st on st.id = si.transaction_id
      where si.product_id = p.id and st.status = 'pending'
    ), 0),
    public.confirmed_qty(p.id) - coalesce((
      select sum(si.quantity)::integer
      from public.sales_items si
      join public.sales_transactions st on st.id = si.transaction_id
      where si.product_id = p.id and st.status = 'pending'
    ), 0)
  from public.products p;
end;
$$;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.units enable row level security;
alter table public.products enable row level security;
alter table public.suppliers enable row level security;
alter table public.stock_in_transactions enable row level security;
alter table public.stock_in_items enable row level security;
alter table public.sales_transactions enable row level security;
alter table public.sales_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.activity_types enable row level security;
alter table public.activity_transactions enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.business_settings enable row level security;

create policy profiles_select on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

create policy categories_select on public.categories for select to authenticated using (true);
create policy categories_write on public.categories for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy units_select on public.units for select to authenticated using (true);
create policy units_write on public.units for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy products_select on public.products for select to authenticated using (is_active or public.is_admin());
create policy products_write on public.products for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy suppliers_select on public.suppliers for select to authenticated using (true);
create policy suppliers_write on public.suppliers for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy stock_in_select on public.stock_in_transactions for select to authenticated
using (submitted_by = auth.uid() or public.is_admin());
create policy stock_in_insert on public.stock_in_transactions for insert to authenticated
with check (submitted_by = auth.uid() and status = 'pending');
create policy stock_in_items_select on public.stock_in_items for select to authenticated
using (exists (
  select 1 from public.stock_in_transactions tx
  where tx.id = transaction_id and (tx.submitted_by = auth.uid() or public.is_admin())
));
create policy stock_in_items_insert on public.stock_in_items for insert to authenticated
with check (exists (
  select 1 from public.stock_in_transactions tx
  where tx.id = transaction_id and tx.submitted_by = auth.uid() and tx.status = 'pending'
));

create policy sales_select on public.sales_transactions for select to authenticated
using (submitted_by = auth.uid() or public.is_admin());
create policy sales_insert on public.sales_transactions for insert to authenticated
with check (submitted_by = auth.uid() and status = 'pending');
create policy sales_items_select on public.sales_items for select to authenticated
using (exists (
  select 1 from public.sales_transactions tx
  where tx.id = transaction_id and (tx.submitted_by = auth.uid() or public.is_admin())
));
create policy sales_items_insert on public.sales_items for insert to authenticated
with check (exists (
  select 1 from public.sales_transactions tx
  where tx.id = transaction_id and tx.submitted_by = auth.uid() and tx.status = 'pending'
));

create policy movements_select on public.inventory_movements for select to authenticated
using (
  public.is_admin() or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_active
  )
);

create policy activity_types_select on public.activity_types for select to authenticated using (true);
create policy activity_types_write on public.activity_types for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy activity_select on public.activity_transactions for select to authenticated
using (submitted_by = auth.uid() or public.is_admin());
create policy activity_insert on public.activity_transactions for insert to authenticated
with check (
  submitted_by = auth.uid()
  and status = 'pending'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active and p.can_submit_activities
  )
);

create policy notifications_select on public.notifications for select to authenticated
using (recipient_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

create policy audit_select on public.audit_logs for select to authenticated using (public.is_admin());
create policy settings_select on public.business_settings for select to authenticated using (true);
create policy settings_update on public.business_settings for update to authenticated
using (public.is_admin()) with check (public.is_admin());

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on sequence public.adjustment_code_seq to authenticated;
revoke all on function public.approve_stock_in(uuid) from public, anon;
revoke all on function public.reject_stock_in(uuid, text) from public, anon;
revoke all on function public.approve_sale(uuid) from public, anon;
revoke all on function public.reject_sale(uuid, text) from public, anon;
revoke all on function public.approve_activity(uuid) from public, anon;
revoke all on function public.reject_activity(uuid, text) from public, anon;
revoke all on function public.adjust_inventory(uuid, integer, text) from public, anon;
grant execute on function public.approve_stock_in(uuid) to authenticated;
grant execute on function public.reject_stock_in(uuid, text) to authenticated;
grant execute on function public.approve_sale(uuid) to authenticated;
grant execute on function public.reject_sale(uuid, text) to authenticated;
grant execute on function public.approve_activity(uuid) to authenticated;
grant execute on function public.reject_activity(uuid, text) to authenticated;
grant execute on function public.adjust_inventory(uuid, integer, text) to authenticated;
grant execute on function public.current_stock() to authenticated;

insert into public.business_settings (business_name, currency, currency_symbol)
values ('Manyara Pub', 'TZS', 'TSh');

insert into public.units (name, abbreviation) values
  ('Bottle', 'btl'),
  ('Can', 'can'),
  ('Crate', 'crate'),
  ('Carton', 'ctn'),
  ('Tot', 'tot'),
  ('Glass', 'glass'),
  ('Piece', 'pc');

insert into public.categories (name, description) values
  ('Beers', 'Bottled and draught beers'),
  ('Spirits and liquor', 'Spirits sold by the tot or bottle'),
  ('Wines', 'Wine by the glass or bottle'),
  ('Soft drinks', 'Fizzy drinks'),
  ('Water', 'Still and sparkling water'),
  ('Juices and energy drinks', 'Juices and energy drinks'),
  ('Other beverages', 'Anything that does not fit the main drink groups'),
  ('Miscellaneous stock', 'Snacks and other bar stock');

insert into public.activity_types (name, code, pricing_mode, unit_price, unit_label) values
  ('Pool table', 'pool_table', 'per_game', 2000, 'game'),
  ('Korokoro machine', 'korokoro', 'per_play', 1000, 'play');

-- Promote the first administrator from the SQL editor after that person has signed up:
-- update public.profiles set role = 'admin' where email = 'admin@manyarapub.co.tz';
