-- Keep the exact buying price instead of rounding it to the nearest thousand TZS.
-- Paste in the Supabase SQL editor and Run.

create or replace function public.round_buying_price(p_amount numeric)
returns integer
language sql
immutable
as $$
  select case
    when p_amount is null or p_amount <= 0 then 0
    else round(p_amount)::integer
  end;
$$;

drop trigger if exists products_round_buying_price on public.products;

notify pgrst, 'reload schema';
