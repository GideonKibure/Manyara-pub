-- Admin can edit employee name, phone, username, and password, and delete unused accounts.
-- Paste in the Supabase SQL editor and Run.

create or replace function public.admin_update_employee(
  p_id uuid,
  p_full_name text,
  p_phone text,
  p_username text,
  p_password text default ''
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_name text := trim(coalesce(p_full_name, ''));
  v_phone text := trim(coalesce(p_phone, ''));
  v_username text := lower(trim(coalesce(p_username, '')));
  v_password text := coalesce(p_password, '');
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can change employee details.';
  end if;
  if not exists (select 1 from public.profiles where id = p_id and role = 'employee') then
    raise exception 'Employee not found.';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'Enter the employee name.';
  end if;
  if char_length(v_username) < 3 then
    raise exception 'Username must be at least 3 characters.';
  end if;
  if exists (
    select 1 from public.profiles
    where id is distinct from p_id and lower(username) = v_username
  ) then
    raise exception 'That username is already in use.';
  end if;
  if v_password <> '' and (char_length(v_password) < 8 or v_password !~ '[A-Za-z]' or v_password !~ '[0-9]') then
    raise exception 'Use at least 8 characters, including a letter and a number.';
  end if;

  update public.profiles
    set
      full_name = v_name,
      phone = v_phone,
      username = v_username
    where id = p_id and role = 'employee';

  update auth.users
    set
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
        'full_name', v_name,
        'username', v_username,
        'phone', v_phone
      ),
      updated_at = now()
    where id = p_id;

  if v_password <> '' then
    update auth.users
      set
        encrypted_password = crypt(v_password, gen_salt('bf')),
        updated_at = now()
      where id = p_id;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'employee.update', 'profile', p_id::text, 'Updated employee ' || v_name || '.');
end;
$$;

create or replace function public.admin_delete_employee(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_used boolean;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can delete an employee.';
  end if;
  if p_id = auth.uid() then
    raise exception 'You cannot delete your own account.';
  end if;
  select full_name into v_name from public.profiles where id = p_id and role = 'employee';
  if v_name is null then
    raise exception 'Employee not found.';
  end if;

  v_used := exists (select 1 from public.sales_transactions where submitted_by = p_id or reviewed_by = p_id)
    or exists (select 1 from public.stock_in_transactions where submitted_by = p_id or reviewed_by = p_id)
    or exists (select 1 from public.activity_transactions where submitted_by = p_id or reviewed_by = p_id)
    or exists (select 1 from public.expenses where submitted_by = p_id or reviewed_by = p_id)
    or exists (select 1 from public.inventory_movements where created_by = p_id);

  if v_used then
    update public.profiles
      set is_active = false
      where id = p_id and role = 'employee';
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (auth.uid(), 'employee.deactivate', 'profile', p_id::text, 'Turned ' || v_name || ' inactive because they have records.');
    return 'deactivated';
  end if;

  update public.audit_logs set actor_id = null where actor_id = p_id;
  delete from public.notifications where recipient_id = p_id;
  delete from public.profiles where id = p_id and role = 'employee';
  delete from auth.users where id = p_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'employee.delete', 'profile', p_id::text, 'Deleted employee ' || v_name || '.');
  return 'deleted';
end;
$$;

revoke all on function public.admin_update_employee(uuid, text, text, text, text) from public;
revoke all on function public.admin_delete_employee(uuid) from public;
grant execute on function public.admin_update_employee(uuid, text, text, text, text) to authenticated;
grant execute on function public.admin_delete_employee(uuid) to authenticated;

notify pgrst, 'reload schema';
