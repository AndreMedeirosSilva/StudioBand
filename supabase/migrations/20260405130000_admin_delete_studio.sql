-- Permite excluir estúdio com a mesma regra de administração (owner/admin).

create or replace function public.admin_delete_studio(p_studio_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (select 1 from public.studios s where s.id = p_studio_id) then
    raise exception 'studio_not_found';
  end if;

  if not public.is_studio_admin(p_studio_id) then
    raise exception 'not_admin';
  end if;

  delete from public.studios s
  where s.id = p_studio_id;
end;
$$;

revoke all on function public.admin_delete_studio(uuid) from public;
grant execute on function public.admin_delete_studio(uuid) to authenticated;

