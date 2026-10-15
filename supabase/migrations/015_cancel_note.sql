-- An employee must write why a pending submission is cancelled.
-- The cancelled record stays, and the note is stored for the administrator.
-- Run this after 014.

drop function if exists public.cancel_submission(text, uuid);

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

revoke all on function public.cancel_submission(text, uuid, text) from public;
grant execute on function public.cancel_submission(text, uuid, text) to authenticated;
