-- The owner app's extra fees, saved through owner_save_fees as the signed-in
-- owner: night fees (kind night_fee) and other extra fees (kind extra_fee).
-- Spec: odd/tasks/owner-area-map-fees-dark.md S2. Each test rolls back.
-- Seed ids: Northside 1..01 (owner Mario 2..01), Eastside 1..02 (owner 2..02).
\set ON_ERROR_STOP 1
\set mario '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}'
\set eastside '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}'
\set stranger '{"sub":"20000000-0000-4000-8000-000000000099","role":"authenticated"}'

\echo '# saving fees updates, adds and removes only the caller''s fees'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$
declare
  night text := (select id::text from public.price_rules
                 where tenant_id = '10000000-0000-4000-8000-000000000001' and kind = 'night_fee');
  eastside_night text := (select id::text from public.price_rules
                          where tenant_id = '10000000-0000-4000-8000-000000000002' and kind = 'night_fee');
  b jsonb;
begin
  b := public.owner_save_fees(jsonb_build_array(
    jsonb_build_object('id', night, 'label', 'Night', 'amount', 30, 'atNight', true),
    jsonb_build_object('id', eastside_night, 'label', 'Not yours', 'amount', 1, 'atNight', false),
    jsonb_build_object('id', 'f-added-1', 'label', 'Weekend', 'amount', 15, 'atNight', false)));
  assert jsonb_array_length(b -> 'fees') = 3, 'one kept, two added';
  assert b -> 'fees' -> 0 = jsonb_build_object('id', night, 'label', 'Night', 'amount', 30,
                                               'window', '10 PM-7 AM', 'atNight', true),
    'night fee updated in place, keeping its window';
  assert b -> 'fees' @> '[{"label": "Not yours", "amount": 1, "atNight": false}]'::jsonb,
    'another business''s id is added as a new fee of the caller';
  assert b -> 'fees' @> '[{"label": "Weekend", "amount": 15, "atNight": false}]'::jsonb, 'extra fee added';
  assert jsonb_array_length(b -> 'prices') = 2, 'prices untouched';

  b := public.owner_save_fees(jsonb_build_array(
    jsonb_build_object('id', night, 'label', 'Night', 'amount', 30, 'atNight', true)));
  assert jsonb_array_length(b -> 'fees') = 1, 'unlisted fees are removed';

  b := public.owner_save_fees('[]'::jsonb);
  assert b -> 'fees' = '[]'::jsonb, 'every fee can be removed';
  assert (select count(*) from public.price_rules where tenant_id = '10000000-0000-4000-8000-000000000001'
          and kind = 'callout') = 1, 'the visit (callout) is never touched';
  assert (select count(*) from public.price_rules where tenant_id = '10000000-0000-4000-8000-000000000001'
          and kind = 'repair_range') = 1, 'repair prices are never touched';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.price_rules where tenant_id = '10000000-0000-4000-8000-000000000002') = 3,
    'Eastside keeps its 3 price rules';
  assert (select min_amount from public.price_rules where tenant_id = '10000000-0000-4000-8000-000000000002'
          and kind = 'night_fee') = 30, 'Eastside night fee untouched';
end $$;
rollback;

\echo '# the "at night" switch decides the kind, and a night fee always has the window the suggested quote reads'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$
declare
  night text := (select id::text from public.price_rules
                 where tenant_id = '10000000-0000-4000-8000-000000000001' and kind = 'night_fee');
begin
  perform public.owner_save_fees(jsonb_build_array(
    jsonb_build_object('id', night, 'label', 'Night fee', 'amount', 25, 'atNight', false),
    jsonb_build_object('label', 'Late call', 'amount', 40, 'atNight', true)));
end $$;
reset role;
do $$ begin
  assert (select kind from public.price_rules where tenant_id = '10000000-0000-4000-8000-000000000001'
          and item = 'Night fee') = 'extra_fee', 'switched off: an extra fee';
  assert (select conditions from public.price_rules where tenant_id = '10000000-0000-4000-8000-000000000001'
          and item = 'Night fee') is null, 'an extra fee drops the night window';
  assert (select kind from public.price_rules where tenant_id = '10000000-0000-4000-8000-000000000001'
          and item = 'Late call') = 'night_fee', 'switched on: a night fee';
  assert (select conditions from public.price_rules where tenant_id = '10000000-0000-4000-8000-000000000001'
          and item = 'Late call') = '10 PM-7 AM', 'a new night fee gets the night window';
end $$;
rollback;

\echo '# an "at cost" fee is outside the editable list and stays'
begin;
insert into public.price_rules (tenant_id, item, kind, min_amount, max_amount, at_cost)
values ('10000000-0000-4000-8000-000000000001', 'Parts', 'extra_fee', 0, 0, true);
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$
declare b jsonb := public.owner_save_fees('[]'::jsonb);
begin
  assert (b -> 'fees' -> 0) - 'id' = '{"label": "Parts", "amount": "at_cost", "atNight": false}'::jsonb,
    'parts at cost stays';
end $$;
rollback;

\echo '# only an owner with a business saves fees'
begin;
insert into public.tenant_users (tenant_id, user_id, role, display_name)
values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'staff', 'Helper');
delete from public.tenant_users
where tenant_id = '10000000-0000-4000-8000-000000000002' and user_id = '20000000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claims to :'eastside';
do $$ begin
  perform public.owner_save_fees('[]'::jsonb);
  assert false, 'staff fee save should fail';
exception when insufficient_privilege then null;
end $$;
set local request.jwt.claims to :'stranger';
do $$ begin
  perform public.owner_save_fees('[]'::jsonb);
  assert false, 'stranger fee save should fail';
exception when sqlstate 'P0002' then null;
end $$;
rollback;
