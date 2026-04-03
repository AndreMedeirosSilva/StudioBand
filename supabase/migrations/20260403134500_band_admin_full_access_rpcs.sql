create or replace function public.is_band_admin(p_band_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.band_memberships m
    where m.band_id = p_band_id
      and m.user_id = auth.uid()
      and m.role = 'admin'
  );
$$;

create or replace function public.admin_rename_band(p_band_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  v_name := nullif(trim(p_name), '');
  if v_name is null then
    raise exception 'empty_band_name';
  end if;
  if not public.is_band_admin(p_band_id) then
    raise exception 'not_admin';
  end if;
  update public.bands
  set name = v_name
  where id = p_band_id;
  if not found then
    raise exception 'band_not_found';
  end if;
end;
$$;

create or replace function public.admin_update_band_photo(p_band_id uuid, p_photo_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_band_admin(p_band_id) then
    raise exception 'not_admin';
  end if;
  update public.bands
  set photo_url = nullif(trim(p_photo_url), '')
  where id = p_band_id;
  if not found then
    raise exception 'band_not_found';
  end if;
end;
$$;

create or replace function public.admin_regenerate_band_invite(p_band_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  i int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_band_admin(p_band_id) then
    raise exception 'not_admin';
  end if;

  for i in 1..10 loop
    v_token := 'inv_' || encode(gen_random_bytes(12), 'hex');
    begin
      update public.bands
      set invite_token = v_token
      where id = p_band_id;
      if not found then
        raise exception 'band_not_found';
      end if;
      return v_token;
    exception
      when unique_violation then
        -- tenta de novo com outro token
        null;
    end;
  end loop;

  raise exception 'invite_generation_conflict';
end;
$$;

create or replace function public.admin_delete_band(p_band_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_band_admin(p_band_id) then
    raise exception 'not_admin';
  end if;
  delete from public.bands where id = p_band_id;
  if not found then
    raise exception 'band_not_found';
  end if;
end;
$$;

create or replace function public.list_band_members_for_admin(p_band_id uuid)
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
  if not public.is_band_admin(p_band_id) then
    raise exception 'not_admin';
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

create or replace function public.remove_band_member_for_admin(
  p_band_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_band_admin(p_band_id) then
    raise exception 'not_admin';
  end if;
  if exists (
    select 1 from public.bands b
    where b.id = p_band_id
      and b.primary_owner_user_id = p_user_id
  ) then
    raise exception 'cannot_remove_owner';
  end if;

  delete from public.band_memberships m
  where m.band_id = p_band_id
    and m.user_id = p_user_id;
  if not found then
    raise exception 'member_not_found';
  end if;
end;
$$;

create or replace function public.set_band_member_role_for_admin(
  p_band_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'invalid_role';
  end if;
  if not public.is_band_admin(p_band_id) then
    raise exception 'not_admin';
  end if;
  if exists (
    select 1 from public.bands b
    where b.id = p_band_id
      and b.primary_owner_user_id = p_user_id
  ) then
    raise exception 'owner_role_immutable';
  end if;

  update public.band_memberships m
  set role = p_role
  where m.band_id = p_band_id
    and m.user_id = p_user_id;
  if not found then
    raise exception 'member_not_found';
  end if;
end;
$$;

revoke all on function public.is_band_admin(uuid) from public;
grant execute on function public.is_band_admin(uuid) to authenticated;

revoke all on function public.admin_rename_band(uuid, text) from public;
grant execute on function public.admin_rename_band(uuid, text) to authenticated;

revoke all on function public.admin_update_band_photo(uuid, text) from public;
grant execute on function public.admin_update_band_photo(uuid, text) to authenticated;

revoke all on function public.admin_regenerate_band_invite(uuid) from public;
grant execute on function public.admin_regenerate_band_invite(uuid) to authenticated;

revoke all on function public.admin_delete_band(uuid) from public;
grant execute on function public.admin_delete_band(uuid) to authenticated;

revoke all on function public.list_band_members_for_admin(uuid) from public;
grant execute on function public.list_band_members_for_admin(uuid) to authenticated;

revoke all on function public.remove_band_member_for_admin(uuid, uuid) from public;
grant execute on function public.remove_band_member_for_admin(uuid, uuid) to authenticated;

revoke all on function public.set_band_member_role_for_admin(uuid, uuid, text) from public;
grant execute on function public.set_band_member_role_for_admin(uuid, uuid, text) to authenticated;

