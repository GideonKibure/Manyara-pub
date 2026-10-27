-- Available stock is last COGS remaining plus stock-in dated after that report.
-- Delivery date is the stock-in date. Earlier deliveries already in remaining are not added again.
-- Paste in the Supabase SQL editor and Run.

create or replace function public.cogs_available_qty(p_product uuid, p_day date, p_inclusive boolean default true)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_prior_day date;
  v_prior numeric;
  v_received numeric := 0;
begin
  select c.day, coalesce((line->>'remaining')::numeric, 0)
    into v_prior_day, v_prior
  from public.day_closes c
  cross join lateral jsonb_array_elements(coalesce(c.lines, '[]'::jsonb)) line
  where (case when p_inclusive then c.day <= p_day else c.day < p_day end)
    and coalesce(line->>'productId', line->>'product_id') = p_product::text
  order by c.day desc, c.created_at desc
  limit 1;

  if v_prior_day is null then
    return null;
  end if;

  select coalesce(sum(i.stock_quantity), 0) into v_received
  from public.stock_in_transactions t
  join public.stock_in_items i on i.transaction_id = t.id
  where t.status = 'approved'
    and i.product_id = p_product
    and t.delivery_date <= p_day
    and t.delivery_date > v_prior_day;

  return v_prior + v_received;
end;
$$;

create or replace function public.remaining_opening_qty(p_product uuid, p_day date, p_user uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_opening numeric;
  v_later numeric := 0;
  v_live numeric;
  v_billed numeric := 0;
begin
  v_opening := public.cogs_available_qty(p_product, p_day, false);
  if v_opening is not null then
    return v_opening;
  end if;

  v_live := public.confirmed_qty(p_product) - public.reserved_qty(p_product);

  select coalesce(sum(i.stock_quantity), 0) into v_later
  from public.stock_in_transactions t
  join public.stock_in_items i on i.transaction_id = t.id
  where t.status = 'approved'
    and i.product_id = p_product
    and t.delivery_date > p_day;

  select coalesce(sum(si.quantity), 0) into v_billed
  from public.sales_transactions s
  join public.sales_items si on si.transaction_id = s.id
  where si.product_id = p_product
    and s.submitted_by = p_user
    and s.status not in ('rejected', 'cancelled')
    and coalesce(s.generated_at, s.submitted_at)::date = p_day
    and coalesce(s.notes, '') <> 'Remaining stock count';

  return v_live - v_later + v_billed;
end;
$$;

create or replace function public.current_stock()
returns table (product_id uuid, confirmed_qty numeric, reserved_qty numeric, available_qty numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'Your account is not active';
  end if;
  return query
  select
    p.id,
    coalesce(public.cogs_available_qty(p.id, current_date, true), public.confirmed_qty(p.id)),
    public.reserved_qty(p.id),
    coalesce(public.cogs_available_qty(p.id, current_date, true), public.confirmed_qty(p.id) - public.reserved_qty(p.id))
  from public.products p;
end;
$$;

grant execute on function public.cogs_available_qty(uuid, date, boolean) to authenticated;
grant execute on function public.remaining_opening_qty(uuid, date, uuid) to authenticated;
grant execute on function public.current_stock() to authenticated;

notify pgrst, 'reload schema';
