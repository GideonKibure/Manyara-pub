-- Admin can wipe operational business data. Paste in the Supabase SQL editor and Run.
-- Keeps login accounts, categories, units, activity types, and settings.

create or replace function public.clear_business_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can clear business data.';
  end if;

  update public.sales_transactions set source_bill_id = null, corrects_id = null;
  update public.stock_in_transactions set corrects_id = null;
  update public.activity_transactions set corrects_id = null;
  update public.expenses set corrects_id = null;

  delete from public.sales_items;
  delete from public.stock_in_items;
  delete from public.sales_transactions;
  delete from public.stock_in_transactions;
  delete from public.inventory_movements;
  delete from public.expenses;
  delete from public.activity_transactions;
  delete from public.notifications;
  delete from public.products;
  delete from public.suppliers;
  delete from public.audit_logs;

  if exists (select 1 from pg_class where relname = 'stock_in_code_seq' and relkind = 'S') then
    perform setval('public.stock_in_code_seq', 1, false);
  end if;
  if exists (select 1 from pg_class where relname = 'sale_code_seq' and relkind = 'S') then
    perform setval('public.sale_code_seq', 1, false);
  end if;
  if exists (select 1 from pg_class where relname = 'activity_code_seq' and relkind = 'S') then
    perform setval('public.activity_code_seq', 1, false);
  end if;
  if exists (select 1 from pg_class where relname = 'expense_code_seq' and relkind = 'S') then
    perform setval('public.expense_code_seq', 1, false);
  end if;
  if exists (select 1 from pg_class where relname = 'adjustment_code_seq' and relkind = 'S') then
    perform setval('public.adjustment_code_seq', 1, false);
  end if;
  if exists (select 1 from pg_class where relname = 'invoice_ref_seq' and relkind = 'S') then
    perform setval('public.invoice_ref_seq', 1, false);
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'business.clear', 'settings', 'all', 'Cleared business operational data.');
end;
$$;

revoke all on function public.clear_business_data() from public;
grant execute on function public.clear_business_data() to authenticated;
