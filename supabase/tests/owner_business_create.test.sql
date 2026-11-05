-- Onboarding creates the caller's business: owner_create_business makes the
-- tenant and the owner membership once, and later calls update that same
-- business. Each test runs in its own transaction and rolls back.
-- Seed ids: Northside 1..01 (owner Mario 2..01), Eastside 1..02 (owner 2..02).
-- New owners Ana 2..a1 and Ben 2..b1 sign up inside each test.
\set ON_ERROR_STOP 1
\set mario '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}'
\set eastside '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}'
\set ana '{"sub":"20000000-0000-4000-8000-0000000000a1","role":"authenticated"}'
\set ben '{"sub":"20000000-0000-4000-8000-0000000000b1","role":"authenticated"}'

\echo '# a new owner creates their business with every required column filled'
begin;
insert into auth.users (id, email) values ('20000000-0000-4000-8000-0000000000a1', 'ana@example.test');
set local role authenticated;
set local request.jwt.claims to :'ana';
do $$
declare b jsonb := public.owner_create_business('Ana''s Locksmith & Keys', 'locksmith', 'https://ana.example', 'Ana Ruiz');
begin
  assert b ->> 'name' = 'Ana''s Locksmith & Keys', 'name';
  assert b ->> 'shortName' = 'Ana''s', 'short name is the first word';
  assert b ->> 'category' = 'locksmith', 'category';
  assert b ->> 'website' = 'https://ana.example', 'website';
  assert b -> 'prices' = '[]'::jsonb and b -> 'fees' = '[]'::jsonb and b -> 'hours' = '[]'::jsonb, 'nothing priced yet';
  assert b -> 'area' = 'null'::jsonb, 'no service area yet';
  assert not (b ->> 'takingRequests')::boolean, 'not taking requests until the owner switches it on';
  assert public.owner_business() ->> 'id' = b ->> 'id', 'GET /business reads the new business';
end $$;
reset role;
do $$
declare t public.tenants;
begin
  select * into t from public.tenants
  where id = (select tenant_id from public.tenant_users where user_id = '20000000-0000-4000-8000-0000000000a1');
  assert t.slug ~ '^anas-locksmith-keys-[a-z0-9]{6}$', 'slug from the name plus a suffix: ' || t.slug;
  assert t.timezone = 'UTC', 'default timezone';
  assert t.location is not null, 'placeholder location';
  assert (select role from public.tenant_users where tenant_id = t.id) = 'owner', 'the caller owns it';
  assert (select display_name from public.tenant_users where tenant_id = t.id) = 'Ana Ruiz', 'owner display name';
end $$;
rollback;

\echo '# a second call updates the same business instead of creating another'
begin;
insert into auth.users (id, email) values ('20000000-0000-4000-8000-0000000000a1', 'ana@example.test');
set local role authenticated;
set local request.jwt.claims to :'ana';
do $$
declare
  first jsonb := public.owner_create_business('Ana Locks', 'locksmith', null, 'Ana');
  second jsonb := public.owner_create_business('Ana Locks & Keys', 'locksmith', 'https://ana.example', 'Ana');
begin
  assert second ->> 'id' = first ->> 'id', 'same business';
  assert second ->> 'name' = 'Ana Locks & Keys', 'name updated';
  assert second ->> 'website' = 'https://ana.example', 'website updated';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.tenant_users where user_id = '20000000-0000-4000-8000-0000000000a1') = 1,
    'one membership';
end $$;
rollback;

\echo '# an existing owner updates their business and creates none'
begin;
select set_config('test.tenants_before', (select count(*) from public.tenants)::text, true) \g /dev/null
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$
declare b jsonb := public.owner_create_business('Northside Plumbing Co', 'plumbing', '', 'Mario');
begin
  assert b ->> 'id' = '10000000-0000-4000-8000-000000000001', 'Northside';
  assert b ->> 'name' = 'Northside Plumbing Co', 'renamed';
  assert b ->> 'shortName' = 'Northside', 'short name kept';
  assert b -> 'website' = 'null'::jsonb, 'empty website clears it';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.tenants) = current_setting('test.tenants_before')::bigint, 'no new tenant';
  assert (select display_name from public.tenant_users
          where user_id = '20000000-0000-4000-8000-000000000001') = 'Mario R.', 'membership untouched';
end $$;
rollback;

\echo '# an existing owner keeps the category customers search by'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$
declare b jsonb := public.owner_create_business('Northside Plumbing', 'locksmith');
begin
  assert b ->> 'category' = 'plumbing', 'owners cannot change the category, as the column grant says';
end $$;
rollback;

\echo '# another owner neither sees nor changes the new business'
begin;
insert into auth.users (id, email) values
  ('20000000-0000-4000-8000-0000000000a1', 'ana@example.test'),
  ('20000000-0000-4000-8000-0000000000b1', 'ben@example.test');
set local role authenticated;
set local request.jwt.claims to :'ana';
do $$ begin
  perform set_config('test.ana_business', public.owner_create_business('Ana Locks', 'locksmith') ->> 'id', true);
end $$;
set local request.jwt.claims to :'ben';
do $$
declare
  ana uuid := current_setting('test.ana_business')::uuid;
  b jsonb := public.owner_create_business('Ben Electric', 'electrician');
begin
  assert (b ->> 'id')::uuid <> ana, 'Ben gets his own business';
  assert (select count(*) from public.tenant_users where tenant_id = ana) = 0, 'Ben cannot list Ana''s members';
  perform public.owner_update_business(p_name => 'Taken over');
  update public.tenants set name = 'Taken over' where id = ana;
end $$;
set local request.jwt.claims to :'eastside';
do $$ begin
  perform public.owner_create_business('Eastside again', 'plumbing');
end $$;
reset role;
do $$
declare ana uuid := current_setting('test.ana_business')::uuid;
begin
  assert (select name from public.tenants where id = ana) = 'Ana Locks', 'Ana''s business untouched';
  assert (select count(*) from public.tenant_users where tenant_id = ana) = 1, 'only Ana is a member';
  assert (select name from public.tenants where id = '10000000-0000-4000-8000-000000000002') = 'Eastside again',
    'Eastside renamed only its own business';
end $$;
rollback;

\echo '# staff cannot create or change a business through onboarding'
begin;
select set_config('test.tenants_before', (select count(*) from public.tenants)::text, true) \g /dev/null
insert into auth.users (id, email) values ('20000000-0000-4000-8000-0000000000a1', 'ana@example.test');
insert into public.tenant_users (tenant_id, user_id, role, display_name)
values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-0000000000a1', 'staff', 'Helper');
set local role authenticated;
set local request.jwt.claims to :'ana';
do $$ begin
  begin
    perform public.owner_create_business('Staff takeover', 'plumbing');
    assert false, 'staff create should fail';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ begin
  assert (select name from public.tenants where id = '10000000-0000-4000-8000-000000000001') = 'Northside Plumbing',
    'Northside untouched';
  assert (select count(*) from public.tenants) = current_setting('test.tenants_before')::bigint, 'no new tenant';
end $$;
rollback;

\echo '# anonymous callers cannot create a business'
begin;
set local role anon;
do $$ begin
  begin
    perform public.owner_create_business('Anon', 'plumbing');
    assert false, 'anon create should fail';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
