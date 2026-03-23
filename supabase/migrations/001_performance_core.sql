-- Core performance indexes for high-traffic reads/writes.

create index if not exists friend_requests_from_status_idx
  on public.friend_requests (from_id, status, created_at desc);

create index if not exists friend_requests_to_status_idx
  on public.friend_requests (to_id, status, created_at desc);

create index if not exists friend_requests_pair_status_idx
  on public.friend_requests (from_id, to_id, status);

create index if not exists guild_members_user_guild_idx
  on public.guild_members (user_id, guild_id, role);

create index if not exists guild_members_guild_role_idx
  on public.guild_members (guild_id, role, user_id);

create index if not exists guild_invites_invitee_status_idx
  on public.guild_invites (invitee_id, status, created_at desc);

create index if not exists guild_invites_guild_status_idx
  on public.guild_invites (guild_id, status, invitee_id);

create index if not exists guild_channels_guild_kind_position_idx
  on public.guild_channels (guild_id, kind, position);

create index if not exists guild_messages_channel_created_desc_idx
  on public.guild_messages (channel_id, created_at desc);

create index if not exists dm_messages_conversation_created_desc_idx
  on public.dm_messages (conversation_id, created_at desc);

create index if not exists profiles_display_name_idx
  on public.profiles (display_name);
