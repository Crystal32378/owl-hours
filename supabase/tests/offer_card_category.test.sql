-- The offer card carries the conversation's category, so the owner app can name a
-- request the customer picked from the category list before describing it
-- (odd/tasks/owner-requests-data.md S1).
\set ON_ERROR_STOP 1
\set eastside '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}'

\echo '# a request without a title still carries its category'
begin;
set local role service_role;
update public.conversations set title = null where id = '40000000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claims to :'eastside';
do $$
declare listed jsonb := public.owner_offers('offered') -> 0;
declare single jsonb := public.owner_offer('50000000-0000-4000-8000-000000000002');
begin
  assert listed -> 'title' = 'null'::jsonb, 'title was ' || (listed ->> 'title');
  assert listed ->> 'category' = 'plumbing', 'listed category was ' || coalesce(listed ->> 'category', 'missing');
  assert single ->> 'category' = 'plumbing', 'single category was ' || coalesce(single ->> 'category', 'missing');
end $$;
rollback;

\echo 'ok - offer card category'
