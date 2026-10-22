-- Cloud backups of COGS / full workspace so staff can restore on another device after login.

create table if not exists public.financial_backups (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('cogs', 'workspace')),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  label text not null default '',
  payload jsonb not null
);

create index if not exists financial_backups_created_at_idx on public.financial_backups (created_at desc);

alter table public.financial_backups enable row level security;

drop policy if exists financial_backups_select on public.financial_backups;
create policy financial_backups_select on public.financial_backups
  for select to authenticated
  using (true);

drop policy if exists financial_backups_insert on public.financial_backups;
create policy financial_backups_insert on public.financial_backups
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists financial_backups_delete on public.financial_backups;
create policy financial_backups_delete on public.financial_backups
  for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());

grant select, insert, delete on public.financial_backups to authenticated;
