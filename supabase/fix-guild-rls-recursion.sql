-- =====================================================================
-- Corrige : infinite recursion detected in policy for relation "guild_members"
--
-- Cause : une policy sur guild_members qui fait EXISTS (SELECT … FROM guild_members …)
-- déclenche une récursion infinie en PostgreSQL.
--
-- Exécute UNE FOIS dans Supabase → SQL Editor → Run (même projet que ton app).
-- =====================================================================

create or replace function public.gm_user_in_guild (p_guild_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.guild_members x
    where x.guild_id = p_guild_id and x.user_id = auth.uid()
  );
$$;

create or replace function public.gm_user_has_role_in_guild (p_guild_id uuid, p_roles text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.guild_members x
    where x.guild_id = p_guild_id
      and x.user_id = auth.uid()
      and x.role = any (p_roles)
  );
$$;

grant execute on function public.gm_user_in_guild (uuid) to authenticated;
grant execute on function public.gm_user_has_role_in_guild (uuid, text[]) to authenticated;

-- guilds
drop policy if exists "guilds_select_member" on public.guilds;
create policy "guilds_select_member"
on public.guilds for select
to authenticated
using (public.gm_user_in_guild (id));

-- guild_members
drop policy if exists "gm_select_same_guild" on public.guild_members;
create policy "gm_select_same_guild"
on public.guild_members for select
to authenticated
using (public.gm_user_in_guild (guild_id));

drop policy if exists "gm_update_owner_roles" on public.guild_members;
create policy "gm_update_owner_roles"
on public.guild_members for update
to authenticated
using (
  public.gm_user_has_role_in_guild (guild_id, array['owner']::text[])
  and guild_members.role <> 'owner'
)
with check (role in ('admin', 'member'));

drop policy if exists "gm_delete_owner_kick" on public.guild_members;
create policy "gm_delete_owner_kick"
on public.guild_members for delete
to authenticated
using (
  public.gm_user_has_role_in_guild (guild_id, array['owner']::text[])
  and guild_members.role <> 'owner'
);

drop policy if exists "gm_delete_admin_kick_member" on public.guild_members;
create policy "gm_delete_admin_kick_member"
on public.guild_members for delete
to authenticated
using (
  public.gm_user_has_role_in_guild (guild_id, array['admin']::text[])
  and guild_members.role = 'member'
);

-- guild_channels
drop policy if exists "gch_select_member" on public.guild_channels;
create policy "gch_select_member"
on public.guild_channels for select
to authenticated
using (public.gm_user_in_guild (guild_id));

drop policy if exists "gch_write_admin" on public.guild_channels;
create policy "gch_write_admin"
on public.guild_channels for insert
to authenticated
with check (
  public.gm_user_has_role_in_guild (guild_id, array['owner', 'admin']::text[])
);

drop policy if exists "gch_update_admin" on public.guild_channels;
create policy "gch_update_admin"
on public.guild_channels for update
to authenticated
using (
  public.gm_user_has_role_in_guild (guild_id, array['owner', 'admin']::text[])
);

drop policy if exists "gch_delete_admin" on public.guild_channels;
create policy "gch_delete_admin"
on public.guild_channels for delete
to authenticated
using (
  public.gm_user_has_role_in_guild (guild_id, array['owner', 'admin']::text[])
);

-- guild_invites
drop policy if exists "gi_select_related" on public.guild_invites;
create policy "gi_select_related"
on public.guild_invites for select
to authenticated
using (
  invitee_id = auth.uid()
  or invited_by = auth.uid()
  or public.gm_user_has_role_in_guild (guild_id, array['owner', 'admin']::text[])
);

drop policy if exists "gi_insert_admin" on public.guild_invites;
create policy "gi_insert_admin"
on public.guild_invites for insert
to authenticated
with check (
  invited_by = auth.uid()
  and public.gm_user_has_role_in_guild (guild_id, array['owner', 'admin']::text[])
);

-- guild_messages
drop policy if exists "gmsg_select_member" on public.guild_messages;
create policy "gmsg_select_member"
on public.guild_messages for select
to authenticated
using (
  exists (
    select 1 from public.guild_channels ch
    where ch.id = guild_messages.channel_id
      and public.gm_user_in_guild (ch.guild_id)
  )
);

drop policy if exists "gmsg_insert_member" on public.guild_messages;
create policy "gmsg_insert_member"
on public.guild_messages for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.guild_channels ch
    where ch.id = channel_id
      and ch.kind = 'text'
      and public.gm_user_in_guild (ch.guild_id)
  )
);
