-- Estúdios com convite e administradores (modelo parecido com bandas).

create extension if not exists "pgcrypto";

alter table public.studios
  add column if not exists invite_token text,
  add column if not exists photo_url text;

update public.studios
set invite_token = coalesce(invite_token, 'inv_' || encode(gen_random_bytes(10), 'hex'))
where invite_token is null or length(trim(invite_token)) = 0;

alter table public.studios
  alter column invite_token set not null;

create unique index if not exists studios_invite_token_idx on public.studios(invite_token);

create table if not exists public.studio_memberships (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin')),
  joined_at timestamptz not null default now(),
  unique (studio_id, user_id)
);

create index if not exists studio_memberships_user_idx on public.studio_memberships(user_id);
create index if not exists studio_memberships_studio_idx on public.studio_memberships(studio_id);

insert into public.studio_memberships (studio_id, user_id, role)
select s.id, s.owner_user_id, 'admin'
from public.studios s
where not exists (
  select 1
  from public.studio_memberships sm
  where sm.studio_id = s.id
    and sm.user_id = s.owner_user_id
);

alter table public.studio_memberships enable row level security;

drop policy if exists studio_memberships_select_own on public.studio_memberships;
create policy studio_memberships_select_own
on public.studio_memberships
for select
using (user_id = auth.uid());

create or replace function public.is_studio_admin(p_studio_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.studios s
    where s.id = p_studio_id
      and (
        s.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.studio_memberships sm
          where sm.studio_id = s.id
            and sm.user_id = auth.uid()
            and sm.role = 'admin'
        )
      )
  );
$$;

create or replace function public.peek_invite_studio_name(p_token text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select s.name::text
  from public.studios s
  where s.invite_token = nullif(trim(p_token), '')
  limit 1;
$$;

create or replace function public.join_studio_by_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_studio_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select s.id into v_studio_id
  from public.studios s
  where s.invite_token = nullif(trim(p_token), '')
  limit 1;

  if v_studio_id is null then
    raise exception 'invalid_invite';
  end if;

  if exists (
    select 1
    from public.studio_memberships sm
    where sm.studio_id = v_studio_id
      and sm.user_id = auth.uid()
  ) then
    raise exception 'already_member';
  end if;

  insert into public.studio_memberships (studio_id, user_id, role)
  values (v_studio_id, auth.uid(), 'admin');

  return v_studio_id;
end;
$$;

create or replace function public.get_managed_studio_summary()
returns table (
  studio_id uuid,
  studio_name text,
  address_line text,
  photo_url text,
  invite_token text,
  is_owner boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select
    s.id as studio_id,
    s.name as studio_name,
    s.address_line,
    s.photo_url,
    s.invite_token,
    (s.owner_user_id = auth.uid()) as is_owner
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
$$;

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
      v_token := 'inv_' || encode(gen_random_bytes(10), 'hex');
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
    v_token := 'inv_' || encode(gen_random_bytes(10), 'hex');
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

grant execute on function public.peek_invite_studio_name(text) to anon, authenticated;
grant execute on function public.join_studio_by_invite(text) to authenticated;
grant execute on function public.get_managed_studio_summary() to authenticated;
grant execute on function public.admin_upsert_my_studio(text, text, text) to authenticated;
grant execute on function public.admin_regenerate_studio_invite(uuid) to authenticated;
