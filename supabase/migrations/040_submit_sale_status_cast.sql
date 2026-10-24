-- CAST bill/sale status to approval_status. Postgres treats CASE 'pending'/'approved' as text.
-- Paste in the Supabase SQL editor and Run.

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
  if v_generated is null or v_generated > now() + interval '1 minute' then
    v_generated := now();
  end if;
  if not public.is_admin() and (v_generated::date < current_date - 2 or v_generated::date > current_date) then
    raise exception 'You can only record sales for today or the two days before.';
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
    case when v_kind = 'bill' then 'pending'::public.approval_status else 'approved'::public.approval_status end,
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
    set status = 'approved'::public.approval_status, reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = null
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
notify pgrst, 'reload schema';
