-- A payment on a bill is recorded as a sale for the amount paid.
-- The unpaid balance stays on the same bill. Stock is not taken off again.
-- Run this after 020.

alter table public.sales_transactions
  add column if not exists amount_paid integer not null default 0 check (amount_paid >= 0),
  add column if not exists settled_amount integer,
  add column if not exists source_bill_id uuid;

alter table public.sales_transactions
  drop constraint if exists sales_settled_amount_check;

alter table public.sales_transactions
  add constraint sales_settled_amount_check check (settled_amount is null or settled_amount >= 0);

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

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (
    auth.uid(), 'sale.payment', 'sale', v_id::text,
    'Recorded ' || p_amount || ' paid on ' || v_tx.code || '. ' || (v_total - v_paid - p_amount) || ' remains on the bill.'
  );
  return v_id;
end;
$$;

grant execute on function public.record_bill_payment(uuid, integer) to authenticated;
