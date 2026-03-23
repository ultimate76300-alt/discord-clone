-- =====================================================================
-- Liste fiable des serveurs privés pour l’utilisateur connecté (JWT).
-- Contourne les soucis de RLS sur SELECT guild_members au rechargement.
--
-- Exécute UNE FOIS dans Supabase → SQL Editor → Run.
-- Puis : Settings → API → « Reload schema » ou redémarre le projet si besoin.
-- =====================================================================

create or replace function public.list_my_guild_memberships ()
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

grant execute on function public.list_my_guild_memberships () to authenticated;
