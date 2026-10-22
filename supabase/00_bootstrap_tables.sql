-- Meghalaya Together: table bootstrap ONLY.
-- Run in Supabase SQL Editor as postgres. Safe on a fresh or partially initialized project.
-- It does NOT install policies or RPCs: run schema.sql in full AFTER this script.
-- Does not delete existing data.

begin;
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
  primary key (trip_id, user_id)
);

create table if not exists public.trip_kv (
  trip_id uuid not null references public.trips(id) on delete cascade,
  key text not null check (length(key) between 1 and 180),
  value jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() references auth.users(id),
  primary key (trip_id, key)
);

create index if not exists trip_members_by_user on public.trip_members(user_id);

-- Deny direct API access until schema.sql has installed the proper member-only policies.
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_kv enable row level security;
commit;

select to_regclass('public.trips') as trips,
       to_regclass('public.trip_members') as trip_members,
       to_regclass('public.trip_kv') as trip_kv;
