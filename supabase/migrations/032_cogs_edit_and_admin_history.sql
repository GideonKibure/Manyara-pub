-- Employees can edit their pending COGS. Admins can edit any report and add past days.
-- Paste in the Supabase SQL editor and Run.

alter table public.day_closes add column if not exists lines jsonb not null default '[]'::jsonb;
alter table public.day_closes add column if not exists expense_items jsonb not null default '[]'::jsonb;

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
    if v_day < current_date - 1 or v_day > current_date then
      raise exception 'You can only record COGS for yesterday or today.';
    end if;
    v_owner := auth.uid();
  end if;
  v_sale := nullif(p_payload->>'remainingSaleId', '')::uuid;
  v_mobile := greatest(0, coalesce((p_payload->>'mobileReceived')::integer, 0));
  v_expenses := greatest(0, coalesce((p_payload->>'expenseTotal')::integer, 0));
  v_debts := coalesce(p_payload->'debts', '[]'::jsonb);
  v_lines := coalesce(p_payload->'lines', '[]'::jsonb);
  v_items := coalesce(p_payload->'expenseItems', '[]'::jsonb);
  if jsonb_typeof(v_debts) is distinct from 'array' then v_debts := '[]'::jsonb; end if;
  if jsonb_typeof(v_lines) is distinct from 'array' then v_lines := '[]'::jsonb; end if;
  if jsonb_typeof(v_items) is distinct from 'array' then v_items := '[]'::jsonb; end if;
  if not public.is_admin() and exists (
    select 1 from public.day_closes
    where day = v_day and submitted_by = v_owner and status = 'approved'
  ) then
    raise exception 'This COGS report is already approved.';
  end if;

  insert into public.day_closes (day, submitted_by, remaining_sale_id, debts, mobile_received, expense_total, lines, expense_items, status)
    values (v_day, v_owner, v_sale, v_debts, v_mobile, v_expenses, v_lines, v_items, 'pending')
  on conflict (day, submitted_by) do update
    set remaining_sale_id = excluded.remaining_sale_id,
        debts = excluded.debts,
        mobile_received = excluded.mobile_received,
        expense_total = excluded.expense_total,
        lines = excluded.lines,
        expense_items = excluded.expense_items,
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
  if jsonb_typeof(v_debts) is distinct from 'array' then v_debts := '[]'::jsonb; end if;
  if jsonb_typeof(v_lines) is distinct from 'array' then v_lines := '[]'::jsonb; end if;
  if jsonb_typeof(v_items) is distinct from 'array' then v_items := '[]'::jsonb; end if;
  update public.day_closes
    set debts = v_debts,
        mobile_received = v_mobile,
        expense_total = v_expenses,
        lines = v_lines,
        expense_items = v_items,
        status = case when public.is_admin() then 'pending' else status end,
        reviewed_by = case when public.is_admin() then null else reviewed_by end,
        reviewed_at = case when public.is_admin() then null else reviewed_at end
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
declare
  v_owner uuid;
  v_status text;
begin
  select submitted_by, status into v_owner, v_status from public.day_closes where id = p_id;
  if v_owner is null then
    raise exception 'COGS report not found.';
  end if;
  if not public.is_admin() and (v_owner is distinct from auth.uid() or v_status = 'approved') then
    raise exception 'You can only delete your COGS report before it is approved.';
  end if;
  delete from public.day_closes where id = p_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (auth.uid(), 'day_close.delete', 'day_close', p_id::text, 'Deleted COGS report.');
end;
$$;

notify pgrst, 'reload schema';
