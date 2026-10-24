-- Remaining-stock mode must still allow bill payments (those inserts are sales with a source bill).
-- Paste in the Supabase SQL editor and Run.

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
  if new.source_bill_id is not null then return new; end if;
  if coalesce(new.notes, '') = 'Remaining stock count' then return new; end if;
  if coalesce(new.notes, '') like 'Payment toward %' then return new; end if;
  select coalesce(allow_remaining_count, false) into v_on from public.business_settings where id = 1;
  if v_on and new.record_kind = 'sale' then
    raise exception 'Sales are taken from remaining stock while that mode is on. Use Remaining stock.';
  end if;
  return new;
end;
$$;
