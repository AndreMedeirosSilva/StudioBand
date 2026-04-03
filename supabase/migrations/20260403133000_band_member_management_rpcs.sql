create or replace function public.remove_band_member_for_owner(
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

  if not exists (
    select 1
    from public.bands b
    where b.id = p_band_id
      and b.primary_owner_user_id = auth.uid()
  ) then
    raise exception 'not_owner';
  end if;

  if exists (
    select 1
    from public.bands b
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

create or replace function public.set_band_member_role_for_owner(
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

  if not exists (
    select 1
    from public.bands b
    where b.id = p_band_id
      and b.primary_owner_user_id = auth.uid()
  ) then
    raise exception 'not_owner';
  end if;

  if exists (
    select 1
    from public.bands b
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

create or replace function public.leave_band(p_band_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if exists (
    select 1
    from public.bands b
    where b.id = p_band_id
      and b.primary_owner_user_id = auth.uid()
  ) then
    raise exception 'owner_cannot_leave';
  end if;

  delete from public.band_memberships m
  where m.band_id = p_band_id
    and m.user_id = auth.uid();

  if not found then
    raise exception 'not_member';
  end if;
end;
$$;

revoke all on function public.remove_band_member_for_owner(uuid, uuid) from public;
grant execute on function public.remove_band_member_for_owner(uuid, uuid) to authenticated;

revoke all on function public.set_band_member_role_for_owner(uuid, uuid, text) from public;
grant execute on function public.set_band_member_role_for_owner(uuid, uuid, text) to authenticated;

revoke all on function public.leave_band(uuid) from public;
grant execute on function public.leave_band(uuid) to authenticated;

