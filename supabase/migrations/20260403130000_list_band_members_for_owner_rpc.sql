create or replace function public.list_band_members_for_owner(p_band_id uuid)
returns table (
  user_id uuid,
  role text,
  joined_at timestamptz,
  display_name text,
  email text
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1
    from public.bands b
    where b.id = p_band_id
      and b.primary_owner_user_id = auth.uid()
  ) then
    raise exception 'not_owner';
  end if;

  return query
  select
    m.user_id,
    m.role,
    m.joined_at,
    p.display_name,
    u.email::text
  from public.band_memberships m
  left join public.profiles p on p.id = m.user_id
  left join auth.users u on u.id = m.user_id
  where m.band_id = p_band_id
  order by
    case when m.role = 'admin' then 0 else 1 end,
    m.joined_at asc;
end;
$$;

revoke all on function public.list_band_members_for_owner(uuid) from public;
grant execute on function public.list_band_members_for_owner(uuid) to authenticated;

