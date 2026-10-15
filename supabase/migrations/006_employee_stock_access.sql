-- Every active employee can see available stock and what is out of stock.

create or replace function public.current_stock()
returns table (product_id uuid, confirmed_qty integer, reserved_qty integer, available_qty integer)
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
    public.confirmed_qty(p.id),
    coalesce((
      select sum(si.quantity)::integer
      from public.sales_items si
      join public.sales_transactions st on st.id = si.transaction_id
      where si.product_id = p.id and st.status = 'pending'
    ), 0),
    public.confirmed_qty(p.id) - coalesce((
      select sum(si.quantity)::integer
      from public.sales_items si
      join public.sales_transactions st on st.id = si.transaction_id
      where si.product_id = p.id and st.status = 'pending'
    ), 0)
  from public.products p;
end;
$$;

drop policy if exists movements_select on public.inventory_movements;
create policy movements_select on public.inventory_movements for select to authenticated
using (
  public.is_admin() or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_active
  )
);

grant execute on function public.current_stock() to authenticated;
