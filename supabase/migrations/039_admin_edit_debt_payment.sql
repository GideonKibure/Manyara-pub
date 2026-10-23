-- Admin can change a recorded debt payment or mark it unpaid without reopening the COGS sheet.
-- Paste in the Supabase SQL editor and Run.

create or replace function public.admin_set_debt_payment(p_close_id uuid, p_debt_id text, p_paid integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debts jsonb;
  v_next jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_found boolean := false;
  v_amount integer;
  v_paid integer;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can edit a debt payment.';
  end if;
  select debts into v_debts from public.day_closes where id = p_close_id;
  if v_debts is null then
    raise exception 'COGS report not found.';
  end if;
  for v_elem in select value from jsonb_array_elements(coalesce(v_debts, '[]'::jsonb))
  loop
    if coalesce(v_elem->>'id', '') = p_debt_id then
      v_found := true;
      v_amount := greatest(0, coalesce((v_elem->>'amount')::integer, 0));
      v_paid := least(v_amount, greatest(0, coalesce(p_paid, 0)));
      if v_paid <= 0 then
        v_elem := (v_elem || jsonb_build_object('paymentStatus', 'unpaid', 'paidAmount', 0)) - 'paidApprovedAmount';
      else
        v_elem := v_elem || jsonb_build_object('paymentStatus', 'approved', 'paidAmount', v_paid, 'paidApprovedAmount', v_paid);
      end if;
    end if;
    v_next := v_next || jsonb_build_array(v_elem);
  end loop;
  if not v_found then
    raise exception 'Debt not found.';
  end if;
  update public.day_closes set debts = v_next where id = p_close_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (auth.uid(), 'debt.set_payment', 'day_close', p_close_id::text, 'Updated a COGS debt payment.');
end;
$$;

revoke all on function public.admin_set_debt_payment(uuid, text, integer) from public;
grant execute on function public.admin_set_debt_payment(uuid, text, integer) to authenticated;

notify pgrst, 'reload schema';
