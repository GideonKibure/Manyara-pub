-- Remaining-count opening matches the app: last COGS remaining for this
-- staff member, plus stock-in after that report through the COGS day.
-- Products whose remaining is not below opening are skipped instead of
-- failing the whole save. Run after 058 and 059.

drop function if exists public.current_stock();
drop function if exists public.remaining_opening_qty(uuid, date, uuid);
drop function if exists public.cogs_available_qty(uuid, date, boolean);

create or replace function public.cogs_available_qty(
  p_product uuid,
  p_day date,
  p_inclusive boolean default true,
  p_user uuid default null
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_prior_day date;
  v_prior numeric;
  v_received numeric := 0;
begin
  select c.day, coalesce((line->>'remaining')::numeric, 0)
    into v_prior_day, v_prior
  from public.day_closes c
  cross join lateral jsonb_array_elements(coalesce(c.lines, '[]'::jsonb)) line
  where (case when p_inclusive then c.day <= p_day else c.day < p_day end)
    and coalesce(line->>'productId', line->>'product_id') = p_product::text
  order by c.day desc,
    case when p_user is not null and c.submitted_by = p_user then 0 else 1 end,
    c.created_at desc
  limit 1;

  if v_prior_day is null then
    return null;
  end if;

  select coalesce(sum(i.stock_quantity), 0) into v_received
  from public.stock_in_transactions t
  join public.stock_in_items i on i.transaction_id = t.id
  where t.status = 'approved'
    and i.product_id = p_product
    and t.delivery_date <= p_day
    and t.delivery_date > v_prior_day;

  return v_prior + v_received;
end;
$$;

create or replace function public.remaining_opening_qty(p_product uuid, p_day date, p_user uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_opening numeric;
  v_later numeric := 0;
  v_live numeric;
  v_billed numeric := 0;
begin
  v_opening := public.cogs_available_qty(p_product, p_day, false, p_user);
  if v_opening is not null then
    return v_opening;
  end if;

  v_live := public.confirmed_qty(p_product) - public.reserved_qty(p_product);

  select coalesce(sum(i.stock_quantity), 0) into v_later
  from public.stock_in_transactions t
  join public.stock_in_items i on i.transaction_id = t.id
  where t.status = 'approved'
    and i.product_id = p_product
    and t.delivery_date > p_day;

  select coalesce(sum(si.quantity), 0) into v_billed
  from public.sales_transactions s
  join public.sales_items si on si.transaction_id = s.id
  where si.product_id = p_product
    and s.submitted_by = p_user
    and s.status not in ('rejected', 'cancelled')
    and coalesce(s.generated_at, s.submitted_at)::date = p_day
    and coalesce(s.notes, '') <> 'Remaining stock count';

  return v_live - v_later + v_billed;
end;
$$;

create or replace function public.current_stock()
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
    coalesce(public.cogs_available_qty(p.id, current_date, true, auth.uid()), public.confirmed_qty(p.id)),
    public.reserved_qty(p.id),
    coalesce(public.cogs_available_qty(p.id, current_date, true, auth.uid()), public.confirmed_qty(p.id) - public.reserved_qty(p.id))
  from public.products p;
end;
$$;

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
  v_opening numeric;
  v_billed numeric;
  v_remaining numeric;
  v_sold numeric;
  v_cost integer;
  v_day date;
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

  begin
    if coalesce(p_payload ->> 'day', '') <> '' then
      v_day := (p_payload ->> 'day')::date;
    end if;
  exception when others then
    v_day := current_date;
  end;
  if v_day is null then v_day := current_date; end if;
  if v_day > current_date then
    raise exception 'The remaining-stock date cannot be in the future.';
  end if;

  perform 1 from public.products
  where id in (select (value ->> 'productId')::uuid from jsonb_array_elements(p_payload -> 'items'))
  order by id
  for update;

  for v_line in
    select
      (value ->> 'productId')::uuid as product_id,
      round(coalesce((value ->> 'remaining')::numeric, -1) * 2) / 2 as remaining,
      round(nullif(value ->> 'unitCost', '')::numeric) as unit_cost
    from jsonb_array_elements(p_payload -> 'items')
  loop
    if v_line.product_id is null then continue; end if;
    select * into v_product from public.products where id = v_line.product_id and is_active;
    if not found then continue; end if;
    v_remaining := v_line.remaining;
    if v_remaining is null or v_remaining < 0 or round(v_remaining * 2) <> v_remaining * 2 then
      continue;
    end if;
    v_opening := public.remaining_opening_qty(v_product.id, v_day, auth.uid());
    if v_remaining > v_opening then
      continue;
    end if;
    select coalesce(sum(si.quantity), 0) into v_billed
    from public.sales_transactions s
    join public.sales_items si on si.transaction_id = s.id
    where si.product_id = v_product.id
      and s.submitted_by = auth.uid()
      and s.status not in ('rejected', 'cancelled')
      and coalesce(s.generated_at, s.submitted_at)::date = v_day
      and coalesce(s.notes, '') <> 'Remaining stock count';
    v_sold := v_opening - v_billed - v_remaining;
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
    v_id, v_code, '', 'paid', 'sale', (v_day::timestamp + now()::time), 'Remaining stock count', 'approved',
    auth.uid(), now(), auth.uid(), now()
  );

  insert into public.sales_items (transaction_id, product_id, quantity, unit_price, unit_cost, size_name, portion)
  select v_id, (value ->> 'product_id')::uuid, (value ->> 'quantity')::numeric,
    round((value ->> 'unit_price')::numeric)::integer, round((value ->> 'unit_cost')::numeric)::integer, 'one', 'full'
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

grant execute on function public.cogs_available_qty(uuid, date, boolean, uuid) to authenticated;
grant execute on function public.remaining_opening_qty(uuid, date, uuid) to authenticated;
grant execute on function public.current_stock() to authenticated;
grant execute on function public.submit_remaining_count(jsonb) to authenticated;

notify pgrst, 'reload schema';
