create or replace function public.list_public_studios_for_booking()
returns table (
  studio_id uuid,
  studio_name text,
  address_line text,
  photo_url text
)
language sql
security definer
set search_path = public
as $$
  select
    s.id as studio_id,
    s.name::text as studio_name,
    nullif(trim(s.address_line), '')::text as address_line,
    nullif(trim(s.photo_url), '')::text as photo_url
  from public.studios s
  where nullif(trim(s.name), '') is not null
  order by s.created_at desc;
$$;

revoke all on function public.list_public_studios_for_booking() from public;
grant execute on function public.list_public_studios_for_booking() to authenticated;
