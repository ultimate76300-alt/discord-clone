-- À exécuter dans Supabase → SQL Editor si les tables guild_* existent déjà mais l’erreur
-- « Could not find the function public.create_guild_with_defaults(p_name) » apparaît.
-- Puis : Database → (optionnel) recharger le schéma, ou attendre ~1 min.

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

-- Politique utile si tu crées un serveur sans RPC (fallback client)
drop policy if exists "guilds_select_owner" on public.guilds;
create policy "guilds_select_owner"
on public.guilds for select
to authenticated
using (owner_id = auth.uid());

select pg_notify('pgrst', 'reload schema');
