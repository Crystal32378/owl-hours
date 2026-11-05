-- A new business starts at the placeholder point (0, 0); saving its service
-- area moves the business there too, so customers near it can find it.
-- Each test runs in its own transaction and rolls back.
-- Seed ids: Northside 1..01 (owner Mario 2..01), Eastside 1..02. New owner Ana 2..a1.
\set ON_ERROR_STOP 1
\set mario '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}'
\set ana '{"sub":"20000000-0000-4000-8000-0000000000a1","role":"authenticated"}'

\echo '# saving the area of a new business sets its location, so a nearby customer finds it'
begin;
select set_config('test.eastside_location',
  (select location::text from public.tenants where id = '10000000-0000-4000-8000-000000000002'), true) \g /dev/null
insert into auth.users (id, email) values ('20000000-0000-4000-8000-0000000000a1', 'ana@example.test');
set local role authenticated;
set local request.jwt.claims to :'ana';
do $$
declare
  created jsonb := public.owner_create_business('Ana Locks', 'locksmith');
  saved jsonb;
begin
  assert not (created ->> 'hasLocation')::boolean, 'a new business has no real location yet';
  perform public.owner_update_business(p_taking_requests => true, p_night_jobs => true);
  saved := public.owner_save_area(20.97, -89.62, 10);
  assert (saved ->> 'hasLocation')::boolean, 'the saved area gives the business its location';
  perform set_config('test.ana_business', saved ->> 'id', true);
end $$;
reset role;
do $$
declare ana uuid := current_setting('test.ana_business')::uuid;
begin
  assert (select extensions.st_equals(location::extensions.geometry, private.geo_point(20.97, -89.62)::extensions.geometry)
          from public.tenants where id = ana), 'location is the area centre';
  assert ana in (select tenant_id from public.search_directory('locksmith', 20.98, -89.63)),
    'a customer nearby finds the business';
  assert (select location::text from public.tenants where id = '10000000-0000-4000-8000-000000000002')
         = current_setting('test.eastside_location'), 'Eastside location untouched';
end $$;
rollback;

\echo '# an owner with a real location reads it as set, and saving moves only their business'
begin;
select set_config('test.eastside_location',
  (select location::text from public.tenants where id = '10000000-0000-4000-8000-000000000002'), true) \g /dev/null
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$
begin
  assert (public.owner_business() ->> 'hasLocation')::boolean, 'the seeded business has a real location';
  perform public.owner_save_area(21.2, -86.9, 12.5);
end $$;
reset role;
do $$ begin
  assert (select extensions.st_equals(location::extensions.geometry, private.geo_point(21.2, -86.9)::extensions.geometry)
          from public.tenants where id = '10000000-0000-4000-8000-000000000001'), 'Northside moved to the new centre';
  assert (select location::text from public.tenants where id = '10000000-0000-4000-8000-000000000002')
         = current_setting('test.eastside_location'), 'Eastside location untouched';
end $$;
rollback;

\echo '# a radius-only save at the placeholder never overwrites a real location'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$ begin
  perform public.owner_save_area(0, 0, 9);
  assert (public.owner_business() ->> 'hasLocation')::boolean, 'Northside keeps its real location';
end $$;
reset role;
do $$ begin
  assert (select not extensions.st_equals(location::extensions.geometry, private.geo_point(0, 0)::extensions.geometry)
          from public.tenants where id = '10000000-0000-4000-8000-000000000001'), 'location is not the placeholder';
end $$;
rollback;

\echo '# the stored location is rounded to about 110 m, not the exact device fix'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$ begin perform public.owner_save_area(21.161987, -86.851543, 5); end $$;
reset role;
do $$ begin
  assert (select extensions.st_equals(location::extensions.geometry, private.geo_point(21.162, -86.852)::extensions.geometry)
          from public.tenants where id = '10000000-0000-4000-8000-000000000001'), 'location rounded to 3 decimals';
  assert (select extensions.st_equals(center::extensions.geometry, private.geo_point(21.162, -86.852)::extensions.geometry)
          from public.service_areas where tenant_id = '10000000-0000-4000-8000-000000000001'), 'area centre rounded too';
end $$;
rollback;
