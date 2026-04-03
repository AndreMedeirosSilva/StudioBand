-- Estudio Banda: perfis, bandas, membros, estúdios + RLS + convites.
-- Aplicar no Supabase: SQL Editor (todo o ficheiro) ou `supabase db push` / MCP `apply_migration`.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  primary_owner_user_id uuid not null references auth.users (id) on delete restrict,
  invite_token text not null unique,
  created_at timestamptz not null default now()
);

create index bands_primary_owner_idx on public.bands (primary_owner_user_id);

create table public.band_memberships (
  id uuid primary key default gen_random_uuid(),
  band_id uuid not null references public.bands (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  unique (band_id, user_id)
);

create index band_memberships_user_idx on public.band_memberships (user_id);
create index band_memberships_band_idx on public.band_memberships (band_id);

create table public.studios (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  address_line text,
  city text,
  default_price_per_hour_cents integer not null default 0,
  timezone text not null default 'Europe/Lisbon',
  created_at timestamptz not null default now()
);

create index studios_owner_idx on public.studios (owner_user_id);

-- ---------------------------------------------------------------------------
-- Perfil automático ao registar (Auth)
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Convites (RPC): pré-visualizar nome e entrar na banda com token
-- ---------------------------------------------------------------------------

create or replace function public.peek_invite_band_name(p_token text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select b.name::text
  from public.bands b
  where b.invite_token = nullif(trim(p_token), '')
  limit 1;
$$;

create or replace function public.join_band_by_invite(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select id into b_id
  from public.bands
  where invite_token = nullif(trim(p_token), '')
  limit 1;

  if b_id is null then
    raise exception 'invalid_invite';
  end if;

  if exists (
    select 1 from public.band_memberships m
    where m.band_id = b_id and m.user_id = auth.uid()
  ) then
    raise exception 'already_member';
  end if;

  insert into public.band_memberships (band_id, user_id, role)
  values (b_id, auth.uid(), 'member');
end;
$$;

grant execute on function public.peek_invite_band_name(text) to anon, authenticated;
grant execute on function public.join_band_by_invite(text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.bands enable row level security;
alter table public.band_memberships enable row level security;
alter table public.studios enable row level security;

-- profiles
create policy profiles_select_own on public.profiles for select using (id = auth.uid());
create policy profiles_update_own on public.profiles for update using (id = auth.uid());

-- bands: ver se és dono ou membro
create policy bands_select_member on public.bands for select using (
  primary_owner_user_id = auth.uid()
  or exists (
    select 1 from public.band_memberships m
    where m.band_id = bands.id and m.user_id = auth.uid()
  )
);

create policy bands_insert_owner on public.bands for insert
with check (primary_owner_user_id = auth.uid());

create policy bands_update_owner on public.bands for update
using (primary_owner_user_id = auth.uid());

create policy bands_delete_owner on public.bands for delete
using (primary_owner_user_id = auth.uid());

-- memberships
create policy memberships_select on public.band_memberships for select using (
  user_id = auth.uid()
);

create policy memberships_insert_admin on public.band_memberships for insert
with check (
  user_id = auth.uid()
  and role = 'admin'
  and exists (
    select 1 from public.bands b
    where b.id = band_id and b.primary_owner_user_id = auth.uid()
  )
);

-- studios
create policy studios_all_own on public.studios for all using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());
