-- Colonnes optionnelles pour l’icône d’un serveur privé (client AtomVoice).
-- À exécuter une fois dans Supabase → SQL Editor si ta base a été créée avant cette fonctionnalité.
alter table public.guilds add column if not exists icon_url text;
alter table public.guilds add column if not exists icon_brand_key text;
