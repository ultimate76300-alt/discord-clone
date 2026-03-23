-- Optionnel : après supabase/friends-dm.sql (table friend_requests).
-- Remplace la politique d’insertion des invitations pour n’autoriser que les paires d’amis acceptés.

drop policy if exists "gi_insert_admin" on public.guild_invites;

create policy "gi_insert_admin_friend"
on public.guild_invites for insert
to authenticated
with check (
  invited_by = auth.uid()
  and exists (
    select 1 from public.guild_members m
    where m.guild_id = guild_invites.guild_id and m.user_id = auth.uid() and m.role in ('owner','admin')
  )
  and exists (
    select 1 from public.friend_requests fr
    where fr.status = 'accepted'
      and (
        (fr.from_id = auth.uid() and fr.to_id = invitee_id)
        or (fr.from_id = invitee_id and fr.to_id = auth.uid())
      )
  )
);
