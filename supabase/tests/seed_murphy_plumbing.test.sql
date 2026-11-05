-- Murphy Plumbing, the fictional Taipei demo business: customers there find it,
-- and its owner reads the listed prices and hours. Each test rolls back.
-- Seed ids: Murphy 1..04 (owner 2..03).
\set ON_ERROR_STOP 1
\set murphy_owner '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}'

\echo '# a customer in Xinyi finds only Murphy Plumbing, open at any hour'
begin;
do $$
declare
  found_slugs text[];
  noon_open boolean;
  night_open boolean;
begin
  select array_agg(slug), bool_or(open_now) into found_slugs, noon_open
  from public.search_directory('plumbing', 25.0330, 121.5654, '2026-11-03T04:00:00Z');
  select bool_or(open_now) into night_open
  from public.search_directory('plumbing', 25.0330, 121.5654, '2026-11-03T18:30:00Z');
  assert found_slugs = array['murphy'], 'only Murphy serves Xinyi';
  assert noon_open, 'open at noon in Taipei';
  assert night_open, 'open at 2:30 AM in Taipei';
end $$;
rollback;

\echo '# a customer in Cancun is not offered Murphy Plumbing'
begin;
do $$ begin
  assert not exists (
    select 1 from public.search_directory('plumbing', 21.1619, -86.8515, '2026-11-03T05:04:00Z') where slug = 'murphy'
  ), 'Murphy does not serve Cancun';
end $$;
rollback;

\echo '# the owner reads the listed prices, the Taipei time zone and every day of hours'
begin;
set local role authenticated;
set local request.jwt.claims to :'murphy_owner';
do $$
declare b jsonb := public.owner_business();
begin
  assert b ->> 'name' = 'Murphy Plumbing (Demo)', 'name';
  assert (b -> 'prices' -> 0) - 'id' = '{"label": "Call-out fee", "amount": 50, "from": false}'::jsonb, 'call-out';
  assert (b -> 'prices' -> 1) - 'id' = '{"label": "Repair work", "amount": 60, "from": true}'::jsonb, 'repair range';
  assert (b -> 'fees' -> 0 ->> 'label') = 'Nighttime surcharge', 'night fee label';
  assert (b -> 'fees' -> 0 ->> 'amount')::numeric = 30, 'night fee amount';
  assert jsonb_array_length(b -> 'hours') = 7, 'every day';
end $$;
reset role;
do $$ begin
  assert (select timezone from public.tenants where slug = 'murphy') = 'Asia/Taipei', 'time zone';
end $$;
rollback;
