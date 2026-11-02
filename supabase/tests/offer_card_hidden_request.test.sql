-- An expired or declined request hides its conversation from the business, for the customer's
-- privacy, yet stays in that business's list. Its card must exist without any customer data: a
-- null card used to take down the whole Requests tab (odd/tasks/judge-local-run.md S8).
\set ON_ERROR_STOP 1
\set mario '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}'
\set eastside '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}'

\echo '# an expired and a declined request list without customer data; other businesses see neither'
begin;
set local role service_role;
insert into public.media (conversation_id, kind, role, storage_path, mime_type)
  select conversation_id, 'image', 'evidence', 'conversations/' || conversation_id || '/hidden.jpg', 'image/jpeg' from public.handoffs
  where id = '50000000-0000-4000-8000-000000000001';
update public.handoffs set status = 'expired', resolved_at = now() where id = '50000000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$
declare
  card jsonb := public.owner_offers('expired') -> 0;
  single jsonb := public.owner_offer('50000000-0000-4000-8000-000000000001');
begin
  assert jsonb_array_length(public.owner_offers('expired')) = 1, 'expected one expired card';
  assert jsonb_typeof(card) = 'object', 'the card was ' || coalesce(card::text, 'null');
  assert card ->> 'id' = '50000000-0000-4000-8000-000000000001', 'wrong card';
  assert card ->> 'status' = 'expired', 'status was ' || (card ->> 'status');
  assert card -> 'title' = 'null'::jsonb, 'title leaked: ' || (card ->> 'title');
  assert card -> 'zukkiSummary' = 'null'::jsonb, 'summary leaked';
  assert card -> 'customerName' = 'null'::jsonb, 'customer name leaked';
  assert card -> 'media' = '[]'::jsonb, 'media leaked';
  assert single ->> 'status' = 'expired', 'the single card was ' || coalesce(single::text, 'null');
end $$;
reset role;
set local role service_role;
update public.handoffs set status = 'declined', resolved_at = now() where id = '50000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$
begin
  assert jsonb_typeof(public.owner_offers('declined') -> 0) = 'object', 'the declined card was null';
end $$;
set local request.jwt.claims to :'eastside';
do $$
begin
  assert jsonb_array_length(public.owner_offers('declined')) = 0, 'another business sees the declined request';
  assert public.owner_offer('50000000-0000-4000-8000-000000000001') is null, 'another business reads the request';
end $$;
rollback;

\echo 'ok - offer card hidden request'
