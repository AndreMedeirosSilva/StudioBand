-- Ferramentas de administração de sócios do estúdio (lista e remoção).

create or replace function public.list_studio_members_for_admin(p_studio_id uuid)
returns table (
  user_id uuid,
  role text,
  joined_at timestamptz,
  display_name text,
  email text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    sm.user_id,
    sm.role,
    sm.joined_at,
    p.display_name,
    u.email::text
  from public.studio_memberships sm
  join public.studios s
    on s.id = sm.studio_id
  left join public.profiles p
    on p.id = sm.user_id
  left join auth.users u
    on u.id = sm.user_id
  where sm.studio_id = p_studio_id
    and public.is_studio_admin(p_studio_id)
  order by
    case when sm.user_id = s.owner_user_id then 0 else 1 end,
    sm.joined_at asc;
$$;

create or replace function public.remove_studio_member_for_admin(
  p_studio_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_studio_admin(p_studio_id) then
    raise exception 'not_admin';
  end if;

  select s.owner_user_id
    into v_owner_user_id
  from public.studios s
  where s.id = p_studio_id;

  if v_owner_user_id is null then
    raise exception 'studio_not_found';
  end if;
  if p_user_id = v_owner_user_id then
    raise exception 'cannot_remove_owner';
  end if;

  delete from public.studio_memberships sm
  where sm.studio_id = p_studio_id
    and sm.user_id = p_user_id;

  if not found then
    raise exception 'member_not_found';
  end if;
end;
$$;

grant execute on function public.list_studio_members_for_admin(uuid) to authenticated;
grant execute on function public.remove_studio_member_for_admin(uuid, uuid) to authenticated;
