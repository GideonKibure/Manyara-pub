-- Admin chooses how many calendar days (including today) employees may record.
-- Also stores Lipa Namba line dates. Paste in the Supabase SQL editor and Run.

alter table public.business_settings
  add column if not exists record_lookback_days integer not null default 2;

alter table public.business_settings
  drop constraint if exists business_settings_record_lookback_days_check;

alter table public.business_settings
  add constraint business_settings_record_lookback_days_check
  check (record_lookback_days in (1, 2, 3, 5, 7));

alter table public.day_closes
  add column if not exists mobile_items jsonb not null default '[]'::jsonb;

create or replace function public.employee_lookback_days()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days integer;
begin
  select record_lookback_days into v_days from public.business_settings where id = 1;
  if v_days is null or v_days not in (1, 2, 3, 5, 7) then
    return 2;
  end if;
  return v_days;
end;
$$;

create or replace function public.employee_day_allowed(p_day date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_day is not null
    and p_day <= current_date
    and p_day >= current_date - (public.employee_lookback_days() - 1);
$$;

create or replace function public.save_day_close(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_day date;
  v_sale uuid;
  v_mobile integer;
  v_expenses integer;
  v_debts jsonb;
  v_lines jsonb;
  v_items jsonb;
  v_mobile_items jsonb;
  v_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to save the COGS close.';
  end if;
  v_day := coalesce((p_payload->>'day')::date, (current_date - 1));
  if public.is_admin() then
    if v_day > current_date then
      raise exception 'COGS cannot be recorded for a future day.';
    end if;
    v_owner := coalesce(nullif(p_payload->>'submittedBy', '')::uuid, auth.uid());
  else
    if not public.employee_day_allowed(v_day) then
      raise exception 'You can only record within the days allowed by the administrator.';
    end if;
    v_owner := auth.uid();
  end if;
  v_sale := nullif(p_payload->>'remainingSaleId', '')::uuid;
  v_mobile := greatest(0, coalesce((p_payload->>'mobileReceived')::integer, 0));
  v_expenses := greatest(0, coalesce((p_payload->>'expenseTotal')::integer, 0));
  v_debts := coalesce(p_payload->'debts', '[]'::jsonb);
  v_lines := coalesce(p_payload->'lines', '[]'::jsonb);
  v_items := coalesce(p_payload->'expenseItems', '[]'::jsonb);
  v_mobile_items := coalesce(p_payload->'mobileItems', '[]'::jsonb);
  if jsonb_typeof(v_debts) is distinct from 'array' then v_debts := '[]'::jsonb; end if;
  if jsonb_typeof(v_lines) is distinct from 'array' then v_lines := '[]'::jsonb; end if;
  if jsonb_typeof(v_items) is distinct from 'array' then v_items := '[]'::jsonb; end if;
  if jsonb_typeof(v_mobile_items) is distinct from 'array' then v_mobile_items := '[]'::jsonb; end if;
  if not public.is_admin() and exists (
    select 1 from public.day_closes
    where day = v_day and submitted_by = v_owner and status = 'approved'
  ) then
    raise exception 'This COGS report is already approved.';
  end if;

  insert into public.day_closes (day, submitted_by, remaining_sale_id, debts, mobile_received, expense_total, lines, expense_items, mobile_items, status)
    values (v_day, v_owner, v_sale, v_debts, v_mobile, v_expenses, v_lines, v_items, v_mobile_items, 'pending')
  on conflict (day, submitted_by) do update
    set remaining_sale_id = excluded.remaining_sale_id,
        debts = excluded.debts,
        mobile_received = excluded.mobile_received,
        expense_total = excluded.expense_total,
        lines = excluded.lines,
        expense_items = excluded.expense_items,
        mobile_items = excluded.mobile_items,
        status = 'pending',
        reviewed_by = null,
        reviewed_at = null
  returning id into v_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (auth.uid(), 'day_close.save', 'day_close', v_id::text, 'Saved COGS close for ' || v_day::text || '.');

  return v_id;
end;
$$;

create or replace function public.admin_update_day_close(p_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_status text;
  v_mobile integer;
  v_expenses integer;
  v_debts jsonb;
  v_lines jsonb;
  v_items jsonb;
  v_mobile_items jsonb;
begin
  select submitted_by, status into v_owner, v_status from public.day_closes where id = p_id;
  if v_owner is null then
    raise exception 'COGS report not found.';
  end if;
  if not public.is_admin() and (v_owner is distinct from auth.uid() or v_status = 'approved') then
    raise exception 'You can only edit your COGS report before it is approved.';
  end if;
  v_mobile := greatest(0, coalesce((p_payload->>'mobileReceived')::integer, 0));
  v_expenses := greatest(0, coalesce((p_payload->>'expenseTotal')::integer, 0));
  v_debts := coalesce(p_payload->'debts', '[]'::jsonb);
  v_lines := coalesce(p_payload->'lines', '[]'::jsonb);
  v_items := coalesce(p_payload->'expenseItems', '[]'::jsonb);
  v_mobile_items := coalesce(p_payload->'mobileItems', '[]'::jsonb);
  if jsonb_typeof(v_debts) is distinct from 'array' then v_debts := '[]'::jsonb; end if;
  if jsonb_typeof(v_lines) is distinct from 'array' then v_lines := '[]'::jsonb; end if;
  if jsonb_typeof(v_items) is distinct from 'array' then v_items := '[]'::jsonb; end if;
  if jsonb_typeof(v_mobile_items) is distinct from 'array' then v_mobile_items := '[]'::jsonb; end if;
  update public.day_closes
    set debts = v_debts,
        mobile_received = v_mobile,
        expense_total = v_expenses,
        lines = v_lines,
        expense_items = v_items,
        mobile_items = v_mobile_items,
        status = case when public.is_admin() then 'pending' else status end,
        reviewed_by = case when public.is_admin() then null else reviewed_by end,
        reviewed_at = case when public.is_admin() then null else reviewed_at end
    where id = p_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (auth.uid(), 'day_close.update', 'day_close', p_id::text, 'Updated COGS report.');
end;
$$;

create or replace function public.submit_expense(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_code text;
  v_description text;
  v_amount integer;
  v_spent date;
  v_notes text;
begin
  if auth.uid() is null then raise exception 'You are not signed in'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'Your account is not active';
  end if;
  perform public.assert_correction('expense', nullif(p_payload ->> 'correctsId', '')::uuid);
  v_description := trim(coalesce(p_payload ->> 'description', ''));
  v_notes := trim(coalesce(p_payload ->> 'notes', ''));
  v_amount := (p_payload ->> 'amount')::integer;
  if char_length(v_description) < 2 or char_length(v_description) > 120 then
    raise exception 'Describe the expense';
  end if;
  if v_amount is null or v_amount < 1 or v_amount > 100000000 then
    raise exception 'Enter the amount spent';
  end if;
  if char_length(v_notes) > 400 then raise exception 'Notes are too long'; end if;
  begin
    v_spent := (p_payload ->> 'spentOn')::date;
  exception when others then
    raise exception 'Enter a date that is today or earlier';
  end;
  if v_spent is null or v_spent > current_date then
    raise exception 'Enter a date that is today or earlier';
  end if;
  if not public.is_admin() and not public.employee_day_allowed(v_spent) then
    raise exception 'You can only record within the days allowed by the administrator.';
  end if;

  v_code := 'EX-' || to_char(nextval('public.expense_code_seq'), 'FM0000');
  if public.is_admin() then
    insert into public.expenses (
      id, code, description, amount, spent_on, notes, status, submitted_by, reviewed_by, reviewed_at, corrects_id
    ) values (
      v_id, v_code, v_description, v_amount, v_spent, v_notes, 'approved', auth.uid(), auth.uid(), now(),
      nullif(p_payload ->> 'correctsId', '')::uuid
    );
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (auth.uid(), 'expense.approve', 'expense', v_id::text, 'Recorded and approved expense ' || v_code || ': ' || v_description || '.');
  else
    insert into public.expenses (
      id, code, description, amount, spent_on, notes, status, submitted_by, corrects_id
    ) values (
      v_id, v_code, v_description, v_amount, v_spent, v_notes, 'pending', auth.uid(),
      nullif(p_payload ->> 'correctsId', '')::uuid
    );
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (auth.uid(), 'expense.submit', 'expense', v_id::text, 'Submitted expense ' || v_code || ': ' || v_description || '.');
    perform public.notify_admins(
      'submission_pending',
      'Expense waiting for review',
      v_code || ' for ' || v_description || ' is waiting for approval.',
      '/admin/approvals'
    );
  end if;
  return v_id;
end;
$$;

create or replace function public.guard_employee_delivery_date()
returns trigger
language plpgsql
as $$
begin
  if public.is_admin() then return NEW; end if;
  if not public.employee_day_allowed(NEW.delivery_date) then
    raise exception 'You can only record within the days allowed by the administrator.';
  end if;
  return NEW;
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
  if not public.is_admin() and not public.employee_day_allowed(v_generated::date) then
    raise exception 'You can only record within the days allowed by the administrator.';
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

grant execute on function public.employee_lookback_days() to authenticated;
grant execute on function public.employee_day_allowed(date) to authenticated;
grant execute on function public.save_day_close(jsonb) to authenticated;
grant execute on function public.admin_update_day_close(uuid, jsonb) to authenticated;
grant execute on function public.submit_expense(jsonb) to authenticated;
grant execute on function public.submit_sale(jsonb) to authenticated;
notify pgrst, 'reload schema';

