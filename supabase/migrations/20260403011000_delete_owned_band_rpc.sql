-- Remove uma banda do owner (e memberships) com SECURITY DEFINER.
-- Evita falhas de RLS ao excluir dados relacionados.

create or replace function public.delete_owned_band(p_band_id uuid)
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
    raise exception 'not_owner_or_band_not_found';
  end if;

  delete from public.band_memberships
  where band_id = p_band_id;

  delete from public.bands
  where id = p_band_id
    and primary_owner_user_id = auth.uid();
end;
$$;

revoke all on function public.delete_owned_band(uuid) from public;
revoke all on function public.delete_owned_band(uuid) from anon;
grant execute on function public.delete_owned_band(uuid) to authenticated;
