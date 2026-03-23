-- =====================================================================
-- OBLIGATOIRE pour les serveurs privés : copier TOUT ce fichier dans
-- Supabase → SQL Editor → Run (une fois), APRÈS supabase/friends-dm.sql.
-- Sans ça, l’erreur « Could not find the table public.guilds » est normale.
-- =====================================================================
--
-- Création de serveur, salons texte/vocal, invitations entre amis, admins, exclusions.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.guilds (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) >= 1 and char_length(name) <= 64),
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.guild_members (
  guild_id uuid not null references public.guilds (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  primary key (guild_id, user_id)
);

create index if not exists guild_members_user on public.guild_members (user_id);

create table if not exists public.guild_channels (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds (id) on delete cascade,
  name text not null check (char_length(trim(name)) >= 1 and char_length(name) <= 64),
  kind text not null check (kind in ('text', 'voice')),
  position int not null default 0
);

create index if not exists guild_channels_guild on public.guild_channels (guild_id);

create table if not exists public.guild_invites (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds (id) on delete cascade,
  invited_by uuid not null references auth.users (id) on delete cascade,
  invitee_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  check (invited_by <> invitee_id)
);

-- Une seule invitation « pending » par couple serveur + invité (nouvelles invitations possibles après accepté/refusé)
create unique index if not exists guild_invites_one_pending
  on public.guild_invites (guild_id, invitee_id)
  where status = 'pending';

create index if not exists guild_invites_invitee_pending
  on public.guild_invites (invitee_id) where status = 'pending';

create table if not exists public.guild_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.guild_channels (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) >= 1 and char_length(body) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists guild_messages_channel_created
  on public.guild_messages (channel_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.guilds enable row level security;
alter table public.guild_members enable row level security;
alter table public.guild_channels enable row level security;
alter table public.guild_invites enable row level security;
alter table public.guild_messages enable row level security;

-- guilds
create policy "guilds_select_member"
on public.guilds for select
to authenticated
using (
  exists (
    select 1 from public.guild_members m
    where m.guild_id = guilds.id and m.user_id = auth.uid()
  )
);

create policy "guilds_insert_owner_self"
on public.guilds for insert
to authenticated
with check (owner_id = auth.uid());

create policy "guilds_update_owner"
on public.guilds for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "guilds_delete_owner"
on public.guilds for delete
to authenticated
using (owner_id = auth.uid());

-- Le propriétaire peut lire son serveur tout de suite après l’INSERT (avant la ligne guild_members),
-- nécessaire pour .insert().select('id') depuis le client si la RPC n’est pas utilisée.
drop policy if exists "guilds_select_owner" on public.guilds;
create policy "guilds_select_owner"
on public.guilds for select
to authenticated
using (owner_id = auth.uid());

-- guild_members
create policy "gm_select_same_guild"
on public.guild_members for select
to authenticated
using (
  exists (
    select 1 from public.guild_members me
    where me.guild_id = guild_members.guild_id and me.user_id = auth.uid()
  )
);

create policy "gm_insert_self_owner_row"
on public.guild_members for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (select 1 from public.guilds g where g.id = guild_id and g.owner_id = auth.uid())
  and role = 'owner'
);

-- Inserts supplémentaires (membre invité) via RPC accept_guild_invite uniquement

create policy "gm_update_owner_roles"
on public.guild_members for update
to authenticated
using (
  exists (
    select 1 from public.guild_members me
    where me.guild_id = guild_members.guild_id and me.user_id = auth.uid() and me.role = 'owner'
  )
  and guild_members.role <> 'owner'
)
with check (
  role in ('admin', 'member')
);

create policy "gm_delete_owner_kick"
on public.guild_members for delete
to authenticated
using (
  exists (
    select 1 from public.guild_members me
    where me.guild_id = guild_members.guild_id and me.user_id = auth.uid() and me.role = 'owner'
  )
  and guild_members.role <> 'owner'
);

create policy "gm_delete_admin_kick_member"
on public.guild_members for delete
to authenticated
using (
  exists (
    select 1 from public.guild_members me
    where me.guild_id = guild_members.guild_id and me.user_id = auth.uid() and me.role = 'admin'
  )
  and guild_members.role = 'member'
);

-- guild_channels
create policy "gch_select_member"
on public.guild_channels for select
to authenticated
using (
  exists (
    select 1 from public.guild_members m
    where m.guild_id = guild_channels.guild_id and m.user_id = auth.uid()
  )
);

create policy "gch_write_admin"
on public.guild_channels for insert
to authenticated
with check (
  exists (
    select 1 from public.guild_members m
    where m.guild_id = guild_channels.guild_id and m.user_id = auth.uid() and m.role in ('owner', 'admin')
  )
);

create policy "gch_update_admin"
on public.guild_channels for update
to authenticated
using (
  exists (
    select 1 from public.guild_members m
    where m.guild_id = guild_channels.guild_id and m.user_id = auth.uid() and m.role in ('owner', 'admin')
  )
);

create policy "gch_delete_admin"
on public.guild_channels for delete
to authenticated
using (
  exists (
    select 1 from public.guild_members m
    where m.guild_id = guild_channels.guild_id and m.user_id = auth.uid() and m.role in ('owner', 'admin')
  )
);

-- guild_invites
create policy "gi_select_related"
on public.guild_invites for select
to authenticated
using (
  invitee_id = auth.uid()
  or invited_by = auth.uid()
  or exists (
    select 1 from public.guild_members m
    where m.guild_id = guild_invites.guild_id and m.user_id = auth.uid() and m.role in ('owner', 'admin')
  )
);

create policy "gi_insert_admin_friend"
on public.guild_invites for insert
to authenticated
with check (
  invited_by = auth.uid()
  and exists (
    select 1 from public.guild_members m
    where m.guild_id = guild_invites.guild_id and m.user_id = auth.uid() and m.role in ('owner', 'admin')
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

create policy "gi_update_invitee"
on public.guild_invites for update
to authenticated
using (invitee_id = auth.uid() and status = 'pending')
with check (invitee_id = auth.uid());

create policy "gi_delete_inviter_pending"
on public.guild_invites for delete
to authenticated
using (invited_by = auth.uid() and status = 'pending');

-- guild_messages
create policy "gmsg_select_member"
on public.guild_messages for select
to authenticated
using (
  exists (
    select 1 from public.guild_channels ch
    join public.guild_members m on m.guild_id = ch.guild_id
    where ch.id = guild_messages.channel_id and m.user_id = auth.uid()
  )
);

create policy "gmsg_insert_member"
on public.guild_messages for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.guild_channels ch
    join public.guild_members m on m.guild_id = ch.guild_id
    where ch.id = channel_id and m.user_id = auth.uid() and ch.kind = 'text'
  )
);

-- ---------------------------------------------------------------------------
-- RPC : création serveur + salons par défaut (évite double insert RLS)
-- ---------------------------------------------------------------------------

create or replace function public.create_guild_with_defaults (p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid;
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;
  if p_name is null or length(trim(p_name)) < 1 or length(p_name) > 64 then
    raise exception 'invalid_name';
  end if;

  insert into public.guilds (name, owner_id)
  values (trim(p_name), me)
  returning id into gid;

  insert into public.guild_members (guild_id, user_id, role)
  values (gid, me, 'owner');

  insert into public.guild_channels (guild_id, name, kind, position) values
    (gid, 'général', 'text', 0),
    (gid, 'Salon vocal', 'voice', 1);

  return gid;
end;
$$;

grant execute on function public.create_guild_with_defaults (text) to authenticated;

-- Après création / remplacement de fonctions : rafraîchir le cache de l’API (SQL Editor, rôle postgres)
-- select pg_notify('pgrst', 'reload schema');

-- Accepter une invitation (ajoute le membre)
create or replace function public.accept_guild_invite (p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g_id uuid;
  inv uuid := auth.uid();
begin
  if inv is null then raise exception 'not_authenticated'; end if;

  update public.guild_invites gi
  set status = 'accepted'
  where gi.id = p_invite_id
    and gi.invitee_id = inv
    and gi.status = 'pending'
  returning gi.guild_id into g_id;

  if g_id is null then
    raise exception 'invite_not_found';
  end if;

  insert into public.guild_members (guild_id, user_id, role)
  values (g_id, inv, 'member')
  on conflict (guild_id, user_id) do nothing;
end;
$$;

grant execute on function public.accept_guild_invite (uuid) to authenticated;
