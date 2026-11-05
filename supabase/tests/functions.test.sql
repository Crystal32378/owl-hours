-- Directory matching, handoff timer and job transitions.
-- Demo night: Tuesday 2026-11-03 00:04 in Cancun (UTC-5) = 05:04Z.
\set ON_ERROR_STOP 1
\set mario '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}'
\set eastside '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}'

\echo '# at night only businesses taking night jobs match, closest first'
begin;
set local role service_role;
do $$
declare names text; km text;
begin
  select string_agg(slug, ',' order by distance_km), string_agg(distance_km::text, ',' order by distance_km)
  into names, km
  from public.search_directory('plumbing', 21.1619, -86.8515, '2026-11-03T05:04:00Z');
  assert names = 'northside,eastside', 'night match was ' || coalesce(names, 'none');
  assert km = '1.2,2.4', 'distances were ' || coalesce(km, 'none');
end $$;
rollback;

\echo '# the agent searches from the customer''s shared location, never its own coordinates'
begin;
set local role service_role;
do $$ begin
  -- Northside already has Ana's handoff, so it is not suggested again.
  assert (select string_agg(slug || ':' || eta_minutes, ',' order by distance_km)
          from public.search_directory_for_conversation('40000000-0000-4000-8000-000000000001', 'plumbing',
               '{}', '2026-11-03T05:04:00Z')) = 'eastside:55', 'Ana''s next option';
  insert into public.messages (conversation_id, sender, kind, payload, body)
  values ('40000000-0000-4000-8000-000000000001', 'zukki', 'interactive',
          '{"variant":"suggest_business","business_id":"10000000-0000-4000-8000-000000000002"}', 'Eastside card');
  assert (select count(*) from public.search_directory_for_conversation('40000000-0000-4000-8000-000000000001', 'plumbing',
          '{}', '2026-11-03T05:04:00Z')) = 0, 'a business already suggested is not suggested twice';
  begin
    perform public.search_directory_for_conversation('40000000-0000-4000-8000-000000000002', 'plumbing');
    raise exception 'searched without a shared location';
  exception when no_data_found then null;
  end;
end $$;
rollback;

begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$ begin
  begin
    perform public.search_directory_for_conversation('40000000-0000-4000-8000-000000000001', 'plumbing');
    raise exception 'owners must not search by a customer''s location';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

\echo '# another option skips businesses already tried'
begin;
set local role service_role;
do $$ begin
  assert (select slug from public.search_directory('plumbing', 21.1619, -86.8515, '2026-11-03T05:04:00Z',
          array['10000000-0000-4000-8000-000000000001']::uuid[]) limit 1) = 'eastside', 'should skip Northside';
end $$;
rollback;

\echo '# in the daytime the closest open business wins'
begin;
set local role service_role;
do $$ begin
  assert (select slug from public.search_directory('plumbing', 21.1619, -86.8515, '2026-11-04T15:00:00Z') limit 1) = 'lagoon',
    'Lagoon is open and closest at 10 AM';
  assert (select count(*) from public.search_directory('electrical', 21.1619, -86.8515, '2026-11-04T15:00:00Z')) = 0,
    'no electricians in the seed';
  assert (select count(*) from public.search_directory('plumbing', 40.0, -3.0, '2026-11-04T15:00:00Z')) = 0,
    'nobody serves Madrid';
end $$;
rollback;

\echo '# a handoff gets 5 minutes when urgent and 30 otherwise'
begin;
set local role service_role;
do $$
declare h public.handoffs;
begin
  update public.handoffs set status = 'declined', resolved_at = now() where id = '50000000-0000-4000-8000-000000000002';
  h := public.create_handoff('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001');
  assert h.expires_at - h.offered_at = interval '30 minutes', 'Pedro is not urgent: 30 minutes';
  assert h.attempt = 2, 'second business is attempt 2';
  assert (select state from public.conversations where id = h.conversation_id) = 'offered', 'conversation offered';
  assert (select count(*) from public.handoff_events where handoff_id = h.id) = 1, 'offer is logged';
end $$;
rollback;

\echo '# a conversation has at most one open handoff'
begin;
set local role service_role;
do $$ begin
  begin
    perform public.create_handoff('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001');
    raise exception 'second open handoff was allowed';
  exception when unique_violation then null;
  end;
end $$;
rollback;

\echo '# the owner accepts in time'
begin;
set local role authenticated;
set local request.jwt.claims to :'eastside';
do $$
declare h public.handoffs;
begin
  h := public.accept_handoff('50000000-0000-4000-8000-000000000002');
  assert h.status = 'accepted', 'status was ' || h.status;
  assert (select state from public.conversations where id = h.conversation_id) = 'accepted', 'conversation accepted';
  assert (select count(*) from public.handoff_events where handoff_id = h.id and to_status = 'accepted') = 1, 'accept logged';
  begin
    perform public.accept_handoff('50000000-0000-4000-8000-000000000002');
    raise exception 'accepted twice';
  exception when sqlstate '22023' then null;
  end;
end $$;
rollback;

\echo '# accepting opens the job, so the owner can quote and the customer approve'
begin;
set local role authenticated;
set local request.jwt.claims to :'eastside';
do $$
declare
  h public.handoffs;
  j public.jobs;
  q public.quotes;
begin
  h := public.accept_handoff('50000000-0000-4000-8000-000000000002');
  select * into j from public.jobs where handoff_id = h.id;
  assert found, 'no job after accept';
  assert j.state = 'proposed', 'job state was ' || j.state;
  assert j.tenant_id = h.tenant_id and j.conversation_id = h.conversation_id, 'job belongs to the offer';
  assert char_length(j.title) between 1 and 120, 'job has a title';
  assert (select count(*) from public.job_events where job_id = j.id and to_state = 'proposed' and actor = 'owner') = 1,
    'job opening logged';
  q := public.send_quote(j.id, '[{"label": "Visit", "min": 40, "max": 40}]'::jsonb, now() + interval '30 minutes',
                         now() + interval '60 minutes');
  assert (select state from public.jobs where id = j.id) = 'owner_confirmed', 'quote moves the job on';
  perform set_config('role', 'service_role', true);
  perform public.approve_quote(q.id);
  assert (select state from public.jobs where id = j.id) = 'customer_approved', 'customer approved';
end $$;
rollback;

\echo '# a late accept opens no job'
begin;
update public.handoffs set offered_at = now() - interval '40 minutes', expires_at = now() - interval '10 minutes'
where id = '50000000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claims to :'eastside';
do $$ begin
  perform public.accept_handoff('50000000-0000-4000-8000-000000000002');
  assert not exists (select 1 from public.jobs where handoff_id = '50000000-0000-4000-8000-000000000002'), 'expired offer opened a job';
end $$;
rollback;

\echo '# an owner cannot accept another business''s handoff'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$ begin
  begin
    perform public.accept_handoff('50000000-0000-4000-8000-000000000002');
    raise exception 'Mario accepted Eastside''s handoff';
  exception when no_data_found then null;
  end;
end $$;
rollback;

\echo '# a late accept expires the offer instead'
begin;
update public.handoffs set offered_at = now() - interval '40 minutes', expires_at = now() - interval '10 minutes'
where id = '50000000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claims to :'eastside';
do $$
declare h public.handoffs;
begin
  h := public.accept_handoff('50000000-0000-4000-8000-000000000002');
  assert h.status = 'expired', 'late accept should expire, got ' || h.status;
  assert (select count(*) from public.conversations where id = h.conversation_id) = 0,
    'an expired offer must not keep the conversation visible';
end $$;
reset role;
do $$ begin
  assert (select state from public.conversations where id = '40000000-0000-4000-8000-000000000002') = 'matched',
    'back to matching';
end $$;
rollback;

\echo '# the owner can decline'
begin;
set local role authenticated;
set local request.jwt.claims to :'eastside';
do $$
declare h public.handoffs;
begin
  h := public.decline_handoff('50000000-0000-4000-8000-000000000002', 'busy', 'no technician free');
  assert h.status = 'declined', 'status was ' || h.status;
  assert h.decline_reason = 'busy', 'decline reason stored';
  assert (select active_handoff_id from public.conversations where id = h.conversation_id) is null, 'active handoff cleared';
end $$;
rollback;

\echo '# the expiry job closes only overdue offers'
begin;
update public.handoffs set offered_at = now() - interval '40 minutes', expires_at = now() - interval '10 minutes'
where id = '50000000-0000-4000-8000-000000000002';
set local role service_role;
do $$ begin
  assert (select count(*) from public.expire_handoffs()) = 1, 'one overdue offer';
  assert (select status from public.handoffs where id = '50000000-0000-4000-8000-000000000002') = 'expired', 'expired';
  assert (select status from public.handoffs where id = '50000000-0000-4000-8000-000000000001') = 'accepted', 'accepted untouched';
  assert (select count(*) from public.expire_handoffs()) = 0, 'second run is a no-op';
end $$;
rollback;

\echo '# owner job transitions follow the actor rules'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$
declare j public.jobs;
begin
  j := public.owner_transition_job('80000000-0000-4000-8000-000000000001', 'owner_confirmed', 'quote looks right');
  assert j.state = 'owner_confirmed', 'owner confirms';
  assert (select count(*) from public.job_events where job_id = j.id and to_state = 'owner_confirmed') = 1, 'logged';
  begin
    perform public.owner_transition_job(j.id, 'customer_approved', 'pretending to be Ana');
    raise exception 'owner approved on the customer''s behalf';
  exception when sqlstate '22023' then null;
  end;
  j := public.owner_transition_job(j.id, 'cancelled', 'customer fixed it');
  begin
    perform public.owner_transition_job(j.id, 'proposed', 'reopen');
    raise exception 'cancelled job moved';
  exception when sqlstate '22023' then null;
  end;
end $$;
rollback;

begin;
set local role authenticated;
set local request.jwt.claims to :'eastside';
do $$ begin
  begin
    perform public.owner_transition_job('80000000-0000-4000-8000-000000000001', 'owner_confirmed', 'x');
    raise exception 'Eastside moved Northside''s job';
  exception when no_data_found then null;
  end;
end $$;
rollback;

\echo '# agent and customer moves are compare-and-set with an audit row'
begin;
set local role service_role;
do $$
declare j public.jobs;
begin
  j := public.record_job_transition('80000000-0000-4000-8000-000000000001', 'proposed', 'cancelled', 'customer', 'fixed it myself');
  assert j.state = 'cancelled', 'state was ' || j.state;
  assert (select count(*) from public.job_events where job_id = j.id and actor = 'customer' and from_state = 'proposed') = 1,
    'customer move logged';
  begin
    perform public.record_job_transition(j.id, 'proposed', 'cancelled', 'system', 'stale read');
    raise exception 'a stale from_state was applied';
  exception when serialization_failure then null;
  end;
  begin
    perform public.record_job_transition('80000000-0000-4000-8000-0000000000ff', 'proposed', 'cancelled', 'system', 'x');
    raise exception 'missing job was moved';
  exception when no_data_found then null;
  end;
  begin
    perform public.record_job_transition(j.id, 'cancelled', 'done', 'owner', 'owner via API');
    raise exception 'owner moves must use owner_transition_job';
  exception when sqlstate '22023' then null;
  end;
end $$;
rollback;

\echo '# agent, customer and system moves follow the job rules (no skipped confirmations)'
begin;
set local role service_role;
do $$
declare
  bad record;
begin
  -- The seed job is 'proposed': only the owner's quote may move it to owner_confirmed,
  -- and only the customer may approve after that.
  for bad in
    select * from (values
      ('proposed'::public.job_state, 'customer_approved'::public.job_state, 'customer'::public.job_actor),
      ('proposed', 'customer_approved', 'system'),
      ('proposed', 'owner_confirmed', 'agent'),
      ('proposed', 'owner_confirmed', 'system'),
      ('proposed', 'done', 'system'),
      ('proposed', 'cancelled', 'agent')
    ) as v(from_state, to_state, actor)
  loop
    begin
      perform public.record_job_transition('80000000-0000-4000-8000-000000000001', bad.from_state, bad.to_state,
                                           bad.actor, 'should be refused');
      raise exception 'allowed % -> % as %', bad.from_state, bad.to_state, bad.actor;
    exception when sqlstate '22023' then null;
    end;
  end loop;
  assert (select state from public.jobs where id = '80000000-0000-4000-8000-000000000001') = 'proposed', 'job unchanged';
  -- The SQL table matches packages/shared/src/job-states.ts on a sample of allowed moves.
  assert private.job_move_allowed('requested', 'triaged', 'agent'), 'agent triages';
  assert private.job_move_allowed('owner_confirmed', 'customer_approved', 'customer'), 'customer approves';
  assert private.job_move_allowed('on_site', 'done', 'system'), 'system closes';
  assert not private.job_move_allowed('on_site', 'cancelled', 'customer'), 'no cancel on site';
  assert not private.job_move_allowed('done', 'cancelled', 'system'), 'done is final';
end $$;
rollback;

begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$ begin
  begin
    perform public.record_job_transition('80000000-0000-4000-8000-000000000001', 'proposed', 'owner_confirmed', 'agent', 'x');
    raise exception 'owners must not record agent moves';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

\echo '# message kinds: replies need a payload, locations never carry coordinates'
begin;
set local role service_role;
do $$ begin
  insert into public.messages (conversation_id, sender, kind, payload, wa_message_id, delivery)
  values ('40000000-0000-4000-8000-000000000001', 'customer', 'button_reply', '{"id":"done_no_cables","title":"Done, no cables"}',
          'wamid.test.button', 'received');
  insert into public.messages (conversation_id, sender, kind, payload, wa_message_id, delivery)
  values ('40000000-0000-4000-8000-000000000001', 'customer', 'location',
          '{"customer_location_id":"90000000-0000-4000-8000-000000000001"}', 'wamid.test.location', 'received');
  begin
    insert into public.messages (conversation_id, sender, kind, payload, delivery)
    values ('40000000-0000-4000-8000-000000000001', 'customer', 'location',
            '{"latitude":21.1619,"longitude":-86.8515}', 'received');
    raise exception 'coordinates were stored in a message';
  exception when check_violation then null;
  end;
  begin
    insert into public.messages (conversation_id, sender, kind, delivery)
    values ('40000000-0000-4000-8000-000000000001', 'customer', 'button_reply', 'received');
    raise exception 'button reply without payload was stored';
  exception when check_violation then null;
  end;
  assert (select kind from public.messages where id = '70000000-0000-4000-8000-000000000001') = 'media',
    'seeded video message should be kind media';
end $$;
rollback;

\echo '# option B: the owner picks between their text and Zukki''s version'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
insert into public.message_drafts (id, conversation_id, tenant_id, author_user_id, original_body)
values ('a0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'ok mario there 12:55');
do $$ begin
  begin
    update public.message_drafts set polished_body = 'self-polished' where id = 'a0000000-0000-4000-8000-000000000001';
    raise exception 'owners must not write the polished version';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.send_message_draft('a0000000-0000-4000-8000-000000000001', true);
    raise exception 'sent a polished version that does not exist';
  exception when sqlstate '22023' then null;
  end;
end $$;
reset role;
update public.message_drafts
set polished_body = 'Mario from Northside Plumbing will arrive at about 12:55 AM.'
where id = 'a0000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$
declare m public.messages;
begin
  m := public.send_message_draft('a0000000-0000-4000-8000-000000000001', true);
  assert m.polished and m.kind = 'interactive' and m.delivery = 'queued', 'polished message queued as interactive';
  assert m.body = 'Mario from Northside Plumbing will arrive at about 12:55 AM.', 'polished body sent';
  assert (select status from public.message_drafts where id = 'a0000000-0000-4000-8000-000000000001') = 'sent_polished',
    'draft resolved';
  begin
    perform public.send_message_draft('a0000000-0000-4000-8000-000000000001', false);
    raise exception 'draft sent twice';
  exception when sqlstate '22023' then null;
  end;
end $$;
rollback;

begin;
set local role authenticated;
set local request.jwt.claims to :'eastside';
do $$ begin
  begin
    insert into public.message_drafts (conversation_id, tenant_id, author_user_id, original_body)
    values ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
            '20000000-0000-4000-8000-000000000002', 'hi Ana');
    raise exception 'Eastside drafted into Ana''s chat';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

\echo '# the accept window comes from platform settings'
begin;
set local role service_role;
do $$
declare h public.handoffs;
begin
  update public.platform_settings set normal_accept_window = interval '10 minutes';
  update public.handoffs set status = 'declined', resolved_at = now() where id = '50000000-0000-4000-8000-000000000002';
  h := public.create_handoff('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001');
  assert h.expires_at - h.offered_at = interval '10 minutes', 'window was ' || (h.expires_at - h.offered_at);
  begin
    update public.platform_settings set urgent_accept_window = interval '5 seconds';
    raise exception 'a 5-second window was allowed';
  exception when check_violation then null;
  end;
  insert into public.price_rules (tenant_id, item, kind, min_amount, max_amount, conditions)
  values ('10000000-0000-4000-8000-000000000001', 'Parking', 'extra_fee', 5, 5, 'Downtown only');
end $$;
rollback;

\echo '# marketing drafts use only consented media from the business''s own jobs'
begin;
set local role service_role;
do $$ begin
  begin
    insert into public.content_drafts (tenant_id, source, source_job_id, source_media_ids, caption, platforms)
    values ('10000000-0000-4000-8000-000000000001', 'job', '80000000-0000-4000-8000-000000000001',
            array['60000000-0000-4000-8000-000000000001']::uuid[], 'Fixed!', array['facebook_page']::public.social_platform[]);
    raise exception 'draft without consent was allowed';
  exception when check_violation then null;
  end;
  insert into public.consents (conversation_id, kind, granted)
  values ('40000000-0000-4000-8000-000000000001', 'photos_for_marketing', true);
  insert into public.content_drafts (tenant_id, source, source_job_id, source_media_ids, caption, platforms)
  values ('10000000-0000-4000-8000-000000000001', 'job', '80000000-0000-4000-8000-000000000001',
          array['60000000-0000-4000-8000-000000000001']::uuid[], 'Fixed!', array['facebook_page']::public.social_platform[]);
  begin
    insert into public.content_drafts (tenant_id, source, source_job_id, source_media_ids, caption, platforms)
    values ('10000000-0000-4000-8000-000000000002', 'prices', null,
            array['60000000-0000-4000-8000-000000000001']::uuid[], 'Stolen', array['instagram']::public.social_platform[]);
    raise exception 'Eastside used Northside''s job photo';
  exception when check_violation then null;
  end;
end $$;
rollback;

\echo '# webhook retries do not duplicate messages'
begin;
set local role service_role;
do $$
declare inserted int;
begin
  insert into public.messages (conversation_id, sender, body, wa_message_id, delivery)
  values ('40000000-0000-4000-8000-000000000001', 'customer', 'retry', 'wamid.seed.ana.1', 'received')
  on conflict (wa_message_id) do nothing;
  get diagnostics inserted = row_count;
  assert inserted = 0, 'duplicate webhook delivery was stored';
end $$;
rollback;

\echo '# quotes: the owner sends, the customer approves only the current one'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$
declare first public.quotes; second public.quotes;
begin
  first := public.send_quote('80000000-0000-4000-8000-000000000001',
    '[{"label":"Visit","min":45,"max":45},{"label":"Night fee","min":25,"max":25},{"label":"Fill valve repair","min":60,"max":90}]',
    '2026-11-03T05:55:00Z', '2026-11-03T06:25:00Z', 'b0000000-0000-4000-8000-000000000001');
  assert first.total_min = 130 and first.total_max = 160, 'totals are the sum of the lines';
  assert (select state from public.jobs where id = first.job_id) = 'owner_confirmed', 'sending confirms the job';
  assert (select arrival_window from public.jobs where id = first.job_id) = '12:55–1:25 AM', 'local arrival window';
  second := public.send_quote(first.job_id, '[{"label":"Visit","min":45,"max":45},{"label":"Repair","min":70,"max":90}]',
    '2026-11-03T05:55:00Z', '2026-11-03T06:25:00Z');
  assert (select status from public.quotes where id = first.id) = 'superseded', 'a new quote replaces the old one';
  begin
    perform public.send_quote(first.job_id, '[{"label":"Visit","min":50,"max":40}]', now(), now());
    raise exception 'a line with max < min was accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.send_quote(first.job_id, '[{"label":"Visit","min":"lots","max":40}]', now(), now());
    raise exception 'a non-numeric amount was accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.send_quote(first.job_id, '[{"label":"Visit","min":45,"max":45}]', now(), now(),
      'b0000000-0000-4000-8000-000000000002');
    raise exception 'assigned another business''s technician';
  exception when foreign_key_violation then null;
  end;
end $$;
reset role;
set local role service_role;
do $$
declare current_quote uuid; old_quote uuid; q public.quotes;
begin
  select id into current_quote from public.quotes where status = 'sent';
  select id into old_quote from public.quotes where status = 'superseded';
  begin
    perform public.approve_quote(old_quote);
    raise exception 'an old quote button approved the job';
  exception when sqlstate '22023' then null;
  end;
  q := public.approve_quote(current_quote);
  assert q.status = 'approved', 'quote approved';
  assert (select state from public.jobs where id = q.job_id) = 'customer_approved', 'job approved by the customer';
  assert (select count(*) from public.job_events where job_id = q.job_id and actor = 'customer') = 1, 'approval logged';
end $$;
reset role;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$ begin
  assert (select count(*) from public.customer_locations) = 1, 'the address unlocks after approval';
end $$;
rollback;

\echo '# an offer records distance and the business''s own accept window'
begin;
set local role service_role;
do $$
declare h public.handoffs;
begin
  insert into public.customer_locations (conversation_id, location)
  values ('40000000-0000-4000-8000-000000000002', private.geo_point(21.1619, -86.8515));
  update public.tenants set normal_accept_window = interval '15 minutes' where slug = 'northside';
  update public.handoffs set status = 'declined', resolved_at = now() where id = '50000000-0000-4000-8000-000000000002';
  h := public.create_handoff('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 115, 145);
  assert h.distance_km = 1.2, 'distance was ' || h.distance_km;
  assert h.expires_at - h.offered_at = interval '15 minutes', 'business override wins';
  assert h.suggested_min = 115 and h.suggested_max = 145, 'suggested quote stored';
end $$;
rollback;

\echo '# technicians, read markers and consent requests'
begin;
set local role authenticated;
set local request.jwt.claims to :'eastside';
do $$ begin
  assert (select count(*) from public.technicians) = 1, 'Eastside sees only its technician';
  begin
    insert into public.conversation_reads (user_id, conversation_id)
    values ('20000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001');
    raise exception 'Eastside marked Ana''s chat as read';
  exception when insufficient_privilege then null;
  end;
end $$;
set local request.jwt.claims to :'mario';
insert into public.conversation_reads (user_id, conversation_id)
values ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001')
on conflict (user_id, conversation_id) do update set last_read_at = excluded.last_read_at;
reset role;
do $$ begin
  insert into public.consents (conversation_id, kind, granted)
  values ('40000000-0000-4000-8000-000000000001', 'photos_for_marketing', null);
  begin
    insert into public.price_rules (tenant_id, item, kind, min_amount, max_amount, at_cost)
    values ('10000000-0000-4000-8000-000000000001', 'Visit', 'callout', 0, 0, true);
    raise exception 'at cost is only for extra fees';
  exception when check_violation then null;
  end;
  insert into public.price_rules (tenant_id, item, kind, min_amount, max_amount, at_cost)
  values ('10000000-0000-4000-8000-000000000001', 'Parts', 'extra_fee', 0, 0, true);
end $$;
rollback;

\echo '# WhatsApp intake: retries stored once, one conversation per customer window'
begin;
set local role service_role;
do $$
declare r record; again record; second record; later record; n integer;
begin
  select * into r from public.record_inbound_message('15550000009', 'wamid.new.1', 'text', 'My door is jammed',
                                                      null, null, 'Sofia R.', '2026-11-03T05:00:00Z');
  assert r.is_new_conversation and not r.duplicate and r.message_id is not null, 'first message opens a conversation';
  assert (select display_name from public.customers where wa_id = '15550000009') = 'Sofia R.', 'customer created';
  select * into again from public.record_inbound_message('15550000009', 'wamid.new.1', 'text', 'My door is jammed');
  assert again.duplicate and again.message_id = r.message_id, 'retry returns the stored message';
  select count(*) into n from public.messages where wa_message_id = 'wamid.new.1';
  assert n = 1, 'retry not stored twice';
  select * into second from public.record_inbound_message('15550000009', 'wamid.new.2', 'list_reply', null,
                                                           '{"id":"cat_locksmith","title":"Locksmith"}', null, null,
                                                           '2026-11-03T05:01:00Z');
  assert second.conversation_id = r.conversation_id and not second.is_new_conversation, 'same conversation';
  select * into later from public.record_inbound_message('15550000009', 'wamid.new.3', 'text', 'hi again',
                                                          null, null, null, '2026-11-04T06:00:00Z');
  assert later.conversation_id <> r.conversation_id and later.is_new_conversation, 'a new conversation after 24 hours';
  begin
    perform public.record_inbound_message('15550000009', 'wamid.new.4', 'location', null, '{}');
    raise exception 'location accepted as a plain message';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.record_inbound_message('not-a-number', 'wamid.new.5', 'text', 'x');
    raise exception 'bad wa_id accepted';
  exception when sqlstate '22023' then null;
  end;
end $$;
do $$
declare r record;
begin
  -- Ana's chat with Northside is open: her message goes to Northside, even days later.
  select * into r from public.record_inbound_message('15550000001', 'wamid.ana.later', 'text', 'Is Mario close?',
                                                      null, null, null, '2026-11-06T05:00:00Z');
  assert r.conversation_id = '40000000-0000-4000-8000-000000000001', 'open business chat reused';
  assert r.open_tenant_id = '10000000-0000-4000-8000-000000000001', 'routed to Northside';
  assert (select tenant_id from public.messages where id = r.message_id) = '10000000-0000-4000-8000-000000000001';
end $$;
rollback;

\echo '# locations are stored by reference and saved once'
begin;
set local role service_role;
do $$
declare r record; again record;
begin
  select * into r from public.save_customer_location('40000000-0000-4000-8000-000000000002', 'wamid.pedro.loc',
                                                      21.1350, -86.7460, 'Hotel Zone km 9');
  assert (select payload ->> 'customer_location_id' from public.messages where id = r.message_id)::uuid = r.customer_location_id;
  assert (select kind from public.messages where id = r.message_id) = 'location';
  select * into again from public.save_customer_location('40000000-0000-4000-8000-000000000002', 'wamid.pedro.loc', 1, 1);
  assert again.duplicate and again.message_id = r.message_id, 'retry is a no-op';
  begin
    perform public.save_customer_location('40000000-0000-4000-8000-000000000002', 'wamid.bad', 91, 0);
    raise exception 'latitude 91 accepted';
  exception when sqlstate '22023' then null;
  end;
end $$;
rollback;

\echo '# outbox: each queued message is claimed once, receipts only move forward'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
insert into public.messages (conversation_id, tenant_id, sender, author_user_id, body)
values ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner',
        '20000000-0000-4000-8000-000000000001', 'On my way');
reset role;
set local role service_role;
do $$
declare claimed jsonb; m public.messages; msg_id uuid;
begin
  claimed := public.claim_outbox(10);
  assert jsonb_array_length(claimed) = 1, 'one queued message';
  assert claimed -> 0 ->> 'waId' = '15550000001' and claimed -> 0 ->> 'businessShortName' = 'Northside';
  assert jsonb_array_length(public.claim_outbox(10)) = 0, 'not claimed twice';
  msg_id := (claimed -> 0 ->> 'id')::uuid;
  m := public.record_outbound_result(msg_id, 'wamid.out.1');
  assert m.delivery = 'sent' and m.wa_message_id = 'wamid.out.1';
  assert public.record_delivery_status('wamid.out.1', 'read'), 'read';
  assert not public.record_delivery_status('wamid.out.1', 'delivered'), 'delivered after read is ignored';
  assert not public.record_delivery_status('wamid.ana.1', 'read'), 'customer messages are not outbound';
  assert (select delivery from public.messages where id = msg_id) = 'read';
end $$;
rollback;

\echo '# outbox: passing failures are retried with backoff, then marked failed'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
insert into public.messages (conversation_id, tenant_id, sender, author_user_id, body)
values ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner',
        '20000000-0000-4000-8000-000000000001', 'On my way');
reset role;
set local role service_role;
do $$
declare claimed jsonb; m public.messages; msg_id uuid; i integer;
begin
  claimed := public.claim_outbox(10);
  msg_id := (claimed -> 0 ->> 'id')::uuid;
  assert (claimed -> 0 ->> 'attempt')::int = 1, 'first attempt';
  m := public.record_outbound_result(msg_id, null, true);
  assert m.delivery = 'queued' and m.next_send_at > now(), 'queued again with a delay';
  assert jsonb_array_length(public.claim_outbox(10)) = 0, 'not before the delay';
  for i in 2..5 loop
    update public.messages set next_send_at = now() - interval '1 second' where id = msg_id;
    claimed := public.claim_outbox(10);
    assert (claimed -> 0 ->> 'attempt')::int = i, 'attempt ' || i;
    m := public.record_outbound_result(msg_id, null, true);
  end loop;
  assert m.delivery = 'failed' and m.next_send_at is null, 'gives up after 5 tries';
end $$;
rollback;

\echo '# outbox: a final failure is not retried, a stuck send is claimed again'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
insert into public.messages (conversation_id, tenant_id, sender, author_user_id, body)
values ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner',
        '20000000-0000-4000-8000-000000000001', 'Bad number'),
       ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner',
        '20000000-0000-4000-8000-000000000001', 'Lost mid-send');
reset role;
set local role service_role;
do $$
declare claimed jsonb; bad uuid; lost uuid;
begin
  claimed := public.claim_outbox(10);
  bad := (select (e ->> 'id')::uuid from jsonb_array_elements(claimed) e where e ->> 'body' = 'Bad number');
  lost := (select (e ->> 'id')::uuid from jsonb_array_elements(claimed) e where e ->> 'body' = 'Lost mid-send');
  assert (public.record_outbound_result(bad, null)).delivery = 'failed', 'no retry for a final error';
  assert jsonb_array_length(public.claim_outbox(10)) = 0, 'the lost send is not reclaimed at once';
  update public.messages set claimed_at = now() - interval '6 minutes' where id = lost;
  claimed := public.claim_outbox(10);
  assert jsonb_array_length(claimed) = 1 and (claimed -> 0 ->> 'id')::uuid = lost, 'stuck send claimed again';
end $$;
rollback;

\echo '# owner screens read through row-level security'
begin;
set local role authenticated;
set local request.jwt.claims to :'eastside';
do $$
declare offers jsonb;
begin
  offers := public.owner_offers('offered');
  assert jsonb_array_length(offers) = 1 and offers -> 0 ->> 'customerName' = 'Pedro M.', 'Eastside sees Pedro''s request';
  assert not (offers::text like '%15550000002%'), 'no phone number in the offer';
  assert jsonb_array_length(public.owner_offers('accepted')) = 0, 'not Northside''s accepted request';
  assert public.owner_offer((offers -> 0 ->> 'id')::uuid) ->> 'customerName' = 'Pedro M.', 'one offer by id';
  assert public.owner_offer('50000000-0000-4000-8000-000000000001') is null, 'Northside''s offer is hidden by id too';
  assert public.owner_offer('50000000-0000-4000-8000-0000000000ff') is null, 'unknown offer is null';
  assert jsonb_array_length(public.owner_jobs()) = 0, 'no other business''s jobs';
  begin
    perform public.owner_conversation_messages('40000000-0000-4000-8000-000000000001');
    raise exception 'Eastside read Ana''s chat';
  exception when sqlstate 'P0002' then null;
  end;
  begin
    perform public.claim_outbox(1);
    raise exception 'an owner claimed the outbox';
  exception when insufficient_privilege then null;
  end;
end $$;
set local request.jwt.claims to :'mario';
do $$
declare offers jsonb; chats jsonb; page jsonb; jobs jsonb;
begin
  offers := public.owner_offers('accepted');
  assert offers -> 0 ->> 'distanceKm' = '1.2' and offers -> 0 -> 'suggestedQuote' ->> 'min' = '130';
  assert jsonb_array_length(offers -> 0 -> 'media') = 1, 'the video, not the voice note';
  assert offers -> 0 ->> 'approxLocation' is not null, 'approximate location falls back to the distance';
  chats := public.owner_conversations();
  assert jsonb_array_length(chats) = 1 and chats -> 0 ->> 'title' = 'Toilet won''t stop running';
  assert (chats -> 0 ->> 'unread')::int = 4, 'unread was ' || (chats -> 0 ->> 'unread');
  perform public.mark_conversation_read('40000000-0000-4000-8000-000000000001');
  assert (public.owner_conversations() -> 0 ->> 'unread')::int = 0, 'read marker clears unread';
  page := public.owner_conversation_messages('40000000-0000-4000-8000-000000000001', null, 3);
  assert jsonb_array_length(page) = 3 and page -> 2 ->> 'text' = 'ok mario there 12:55', 'newest page, oldest first';
  assert page -> 2 ->> 'delivery' = 'as_written';
  jobs := public.owner_jobs();
  assert jobs -> 0 ->> 'technician' = 'Mario R.' and jobs -> 0 ->> 'shareConsent' = 'not_asked';
  assert jobs -> 0 -> 'location' = 'null'::jsonb, 'no address before approval';
end $$;
rollback;

\echo 'ok - functions'
