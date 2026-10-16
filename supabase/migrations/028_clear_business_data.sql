-- Admin can wipe operational business data. Paste in the Supabase SQL editor and Run.
-- Keeps login accounts, categories, units, activity types, and settings.
-- Every UPDATE/DELETE has a WHERE clause (required by pg-safeupdate / SQL editor).

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

  perform set_config('manyara.internal', 'on', true);

  update public.sales_transactions
    set source_bill_id = null, corrects_id = null
    where id is not null;
  update public.stock_in_transactions
    set corrects_id = null
    where id is not null;
  update public.activity_transactions
    set corrects_id = null
    where id is not null;
  update public.expenses
    set corrects_id = null
    where id is not null;

  delete from public.sales_items where id is not null;
  delete from public.stock_in_items where id is not null;
  delete from public.sales_transactions where id is not null;
  delete from public.stock_in_transactions where id is not null;
  delete from public.inventory_movements where id is not null;
  delete from public.expenses where id is not null;
  delete from public.activity_transactions where id is not null;
  delete from public.notifications where id is not null;
  delete from public.products where id is not null;
  delete from public.suppliers where id is not null;
  delete from public.audit_logs where id is not null;

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

notify pgrst, 'reload schema';
