-- ----------------------------------------------------------------------------
-- Profils : pseudo unique au format "username@XYZ" (XYZ = 3 chiffres).
-- Le suffixe est généré aléatoirement côté Supabase via un RPC.
--
-- Ce fichier doit être exécuté dans Supabase (SQL Editor) après avoir créé
-- la table `public.profiles` (voir supabase/friends-dm.sql).
-- ----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists username_base text;

alter table public.profiles
  add column if not exists username_tag integer;

alter table public.profiles
  add column if not exists username_handle text;

-- Unicité stricte uniquement quand le handle est rempli.
-- (Les anciens profils ont username_handle = NULL => multiples NULL autorisés.)
create unique index if not exists profiles_unique_username_handle
  on public.profiles (username_handle)
  where username_handle is not null;

-- Génère / assigne un handle unique pour le profil courant.
-- Retourne le handle final (ex: "desyntoxs@134").
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
  -- Nettoyage minimal : on garde lettres/chiffres/underscore uniquement.
  base_norm := regexp_replace(base_norm, '[^a-z0-9_]+', '', 'g');

  if base_norm is null or length(base_norm) < 1 or length(base_norm) > 32 then
    raise exception 'invalid_username_base';
  end if;

  -- Profil existant et base identique : on conserve le handle.
  select username_handle
    into existing_handle
  from public.profiles
  where id = me
    and username_base = base_norm
    and username_handle is not null;

  if existing_handle is not null then
    return existing_handle;
  end if;

  -- Assure que la ligne existe (sinon insert).
  insert into public.profiles (id, display_name, username_base, username_tag, username_handle)
  values (me, '', base_norm, null, null)
  on conflict (id) do nothing;

  -- Tentatives aléatoires : collisions rares, mais l'unicité est garantie par l'index.
  for attempt in 1..50 loop
    tag := floor(random() * 1000)::int; -- 0..999
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

      -- Si update n'a rien trouvé (profil absent), on insert.
      if not found then
        insert into public.profiles (id, display_name, username_base, username_tag, username_handle, updated_at)
        values (me, handle, base_norm, tag, handle, now());
      end if;

      return handle;
    exception
      when unique_violation then
        -- Handle déjà pris : on retente.
        null;
    end;
  end loop;

  -- Fallback déterministe (si collisions/ranit) : première valeur libre.
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

