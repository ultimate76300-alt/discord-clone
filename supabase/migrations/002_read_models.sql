-- Read-optimized RPC for guild/friend bootstrap screens.

create or replace function public.list_my_friend_requests()
returns table (
  id uuid,
  from_id uuid,
  to_id uuid,
  status text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select fr.id, fr.from_id, fr.to_id, fr.status, fr.created_at
  from public.friend_requests fr
  where fr.from_id = auth.uid() or fr.to_id = auth.uid()
  order by fr.created_at desc
  limit 500;
$$;

grant execute on function public.list_my_friend_requests() to authenticated;
