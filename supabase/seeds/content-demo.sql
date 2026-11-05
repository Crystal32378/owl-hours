-- Local demo only: one finished Northside job with consented before/after photos
-- and a Story Pack draft waiting for review, so the Content tab can be demoed live.
-- Fixed uuids make it idempotent; the photo objects are uploaded by
-- scripts/local/seed-content-demo.sh, since SQL cannot write to Storage.

insert into public.customers (id, wa_id, display_name, approx_area)
values ('30000000-0000-4000-8000-000000000091', '15550000091', 'Lucia R.', 'Downtown')
on conflict (id) do nothing;

insert into public.conversations (id, customer_id, state, category, urgency, title, summary, last_message_at, created_at)
values ('40000000-0000-4000-8000-000000000091', '30000000-0000-4000-8000-000000000091', 'chatting', 'plumbing', 'today',
        'Kitchen sink leaking under cabinet', 'Pipe under the kitchen sink leaked; replaced the trap.', now(), now())
on conflict (id) do nothing;

insert into public.handoffs (id, conversation_id, tenant_id, status, urgency, attempt, offered_at, expires_at, resolved_at)
values ('50000000-0000-4000-8000-000000000091', '40000000-0000-4000-8000-000000000091', '10000000-0000-4000-8000-000000000001',
        'accepted', 'today', 1, now(), now() + interval '5 minutes', now())
on conflict (id) do nothing;

insert into public.jobs (id, tenant_id, conversation_id, handoff_id, title, state, total_min, total_max, final_total)
values ('80000000-0000-4000-8000-000000000091', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000091',
        '50000000-0000-4000-8000-000000000091', 'Kitchen sink leaking under cabinet', 'done', 120, 180, 150)
on conflict (id) do nothing;

-- consents.id is generated, so idempotency comes from the conversation instead.
insert into public.consents (conversation_id, kind, granted, at)
select '40000000-0000-4000-8000-000000000091', 'photos_for_marketing', true, now()
where not exists (select 1 from public.consents
  where conversation_id = '40000000-0000-4000-8000-000000000091' and kind = 'photos_for_marketing');

insert into public.media (id, conversation_id, job_id, kind, role, story_role, storage_path, mime_type)
values
  ('60000000-0000-4000-8000-000000000091', '40000000-0000-4000-8000-000000000091', '80000000-0000-4000-8000-000000000091',
   'image', 'before_photo', 'before', 'conversations/40000000-0000-4000-8000-000000000091/sink-before.jpg', 'image/jpeg'),
  ('60000000-0000-4000-8000-000000000092', '40000000-0000-4000-8000-000000000091', '80000000-0000-4000-8000-000000000091',
   'image', 'after_photo', 'after', 'conversations/40000000-0000-4000-8000-000000000091/sink-after.jpg', 'image/jpeg')
on conflict (id) do nothing;

-- The draft trigger checks eligibility for the signed-in owner (auth.uid()), so
-- the insert carries Mario's claims while keeping the seed's own role.
begin;
set local request.jwt.claims to '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into public.content_drafts (id, tenant_id, source, source_job_id, source_media_ids, title, caption, slides, platforms)
values ('c0000000-0000-4000-8000-000000000091', '10000000-0000-4000-8000-000000000001', 'story_pack',
        '80000000-0000-4000-8000-000000000091',
        array['60000000-0000-4000-8000-000000000091', '60000000-0000-4000-8000-000000000092']::uuid[],
        'Leaky sink, fixed the same day',
        'A slow leak under the kitchen sink can rot a cabinet in weeks. We replaced the trap and sealed every joint. Dry and done.',
        '[{"title":"The problem","body":"Water was dripping under the kitchen sink and soaking the cabinet floor."},
          {"title":"The fix","body":"We replaced the worn trap and resealed every joint."},
          {"title":"The result","body":"A dry cabinet and a sink that drains like new."}]'::jsonb,
        array['instagram', 'facebook_page']::public.social_platform[])
on conflict (id) do nothing;
commit;
