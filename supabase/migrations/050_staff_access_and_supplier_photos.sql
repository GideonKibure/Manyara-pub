-- Staff titles, per-person permissions, supplier photos, and admin role assignment.
-- Paste in the Supabase SQL editor and Run.

alter table public.profiles
  add column if not exists staff_title text not null default 'staff',
  add column if not exists can_view_suppliers boolean not null default false;

alter table public.profiles
  drop constraint if exists profiles_staff_title_check;

alter table public.profiles
  add constraint profiles_staff_title_check check (staff_title in ('staff', 'manager'));

update public.profiles
  set can_view_suppliers = true
  where role = 'admin' or staff_title = 'manager';

alter table public.suppliers
  add column if not exists image_url text;

create or replace function public.protect_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'admin' and old.role is distinct from 'admin'
    and not public.is_admin()
    and current_user not in ('postgres', 'supabase_admin')
  then
    raise exception 'Only an administrator can grant administrator access.';
  end if;
  if current_user not in ('postgres', 'supabase_admin') and not public.is_admin() then
    if new.role is distinct from old.role
      or new.is_active is distinct from old.is_active
      or new.can_submit_activities is distinct from old.can_submit_activities
      or new.can_view_stock is distinct from old.can_view_stock
      or new.can_view_suppliers is distinct from old.can_view_suppliers
      or new.staff_title is distinct from old.staff_title
      or new.email is distinct from old.email
      or new.username is distinct from old.username
    then
      raise exception 'You cannot change account privileges';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.admin_set_staff_access(
  p_id uuid,
  p_role text,
  p_can_submit boolean,
  p_can_view_stock boolean,
  p_can_view_suppliers boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := lower(trim(coalesce(p_role, 'employee')));
  v_portal public.user_role;
  v_title text;
  v_suppliers boolean;
  v_admins integer;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can change roles and permissions.';
  end if;
  if v_role not in ('admin', 'manager', 'employee') then
    raise exception 'Choose employee, manager, or administrator.';
  end if;
  if not exists (select 1 from public.profiles where id = p_id) then
    raise exception 'Staff account not found.';
  end if;

  select count(*) into v_admins
  from public.profiles
  where role = 'admin' and is_active and id is distinct from p_id;

  if v_role <> 'admin' and v_admins < 1 then
    if exists (select 1 from public.profiles where id = p_id and role = 'admin' and is_active) then
      raise exception 'Keep at least one administrator.';
    end if;
  end if;

  v_portal := case when v_role = 'admin' then 'admin'::public.user_role else 'employee'::public.user_role end;
  v_title := case when v_role = 'manager' then 'manager' else 'staff' end;
  v_suppliers := v_role in ('admin', 'manager') or coalesce(p_can_view_suppliers, false);

  update public.profiles
    set
      role = v_portal,
      staff_title = v_title,
      can_submit_activities = case when v_role = 'admin' then true else coalesce(p_can_submit, false) end,
      can_view_stock = case when v_role = 'admin' then true else coalesce(p_can_view_stock, true) end,
      can_view_suppliers = v_suppliers
    where id = p_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'employee.access', 'profile', p_id::text, 'Updated staff role and permissions.');
end;
$$;

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
  if not exists (select 1 from public.profiles where id = p_id) then
    raise exception 'Staff account not found.';
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
    where id = p_id;

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
  v_role public.user_role;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can delete an employee.';
  end if;
  if p_id = auth.uid() then
    raise exception 'You cannot delete your own account.';
  end if;
  select full_name, role into v_name, v_role from public.profiles where id = p_id;
  if v_name is null then
    raise exception 'Staff account not found.';
  end if;
  if v_role = 'admin' then
    raise exception 'Demote this administrator before deleting the account.';
  end if;

  v_used := exists (select 1 from public.sales_transactions where submitted_by = p_id or reviewed_by = p_id)
    or exists (select 1 from public.stock_in_transactions where submitted_by = p_id or reviewed_by = p_id)
    or exists (select 1 from public.activity_transactions where submitted_by = p_id or reviewed_by = p_id)
    or exists (select 1 from public.expenses where submitted_by = p_id or reviewed_by = p_id)
    or exists (select 1 from public.inventory_movements where created_by = p_id);

  if v_used then
    update public.profiles
      set is_active = false
      where id = p_id;
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (auth.uid(), 'employee.deactivate', 'profile', p_id::text, 'Turned ' || v_name || ' inactive because they have records.');
    return 'deactivated';
  end if;

  update public.audit_logs set actor_id = null where actor_id = p_id;
  delete from public.notifications where recipient_id = p_id;
  delete from public.profiles where id = p_id;
  delete from auth.users where id = p_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), 'employee.delete', 'profile', p_id::text, 'Deleted employee ' || v_name || '.');
  return 'deleted';
end;
$$;

revoke all on function public.admin_set_staff_access(uuid, text, boolean, boolean, boolean) from public;
grant execute on function public.admin_set_staff_access(uuid, text, boolean, boolean, boolean) to authenticated;
revoke all on function public.admin_update_employee(uuid, text, text, text, text) from public;
revoke all on function public.admin_delete_employee(uuid) from public;
grant execute on function public.admin_update_employee(uuid, text, text, text, text) to authenticated;
grant execute on function public.admin_delete_employee(uuid) to authenticated;

notify pgrst, 'reload schema';
