-- Pièces jointes DM + salons (guild) : URL publique, métadonnées, expiration 24h (trigger).
-- Bucket Storage public lecture ; upload / suppression via service role (API serveur).
-- Après exécution : select pg_notify('pgrst', 'reload schema');

-- ------------------------------------------------------------
-- STORAGE: bucket public pour URLs dans <img> / liens
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-attachments', 'chat-attachments', true, 26214400)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = coalesce(excluded.file_size_limit, storage.buckets.file_size_limit);

drop policy if exists "chat_attachments_select_public" on storage.objects;
create policy "chat_attachments_select_public"
on storage.objects for select
to public
using (bucket_id = 'chat-attachments');

-- ------------------------------------------------------------
-- DM messages : colonnes + contrainte body / fichier
-- ------------------------------------------------------------
alter table public.dm_messages
  add column if not exists file_url text,
  add column if not exists file_name text,
  add column if not exists file_type text,
  add column if not exists file_storage_path text,
  add column if not exists expires_at timestamptz;

alter table public.dm_messages drop constraint if exists dm_messages_body_check;

alter table public.dm_messages
  add constraint dm_messages_body_or_file check (
    char_length(body) <= 2000
    and (
      (
        (file_url is null or btrim(file_url) = '')
        and length(btrim(body)) >= 1
      )
      or (file_url is not null and btrim(file_url) <> '')
    )
  );

-- Expiration fixée à l’insert (24h) ; pas recalculée à chaque update
create or replace function public.dm_messages_set_attachment_expiry()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.file_url is not null and btrim(new.file_url) <> '' then
      new.expires_at := (timezone('utc', now())) + interval '24 hours';
    else
      new.expires_at := null;
      new.file_name := null;
      new.file_type := null;
      new.file_storage_path := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists dm_messages_attachment_expiry on public.dm_messages;
create trigger dm_messages_attachment_expiry
before insert on public.dm_messages
for each row
execute function public.dm_messages_set_attachment_expiry();

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
  and (
    file_storage_path is null
    or split_part(file_storage_path, '/', 1) = auth.uid()::text
  )
  and (
    (file_url is null or btrim(file_url) = '')
    or (
      file_storage_path is not null
      and btrim(file_storage_path) <> ''
    )
  )
);

create index if not exists dm_messages_expires_at_idx
  on public.dm_messages (expires_at)
  where expires_at is not null;

alter table public.dm_messages replica identity full;

-- ------------------------------------------------------------
-- Guild messages : mêmes règles (insert côté serveur service role)
-- ------------------------------------------------------------
alter table public.guild_messages
  add column if not exists file_url text,
  add column if not exists file_name text,
  add column if not exists file_type text,
  add column if not exists file_storage_path text,
  add column if not exists expires_at timestamptz;

alter table public.guild_messages drop constraint if exists guild_messages_body_check;

alter table public.guild_messages
  add constraint guild_messages_body_or_file check (
    char_length(body) <= 2000
    and (
      (
        (file_url is null or btrim(file_url) = '')
        and length(btrim(body)) >= 1
      )
      or (file_url is not null and btrim(file_url) <> '')
    )
  );

create or replace function public.guild_messages_set_attachment_expiry()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.file_url is not null and btrim(new.file_url) <> '' then
      new.expires_at := (timezone('utc', now())) + interval '24 hours';
    else
      new.expires_at := null;
      new.file_name := null;
      new.file_type := null;
      new.file_storage_path := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guild_messages_attachment_expiry on public.guild_messages;
create trigger guild_messages_attachment_expiry
before insert on public.guild_messages
for each row
execute function public.guild_messages_set_attachment_expiry();

create index if not exists guild_messages_expires_at_idx
  on public.guild_messages (expires_at)
  where expires_at is not null;
