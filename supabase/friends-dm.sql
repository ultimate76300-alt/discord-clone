-- Exécuter dans Supabase → SQL Editor (une fois).
-- Puis : Database → Replication → activer supabase_realtime pour la table public.dm_messages

-- Profils (synchronisés depuis l’app au login)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_auth"
on public.profiles for select
to authenticated
using (true);

create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (auth.uid() = id);

-- Demandes d’amitié (une ligne par couple directionnel)
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references auth.users (id) on delete cascade,
  to_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  check (from_id <> to_id),
  unique (from_id, to_id)
);

create index if not exists friend_requests_to_pending
  on public.friend_requests (to_id) where status = 'pending';

alter table public.friend_requests enable row level security;

create policy "fr_select_participants"
on public.friend_requests for select
to authenticated
using (from_id = auth.uid() or to_id = auth.uid());

create policy "fr_insert_from_self"
on public.friend_requests for insert
to authenticated
with check (from_id = auth.uid() and from_id <> to_id);

create policy "fr_update_recipient_pending"
on public.friend_requests for update
to authenticated
using (to_id = auth.uid() and status = 'pending')
with check (to_id = auth.uid());

create policy "fr_cancel_own_outgoing"
on public.friend_requests for delete
to authenticated
using (from_id = auth.uid() and status = 'pending');

create policy "fr_delete_recipient_pending"
on public.friend_requests for delete
to authenticated
using (to_id = auth.uid() and status = 'pending');

-- Conversations privées (paire normalisée)
create table if not exists public.dm_conversations (
  id uuid primary key default gen_random_uuid(),
  user_low uuid not null references auth.users (id) on delete cascade,
  user_high uuid not null references auth.users (id) on delete cascade,
  check (user_low < user_high),
  unique (user_low, user_high)
);

alter table public.dm_conversations enable row level security;

create policy "dm_conv_select_member"
on public.dm_conversations for select
to authenticated
using (user_low = auth.uid() or user_high = auth.uid());

create policy "dm_conv_insert_member"
on public.dm_conversations for insert
to authenticated
with check (
  (user_low = auth.uid() or user_high = auth.uid())
  and user_low < user_high
);

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

-- Crée ou retourne la conversation DM si les deux sont amis (accepted)
create or replace function public.get_or_create_dm (other_user_id uuid)
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

grant execute on function public.get_or_create_dm (uuid) to authenticated;

-- Dashboard → Database → Replication : activer la publication « supabase_realtime » pour public.dm_messages
