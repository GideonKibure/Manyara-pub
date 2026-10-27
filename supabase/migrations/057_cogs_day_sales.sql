-- Remaining-stock sales belong to the COGS day they were counted for,
-- not the calendar day they were typed in.
-- Paste in the Supabase SQL editor and Run.

create or replace function public.stamp_remaining_sale_to_cogs_day()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.remaining_sale_id is null then
    return new;
  end if;
  update public.sales_transactions
    set generated_at = (new.day::timestamp + coalesce(generated_at::time, now()::time))
    where id = new.remaining_sale_id
      and coalesce(notes, '') = 'Remaining stock count';
  return new;
end;
$$;

drop trigger if exists day_closes_stamp_remaining_sale on public.day_closes;
create trigger day_closes_stamp_remaining_sale
after insert or update of remaining_sale_id, day on public.day_closes
for each row execute function public.stamp_remaining_sale_to_cogs_day();

update public.sales_transactions s
set generated_at = (c.day::timestamp + coalesce(s.generated_at::time, time '20:00'))
from public.day_closes c
where c.remaining_sale_id = s.id
  and coalesce(s.notes, '') = 'Remaining stock count';

notify pgrst, 'reload schema';
