-- Debt payments on COGS closes. Employees record paid amounts; admins approve them.
-- Paste in the Supabase SQL editor and Run.

create or replace function public.review_debt_payment(p_close_id uuid, p_debt_id text, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debts jsonb;
  v_next jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_paid integer;
  v_found boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can approve a debt payment.';
  end if;
  select debts into v_debts from public.day_closes where id = p_close_id;
  if v_debts is null then
    raise exception 'COGS report not found.';
  end if;
  for v_elem in select value from jsonb_array_elements(coalesce(v_debts, '[]'::jsonb))
  loop
    if coalesce(v_elem->>'id', '') = p_debt_id then
      v_found := true;
      if p_approve then
        v_paid := greatest(0, coalesce((v_elem->>'paidAmount')::integer, 0));
        if v_paid < 1 then
          raise exception 'This debt has no payment to approve.';
        end if;
        v_elem := v_elem || jsonb_build_object('paymentStatus', 'approved', 'paidApprovedAmount', v_paid);
      else
        v_elem := (v_elem || jsonb_build_object('paymentStatus', 'unpaid', 'paidAmount', 0)) - 'paidApprovedAmount';
      end if;
    end if;
    v_next := v_next || jsonb_build_array(v_elem);
  end loop;
  if not v_found then
    raise exception 'Debt not found.';
  end if;
  update public.day_closes set debts = v_next where id = p_close_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (auth.uid(), case when p_approve then 'debt.approve' else 'debt.reject' end, 'day_close', p_close_id::text, 'Reviewed a COGS debt payment.');
end;
$$;

create or replace function public.admin_approve_day_close(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debts jsonb;
  v_next jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_paid integer;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can approve a COGS report.';
  end if;
  select debts into v_debts from public.day_closes where id = p_id;
  if v_debts is null and not exists (select 1 from public.day_closes where id = p_id) then
    raise exception 'COGS report not found.';
  end if;
  for v_elem in select value from jsonb_array_elements(coalesce(v_debts, '[]'::jsonb))
  loop
    v_paid := greatest(0, coalesce((v_elem->>'paidAmount')::integer, 0));
    if v_paid > 0 then
      v_elem := v_elem || jsonb_build_object('paymentStatus', 'approved', 'paidApprovedAmount', v_paid);
    end if;
    v_next := v_next || jsonb_build_array(v_elem);
  end loop;
  update public.day_closes
    set status = 'approved',
        debts = v_next,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = p_id;
  if not found then
    raise exception 'COGS report not found.';
  end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (auth.uid(), 'day_close.approve', 'day_close', p_id::text, 'Approved COGS report.');
end;
$$;

revoke all on function public.review_debt_payment(uuid, text, boolean) from public;
grant execute on function public.review_debt_payment(uuid, text, boolean) to authenticated;
revoke all on function public.admin_approve_day_close(uuid) from public;
grant execute on function public.admin_approve_day_close(uuid) to authenticated;

notify pgrst, 'reload schema';
