-- Allow a signed-in user to delete their own notifications.
-- Paste in the Supabase SQL editor and Run.

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete to authenticated
  using (recipient_id = auth.uid());

notify pgrst, 'reload schema';
