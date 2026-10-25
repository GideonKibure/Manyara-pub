-- Bill payments must update the owner's COGS debts even after the sheet is approved.
-- Paste in the Supabase SQL editor and Run.

create or replace function public.apply_cogs_debt_payment(
  p_owner uuid,
  p_day date,
  p_customer text,
  p_extra integer,
  p_admin boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_close public.day_closes%rowtype;
  v_next jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_amount integer;
  v_paid integer;
  v_left integer;
  v_add integer;
  v_matched boolean := false;
  v_name text := lower(trim(coalesce(p_customer, '')));
begin
  if p_extra is null or p_extra < 1 or v_name = '' then
    return;
  end if;
  select * into v_close
  from public.day_closes
  where submitted_by = p_owner and day = p_day
  order by created_at desc
  limit 1;
  if not found then
    return;
  end if;
  for v_elem in select value from jsonb_array_elements(coalesce(v_close.debts, '[]'::jsonb))
  loop
    v_amount := greatest(0, coalesce((v_elem->>'amount')::integer, 0));
    v_paid := greatest(0, coalesce((v_elem->>'paidAmount')::integer, 0));
    v_left := greatest(0, v_amount - v_paid);
    if not v_matched and lower(trim(coalesce(v_elem->>'customerName', ''))) = v_name and v_left > 0 then
      v_matched := true;
      v_add := least(v_left, p_extra);
      v_paid := v_paid + v_add;
      if v_paid <= 0 then
        v_elem := (v_elem || jsonb_build_object('paidAmount', 0, 'paymentStatus', 'unpaid')) - 'paidApprovedAmount';
      elsif p_admin then
        v_elem := v_elem || jsonb_build_object('paidAmount', v_paid, 'paymentStatus', 'approved', 'paidApprovedAmount', v_paid);
      else
        v_elem := v_elem || jsonb_build_object('paidAmount', v_paid, 'paymentStatus', 'pending');
      end if;
    end if;
    v_next := v_next || jsonb_build_array(v_elem);
  end loop;
  if not v_matched then
    return;
  end if;
  update public.day_closes set debts = v_next where id = v_close.id;
end;
$$;

notify pgrst, 'reload schema';
