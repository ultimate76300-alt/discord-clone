-- À exécuter une fois sur une base déjà déployée : nouveaux serveurs sans salons par défaut.
-- (Les serveurs existants ne sont pas modifiés.)

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

  return gid;
end;
$$;
