-- Corrige geração de token de convite de estúdio sem depender de gen_random_bytes.

create or replace function public.studio_new_invite_token()
returns text
language sql
volatile
set search_path = public
as $$
  select
    'inv_' ||
    substr(
      md5(
        random()::text || '|' ||
        clock_timestamp()::text || '|' ||
        coalesce(auth.uid()::text, 'system')
      ),
      1,
      20
    );
$$;

update public.studios
set invite_token = public.studio_new_invite_token()
where invite_token is null or length(trim(invite_token)) = 0;

create or replace function public.admin_upsert_my_studio(
  p_name text,
  p_address_line text,
  p_photo_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_studio_id uuid;
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select s.id into v_studio_id
  from public.studios s
  where s.owner_user_id = auth.uid()
     or exists (
       select 1
       from public.studio_memberships sm
       where sm.studio_id = s.id
         and sm.user_id = auth.uid()
         and sm.role = 'admin'
     )
  order by s.created_at asc
  limit 1;

  if v_studio_id is null then
    loop
      v_token := public.studio_new_invite_token();
      begin
        insert into public.studios (owner_user_id, name, address_line, photo_url, invite_token, default_price_per_hour_cents, timezone)
        values (
          auth.uid(),
          coalesce(nullif(trim(p_name), ''), 'Meu estúdio'),
          nullif(trim(p_address_line), ''),
          nullif(trim(p_photo_url), ''),
          v_token,
          9000,
          'America/Sao_Paulo'
        )
        returning id into v_studio_id;
        exit;
      exception when unique_violation then
        continue;
      end;
    end loop;
  else
    if not public.is_studio_admin(v_studio_id) then
      raise exception 'not_admin';
    end if;
    update public.studios s
    set
      name = coalesce(nullif(trim(p_name), ''), s.name),
      address_line = nullif(trim(p_address_line), ''),
      photo_url = nullif(trim(p_photo_url), '')
    where s.id = v_studio_id;
  end if;

  insert into public.studio_memberships (studio_id, user_id, role)
  values (v_studio_id, auth.uid(), 'admin')
  on conflict (studio_id, user_id) do update
    set role = 'admin';

  return v_studio_id;
end;
$$;

create or replace function public.admin_regenerate_studio_invite(p_studio_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_studio_admin(p_studio_id) then
    raise exception 'not_admin';
  end if;

  for i in 1..10 loop
    v_token := public.studio_new_invite_token();
    begin
      update public.studios s
      set invite_token = v_token
      where s.id = p_studio_id;
      return v_token;
    exception when unique_violation then
      continue;
    end;
  end loop;

  raise exception 'invite_generation_conflict';
end;
$$;

