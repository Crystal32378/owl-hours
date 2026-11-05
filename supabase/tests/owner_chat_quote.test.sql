-- The owner's chat shows the quote that was sent and when the offer was accepted
-- (odd/tasks/owner-chat-live-fixes.md, S1 and S3).
\set ON_ERROR_STOP 1
\set mario '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}'
\set eastside '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}'

\echo '# a sent quote is an owner message in the chat, carrying the quote'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$
declare
  q public.quotes;
  thread jsonb;
  quote_messages jsonb;
  message jsonb;
begin
  q := public.send_quote('80000000-0000-4000-8000-000000000001',
                         '[{"label":"Callout","min":45,"max":45},{"label":"Valve repair","min":85,"max":115}]'::jsonb,
                         '2026-11-03T05:55:00Z', '2026-11-03T06:25:00Z', null, 'Bring the spare valve');
  thread := public.owner_conversation_messages('40000000-0000-4000-8000-000000000001');
  select coalesce(jsonb_agg(m), '[]'::jsonb) into quote_messages
  from jsonb_array_elements(thread) as e(m) where m -> 'quote' <> 'null'::jsonb;
  assert jsonb_array_length(quote_messages) = 1, 'quote messages: ' || quote_messages::text;
  message := quote_messages -> 0;
  assert message ->> 'from' = 'owner', 'sender was ' || (message ->> 'from');
  assert message ->> 'text' = 'Estimated total: $130–160', 'text was ' || (message ->> 'text');
  assert message -> 'delivery' = 'null'::jsonb, 'a quote message has no delivery, was ' || (message -> 'delivery')::text;
  assert message -> 'quote' ->> 'id' = q.id::text, 'quote id';
  assert message -> 'quote' -> 'lines' = q.lines, 'quote lines';
  assert message -> 'quote' -> 'total' = '{"min":130,"max":160}'::jsonb, 'quote total ' || (message -> 'quote' -> 'total')::text;
  assert (message -> 'quote' ->> 'arrivalFrom')::timestamptz = '2026-11-03T05:55:00Z', 'arrival from';
  assert (message -> 'quote' ->> 'arrivalTo')::timestamptz = '2026-11-03T06:25:00Z', 'arrival to';
  assert message -> 'quote' ->> 'note' = 'Bring the spare valve', 'note';
  assert message -> 'quote' ->> 'technician' = (select display_name from public.technicians
                                                where id = 'b0000000-0000-4000-8000-000000000001'),
    'technician was ' || coalesce(message -> 'quote' ->> 'technician', 'null');
  assert (select author_user_id from public.messages where quote_id = q.id) = '20000000-0000-4000-8000-000000000001',
    'the quote message is authored by the owner who sent it';
end $$;
rollback;

\echo '# the quote message is never sent again by the outbox: Zukki''s notice 13 delivers the quote'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
select public.send_quote('80000000-0000-4000-8000-000000000001', '[{"label":"Fix","min":130,"max":160}]'::jsonb,
                         '2026-11-03T05:55:00Z', '2026-11-03T06:25:00Z');
reset request.jwt.claims;
set local role service_role;
do $$
declare claimed jsonb;
begin
  claimed := public.claim_outbox(100);
  assert not exists (select 1 from jsonb_array_elements(claimed) as e(m)
                     where (m ->> 'id')::uuid in (select id from public.messages where quote_id is not null)),
    'the outbox claimed the quote message';
end $$;
rollback;

\echo '# Zukki''s WhatsApp copy of a quote the thread already shows is left out; an older one stays'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
select set_config('zukki.test_quote', (public.send_quote('80000000-0000-4000-8000-000000000001',
  '[{"label":"Fix","min":130,"max":160}]'::jsonb, '2026-11-03T05:55:00Z', '2026-11-03T06:25:00Z')).id::text, true);
reset request.jwt.claims;
set local role service_role;
insert into public.messages (conversation_id, sender, body, kind, payload, delivery)
values
  ('40000000-0000-4000-8000-000000000001', 'zukki', 'Quote sent to the customer', 'interactive',
   jsonb_build_object('variant', 'quote', 'notice', 'quote:' || current_setting('zukki.test_quote'),
                      'quote_id', current_setting('zukki.test_quote')), 'sent'),
  ('40000000-0000-4000-8000-000000000001', 'zukki', 'An older quote', 'interactive',
   jsonb_build_object('variant', 'quote', 'quote_id', gen_random_uuid()), 'sent');
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$
declare thread jsonb;
begin
  thread := public.owner_conversation_messages('40000000-0000-4000-8000-000000000001');
  assert not exists (select 1 from jsonb_array_elements(thread) as e(m) where m ->> 'text' = 'Quote sent to the customer'),
    'Zukki''s copy of a quote the thread shows is listed twice';
  assert exists (select 1 from jsonb_array_elements(thread) as e(m) where m ->> 'text' = 'An older quote'),
    'a Zukki quote with no owner quote message disappeared';
end $$;
rollback;

\echo '# a plain owner message still reads as before, with no quote'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$
declare message jsonb;
begin
  select m into message
  from jsonb_array_elements(public.owner_conversation_messages('40000000-0000-4000-8000-000000000001')) as e(m)
  where m ->> 'id' = '70000000-0000-4000-8000-000000000005';
  assert message ->> 'text' = 'ok mario there 12:55', 'text';
  assert message ->> 'delivery' = 'as_written', 'delivery was ' || coalesce(message ->> 'delivery', 'null');
  assert message ->> 'status' = 'delivered', 'status';
  assert message -> 'quote' = 'null'::jsonb, 'quote was ' || (message -> 'quote')::text;
end $$;
rollback;

\echo '# another business cannot read the quote message'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
select public.send_quote('80000000-0000-4000-8000-000000000001', '[{"label":"Fix","min":130,"max":160}]'::jsonb,
                         '2026-11-03T05:55:00Z', '2026-11-03T06:25:00Z');
set local request.jwt.claims to :'eastside';
do $$ begin
  assert (select count(*) from public.messages where quote_id is not null) = 0, 'Eastside sees Northside''s quote message';
end $$;
rollback;

\echo '# the chat list carries when the business accepted the offer'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$
declare chat jsonb;
begin
  select c into chat from jsonb_array_elements(public.owner_conversations()) as e(c)
  where c ->> 'id' = '40000000-0000-4000-8000-000000000001';
  assert (chat ->> 'acceptedAt')::timestamptz = '2026-11-03T05:05:28Z', 'acceptedAt was ' || coalesce(chat ->> 'acceptedAt', 'null');
  assert chat ->> 'offerId' = '50000000-0000-4000-8000-000000000001', 'the rest of the row is unchanged';
  assert chat -> 'job' ->> 'id' = '80000000-0000-4000-8000-000000000001', 'job';
end $$;
rollback;
