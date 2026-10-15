-- A bill deducts stock when it is written. An unpaid bill is sent to the admin after three days.
-- Run this after 017.

alter table public.sales_transactions
  add column if not exists is_loss boolean not null default false;

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
    values (auth.uid(), 'sale.submit', 'sale', v_id::text, 'Submitted bill ' || v_code || ' for ' || v_customer || ' (' || v_payment || ').');
    if v_kind <> 'bill' or v_payment = 'paid' then
      perform public.notify_admins(
        'submission_pending',
        case when v_kind = 'bill' then 'Bill waiting for review' else 'Sale waiting for review' end,
        v_code || ' is ' || v_payment || ' and is waiting for approval.',
        '/admin/approvals'
      );
    end if;
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
  if v_payment not in ('paid', 'unpaid') then raise exception 'Mark the bill paid or unpaid'; end if;
  if v_kind <> 'bill' and v_payment <> 'paid' then raise exception 'A sale can be recorded only when it is paid'; end if;
  if v_kind <> 'bill' then v_payment := 'paid'; end if;
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
        and not exists (
          select 1 from public.inventory_movements m
          where m.reference_type = 'sale' and m.reference_id = st.id::text and m.quantity < 0
        )
    ), 0);
    if v_tx.record_kind = 'bill' or v_tx.status = 'approved' then
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

  if v_tx.record_kind = 'bill' or v_tx.status = 'approved' then
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

  if v_tx.record_kind = 'bill' or v_tx.status = 'approved' then
    for v_line in select * from public.sales_items where transaction_id = p_id loop
      insert into public.inventory_movements (product_id, type, quantity, unit_cost, reference_type, reference_id, note, created_by)
      values (v_line.product_id, 'sale', -v_line.quantity, v_line.unit_cost, 'sale', p_id::text, 'Approved sale ' || v_tx.code, auth.uid());
    end loop;
  end if;

  update public.sales_transactions
  set customer_name = v_customer, payment_status = v_payment, record_kind = v_kind, notes = v_notes
  where id = p_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'sale.edit', 'sale', p_id::text, 'Edited bill ' || v_tx.code || '. The generated time was left unchanged.');
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
    public.reserved_qty(p.id),
    public.confirmed_qty(p.id) - public.reserved_qty(p.id)
  from public.products p;
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
  v_taken boolean;
begin
  if not public.is_admin() then raise exception 'Only an administrator can do that'; end if;
  select * into v_tx from public.sales_transactions where id = p_id for update;
  if not found then raise exception 'Submission not found'; end if;
  if v_tx.status <> 'pending' then raise exception 'This submission has already been reviewed'; end if;
  if v_tx.submitted_by = auth.uid() then raise exception 'You cannot review a submission you created'; end if;
  if v_tx.record_kind = 'bill' and v_tx.payment_status = 'unpaid' and v_tx.submitted_at > now() - interval '3 days' then
    raise exception 'This unpaid bill is sent to you after three days';
  end if;

  select exists (
    select 1 from public.inventory_movements
    where reference_type = 'sale' and reference_id = p_id::text and quantity < 0
  ) into v_taken;

  if not v_taken then
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
  end if;

  perform set_config('manyara.internal', 'on', true);
  update public.sales_transactions
  set status = 'approved',
      payment_status = case when record_kind = 'bill' then 'paid' else payment_status end,
      is_loss = false,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      rejection_reason = null
  where id = p_id and status = 'pending';

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'sale.approve', 'sale', p_id::text, 'Approved ' || v_tx.code);
  insert into public.notifications (recipient_id, type, title, message, href)
  values (
    v_tx.submitted_by,
    'submission_approved',
    v_tx.code || ' approved',
    case when v_taken then 'Your bill was approved as paid. Stock was already updated when it was written.'
         else 'Your sale was approved and removed from confirmed stock.' end,
    '/employee/submissions'
  );
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
  insert into public.inventory_movements (product_id, type, quantity, unit_cost, reference_type, reference_id, note, created_by)
  select product_id, 'sale', -quantity, unit_cost, 'sale', reference_id, 'Returned stock for rejected ' || v_tx.code, auth.uid()
  from public.inventory_movements
  where reference_type = 'sale' and reference_id = p_id::text and quantity < 0;
  perform set_config('manyara.internal', 'on', true);
  update public.sales_transactions
  set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = trim(p_reason)
  where id = p_id and status = 'pending';
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'sale.reject', 'sale', p_id::text, 'Rejected ' || v_tx.code || '. Stock taken for this bill was put back.');
  insert into public.notifications (recipient_id, type, title, message, href)
  values (v_tx.submitted_by, 'submission_rejected', v_tx.code || ' was rejected', trim(p_reason), '/employee/submissions');
end;
$$;

create or replace function public.settle_bill_loss(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.sales_transactions%rowtype;
begin
  if not public.is_admin() then raise exception 'Only an administrator can do that'; end if;
  select * into v_tx from public.sales_transactions where id = p_id for update;
  if not found then raise exception 'Bill not found'; end if;
  if v_tx.record_kind <> 'bill' then raise exception 'Only a bill can be recorded as a loss'; end if;
  if v_tx.status <> 'pending' then raise exception 'This submission has already been reviewed'; end if;
  if v_tx.submitted_by = auth.uid() then raise exception 'You cannot review a submission you created'; end if;
  if v_tx.submitted_at > now() - interval '3 days' and v_tx.payment_status = 'unpaid' then
    raise exception 'This unpaid bill is sent to you after three days';
  end if;
  perform set_config('manyara.internal', 'on', true);
  update public.sales_transactions
  set status = 'approved', payment_status = 'unpaid', is_loss = true, reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = null
  where id = p_id and status = 'pending';
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'sale.loss', 'sale', p_id::text, 'Recorded ' || v_tx.code || ' as a loss. Stock stays deducted.');
  insert into public.notifications (recipient_id, type, title, message, href)
  values (v_tx.submitted_by, 'submission_approved', v_tx.code || ' recorded as a loss', 'The administrator recorded this unpaid bill as a loss. The stock stays deducted.', '/employee/submissions');
end;
$$;

create or replace function public.cancel_submission(p_kind text, p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_owner uuid;
  v_status public.approval_status;
  v_name text;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  select full_name into v_name from public.profiles where id = auth.uid() and is_active;
  if v_name is null then raise exception 'Your account is not active'; end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 400 then
    raise exception 'Write why you are cancelling';
  end if;

  if p_kind = 'stock_in' then
    select code, submitted_by, status into v_code, v_owner, v_status from public.stock_in_transactions where id = p_id for update;
  elsif p_kind = 'sale' then
    select code, submitted_by, status into v_code, v_owner, v_status from public.sales_transactions where id = p_id for update;
  elsif p_kind = 'activity' then
    select code, submitted_by, status into v_code, v_owner, v_status from public.activity_transactions where id = p_id for update;
  elsif p_kind = 'expense' then
    select code, submitted_by, status into v_code, v_owner, v_status from public.expenses where id = p_id for update;
  else
    raise exception 'Unknown submission';
  end if;

  if v_owner is null or v_owner is distinct from auth.uid() then raise exception 'Submission not found'; end if;
  if v_status <> 'pending' then raise exception 'Only a pending submission can be cancelled'; end if;

  if p_kind = 'sale' then
    insert into public.inventory_movements (product_id, type, quantity, unit_cost, reference_type, reference_id, note, created_by)
    select product_id, 'sale', -quantity, unit_cost, 'sale', reference_id, 'Returned stock for cancelled ' || v_code, auth.uid()
    from public.inventory_movements
    where reference_type = 'sale' and reference_id = p_id::text and quantity < 0;
  end if;

  perform set_config('manyara.internal', 'on', true);
  if p_kind = 'stock_in' then
    update public.stock_in_transactions
    set status = 'cancelled', reviewed_at = now(), rejection_reason = v_reason
    where id = p_id and status = 'pending';
  elsif p_kind = 'sale' then
    update public.sales_transactions
    set status = 'cancelled', reviewed_at = now(), rejection_reason = v_reason
    where id = p_id and status = 'pending';
  elsif p_kind = 'activity' then
    update public.activity_transactions
    set status = 'cancelled', reviewed_at = now(), rejection_reason = v_reason
    where id = p_id and status = 'pending';
  else
    update public.expenses
    set status = 'cancelled', reviewed_at = now(), rejection_reason = v_reason
    where id = p_id and status = 'pending';
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), p_kind || '.cancel', p_kind, p_id::text, 'Cancelled ' || v_code || '. ' || v_reason);
  perform public.notify_admins(
    'submission_cancelled',
    v_code || ' cancelled',
    v_name || ' cancelled this submission. ' || v_reason,
    '/admin/approvals'
  );
end;
$$;

create or replace function public.notify_overdue_bills()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill public.sales_transactions%rowtype;
  v_admin uuid;
begin
  if auth.uid() is null then return; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and is_active) then return; end if;
  for v_bill in
    select * from public.sales_transactions
    where record_kind = 'bill'
      and payment_status = 'unpaid'
      and status = 'pending'
      and is_loss = false
      and submitted_at <= now() - interval '3 days'
  loop
    if exists (select 1 from public.notifications where dedupe_key = 'bill-overdue-' || v_bill.id::text) then
      continue;
    end if;
    for v_admin in select id from public.profiles where role = 'admin' and is_active loop
      insert into public.notifications (recipient_id, type, title, message, href, dedupe_key, channels)
      values (
        v_admin,
        'submission_pending',
        v_bill.code || ' unpaid for three days',
        v_bill.code || ' for ' || coalesce(nullif(v_bill.customer_name, ''), 'a customer') || ' has been unpaid for three days. Approve it as paid or record it as a loss.',
        '/admin/approvals',
        'bill-overdue-' || v_bill.id::text,
        array['in_app']::text[]
      );
    end loop;
  end loop;
end;
$$;

delete from public.inventory_movements
where reference_type = 'sale'
  and reference_id in (
    select st.id::text
    from public.sales_transactions st
    join public.sales_items si on si.transaction_id = st.id
    where st.record_kind = 'bill'
    group by st.id
    having sum(si.quantity * si.unit_price) = 20000
       or bool_or(si.unit_price = 20000)
       or bool_or(si.quantity * si.unit_price = 20000)
  );

delete from public.sales_transactions st
where st.record_kind = 'bill'
  and st.id in (
    select si.transaction_id
    from public.sales_items si
    group by si.transaction_id
    having sum(si.quantity * si.unit_price) = 20000
       or bool_or(si.unit_price = 20000)
       or bool_or(si.quantity * si.unit_price = 20000)
  );

revoke all on function public.reserved_qty(uuid) from public;
revoke all on function public.settle_bill_loss(uuid) from public;
revoke all on function public.notify_overdue_bills() from public;
grant execute on function public.reserved_qty(uuid) to authenticated;
grant execute on function public.current_stock() to authenticated;
grant execute on function public.approve_sale(uuid) to authenticated;
grant execute on function public.reject_sale(uuid, text) to authenticated;
grant execute on function public.settle_bill_loss(uuid) to authenticated;
grant execute on function public.cancel_submission(text, uuid, text) to authenticated;
grant execute on function public.notify_overdue_bills() to authenticated;
create or replace function public.set_bill_payment(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.sales_transactions%rowtype;
  v_status text := lower(trim(coalesce(p_status, '')));
  v_name text;
begin
  if auth.uid() is null then raise exception 'You are not signed in'; end if;
  if v_status <> 'paid' then raise exception 'Mark the bill paid or unpaid'; end if;
  select full_name into v_name from public.profiles where id = auth.uid() and is_active;
  if v_name is null then raise exception 'Your account is not active'; end if;
  select * into v_tx from public.sales_transactions where id = p_id for update;
  if not found then raise exception 'Bill not found'; end if;
  if v_tx.status in ('rejected', 'cancelled') then raise exception 'This bill can no longer be changed'; end if;
  if not public.is_admin() then
    if v_tx.submitted_by is distinct from auth.uid() then raise exception 'Bill not found'; end if;
    if v_tx.status <> 'pending' then raise exception 'Payment can be changed until the administrator reviews the bill'; end if;
  end if;
  update public.sales_transactions set payment_status = v_status where id = p_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'sale.payment', 'sale', p_id::text, 'Marked ' || v_tx.code || ' as ' || v_status || '.');
  if v_tx.status = 'pending' and not public.is_admin() then
    perform public.notify_admins(
      'submission_pending',
      'Bill waiting for review',
      v_name || ' marked ' || v_tx.code || ' as paid.',
      '/admin/approvals'
    );
  end if;
end;
$$;

grant execute on function public.submit_sale(jsonb) to authenticated;
grant execute on function public.update_sale(uuid, jsonb) to authenticated;
grant execute on function public.set_bill_payment(uuid, text) to authenticated;


