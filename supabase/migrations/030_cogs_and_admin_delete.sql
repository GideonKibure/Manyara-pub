-- Admin can delete stock-ins, sales, bills, and expenses (reversing stock).
-- Employees save a daily COGS close (debts + Lipa Namba).
-- Paste in the Supabase SQL editor and Run.

create table if not exists public.day_closes (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  submitted_by uuid not null references public.profiles (id),
  remaining_sale_id uuid,
  debts jsonb not null default '[]'::jsonb,
  mobile_received integer not null default 0,
  created_at timestamptz not null default now(),
  unique (day, submitted_by)
);

alter table public.day_closes enable row level security;

drop policy if exists day_closes_select on public.day_closes;
create policy day_closes_select on public.day_closes
  for select to authenticated
  using (public.is_admin() or submitted_by = auth.uid());

create or replace function public.admin_delete_record(p_kind text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_label text;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can delete this record.';
  end if;

  if p_kind = 'stock_in' then
    select code into v_code from public.stock_in_transactions where id = p_id;
    if v_code is null then
      raise exception 'Delivery not found.';
    end if;
    delete from public.inventory_movements
      where id is not null
        and (
          reference_id = p_id::text
          or reference_id = v_code
          or (reference_type = 'stock_in' and reference_id = p_id::text)
        );
    delete from public.stock_in_items where transaction_id = p_id;
    delete from public.stock_in_transactions where id = p_id;
    v_label := 'Deleted stock in ' || v_code || '.';
  elsif p_kind = 'sale' then
    select code into v_code from public.sales_transactions where id = p_id;
    if v_code is null then
      raise exception 'Sale not found.';
    end if;
    delete from public.inventory_movements
      where id is not null
        and (
          reference_id = p_id::text
          or reference_id = v_code
          or (reference_type = 'sale' and reference_id = p_id::text)
        );
    delete from public.sales_items where transaction_id = p_id;
    delete from public.sales_transactions where id = p_id;
    v_label := 'Deleted sale or bill ' || v_code || '.';
  elsif p_kind = 'expense' then
    select code into v_code from public.expenses where id = p_id;
    if v_code is null then
      raise exception 'Expense not found.';
    end if;
    delete from public.expenses where id = p_id;
    v_label := 'Deleted expense ' || v_code || '.';
  else
    raise exception 'Unknown record type.';
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (auth.uid(), p_kind || '.delete', p_kind, p_id::text, v_label);
end;
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
  v_debts jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in to save the COGS close.';
  end if;
  v_day := coalesce((p_payload->>'day')::date, current_date);
  v_sale := nullif(p_payload->>'remainingSaleId', '')::uuid;
  v_mobile := greatest(0, coalesce((p_payload->>'mobileReceived')::integer, 0));
  v_debts := coalesce(p_payload->'debts', '[]'::jsonb);
  if jsonb_typeof(v_debts) is distinct from 'array' then
    v_debts := '[]'::jsonb;
  end if;

  insert into public.day_closes (day, submitted_by, remaining_sale_id, debts, mobile_received)
    values (v_day, auth.uid(), v_sale, v_debts, v_mobile)
  on conflict (day, submitted_by) do update
    set remaining_sale_id = excluded.remaining_sale_id,
        debts = excluded.debts,
        mobile_received = excluded.mobile_received
  returning id into v_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (auth.uid(), 'day_close.save', 'day_close', v_id::text, 'Saved COGS close for ' || v_day::text || '.');

  return v_id;
end;
$$;

revoke all on function public.admin_delete_record(text, uuid) from public;
revoke all on function public.save_day_close(jsonb) from public;
grant execute on function public.admin_delete_record(text, uuid) to authenticated;
grant execute on function public.save_day_close(jsonb) to authenticated;

notify pgrst, 'reload schema';
