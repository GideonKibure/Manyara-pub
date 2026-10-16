-- While remaining-stock mode is on, employees cannot insert ordinary sales.
-- Remaining-stock counts still save as sales with that note. Run after 024.

create or replace function public.block_employee_sales_when_counting()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_on boolean := false;
begin
  if public.is_admin() then return new; end if;
  select coalesce(allow_remaining_count, false) into v_on from public.business_settings where id = 1;
  if v_on and new.record_kind = 'sale' and coalesce(new.notes, '') is distinct from 'Remaining stock count' then
    raise exception 'Sales are taken from remaining stock while that mode is on. Use Remaining stock.';
  end if;
  return new;
end;
$$;

drop trigger if exists sales_remaining_mode_guard on public.sales_transactions;
create trigger sales_remaining_mode_guard
before insert on public.sales_transactions
for each row execute function public.block_employee_sales_when_counting();
