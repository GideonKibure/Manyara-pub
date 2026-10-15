-- Unique automatic invoice numbers, and a safe way for an admin to remove a supplier.

create sequence if not exists public.invoice_ref_seq;

do $$
declare
  v_max bigint;
begin
  select coalesce(max((regexp_match(invoice_ref, '^INV-([0-9]+)$'))[1]::bigint), 0)
    into v_max
  from public.stock_in_transactions;
  if v_max > 0 then
    perform setval('public.invoice_ref_seq', v_max, true);
  else
    perform setval('public.invoice_ref_seq', 1, false);
  end if;
end $$;

do $$
begin
  create unique index stock_in_invoice_ref_unique
    on public.stock_in_transactions (lower(invoice_ref))
    where invoice_ref <> '';
exception
  when duplicate_table or unique_violation then
    null;
end $$;

alter table public.stock_in_transactions
  drop constraint if exists stock_in_transactions_supplier_id_fkey;

alter table public.stock_in_transactions
  add constraint stock_in_transactions_supplier_id_fkey
  foreign key (supplier_id) references public.suppliers (id) on delete set null;

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

  if v_invoice <> '' then
    perform public.finalize_stock_in(v_id);
  else
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (auth.uid(), 'stock_in.submit', 'stock_in', v_id::text, 'Submitted delivery ' || v_code || ' for approval. It has no invoice reference.');
    perform public.notify_admins(
      'submission_pending',
      'Stock delivery waiting for review',
      v_code || ' was submitted without an invoice reference.',
      '/admin/approvals'
    );
  end if;

  return v_id;
end;
$$;

create or replace function public.remove_supplier(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can remove a supplier';
  end if;
  select name into v_name from public.suppliers where id = p_id;
  if v_name is null then
    raise exception 'That supplier could not be found';
  end if;
  update public.stock_in_transactions
    set supplier_id = null
    where supplier_id = p_id;
  delete from public.suppliers where id = p_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'supplier.remove', 'supplier', p_id::text, 'Removed supplier ' || v_name || '.');
end;
$$;

revoke all on function public.submit_stock_in(jsonb) from public;
revoke all on function public.remove_supplier(uuid) from public;
grant execute on function public.submit_stock_in(jsonb) to authenticated;
grant execute on function public.remove_supplier(uuid) to authenticated;
