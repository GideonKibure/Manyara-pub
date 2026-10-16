-- Admin can let employees record remaining stock. The difference from available
-- stock is saved as a paid sale and taken off inventory. Run after 023.

alter table public.business_settings
  add column if not exists allow_remaining_count boolean not null default false;

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
  v_available integer;
  v_remaining integer;
  v_sold integer;
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
    select (value ->> 'productId')::uuid as product_id, (value ->> 'remaining')::integer as remaining
    from jsonb_array_elements(p_payload -> 'items')
  loop
    if v_line.product_id is null then raise exception 'Choose an active product'; end if;
    select * into v_product from public.products where id = v_line.product_id and is_active;
    if not found then raise exception 'Choose an active product'; end if;
    v_remaining := v_line.remaining;
    if v_remaining is null or v_remaining < 0 then
      raise exception 'Enter the remaining quantity for %', v_product.name;
    end if;
    v_available := public.confirmed_qty(v_product.id) - public.reserved_qty(v_product.id);
    if v_remaining > v_available then
      raise exception '% has % available. Remaining cannot be higher.', v_product.name, v_available;
    end if;
    v_sold := v_available - v_remaining;
    if v_sold < 1 then continue; end if;
    v_sold_items := v_sold_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'quantity', v_sold,
      'unit_price', v_product.selling_price,
      'unit_cost', v_product.cost_price
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
    v_id, v_code, '', 'paid', 'sale', now(), 'Remaining stock count', 'pending',
    auth.uid(), now(), null, null
  );

  insert into public.sales_items (transaction_id, product_id, quantity, unit_price, unit_cost, size_name, portion)
  select v_id, (value ->> 'product_id')::uuid, (value ->> 'quantity')::integer,
    (value ->> 'unit_price')::integer, (value ->> 'unit_cost')::integer, 'one', 'full'
  from jsonb_array_elements(v_sold_items);

  for v_line in select * from public.sales_items where transaction_id = v_id loop
    insert into public.inventory_movements (product_id, type, quantity, unit_cost, reference_type, reference_id, note, created_by)
    values (v_line.product_id, 'sale', -v_line.quantity, v_line.unit_cost, 'sale', v_id::text, 'Remaining count ' || v_code, auth.uid());
  end loop;

  perform set_config('manyara.internal', 'on', true);
  update public.sales_transactions
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = null
  where id = v_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'sale.remaining', 'sale', v_id::text, 'Recorded remaining stock as sale ' || v_code || '.');
  insert into public.notifications (recipient_id, type, title, message, href)
  select id, 'submission_approved', v_code || ' from remaining stock',
    'Remaining stock was counted and recorded as sales.', '/admin/sales'
  from public.profiles where role = 'admin' and is_active and id is distinct from auth.uid();
  return v_id;
end;
$$;

grant execute on function public.submit_remaining_count(jsonb) to authenticated;
