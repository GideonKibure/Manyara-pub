-- COGS day is yesterday by default. Admins can edit, delete, and approve closes.
-- Paste in the Supabase SQL editor and Run.

alter table public.day_closes add column if not exists status text not null default 'pending';
alter table public.day_closes add column if not exists expense_total integer not null default 0;
alter table public.day_closes add column if not exists reviewed_by uuid references public.profiles (id);
alter table public.day_closes add column if not exists reviewed_at timestamptz;

update public.day_closes
  set status = 'pending'
  where id is not null and (status is null or status = '');

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
begin
  if auth.uid() is null then
    raise exception 'Sign in to save the COGS close.';
  end if;
  v_day := coalesce((p_payload->>'day')::date, (current_date - 1));
  if not public.is_admin() and (v_day < current_date - 1 or v_day > current_date) then
    raise exception 'You can only record COGS for yesterday or today.';
  end if;
  v_sale := nullif(p_payload->>'remainingSaleId', '')::uuid;
  v_mobile := greatest(0, coalesce((p_payload->>'mobileReceived')::integer, 0));
  v_expenses := greatest(0, coalesce((p_payload->>'expenseTotal')::integer, 0));
  v_debts := coalesce(p_payload->'debts', '[]'::jsonb);
  if jsonb_typeof(v_debts) is distinct from 'array' then
    v_debts := '[]'::jsonb;
  end if;

  insert into public.day_closes (day, submitted_by, remaining_sale_id, debts, mobile_received, expense_total, status)
    values (v_day, auth.uid(), v_sale, v_debts, v_mobile, v_expenses, 'pending')
  on conflict (day, submitted_by) do update
    set remaining_sale_id = excluded.remaining_sale_id,
        debts = excluded.debts,
        mobile_received = excluded.mobile_received,
        expense_total = excluded.expense_total,
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
  v_mobile integer;
  v_expenses integer;
  v_debts jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can edit a COGS report.';
  end if;
  if not exists (select 1 from public.day_closes where id = p_id) then
    raise exception 'COGS report not found.';
  end if;
  v_mobile := greatest(0, coalesce((p_payload->>'mobileReceived')::integer, 0));
  v_expenses := greatest(0, coalesce((p_payload->>'expenseTotal')::integer, 0));
  v_debts := coalesce(p_payload->'debts', '[]'::jsonb);
  if jsonb_typeof(v_debts) is distinct from 'array' then
    v_debts := '[]'::jsonb;
  end if;
  update public.day_closes
    set debts = v_debts,
        mobile_received = v_mobile,
        expense_total = v_expenses,
        status = 'pending',
        reviewed_by = null,
        reviewed_at = null
    where id = p_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (auth.uid(), 'day_close.update', 'day_close', p_id::text, 'Updated COGS report.');
end;
$$;

create or replace function public.admin_delete_day_close(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can delete a COGS report.';
  end if;
  if not exists (select 1 from public.day_closes where id = p_id) then
    raise exception 'COGS report not found.';
  end if;
  delete from public.day_closes where id = p_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (auth.uid(), 'day_close.delete', 'day_close', p_id::text, 'Deleted COGS report.');
end;
$$;

create or replace function public.admin_approve_day_close(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can approve a COGS report.';
  end if;
  update public.day_closes
    set status = 'approved',
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

revoke all on function public.save_day_close(jsonb) from public;
revoke all on function public.admin_update_day_close(uuid, jsonb) from public;
revoke all on function public.admin_delete_day_close(uuid) from public;
revoke all on function public.admin_approve_day_close(uuid) from public;
grant execute on function public.save_day_close(jsonb) to authenticated;
grant execute on function public.admin_update_day_close(uuid, jsonb) to authenticated;
grant execute on function public.admin_delete_day_close(uuid) to authenticated;
grant execute on function public.admin_approve_day_close(uuid) to authenticated;

notify pgrst, 'reload schema';
