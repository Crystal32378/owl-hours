-- Demo seed (handoff section 4): Ana's toilet at 12:04 AM, Northside
-- accepts with 4:32 left. Fixed ids so tests and fixtures can refer to them.
--
-- Assumptions to confirm with the team:
-- * City: Cancun (America/Cancun, UTC-5) as a placeholder; distances match
--   the demo (Northside 1.2 km, Eastside 2.4 km from Ana).
-- * Lagoon Plumbing: the closest (0.8 km) but closed at night with no
--   night jobs, so it shows why Northside is picked.
-- * Pedro: a second customer offered to Eastside, used by isolation tests.
-- * No model outputs here (transcripts, SAM boxes): those come from real
--   runs only (handoff section 10).
-- Owners sign in with an emailed 6-digit code; no passwords are seeded. Seeded
-- owners already have an email, so code sign-in matches their auth user.
-- Supabase Auth reads the token columns as strings: NULL makes /otp fail with
-- "Database error finding user", so they are seeded empty.

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'mario@northside.example', now(), '{"provider":"email","providers":["email"]}',
   '{}', now(), now(), '', '', '', ''),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'owner@eastside.example', now(), '{"provider":"email","providers":["email"]}',
   '{}', now(), now(), '', '', '', ''),
  ('20000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'owner@murphy.example', now(), '{"provider":"email","providers":["email"]}',
   '{}', now(), now(), '', '', '', '');

-- Northside "can arrive in about 40 min" (ZkWaMatch); Eastside's 55 is a placeholder.
insert into public.tenants (id, slug, name, short_name, category, timezone, location, rating, review_count,
                            accepts_now, night_jobs, eta_minutes, website)
values
  ('10000000-0000-4000-8000-000000000001', 'northside', 'Northside Plumbing', 'Northside', 'plumbing', 'America/Cancun',
   private.geo_point(21.1727, -86.8515), 4.9, 128, true, true, 40, 'https://northside.example'),
  ('10000000-0000-4000-8000-000000000002', 'eastside', 'Eastside Plumbing', 'Eastside', 'plumbing', 'America/Cancun',
   private.geo_point(21.1619, -86.8283), 4.8, 96, true, true, 55, null),
  ('10000000-0000-4000-8000-000000000003', 'lagoon', 'Lagoon Plumbing', 'Lagoon', 'plumbing', 'America/Cancun',
   private.geo_point(21.1547, -86.8515), 4.6, 41, true, false, null, null),
  -- Fictional business at 123 Demo Street, Xinyi District; the point is a placeholder in Xinyi.
  ('10000000-0000-4000-8000-000000000004', 'murphy', 'Murphy Plumbing (Demo)', 'Murphy', 'plumbing', 'Asia/Taipei',
   private.geo_point(25.0330, 121.5654), null, 0, true, true, null, null);

insert into public.tenant_users (tenant_id, user_id, role, display_name)
values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'owner', 'Mario R.'),
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'owner', 'Eastside owner'),
  ('10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000003', 'owner', 'Murphy owner');

-- Mario owns Northside and is also its technician ("Mario R." on the quote).
insert into public.technicians (id, tenant_id, display_name, user_id)
values
  ('b0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Mario R.',
   '20000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Luis P.', null);

-- $45 visit + $25 night fee + $60-90 repair = $130-160 (demo numbers).
insert into public.price_rules (tenant_id, item, kind, min_amount, max_amount, conditions)
values
  ('10000000-0000-4000-8000-000000000001', 'Visit', 'callout', 45, 45, null),
  ('10000000-0000-4000-8000-000000000001', 'Night fee', 'night_fee', 25, 25, '10 PM-7 AM'),
  ('10000000-0000-4000-8000-000000000001', 'Leak repair', 'repair_range', 60, 90, null),
  ('10000000-0000-4000-8000-000000000002', 'Visit', 'callout', 45, 45, null),
  ('10000000-0000-4000-8000-000000000002', 'Night fee', 'night_fee', 30, 30, '10 PM-7 AM'),
  ('10000000-0000-4000-8000-000000000002', 'Leak repair', 'repair_range', 60, 90, null),
  ('10000000-0000-4000-8000-000000000003', 'Visit', 'callout', 40, 40, null),
  ('10000000-0000-4000-8000-000000000003', 'Leak repair', 'repair_range', 55, 85, null),
  -- Listed prices; Ana's $45 + $25 sample is a discount, so it is not a rule. The window is an assumption.
  ('10000000-0000-4000-8000-000000000004', 'Call-out fee', 'callout', 50, 50, null),
  ('10000000-0000-4000-8000-000000000004', 'Nighttime surcharge', 'night_fee', 30, 30, '10 PM-7 AM'),
  ('10000000-0000-4000-8000-000000000004', 'Repair work', 'repair_range', 60, 90, null);

-- Northside Mon-Sat 8-18, Eastside Mon-Fri 8-17, Lagoon every day 7-19, Murphy all day.
-- opens and closes must differ, so "all day" ends at 23:59.
insert into public.business_hours (tenant_id, weekday, opens, closes)
select '10000000-0000-4000-8000-000000000001'::uuid, d, '08:00'::time, '18:00'::time from generate_series(1, 6) d
union all
select '10000000-0000-4000-8000-000000000002'::uuid, d, '08:00'::time, '17:00'::time from generate_series(1, 5) d
union all
select '10000000-0000-4000-8000-000000000003'::uuid, d, '07:00'::time, '19:00'::time from generate_series(0, 6) d
union all
select '10000000-0000-4000-8000-000000000004'::uuid, d, '00:00'::time, '23:59'::time from generate_series(0, 6) d;

insert into public.service_areas (tenant_id, center, radius_km)
select id, location, 8 from public.tenants;

insert into public.customers (id, wa_id, display_name, approx_area)
values
  ('30000000-0000-4000-8000-000000000001', '15550000001', 'Ana L.', 'Downtown'),
  ('30000000-0000-4000-8000-000000000002', '15550000002', 'Pedro M.', 'Hotel Zone');

insert into public.conversations (id, customer_id, state, category, urgency, title, summary, last_message_at, created_at)
values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'chatting', 'plumbing', 'now',
   'Toilet won''t stop running', 'Toilet will not stop running; water reaching the hallway.',
   '2026-11-03T05:06:30Z', '2026-11-03T05:04:00Z'),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'offered', 'plumbing', 'today',
   'Kitchen sink dripping', 'Kitchen sink drips under the cabinet.', now(), now());

insert into public.handoffs (id, conversation_id, tenant_id, status, urgency, attempt, offered_at, expires_at, resolved_at,
                             distance_km, suggested_min, suggested_max)
values
  -- Accepted with 4:32 left on the 5-minute window.
  ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   'accepted', 'now', 1, '2026-11-03T05:05:00Z', '2026-11-03T05:10:00Z', '2026-11-03T05:05:28Z', 1.2, 130, 160),
  ('50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002',
   'offered', 'today', 1, now(), now() + interval '30 minutes', null, null, null, null);

update public.conversations set active_handoff_id = '50000000-0000-4000-8000-000000000001'
where id = '40000000-0000-4000-8000-000000000001';
update public.conversations set active_handoff_id = '50000000-0000-4000-8000-000000000002'
where id = '40000000-0000-4000-8000-000000000002';

insert into public.handoff_events (handoff_id, tenant_id, actor, actor_user_id, from_status, to_status, reason, at)
values
  ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'system', null, null, 'offered',
   'customer asked to connect', '2026-11-03T05:05:00Z'),
  ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner',
   '20000000-0000-4000-8000-000000000001', 'offered', 'accepted', null, '2026-11-03T05:05:28Z'),
  ('50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'system', null, null, 'offered',
   'customer asked to connect', now());

insert into public.media (id, conversation_id, kind, storage_path, mime_type, size_bytes, wa_media_id, created_at)
values
  ('60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'video',
   'conversations/40000000-0000-4000-8000-000000000001/toilet-leak.mp4', 'video/mp4', null, null, '2026-11-03T05:04:00Z'),
  ('60000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', 'audio',
   'conversations/40000000-0000-4000-8000-000000000001/voice-note.ogg', 'audio/ogg', null, null, '2026-11-03T05:04:05Z');

insert into public.messages (id, conversation_id, tenant_id, sender, author_user_id, body, media_id, wa_message_id, delivery, created_at)
values
  ('70000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', null, 'customer', null,
   null, '60000000-0000-4000-8000-000000000001', 'wamid.seed.ana.1', 'received', '2026-11-03T05:04:00Z'),
  ('70000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', null, 'customer', null,
   null, '60000000-0000-4000-8000-000000000002', 'wamid.seed.ana.2', 'received', '2026-11-03T05:04:05Z'),
  ('70000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001', null, 'zukki', null,
   'Hi, I''m Zukki, an AI assistant that finds you a local business and connects you with it. A person from the business confirms every request.',
   null, 'wamid.seed.ana.3', 'read', '2026-11-03T05:04:20Z'),
  ('70000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000001', null, 'zukki', null,
   'Northside Plumbing is open now, 1.2 km away, and takes night jobs.', null, 'wamid.seed.ana.4', 'read',
   '2026-11-03T05:04:50Z'),
  ('70000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   'owner', '20000000-0000-4000-8000-000000000001', 'ok mario there 12:55', null, 'wamid.seed.ana.5', 'delivered',
   '2026-11-03T05:06:30Z'),
  ('70000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000002', null, 'customer', null,
   'My kitchen sink is dripping under the cabinet', null, 'wamid.seed.pedro.1', 'received', now());

-- The video and voice note are media messages (message kinds migration).
update public.messages set kind = 'media' where media_id is not null and body is null;

insert into public.jobs (id, tenant_id, conversation_id, handoff_id, title, state, total_min, total_max, arrival_window,
                         technician_id, created_at)
values
  ('80000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
   '50000000-0000-4000-8000-000000000001', 'Toilet won''t stop running', 'proposed', 130, 160, '12:55 AM',
   'b0000000-0000-4000-8000-000000000001', '2026-11-03T05:06:00Z');

-- Ana shared her location; Northside sees it only after she approves the visit.
insert into public.customer_locations (id, conversation_id, location, address, shared_at)
values
  ('90000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
   private.geo_point(21.1619, -86.8515), null, '2026-11-03T05:04:40Z');

insert into public.linked_accounts (tenant_id, platform, external_id, display_name, mode)
values ('10000000-0000-4000-8000-000000000001', 'facebook_page', '100000000000001', 'Northside Plumbing (test Page)', 'test');
