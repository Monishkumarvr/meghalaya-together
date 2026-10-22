-- Meghalaya Together: two-member trip with row-level security.
-- Run the ENTIRE script in Supabase SQL Editor (role: postgres). Safe to rerun if setup was interrupted. No credentials are stored here.
create extension if not exists pgcrypto;

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Meghalaya Together',
  invite_token uuid not null unique default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.trip_members (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key(trip_id,user_id)
);
create table if not exists public.trip_kv (
  trip_id uuid not null references public.trips(id) on delete cascade,
  key text not null check(length(key) between 1 and 180),
  value jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() references auth.users(id),
  primary key(trip_id,key)
);
create index if not exists trip_members_by_user on public.trip_members(user_id);

alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_kv enable row level security;

-- Each account can only read its own membership entry. SECURITY DEFINER RPCs
-- create the membership records; clients cannot add members directly.
drop policy if exists "members read own membership" on public.trip_members;
create policy "members read own membership" on public.trip_members
  for select to authenticated using (user_id=(select auth.uid()));

drop policy if exists "trips readable by members" on public.trips;
create policy "trips readable by members" on public.trips
  for select to authenticated using (
    exists (select 1 from public.trip_members m
            where m.trip_id=id and m.user_id=(select auth.uid()))
  );

drop policy if exists "trip kv select for members" on public.trip_kv;
create policy "trip kv select for members" on public.trip_kv
  for select to authenticated using (
    exists (select 1 from public.trip_members m
            where m.trip_id=trip_kv.trip_id and m.user_id=(select auth.uid()))
  );
drop policy if exists "trip kv insert for members" on public.trip_kv;
create policy "trip kv insert for members" on public.trip_kv
  for insert to authenticated with check (
    updated_by=(select auth.uid()) and
    exists (select 1 from public.trip_members m
            where m.trip_id=trip_kv.trip_id and m.user_id=(select auth.uid()))
  );
drop policy if exists "trip kv update for members" on public.trip_kv;
create policy "trip kv update for members" on public.trip_kv
  for update to authenticated using (
    exists (select 1 from public.trip_members m
            where m.trip_id=trip_kv.trip_id and m.user_id=(select auth.uid()))
  ) with check (
    updated_by=(select auth.uid()) and
    exists (select 1 from public.trip_members m
            where m.trip_id=trip_kv.trip_id and m.user_id=(select auth.uid()))
  );
-- Deleting KV rows is unnecessary: clients write a JSON null tombstone.

-- The role creating the trip also becomes its initial member.
create or replace function public.create_trip(p_title text default 'Meghalaya Together')
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 insert into public.trips(title,created_by)
 values (left(coalesce(nullif(trim(p_title),''),'Meghalaya Together'),100),auth.uid())
 returning id into new_id;
 insert into public.trip_members(trip_id,user_id) values(new_id,auth.uid());
 return new_id;
end;
$$;

-- Possession of a secret UUID invitation + Supabase login permits joining.
-- Lock the trip row to prevent simultaneous invitation uses from exceeding 2 members.
create or replace function public.join_trip(p_token uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare matched_id uuid; member_count integer;
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 select t.id into matched_id from public.trips t
 where t.invite_token=p_token for update;
 if matched_id is null then raise exception 'Invalid invitation';end if;
 if exists(select 1 from public.trip_members where trip_id=matched_id and user_id=auth.uid()) then
  return matched_id;
 end if;
 select count(*) into member_count from public.trip_members where trip_id=matched_id;
 if member_count>=2 then raise exception 'This trip already has two members';end if;
 insert into public.trip_members(trip_id,user_id) values(matched_id,auth.uid());
 return matched_id;
end;
$$;

revoke all on public.trips from anon;
revoke all on public.trip_members from anon;
revoke all on public.trip_kv from anon;
grant usage on schema public to authenticated;
grant select on public.trips to authenticated;
grant select on public.trip_members to authenticated;
grant select,insert,update on public.trip_kv to authenticated;
revoke all on function public.create_trip(text) from public,anon;
revoke all on function public.join_trip(uuid) from public,anon;
grant execute on function public.create_trip(text) to authenticated;
grant execute on function public.join_trip(uuid) to authenticated;

-- Enable INSERT/UPDATE broadcasts idempotently. Does not duplicate an existing publication member.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'trip_kv'
     )
  then
    alter publication supabase_realtime add table public.trip_kv;
  end if;
end;
$$;

-- Expected: all three columns report a table name, not NULL.
select to_regclass('public.trips') as trips,
       to_regclass('public.trip_members') as trip_members,
       to_regclass('public.trip_kv') as trip_kv;
