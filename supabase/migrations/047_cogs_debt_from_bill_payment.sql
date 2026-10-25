-- When a bill payment is recorded, apply the same amount to that day's COGS debt.
-- Paste in the Supabase SQL editor and Run.

create or replace function public.apply_cogs_debt_payment(
  p_owner uuid,
  p_day date,
  p_customer text,
  p_extra integer,
  p_admin boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_close public.day_closes%rowtype;
  v_next jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_amount integer;
  v_paid integer;
  v_left integer;
  v_add integer;
  v_matched boolean := false;
  v_name text := lower(trim(coalesce(p_customer, '')));
begin
  if p_extra is null or p_extra < 1 or v_name = '' then
    return;
  end if;
  select * into v_close
  from public.day_closes
  where submitted_by = p_owner and day = p_day
  order by created_at desc
  limit 1;
  if not found then
    return;
  end if;
  if v_close.status = 'approved' and not p_admin then
    return;
  end if;
  for v_elem in select value from jsonb_array_elements(coalesce(v_close.debts, '[]'::jsonb))
  loop
    v_amount := greatest(0, coalesce((v_elem->>'amount')::integer, 0));
    v_paid := greatest(0, coalesce((v_elem->>'paidAmount')::integer, 0));
    v_left := greatest(0, v_amount - v_paid);
    if not v_matched and lower(trim(coalesce(v_elem->>'customerName', ''))) = v_name and v_left > 0 then
      v_matched := true;
      v_add := least(v_left, p_extra);
      v_paid := v_paid + v_add;
      if v_paid <= 0 then
        v_elem := (v_elem || jsonb_build_object('paidAmount', 0, 'paymentStatus', 'unpaid')) - 'paidApprovedAmount';
      elsif p_admin then
        v_elem := v_elem || jsonb_build_object('paidAmount', v_paid, 'paymentStatus', 'approved', 'paidApprovedAmount', v_paid);
      else
        v_elem := v_elem || jsonb_build_object('paidAmount', v_paid, 'paymentStatus', 'pending');
      end if;
    end if;
    v_next := v_next || jsonb_build_array(v_elem);
  end loop;
  if not v_matched then
    return;
  end if;
  update public.day_closes set debts = v_next where id = v_close.id;
end;
$$;

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

  perform public.apply_cogs_debt_payment(
    v_tx.submitted_by,
    (v_tx.generated_at at time zone 'Africa/Nairobi')::date,
    v_tx.customer_name,
    p_amount,
    public.is_admin()
  );

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (
    auth.uid(), 'sale.payment', 'sale', v_id::text,
    'Recorded ' || p_amount || ' paid on ' || v_tx.code || '. ' || (v_total - v_paid - p_amount) || ' remains on the bill.'
  );
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
  v_total integer;
  v_left integer;
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
  select coalesce(sum(quantity * unit_price), 0)::integer into v_total
  from public.sales_items where transaction_id = p_id;
  v_left := greatest(0, v_total - coalesce(v_tx.amount_paid, 0));
  perform set_config('manyara.internal', 'on', true);
  update public.sales_transactions
  set record_kind = 'sale', payment_status = 'paid', status = 'approved', is_loss = false,
      reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = null
  where id = p_id;
  perform public.apply_cogs_debt_payment(
    v_tx.submitted_by,
    (v_tx.generated_at at time zone 'Africa/Nairobi')::date,
    v_tx.customer_name,
    v_left,
    public.is_admin()
  );
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'sale.payment', 'sale', p_id::text, 'Marked ' || v_tx.code || ' as sold. It is now a sale.');
end;
$$;

revoke all on function public.apply_cogs_debt_payment(uuid, date, text, integer, boolean) from public;
grant execute on function public.apply_cogs_debt_payment(uuid, date, text, integer, boolean) to authenticated;
grant execute on function public.record_bill_payment(uuid, integer) to authenticated;
grant execute on function public.set_bill_payment(uuid, text) to authenticated;

notify pgrst, 'reload schema';
