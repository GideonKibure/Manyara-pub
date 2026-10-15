-- Functions the browser calls after Supabase Auth is connected.
-- Run this after 001_initial.sql and 002_auto_approve_invoiced_stock_in.sql.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  v_username := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', split_part(coalesce(new.email, 'staff'), '@', 1))));
  if v_username = '' then
    v_username := split_part(coalesce(new.email, 'staff'), '@', 1);
  end if;
  insert into public.profiles (id, email, full_name, username, phone, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, 'staff'), '@', 1)),
    v_username,
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    'employee'
  );
  return new;
end;
$$;

create or replace function public.email_for_login(identifier text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select email
  from public.profiles
  where lower(email) = lower(trim(identifier))
     or lower(username) = lower(trim(identifier))
  limit 1;
$$;

create or replace function public.staff_directory()
returns table (id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name
  from public.profiles p
  where auth.uid() is not null
    and p.is_active;
$$;

create or replace function public.record_audit(p_action text, p_entity_type text, p_entity_id text, p_summary text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You are not signed in';
  end if;
  if not public.is_admin() then
    raise exception 'Only an administrator can do that';
  end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, left(p_summary, 500));
end;
$$;

create sequence if not exists public.stock_in_code_seq;
create sequence if not exists public.sale_code_seq;
create sequence if not exists public.activity_code_seq;

create or replace function public.notify_admins(p_type public.notification_type, p_title text, p_message text, p_href text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid;
begin
  for v_admin in select id from public.profiles where role = 'admin' and is_active loop
    insert into public.notifications (recipient_id, type, title, message, href, channels)
    values (v_admin, p_type, p_title, p_message, p_href, array['in_app']::text[]);
  end loop;
end;
$$;

create or replace function public.sync_stock_alerts()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
  v_product record;
  v_available integer;
  v_key text;
  v_admin uuid;
  v_type public.notification_type;
  v_title text;
  v_message text;
begin
  select low_stock_alerts into v_enabled from public.business_settings where id = 1;
  if coalesce(v_enabled, false) = false then
    update public.notifications
    set resolved_at = now()
    where resolved_at is null
      and (dedupe_key like 'low_stock:%' or dedupe_key like 'out_of_stock:%');
    return;
  end if;

  for v_product in
    select
      p.id,
      p.name,
      p.min_stock,
      p.is_active,
      public.confirmed_qty(p.id) as confirmed,
      coalesce((
        select sum(si.quantity)::integer
        from public.sales_items si
        join public.sales_transactions st on st.id = si.transaction_id
        where si.product_id = p.id and st.status = 'pending'
      ), 0) as reserved
    from public.products p
  loop
    v_available := v_product.confirmed - v_product.reserved;
    if not v_product.is_active or v_available > v_product.min_stock then
      v_key := null;
    elsif v_available <= 0 then
      v_key := 'out_of_stock:' || v_product.id::text;
    else
      v_key := 'low_stock:' || v_product.id::text;
    end if;

    update public.notifications
    set resolved_at = now()
    where resolved_at is null
      and (dedupe_key = 'low_stock:' || v_product.id::text or dedupe_key = 'out_of_stock:' || v_product.id::text)
      and dedupe_key is distinct from v_key;

    if v_key is null then
      continue;
    end if;

    v_type := case when v_key like 'out_of_stock:%' then 'out_of_stock'::public.notification_type else 'low_stock'::public.notification_type end;
    v_title := case when v_type = 'out_of_stock' then v_product.name || ' is out of stock' else v_product.name || ' is running low' end;
    v_message := case
      when v_type = 'out_of_stock' then v_product.name || ' has no available stock.'
      else v_product.name || ' has ' || v_available || ' available, which is at or below the minimum of ' || v_product.min_stock || '.'
    end;

    for v_admin in select id from public.profiles where role = 'admin' and is_active loop
      if not exists (
        select 1 from public.notifications
        where recipient_id = v_admin and dedupe_key = v_key and resolved_at is null
      ) then
        insert into public.notifications (recipient_id, type, title, message, href, dedupe_key, channels)
        values (v_admin, v_type, v_title, v_message, '/admin/inventory', v_key, array['in_app']::text[]);
      end if;
    end loop;
  end loop;
end;
$$;

create or replace function public.sync_stock_alerts_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_stock_alerts();
  return null;
end;
$$;

drop trigger if exists movements_stock_alerts on public.inventory_movements;
create trigger movements_stock_alerts
after insert on public.inventory_movements
for each statement execute function public.sync_stock_alerts_trigger();

drop trigger if exists products_stock_alerts on public.products;
create trigger products_stock_alerts
after insert or update on public.products
for each statement execute function public.sync_stock_alerts_trigger();

drop trigger if exists settings_stock_alerts on public.business_settings;
create trigger settings_stock_alerts
after update of low_stock_alerts on public.business_settings
for each statement execute function public.sync_stock_alerts_trigger();

create or replace function public.assert_correction(p_table text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_status public.approval_status;
begin
  if p_id is null then
    return;
  end if;
  if p_table = 'stock_in' then
    select submitted_by, status into v_owner, v_status from public.stock_in_transactions where id = p_id;
  elsif p_table = 'sale' then
    select submitted_by, status into v_owner, v_status from public.sales_transactions where id = p_id;
  elsif p_table = 'activity' then
    select submitted_by, status into v_owner, v_status from public.activity_transactions where id = p_id;
  else
    raise exception 'Unknown submission';
  end if;
  if v_owner is null or v_owner is distinct from auth.uid() then
    raise exception 'The original submission could not be found';
  end if;
  if v_status not in ('rejected', 'cancelled') then
    raise exception 'Only a rejected or withdrawn submission can be corrected';
  end if;
end;
$$;

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
  v_invoice := trim(coalesce(p_payload ->> 'invoiceRef', ''));
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
  if char_length(v_invoice) > 60 then raise exception 'Invoice reference is too long'; end if;
  if char_length(v_notes) > 400 then raise exception 'Notes are too long'; end if;

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
  v_line record;
  v_available integer;
  v_name text;
begin
  if auth.uid() is null then raise exception 'You are not signed in'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'Your account is not active';
  end if;
  perform public.assert_correction('sale', nullif(p_payload ->> 'correctsId', '')::uuid);
  v_notes := trim(coalesce(p_payload ->> 'notes', ''));
  if char_length(v_notes) > 400 then raise exception 'Notes are too long'; end if;
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

  v_code := 'SL-' || to_char(nextval('public.sale_code_seq'), 'FM0000');
  insert into public.sales_transactions (id, code, notes, status, submitted_by, corrects_id)
  values (v_id, v_code, v_notes, 'pending', auth.uid(), nullif(p_payload ->> 'correctsId', '')::uuid);

  insert into public.sales_items (transaction_id, product_id, quantity, unit_price, unit_cost)
  select v_id, lines.product_id, lines.quantity, p.selling_price, p.cost_price
  from (
    select (value ->> 'productId')::uuid as product_id, sum((value ->> 'quantity')::integer) as quantity
    from jsonb_array_elements(p_payload -> 'items')
    group by 1
  ) lines
  join public.products p on p.id = lines.product_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'sale.submit', 'sale', v_id::text, 'Submitted sale ' || v_code || ' for approval.');
  perform public.notify_admins(
    'submission_pending',
    'Sale waiting for review',
    v_code || ' is waiting for approval. Stock stays reserved until you approve or reject it.',
    '/admin/approvals'
  );
  return v_id;
end;
$$;

create or replace function public.submit_activity(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles%rowtype;
  v_type public.activity_types%rowtype;
  v_id uuid := gen_random_uuid();
  v_code text;
  v_quantity integer;
  v_amount integer;
  v_occurred timestamptz;
  v_method public.payment_method;
  v_notes text;
begin
  select * into v_actor from public.profiles where id = auth.uid() and is_active;
  if not found then raise exception 'Your account is not active'; end if;
  if not v_actor.can_submit_activities then
    raise exception 'You are not allowed to record pool table or korokoro income';
  end if;
  perform public.assert_correction('activity', nullif(p_payload ->> 'correctsId', '')::uuid);

  select * into v_type from public.activity_types where id = (p_payload ->> 'activityTypeId')::uuid and is_active;
  if not found then raise exception 'Choose an active income type'; end if;
  v_quantity := (p_payload ->> 'quantity')::integer;
  v_amount := (p_payload ->> 'amount')::integer;
  v_notes := trim(coalesce(p_payload ->> 'notes', ''));
  if v_quantity is null or v_quantity < 1 or v_quantity > 100000 then raise exception 'Enter a valid quantity'; end if;
  if v_amount is null or v_amount < 0 or v_amount > 100000000 then raise exception 'Enter the amount collected'; end if;
  if char_length(v_notes) > 400 then raise exception 'Notes are too long'; end if;
  begin
    v_method := (p_payload ->> 'paymentMethod')::public.payment_method;
    v_occurred := (p_payload ->> 'occurredAt')::timestamptz;
  exception when others then
    raise exception 'Check the payment method and the date';
  end;
  if v_occurred is null or v_occurred > now() + interval '1 minute' then
    raise exception 'Enter a date and time that is not in the future';
  end if;

  v_code := 'AC-' || to_char(nextval('public.activity_code_seq'), 'FM0000');
  insert into public.activity_transactions (
    id, code, activity_type_id, quantity, unit_price, amount, payment_method, notes, occurred_at, status, submitted_by, corrects_id
  ) values (
    v_id, v_code, v_type.id, v_quantity, v_type.unit_price, v_amount, v_method, v_notes, v_occurred, 'pending', auth.uid(),
    nullif(p_payload ->> 'correctsId', '')::uuid
  );
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'activity.submit', 'activity', v_id::text, 'Submitted ' || lower(v_type.name) || ' collection ' || v_code || ' for approval.');
  perform public.notify_admins(
    'submission_pending',
    v_type.name || ' income waiting for review',
    v_code || ' was submitted. This does not change beverage stock.',
    '/admin/approvals'
  );
  return v_id;
end;
$$;

create or replace function public.cancel_submission(p_kind text, p_id uuid)
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
begin
  select full_name into v_name from public.profiles where id = auth.uid() and is_active;
  if v_name is null then raise exception 'Your account is not active'; end if;

  if p_kind = 'stock_in' then
    select code, submitted_by, status into v_code, v_owner, v_status from public.stock_in_transactions where id = p_id for update;
  elsif p_kind = 'sale' then
    select code, submitted_by, status into v_code, v_owner, v_status from public.sales_transactions where id = p_id for update;
  elsif p_kind = 'activity' then
    select code, submitted_by, status into v_code, v_owner, v_status from public.activity_transactions where id = p_id for update;
  else
    raise exception 'Unknown submission';
  end if;

  if v_owner is null or v_owner is distinct from auth.uid() then raise exception 'Submission not found'; end if;
  if v_status <> 'pending' then raise exception 'Only a pending submission can be withdrawn'; end if;

  perform set_config('manyara.internal', 'on', true);
  if p_kind = 'stock_in' then
    update public.stock_in_transactions
    set status = 'cancelled', reviewed_at = now(), rejection_reason = 'Withdrawn by the employee.'
    where id = p_id and status = 'pending';
  elsif p_kind = 'sale' then
    update public.sales_transactions
    set status = 'cancelled', reviewed_at = now(), rejection_reason = 'Withdrawn by the employee.'
    where id = p_id and status = 'pending';
  else
    update public.activity_transactions
    set status = 'cancelled', reviewed_at = now(), rejection_reason = 'Withdrawn by the employee.'
    where id = p_id and status = 'pending';
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), p_kind || '.cancel', p_kind, p_id::text, 'Withdrew ' || v_code || '.');
  perform public.notify_admins('submission_cancelled', v_code || ' withdrawn', v_name || ' withdrew this submission.', '/admin/approvals');
end;
$$;

revoke all on function public.email_for_login(text) from public;
revoke all on function public.staff_directory() from public;
revoke all on function public.record_audit(text, text, text, text) from public;
revoke all on function public.notify_admins(public.notification_type, text, text, text) from public;
revoke all on function public.sync_stock_alerts() from public;
revoke all on function public.assert_correction(text, uuid) from public;
revoke all on function public.submit_stock_in(jsonb) from public;
revoke all on function public.submit_sale(jsonb) from public;
revoke all on function public.submit_activity(jsonb) from public;
revoke all on function public.cancel_submission(text, uuid) from public;

grant execute on function public.email_for_login(text) to anon, authenticated;
grant execute on function public.staff_directory() to authenticated;
grant execute on function public.record_audit(text, text, text, text) to authenticated;
grant execute on function public.submit_stock_in(jsonb) to authenticated;
grant execute on function public.submit_sale(jsonb) to authenticated;
grant execute on function public.submit_activity(jsonb) to authenticated;
grant execute on function public.cancel_submission(text, uuid) to authenticated;

select public.sync_stock_alerts();
