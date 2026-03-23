-- À utiliser seulement si l’exécution de private-guilds.sql a échoué sur `profiles`
-- et que la table guild_messages existe encore avec une mauvaise FK.
-- Sinon, supprime les tables guild_* et relance private-guilds.sql à jour.

alter table public.guild_messages
  drop constraint if exists guild_messages_sender_id_fkey;

alter table public.guild_messages
  add constraint guild_messages_sender_id_fkey
  foreign key (sender_id) references auth.users (id) on delete cascade;
