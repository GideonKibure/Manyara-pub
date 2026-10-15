-- A delivery that already has an invoice reference is approved by the person who submitted it.
-- Deliveries with a blank invoice reference stay pending for an administrator.

create or replace function public.finalize_stock_in(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.stock_in_transactions%rowtype;
  v_item public.stock_in_items%rowtype;
  v_admin uuid;
  v_invoice text;
begin
  select * into v_tx from public.stock_in_transactions where id = p_id for update;
  if not found then raise exception 'Submission not found'; end if;
  if v_tx.status = 'approved' then return; end if;
  if v_tx.status <> 'pending' then raise exception 'This submission has already been reviewed'; end if;
  if v_tx.submitted_by is distinct from auth.uid() and not public.is_admin() then
    raise exception 'You cannot approve this delivery';
  end if;

  v_invoice := trim(coalesce(v_tx.invoice_ref, ''));
  if v_invoice = '' then return; end if;
  if not exists (select 1 from public.stock_in_items where transaction_id = p_id) then
    raise exception 'Add at least one product';
  end if;

  for v_item in select * from public.stock_in_items where transaction_id = p_id order by id loop
    insert into public.inventory_movements (product_id, type, quantity, unit_cost, reference_type, reference_id, note, created_by)
    values (
      v_item.product_id,
      'stock_in',
      v_item.stock_quantity,
      v_item.cost_per_stock_unit,
      'stock_in',
      p_id::text,
      'Approved delivery ' || v_tx.code,
      v_tx.submitted_by
    );
    update public.products set cost_price = v_item.cost_per_stock_unit where id = v_item.product_id;
  end loop;

  perform set_config('manyara.internal', 'on', true);
  update public.stock_in_transactions
  set status = 'approved', reviewed_by = v_tx.submitted_by, reviewed_at = now(), rejection_reason = null
  where id = p_id and status = 'pending';
  if not found then raise exception 'This submission has already been reviewed'; end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (
    v_tx.submitted_by,
    'stock_in.auto_approve',
    'stock_in',
    p_id::text,
    'Approved delivery ' || v_tx.code || ' automatically because invoice ' || v_invoice || ' was provided.'
  );

  for v_admin in select id from public.profiles where role = 'admin' and is_active loop
    insert into public.notifications (recipient_id, type, title, message, href, channels)
    values (
      v_admin,
      'submission_approved',
      v_tx.code || ' approved',
      v_tx.code || ' had invoice ' || v_invoice || ', so it was approved and added to confirmed stock.',
      '/admin/stock-in',
      array['in_app']::text[]
    );
  end loop;
end;
$$;

revoke all on function public.finalize_stock_in(uuid) from public, anon;
grant execute on function public.finalize_stock_in(uuid) to authenticated;
