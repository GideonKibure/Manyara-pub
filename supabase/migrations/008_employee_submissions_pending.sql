-- Employee stock deliveries wait for an administrator, even when an invoice number is present.
-- A delivery recorded by an administrator is still approved immediately.
-- Live updates: the admin portal listens for new sales, deliveries, and notifications.

create or replace function public.submit_stock_in(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_code text;
  v_supplier uuid;
  v_supplier_name text;
  v_requested text;
  v_invoice text;
  v_notes text;
  v_date date;
  v_item jsonb;
  v_product public.products%rowtype;
  v_received integer;
  v_cost integer;
  v_stock integer;
begin
  if auth.uid() is null then raise exception 'You are not signed in'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'Your account is not active';
  end if;
  perform public.assert_correction('stock_in', nullif(p_payload ->> 'correctsId', '')::uuid);

  v_supplier_name := trim(coalesce(p_payload ->> 'supplierName', ''));
  v_requested := trim(coalesce(p_payload ->> 'invoiceRef', ''));
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

  if char_length(v_requested) between 1 and 60
     and not exists (
       select 1 from public.stock_in_transactions
       where lower(invoice_ref) = lower(v_requested)
     )
  then
    v_invoice := v_requested;
  else
    loop
      v_invoice := 'INV-' || to_char(nextval('public.invoice_ref_seq'), 'FM0000');
      exit when not exists (
        select 1 from public.stock_in_transactions
        where lower(invoice_ref) = lower(v_invoice)
      );
    end loop;
  end if;

  select id into v_supplier from public.suppliers where lower(name) = lower(v_supplier_name) limit 1;
  if v_supplier is null then
    insert into public.suppliers (name) values (v_supplier_name) returning id into v_supplier;
  end if;

  v_code := 'SI-' || to_char(nextval('public.stock_in_code_seq'), 'FM0000');
  insert into public.stock_in_transactions (
    id, code, supplier_id, supplier_name, delivery_date, invoice_ref, notes, status, submitted_by, corrects_id
  ) values (
    v_id, v_code, v_supplier, v_supplier_name, v_date, v_invoice, v_notes, 'pending', auth.uid(),
    nullif(p_payload ->> 'correctsId', '')::uuid
  );

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
      v_id, v_product.id, v_received, v_product.receive_unit_id, v_product.conversion_factor, v_stock, v_cost, v_cost * v_stock
    );
  end loop;

  if public.is_admin() and v_invoice <> '' then
    perform public.finalize_stock_in(v_id);
  else
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (auth.uid(), 'stock_in.submit', 'stock_in', v_id::text, 'Submitted delivery ' || v_code || ' for approval.');
    perform public.notify_admins(
      'submission_pending',
      'Stock delivery waiting for review',
      v_code || ' was submitted. Confirmed stock will not change until you approve it.',
      '/admin/approvals'
    );
  end if;

  return v_id;
end;
$$;

revoke all on function public.submit_stock_in(jsonb) from public;
grant execute on function public.submit_stock_in(jsonb) to authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'sales_transactions',
    'sales_items',
    'stock_in_transactions',
    'stock_in_items',
    'notifications'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end loop;
end $$;
