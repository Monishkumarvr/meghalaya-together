-- Meghalaya Together: read-only setup verification.
-- Expect each table to exist, RLS = true, both RPC functions to exist.
select current_database() as database_name, current_user as sql_role,
       to_regclass('public.trips') as trips,
       to_regclass('public.trip_members') as trip_members,
       to_regclass('public.trip_kv') as trip_kv,
       to_regprocedure('public.create_trip(text)') as create_trip_rpc,
       to_regprocedure('public.join_trip(uuid)') as join_trip_rpc;

select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity as rls_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname='public' and c.relname in ('trips','trip_members','trip_kv')
 order by c.relname;
