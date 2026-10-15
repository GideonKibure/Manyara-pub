-- Business expenses. An employee submission stays pending. An administrator records an expense as approved.

create sequence if not exists public.expense_code_seq;

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text not null,
  amount integer not null check (amount > 0 and amount <= 100000000),
  spent_on date not null,
  notes text not null default '',
  status public.approval_status not null default 'pending',
  submitted_by uuid not null references public.profiles (id),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  rejection_reason text,
  corrects_id uuid references public.expenses (id)
);

create index if not exists expenses_status_idx on public.expenses (status, submitted_at desc);

drop trigger if exists expenses_status_guard on public.expenses;
create trigger expenses_status_guard before update on public.expenses
for each row execute function public.block_direct_status_change();

alter table public.expenses enable row level security;

drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses for select to authenticated
using (submitted_by = auth.uid() or public.is_admin());

grant select, insert, update, delete on public.expenses to authenticated;
grant usage on sequence public.expense_code_seq to authenticated;

create or replace function public.assert_correction(p_table text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_status public.approval_status;
begin
  if p_id is null then
    return;
  end if;
  if p_table = 'stock_in' then
    select submitted_by, status into v_owner, v_status from public.stock_in_transactions where id = p_id;
  elsif p_table = 'sale' then
    select submitted_by, status into v_owner, v_status from public.sales_transactions where id = p_id;
  elsif p_table = 'activity' then
    select submitted_by, status into v_owner, v_status from public.activity_transactions where id = p_id;
  elsif p_table = 'expense' then
    select submitted_by, status into v_owner, v_status from public.expenses where id = p_id;
  else
    raise exception 'Unknown submission';
  end if;
  if v_owner is null or v_owner is distinct from auth.uid() then
    raise exception 'The original submission could not be found';
  end if;
  if v_status not in ('rejected', 'cancelled') then
    raise exception 'Only a rejected or withdrawn submission can be corrected';
  end if;
end;
$$;

create or replace function public.submit_expense(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_code text;
  v_description text;
  v_amount integer;
  v_spent date;
  v_notes text;
begin
  if auth.uid() is null then raise exception 'You are not signed in'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'Your account is not active';
  end if;
  perform public.assert_correction('expense', nullif(p_payload ->> 'correctsId', '')::uuid);
  v_description := trim(coalesce(p_payload ->> 'description', ''));
  v_notes := trim(coalesce(p_payload ->> 'notes', ''));
  v_amount := (p_payload ->> 'amount')::integer;
  if char_length(v_description) < 2 or char_length(v_description) > 120 then
    raise exception 'Describe the expense';
  end if;
  if v_amount is null or v_amount < 1 or v_amount > 100000000 then
    raise exception 'Enter the amount spent';
  end if;
  if char_length(v_notes) > 400 then raise exception 'Notes are too long'; end if;
  begin
    v_spent := (p_payload ->> 'spentOn')::date;
  exception when others then
    raise exception 'Enter a date that is today or earlier';
  end;
  if v_spent is null or v_spent > current_date then
    raise exception 'Enter a date that is today or earlier';
  end if;

  v_code := 'EX-' || to_char(nextval('public.expense_code_seq'), 'FM0000');
  if public.is_admin() then
    insert into public.expenses (
      id, code, description, amount, spent_on, notes, status, submitted_by, reviewed_by, reviewed_at, corrects_id
    ) values (
      v_id, v_code, v_description, v_amount, v_spent, v_notes, 'approved', auth.uid(), auth.uid(), now(),
      nullif(p_payload ->> 'correctsId', '')::uuid
    );
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (auth.uid(), 'expense.approve', 'expense', v_id::text, 'Recorded and approved expense ' || v_code || ': ' || v_description || '.');
  else
    insert into public.expenses (
      id, code, description, amount, spent_on, notes, status, submitted_by, corrects_id
    ) values (
      v_id, v_code, v_description, v_amount, v_spent, v_notes, 'pending', auth.uid(),
      nullif(p_payload ->> 'correctsId', '')::uuid
    );
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (auth.uid(), 'expense.submit', 'expense', v_id::text, 'Submitted expense ' || v_code || ': ' || v_description || '.');
    perform public.notify_admins(
      'submission_pending',
      'Expense waiting for review',
      v_code || ' for ' || v_description || ' is waiting for approval.',
      '/admin/approvals'
    );
  end if;
  return v_id;
end;
$$;

create or replace function public.approve_expense(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.expenses%rowtype;
begin
  if not public.is_admin() then raise exception 'Only an administrator can do that'; end if;
  select * into v_tx from public.expenses where id = p_id for update;
  if not found then raise exception 'Submission not found'; end if;
  if v_tx.status <> 'pending' then raise exception 'This submission has already been reviewed'; end if;
  if v_tx.submitted_by = auth.uid() then raise exception 'You cannot review a submission you created'; end if;
  perform set_config('manyara.internal', 'on', true);
  update public.expenses
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = null
  where id = p_id and status = 'pending';
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'expense.approve', 'expense', p_id::text, 'Approved expense ' || v_tx.code || '. Stock was not changed.');
  insert into public.notifications (recipient_id, type, title, message, href)
  values (v_tx.submitted_by, 'submission_approved', v_tx.code || ' approved', 'Your expense was approved.', '/employee/submissions');
end;
$$;

create or replace function public.reject_expense(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.expenses%rowtype;
begin
  if not public.is_admin() then raise exception 'Only an administrator can do that'; end if;
  if char_length(trim(p_reason)) < 3 then raise exception 'Enter a rejection reason'; end if;
  select * into v_tx from public.expenses where id = p_id for update;
  if not found then raise exception 'Submission not found'; end if;
  if v_tx.status <> 'pending' then raise exception 'This submission has already been reviewed'; end if;
  if v_tx.submitted_by = auth.uid() then raise exception 'You cannot review a submission you created'; end if;
  perform set_config('manyara.internal', 'on', true);
  update public.expenses
  set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = trim(p_reason)
  where id = p_id and status = 'pending';
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'expense.reject', 'expense', p_id::text, 'Rejected expense ' || v_tx.code);
  insert into public.notifications (recipient_id, type, title, message, href)
  values (v_tx.submitted_by, 'submission_rejected', v_tx.code || ' was rejected', trim(p_reason), '/employee/submissions');
end;
$$;

create or replace function public.cancel_submission(p_kind text, p_id uuid)
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
begin
  select full_name into v_name from public.profiles where id = auth.uid() and is_active;
  if v_name is null then raise exception 'Your account is not active'; end if;

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
  if v_status <> 'pending' then raise exception 'Only a pending submission can be withdrawn'; end if;

  perform set_config('manyara.internal', 'on', true);
  if p_kind = 'stock_in' then
    update public.stock_in_transactions
    set status = 'cancelled', reviewed_at = now(), rejection_reason = 'Withdrawn by the employee.'
    where id = p_id and status = 'pending';
  elsif p_kind = 'sale' then
    update public.sales_transactions
    set status = 'cancelled', reviewed_at = now(), rejection_reason = 'Withdrawn by the employee.'
    where id = p_id and status = 'pending';
  elsif p_kind = 'activity' then
    update public.activity_transactions
    set status = 'cancelled', reviewed_at = now(), rejection_reason = 'Withdrawn by the employee.'
    where id = p_id and status = 'pending';
  else
    update public.expenses
    set status = 'cancelled', reviewed_at = now(), rejection_reason = 'Withdrawn by the employee.'
    where id = p_id and status = 'pending';
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), p_kind || '.cancel', p_kind, p_id::text, 'Withdrew ' || v_code || '.');
  perform public.notify_admins('submission_cancelled', v_code || ' withdrawn', v_name || ' withdrew this submission.', '/admin/approvals');
end;
$$;

revoke all on function public.submit_expense(jsonb) from public;
revoke all on function public.approve_expense(uuid) from public, anon;
revoke all on function public.reject_expense(uuid, text) from public, anon;
revoke all on function public.cancel_submission(text, uuid) from public;
revoke all on function public.assert_correction(text, uuid) from public;

grant execute on function public.submit_expense(jsonb) to authenticated;
grant execute on function public.approve_expense(uuid) to authenticated;
grant execute on function public.reject_expense(uuid, text) to authenticated;
grant execute on function public.cancel_submission(text, uuid) to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.expenses;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
