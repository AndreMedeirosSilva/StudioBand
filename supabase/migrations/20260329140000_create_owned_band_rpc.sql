-- Cria banda + primeira membership (admin) num único passo com SECURITY DEFINER,
-- evitando falhas de RLS ao inserir em band_memberships logo após criar a banda.

create or replace function public.create_owned_band(p_name text, p_invite_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  trimmed_name text;
  trimmed_token text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  trimmed_name := nullif(trim(p_name), '');
  trimmed_token := nullif(trim(p_invite_token), '');

  if trimmed_name is null then
    raise exception 'empty_band_name';
  end if;
  if trimmed_token is null then
    raise exception 'empty_invite_token';
  end if;

  if exists (
    select 1 from public.bands
    where primary_owner_user_id = auth.uid()
    limit 1
  ) then
    raise exception 'already_has_owned_band';
  end if;

  insert into public.bands (name, primary_owner_user_id, invite_token)
  values (trimmed_name, auth.uid(), trimmed_token)
  returning id into new_id;

  insert into public.band_memberships (band_id, user_id, role)
  values (new_id, auth.uid(), 'admin');

  return new_id;
end;
$$;

revoke all on function public.create_owned_band(text, text) from public;
grant execute on function public.create_owned_band(text, text) to authenticated;
