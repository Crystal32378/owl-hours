-- The owner app's business: profile, prices, hours, service area and
-- settings, read and written through owner_* functions as the signed-in
-- owner. Each test runs in its own transaction and rolls back.
-- Seed ids: Northside 1..01 (owner Mario 2..01), Eastside 1..02 (owner 2..02).
\set ON_ERROR_STOP 1
\set mario '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}'
\set eastside '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}'
\set stranger '{"sub":"20000000-0000-4000-8000-000000000099","role":"authenticated"}'

\echo '# an owner reads their own business with prices, fees, hours, area and accept windows'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$
declare b jsonb := public.owner_business();
begin
  assert b ->> 'id' = '10000000-0000-4000-8000-000000000001', 'Mario reads Northside';
  assert b ->> 'name' = 'Northside Plumbing', 'name';
  assert b ->> 'shortName' = 'Northside', 'short name';
  assert b -> 'rating' = '{"value": 4.9, "count": 128}'::jsonb, 'rating';
  assert (b ->> 'technicians')::int = 1, 'one active technician';
  assert jsonb_array_length(b -> 'prices') = 2, 'callout and repair range are prices';
  assert (b -> 'prices' -> 0) - 'id' = '{"label": "Visit", "amount": 45, "from": false}'::jsonb, 'visit first';
  assert (b -> 'prices' -> 1) - 'id' = '{"label": "Leak repair", "amount": 60, "from": true}'::jsonb, 'repair range reads from';
  assert (b -> 'fees' -> 0) - 'id' = '{"label": "Night fee", "amount": 25, "window": "10 PM-7 AM", "atNight": true}'::jsonb,
    'night fee, read as at night';
  assert jsonb_array_length(b -> 'hours') = 6, 'Mon-Sat';
  assert b -> 'hours' -> 0 = '{"weekday": 1, "opens": "08:00", "closes": "18:00"}'::jsonb, 'Monday hours';
  assert (b -> 'area' ->> 'radiusKm')::numeric = 8, 'radius';
  assert round((b -> 'area' ->> 'lat')::numeric, 4) = 21.1727, 'area latitude';
  assert round((b -> 'area' ->> 'lng')::numeric, 4) = -86.8515, 'area longitude';
  assert (b ->> 'takingRequests')::boolean, 'accepts now';
  assert (b ->> 'nightJobs')::boolean, 'night jobs';
  assert b -> 'acceptWindowMin' = '{"urgent": 5, "other": 30}'::jsonb, 'platform accept windows';
  assert b -> 'linkedAccounts' = '[{"kind": "facebook_page", "name": "Northside Plumbing (test Page)"}]'::jsonb,
    'the linked test Page';
end $$;
rollback;

\echo '# each owner reads only their own business'
begin;
set local role authenticated;
set local request.jwt.claims to :'eastside';
do $$
declare b jsonb := public.owner_business();
begin
  assert b ->> 'id' = '10000000-0000-4000-8000-000000000002', 'Eastside reads Eastside';
  assert (b -> 'fees' -> 0 ->> 'amount')::int = 30, 'Eastside night fee';
end $$;
rollback;

\echo '# a business accept window overrides the platform default'
begin;
update public.tenants set urgent_accept_window = interval '10 minutes'
  where id = '10000000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$ begin
  assert public.owner_business() -> 'acceptWindowMin' = '{"urgent": 10, "other": 30}'::jsonb, 'tenant window wins';
end $$;
rollback;

\echo '# a user with no business reads nothing and writes nothing'
begin;
set local role authenticated;
set local request.jwt.claims to :'stranger';
do $$ begin
  assert public.owner_business() is null, 'no business';
  begin
    perform public.owner_update_business(p_taking_requests => false);
    assert false, 'stranger update should fail';
  exception when sqlstate 'P0002' then null;
  end;
end $$;
rollback;

\echo '# an owner switches taking requests and edits the profile of their business only'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$
declare b jsonb := public.owner_update_business(p_taking_requests => false, p_short_name => 'North');
begin
  assert not (b ->> 'takingRequests')::boolean, 'returns the saved switch';
  assert b ->> 'shortName' = 'North', 'returns the saved short name';
  assert b ->> 'name' = 'Northside Plumbing', 'untouched fields stay';
end $$;
reset role;
do $$ begin
  assert not (select accepts_now from public.tenants where id = '10000000-0000-4000-8000-000000000001'), 'Northside paused';
  assert (select accepts_now from public.tenants where id = '10000000-0000-4000-8000-000000000002'), 'Eastside untouched';
end $$;
rollback;

\echo '# saving prices updates, adds and removes only the caller''s prices'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$
declare
  visit text := (select id::text from public.price_rules
                 where tenant_id = '10000000-0000-4000-8000-000000000001' and item = 'Visit');
  repair text := (select id::text from public.price_rules
                  where tenant_id = '10000000-0000-4000-8000-000000000001' and item = 'Leak repair');
  eastside_visit text := (select id::text from public.price_rules
                          where tenant_id = '10000000-0000-4000-8000-000000000002' and item = 'Visit');
  b jsonb;
begin
  b := public.owner_save_prices(jsonb_build_array(
    jsonb_build_object('id', visit, 'label', 'Visit', 'amount', 50),
    jsonb_build_object('id', repair, 'label', 'Leak repair', 'amount', 70),
    jsonb_build_object('id', eastside_visit, 'label', 'Not yours', 'amount', 1),
    jsonb_build_object('id', 'p-added-1', 'label', 'Unclog a drain', 'amount', 80)));
  assert jsonb_array_length(b -> 'prices') = 4, 'two kept, two added';
  assert (b -> 'prices' -> 0) - 'id' = '{"label": "Visit", "amount": 50, "from": false}'::jsonb, 'visit updated';
  assert (select max_amount from public.price_rules where id::text = repair) = 100, 'repair keeps its 30 range width';
  assert (select count(*) from public.price_rules where tenant_id = '10000000-0000-4000-8000-000000000001'
          and kind = 'night_fee') = 1, 'fees untouched';

  b := public.owner_save_prices(jsonb_build_array(jsonb_build_object('id', visit, 'label', 'Visit', 'amount', 50)));
  assert jsonb_array_length(b -> 'prices') = 1, 'missing prices are removed';

  b := public.owner_save_prices('[]'::jsonb);
  assert (select count(*) from public.price_rules where tenant_id = '10000000-0000-4000-8000-000000000001'
          and kind = 'callout') = 1, 'the visit fee the suggested quote reads is never removed';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.price_rules where tenant_id = '10000000-0000-4000-8000-000000000002') = 3,
    'Eastside keeps its 3 price rules';
  assert (select item from public.price_rules where tenant_id = '10000000-0000-4000-8000-000000000002'
          and kind = 'callout') = 'Visit', 'Eastside visit untouched';
end $$;
rollback;

\echo '# saving hours and the service area replaces the caller''s rows only'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$
declare b jsonb;
begin
  b := public.owner_save_hours('[{"weekday": 0, "opens": "09:00", "closes": "13:00"},
                                 {"weekday": 5, "opens": "20:00", "closes": "02:00"}]'::jsonb);
  assert b -> 'hours' = '[{"weekday": 0, "opens": "09:00", "closes": "13:00"},
                          {"weekday": 5, "opens": "20:00", "closes": "02:00"}]'::jsonb, 'hours replaced';
  b := public.owner_save_area(21.2, -86.9, 12.5);
  assert (b -> 'area' ->> 'radiusKm')::numeric = 12.5, 'radius saved';
  assert round((b -> 'area' ->> 'lat')::numeric, 1) = 21.2, 'center saved';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.business_hours where tenant_id = '10000000-0000-4000-8000-000000000002') = 5,
    'Eastside hours untouched';
  assert (select radius_km from public.service_areas where tenant_id = '10000000-0000-4000-8000-000000000002') = 8,
    'Eastside area untouched';
end $$;
rollback;

\echo '# staff read the business but only owners change it'
begin;
insert into public.tenant_users (tenant_id, user_id, role, display_name)
values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'staff', 'Helper');
delete from public.tenant_users
where tenant_id = '10000000-0000-4000-8000-000000000002' and user_id = '20000000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claims to :'eastside';
do $$ begin
  assert public.owner_business() ->> 'id' = '10000000-0000-4000-8000-000000000001', 'staff read Northside';
  begin
    perform public.owner_update_business(p_taking_requests => false);
    assert false, 'staff update should fail';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.owner_save_prices('[]'::jsonb);
    assert false, 'staff price save should fail';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
