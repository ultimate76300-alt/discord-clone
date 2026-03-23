-- ============================================================
-- AtomVoice / Discord clone - Supabase full setup (idempotent)
-- Exécuter ce fichier en une seule fois dans Supabase SQL Editor.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- PROFILES
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  username_base text,
  username_tag integer,
  username_handle text,
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_unique_username_handle
  on public.profiles (username_handle)
  where username_handle is not null;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_auth" on public.profiles;
create policy "profiles_select_auth"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- RPC: génération de pseudo unique base@XYZ
create or replace function public.profiles_set_username(p_username_base text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  base_norm text;
  tag int;
  handle text;
  attempt int;
  existing_handle text;
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;

  base_norm := lower(trim(coalesce(p_username_base, '')));
  base_norm := regexp_replace(base_norm, '[^a-z0-9_]+', '', 'g');

  if base_norm is null or length(base_norm) < 1 or length(base_norm) > 32 then
    raise exception 'invalid_username_base';
  end if;

  select username_handle
    into existing_handle
  from public.profiles
  where id = me
    and username_base = base_norm
    and username_handle is not null;

  if existing_handle is not null then
    return existing_handle;
  end if;

  insert into public.profiles (id, display_name, username_base, username_tag, username_handle)
  values (me, '', base_norm, null, null)
  on conflict (id) do nothing;

  for attempt in 1..50 loop
    tag := floor(random() * 1000)::int;
    handle := base_norm || '@' || lpad(tag::text, 3, '0');
    begin
      update public.profiles
      set
        username_base = base_norm,
        username_tag = tag,
        username_handle = handle,
        display_name = handle,
        updated_at = now()
      where id = me;
      return handle;
    exception
      when unique_violation then
        null;
    end;
  end loop;

  for tag in 0..999 loop
    handle := base_norm || '@' || lpad(tag::text, 3, '0');
    if not exists (
      select 1 from public.profiles where username_handle = handle and id <> me
    ) then
      update public.profiles
      set
        username_base = base_norm,
        username_tag = tag,
        username_handle = handle,
        display_name = handle,
        updated_at = now()
      where id = me;
      return handle;
    end if;
  end loop;

  raise exception 'could_not_generate_username_handle';
end;
$$;

grant execute on function public.profiles_set_username(text) to authenticated;

-- ------------------------------------------------------------
-- FRIEND REQUESTS + DM
-- ------------------------------------------------------------
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references auth.users (id) on delete cascade,
  to_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  check (from_id <> to_id),
  unique (from_id, to_id)
);

create index if not exists friend_requests_to_pending
  on public.friend_requests (to_id) where status = 'pending';

alter table public.friend_requests enable row level security;

drop policy if exists "fr_select_participants" on public.friend_requests;
create policy "fr_select_participants"
on public.friend_requests for select
to authenticated
using (from_id = auth.uid() or to_id = auth.uid());

drop policy if exists "fr_insert_from_self" on public.friend_requests;
create policy "fr_insert_from_self"
on public.friend_requests for insert
to authenticated
with check (from_id = auth.uid() and from_id <> to_id);

drop policy if exists "fr_update_recipient_pending" on public.friend_requests;
create policy "fr_update_recipient_pending"
on public.friend_requests for update
to authenticated
using (to_id = auth.uid() and status = 'pending')
with check (to_id = auth.uid());

drop policy if exists "fr_cancel_own_outgoing" on public.friend_requests;
create policy "fr_cancel_own_outgoing"
on public.friend_requests for delete
to authenticated
using (from_id = auth.uid() and status = 'pending');

drop policy if exists "fr_delete_recipient_pending" on public.friend_requests;
create policy "fr_delete_recipient_pending"
on public.friend_requests for delete
to authenticated
using (to_id = auth.uid() and status = 'pending');

create table if not exists public.dm_conversations (
  id uuid primary key default gen_random_uuid(),
  user_low uuid not null references auth.users (id) on delete cascade,
  user_high uuid not null references auth.users (id) on delete cascade,
  check (user_low < user_high),
  unique (user_low, user_high)
);

alter table public.dm_conversations enable row level security;

drop policy if exists "dm_conv_select_member" on public.dm_conversations;
create policy "dm_conv_select_member"
on public.dm_conversations for select
to authenticated
using (user_low = auth.uid() or user_high = auth.uid());

drop policy if exists "dm_conv_insert_member" on public.dm_conversations;
create policy "dm_conv_insert_member"
on public.dm_conversations for insert
to authenticated
with check ((user_low = auth.uid() or user_high = auth.uid()) and user_low < user_high);

create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.dm_conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) >= 1 and char_length(body) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists dm_messages_conv_created
  on public.dm_messages (conversation_id, created_at);

alter table public.dm_messages enable row level security;

drop policy if exists "dm_msg_select_member" on public.dm_messages;
create policy "dm_msg_select_member"
on public.dm_messages for select
to authenticated
using (
  exists (
    select 1 from public.dm_conversations c
    where c.id = conversation_id
      and (c.user_low = auth.uid() or c.user_high = auth.uid())
  )
);

drop policy if exists "dm_msg_insert_member" on public.dm_messages;
create policy "dm_msg_insert_member"
on public.dm_messages for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.dm_conversations c
    where c.id = conversation_id
      and (c.user_low = auth.uid() or c.user_high = auth.uid())
  )
);

create or replace function public.get_or_create_dm(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  low_u uuid;
  high_u uuid;
  conv_id uuid;
begin
  if me is null or other_user_id is null or me = other_user_id then
    raise exception 'invalid_users';
  end if;

  if not exists (
    select 1 from public.friend_requests fr
    where fr.status = 'accepted'
      and (
        (fr.from_id = me and fr.to_id = other_user_id)
        or (fr.from_id = other_user_id and fr.to_id = me)
      )
  ) then
    raise exception 'not_friends';
  end if;

  if me < other_user_id then
    low_u := me;
    high_u := other_user_id;
  else
    low_u := other_user_id;
    high_u := me;
  end if;

  select id into conv_id
  from public.dm_conversations
  where user_low = low_u and user_high = high_u;

  if conv_id is null then
    insert into public.dm_conversations (user_low, user_high)
    values (low_u, high_u)
    returning id into conv_id;
  end if;

  return conv_id;
end;
$$;

grant execute on function public.get_or_create_dm(uuid) to authenticated;

-- ------------------------------------------------------------
-- PRIVATE GUILDS
-- ------------------------------------------------------------
create table if not exists public.guilds (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) >= 1 and char_length(name) <= 64),
  owner_id uuid not null references auth.users (id) on delete cascade,
  icon_url text,
  icon_brand_key text,
  created_at timestamptz not null default now()
);

alter table public.guilds add column if not exists icon_url text;
alter table public.guilds add column if not exists icon_brand_key text;

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

create unique index if not exists guild_invites_one_pending
  on public.guild_invites (guild_id, invitee_id)
  where status = 'pending';

create index if not exists guild_invites_invitee_pending
  on public.guild_invites (invitee_id) where status = 'pending';

create table if not exists public.guild_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.guild_channels (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) >= 1 and char_length(body) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists guild_messages_channel_created
  on public.guild_messages (channel_id, created_at);

alter table public.guilds enable row level security;
alter table public.guild_members enable row level security;
alter table public.guild_channels enable row level security;
alter table public.guild_invites enable row level security;
alter table public.guild_messages enable row level security;

create or replace function public.gm_user_in_guild(p_guild_id uuid)
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

create or replace function public.gm_user_has_role_in_guild(p_guild_id uuid, p_roles text[])
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

grant execute on function public.gm_user_in_guild(uuid) to authenticated;
grant execute on function public.gm_user_has_role_in_guild(uuid, text[]) to authenticated;

drop policy if exists "guilds_select_member" on public.guilds;
create policy "guilds_select_member"
on public.guilds for select
to authenticated
using (public.gm_user_in_guild(id));

drop policy if exists "guilds_select_owner" on public.guilds;
create policy "guilds_select_owner"
on public.guilds for select
to authenticated
using (owner_id = auth.uid());

drop policy if exists "guilds_insert_owner_self" on public.guilds;
create policy "guilds_insert_owner_self"
on public.guilds for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "guilds_update_owner" on public.guilds;
create policy "guilds_update_owner"
on public.guilds for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "guilds_delete_owner" on public.guilds;
create policy "guilds_delete_owner"
on public.guilds for delete
to authenticated
using (owner_id = auth.uid());

drop policy if exists "gm_select_same_guild" on public.guild_members;
create policy "gm_select_same_guild"
on public.guild_members for select
to authenticated
using (public.gm_user_in_guild(guild_id));

drop policy if exists "gm_insert_self_owner_row" on public.guild_members;
create policy "gm_insert_self_owner_row"
on public.guild_members for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (select 1 from public.guilds g where g.id = guild_id and g.owner_id = auth.uid())
  and role = 'owner'
);

drop policy if exists "gm_update_owner_roles" on public.guild_members;
create policy "gm_update_owner_roles"
on public.guild_members for update
to authenticated
using (
  public.gm_user_has_role_in_guild(guild_id, array['owner']::text[])
  and guild_members.role <> 'owner'
)
with check (role in ('admin', 'member'));

drop policy if exists "gm_delete_owner_kick" on public.guild_members;
create policy "gm_delete_owner_kick"
on public.guild_members for delete
to authenticated
using (
  public.gm_user_has_role_in_guild(guild_id, array['owner']::text[])
  and guild_members.role <> 'owner'
);

drop policy if exists "gm_delete_admin_kick_member" on public.guild_members;
create policy "gm_delete_admin_kick_member"
on public.guild_members for delete
to authenticated
using (
  public.gm_user_has_role_in_guild(guild_id, array['admin']::text[])
  and guild_members.role = 'member'
);

drop policy if exists "gch_select_member" on public.guild_channels;
create policy "gch_select_member"
on public.guild_channels for select
to authenticated
using (public.gm_user_in_guild(guild_id));

drop policy if exists "gch_write_admin" on public.guild_channels;
create policy "gch_write_admin"
on public.guild_channels for insert
to authenticated
with check (public.gm_user_has_role_in_guild(guild_id, array['owner', 'admin']::text[]));

drop policy if exists "gch_update_admin" on public.guild_channels;
create policy "gch_update_admin"
on public.guild_channels for update
to authenticated
using (public.gm_user_has_role_in_guild(guild_id, array['owner', 'admin']::text[]));

drop policy if exists "gch_delete_admin" on public.guild_channels;
create policy "gch_delete_admin"
on public.guild_channels for delete
to authenticated
using (public.gm_user_has_role_in_guild(guild_id, array['owner', 'admin']::text[]));

drop policy if exists "gi_select_related" on public.guild_invites;
create policy "gi_select_related"
on public.guild_invites for select
to authenticated
using (
  invitee_id = auth.uid()
  or invited_by = auth.uid()
  or public.gm_user_has_role_in_guild(guild_id, array['owner', 'admin']::text[])
);

drop policy if exists "gi_insert_admin_friend" on public.guild_invites;
create policy "gi_insert_admin_friend"
on public.guild_invites for insert
to authenticated
with check (
  invited_by = auth.uid()
  and public.gm_user_has_role_in_guild(guild_id, array['owner', 'admin']::text[])
  and exists (
    select 1
    from public.friend_requests fr
    where fr.status = 'accepted'
      and (
        (fr.from_id = auth.uid() and fr.to_id = invitee_id)
        or (fr.to_id = auth.uid() and fr.from_id = invitee_id)
      )
  )
);

drop policy if exists "gi_update_invitee" on public.guild_invites;
create policy "gi_update_invitee"
on public.guild_invites for update
to authenticated
using (invitee_id = auth.uid() and status = 'pending')
with check (invitee_id = auth.uid());

drop policy if exists "gi_delete_inviter_pending" on public.guild_invites;
create policy "gi_delete_inviter_pending"
on public.guild_invites for delete
to authenticated
using (invited_by = auth.uid() and status = 'pending');

drop policy if exists "gmsg_select_member" on public.guild_messages;
create policy "gmsg_select_member"
on public.guild_messages for select
to authenticated
using (
  exists (
    select 1 from public.guild_channels ch
    where ch.id = guild_messages.channel_id
      and public.gm_user_in_guild(ch.guild_id)
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
      and public.gm_user_in_guild(ch.guild_id)
  )
);

create or replace function public.create_guild_with_defaults(p_name text)
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

  return gid;
end;
$$;

grant execute on function public.create_guild_with_defaults(text) to authenticated;

create or replace function public.accept_guild_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g_id uuid;
  inv uuid := auth.uid();
begin
  if inv is null then
    raise exception 'not_authenticated';
  end if;

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

grant execute on function public.accept_guild_invite(uuid) to authenticated;

create or replace function public.list_my_guild_memberships()
returns table (
  guild_id uuid,
  role text
)
language sql
security definer
set search_path = public
stable
as $$
  select gm.guild_id, gm.role
  from public.guild_members gm
  where gm.user_id = auth.uid();
$$;

grant execute on function public.list_my_guild_memberships() to authenticated;

-- ------------------------------------------------------------
-- STORAGE AVATARS (optionnel si bucket déjà configuré)
-- ------------------------------------------------------------
drop policy if exists "avatars_select_public" on storage.objects;
create policy "avatars_select_public"
on storage.objects for select
using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own_folder" on storage.objects;
create policy "avatars_insert_own_folder"
on storage.objects for insert
with check (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "avatars_update_own_folder" on storage.objects;
create policy "avatars_update_own_folder"
on storage.objects for update
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "avatars_delete_own_folder" on storage.objects;
create policy "avatars_delete_own_folder"
on storage.objects for delete
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- ------------------------------------------------------------
-- Realtime publication for DM messages
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dm_messages'
  ) then
    alter publication supabase_realtime add table public.dm_messages;
  end if;
end $$;

-- Utile après gros patch SQL:
-- select pg_notify('pgrst', 'reload schema');
