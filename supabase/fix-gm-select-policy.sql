-- =====================================================================
-- Correctif obligatoire si tes serveurs privés disparaissent après F5 / reconnexion
-- alors que les lignes existent dans guild_members (Table Editor).
--
-- Exécute UNE FOIS dans Supabase → SQL Editor → Run.
-- =====================================================================

drop policy if exists "gm_select_same_guild" on public.guild_members;

create policy "gm_select_same_guild"
on public.guild_members for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.guild_members me
    where me.guild_id = guild_members.guild_id
      and me.user_id = auth.uid()
  )
);
