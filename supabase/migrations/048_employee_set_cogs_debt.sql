-- Employees can mark their own COGS debts paid or unpaid, including on approved sheets.
-- Paste in the Supabase SQL editor and Run.

create or replace function public.set_cogs_debt_payment(
  p_close_id uuid,
  p_debt_id text,
  p_paid integer,
  p_customer text default '',
  p_amount integer default 0,
  p_products text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.day_closes%rowtype;
  v_debts jsonb;
  v_next jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_found boolean := false;
  v_amount integer;
  v_paid integer;
  v_admin boolean := public.is_admin();
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'You are not signed in';
  end if;
  select * into v_row from public.day_closes where id = p_close_id for update;
  if not found then
    raise exception 'COGS report not found.';
  end if;
  if not v_admin and v_row.submitted_by is distinct from auth.uid() then
    raise exception 'You can only update your own bills.';
  end if;
  v_debts := coalesce(v_row.debts, '[]'::jsonb);
  for v_elem in select value from jsonb_array_elements(v_debts)
  loop
    if (coalesce(v_elem->>'id', '') <> '' and v_elem->>'id' = coalesce(p_debt_id, ''))
      or (not v_found and lower(trim(coalesce(v_elem->>'customerName', ''))) = lower(trim(coalesce(p_customer, ''))) and trim(coalesce(p_customer, '')) <> '')
    then
      if not v_found then
        v_found := true;
        v_amount := greatest(coalesce((v_elem->>'amount')::integer, 0), greatest(0, coalesce(p_amount, 0)));
        v_paid := least(v_amount, greatest(0, coalesce(p_paid, 0)));
        v_status := case
          when v_paid <= 0 then 'unpaid'
          when v_admin then 'approved'
          else 'pending'
        end;
        if v_paid <= 0 then
          v_elem := (v_elem || jsonb_build_object('amount', v_amount, 'paidAmount', 0, 'paymentStatus', 'unpaid')) - 'paidApprovedAmount';
        elsif v_admin then
          v_elem := v_elem || jsonb_build_object('amount', v_amount, 'paidAmount', v_paid, 'paymentStatus', 'approved', 'paidApprovedAmount', v_paid);
        else
          v_elem := v_elem || jsonb_build_object('amount', v_amount, 'paidAmount', v_paid, 'paymentStatus', 'pending');
        end if;
      end if;
    end if;
    v_next := v_next || jsonb_build_array(v_elem);
  end loop;
  if not v_found then
    if trim(coalesce(p_customer, '')) = '' or coalesce(p_amount, 0) < 1 then
      raise exception 'Debt not found.';
    end if;
    v_amount := greatest(0, coalesce(p_amount, 0));
    v_paid := least(v_amount, greatest(0, coalesce(p_paid, 0)));
    v_status := case when v_paid <= 0 then 'unpaid' when v_admin then 'approved' else 'pending' end;
    v_next := v_next || jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid()::text,
      'customerName', trim(p_customer),
      'amount', v_amount,
      'products', coalesce(p_products, ''),
      'paidAmount', v_paid,
      'paymentStatus', v_status
    ));
  end if;
  update public.day_closes set debts = v_next where id = p_close_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (auth.uid(), 'debt.set_payment', 'day_close', p_close_id::text, 'Updated a COGS debt payment.');
end;
$$;

revoke all on function public.set_cogs_debt_payment(uuid, text, integer, text, integer, text) from public;
grant execute on function public.set_cogs_debt_payment(uuid, text, integer, text, integer, text) to authenticated;

notify pgrst, 'reload schema';
