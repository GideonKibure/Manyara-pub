-- Point remaining-stock admin notices at Remaining stock.
-- Notifications normally cannot change href; this lifts that guard for this update only.

alter table public.notifications disable trigger protect_notification_trigger;

update public.notifications
set href = '/admin/remaining'
where href = '/admin/sales'
  and (title ilike '%remaining%' or message ilike '%remaining%');

alter table public.notifications enable trigger protect_notification_trigger;
