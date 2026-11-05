-- Facebook Page / Instagram linking and publishing (odd/tasks/owner-meta-publishing.md S2, S3, S5).
-- The API links accounts and records posts as service_role; owners only see and unlink.
-- Seed ids: Northside 1..01 (owner Mario 2..01), Eastside 1..02 (owner 2..02). Each test rolls back.
\set ON_ERROR_STOP 1
\set mario '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}'
\set eastside '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}'
\set stranger '{"sub":"20000000-0000-4000-8000-000000000099","role":"authenticated"}'

\echo '# owners start linking only for the business they own'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$ begin
  assert public.caller_owned_business_id() = '10000000-0000-4000-8000-000000000001', 'Mario links Northside';
end $$;
set local request.jwt.claims to :'stranger';
do $$ begin
  perform public.caller_owned_business_id();
  raise exception 'a user without a business got one';
exception when sqlstate 'P0002' then null;
end $$;
rollback;

\echo '# linking stores the Page token in Vault and relinking replaces it in place'
begin;
set local role service_role;
do $$
declare first_id uuid; second_id uuid; secret uuid;
begin
  first_id := public.save_linked_account('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
    'facebook_page', '555000111', 'Northside Page', 'page-token-first-0123456789');
  second_id := public.save_linked_account('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
    'facebook_page', '555000111', 'Northside Page renamed', 'page-token-second-0123456789');
  assert first_id = second_id, 'relinking the same Page created a second row';
  select token_secret_id into secret from public.linked_accounts where id = first_id;
  assert secret is not null, 'no Vault secret id stored';
  assert (select display_name from public.linked_accounts where id = first_id) = 'Northside Page renamed', 'name not updated';
  assert (select access_token from public.linked_account_tokens('10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001') where id = first_id) = 'page-token-second-0123456789', 'token not replaced';
end $$;
reset role;
do $$ begin
  assert (select count(*) from vault.secrets where secret like 'page-token-%') = 1, 'relinking left an old secret behind';
end $$;
rollback;

\echo '# only the business owner can link or read tokens'
begin;
set local role service_role;
do $$ begin
  begin
    perform public.save_linked_account('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002',
      'instagram', '1784000111', 'eastside_ig', 'page-token-eastside-0123456789');
    raise exception 'Eastside linked an account to Northside';
  exception when insufficient_privilege then null; end;
  begin
    perform public.linked_account_tokens('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002');
    raise exception 'Eastside read Northside tokens';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

\echo '# owners cannot reach tokens, Vault or the server-side functions'
begin;
set local role service_role;
do $$ begin
  perform public.save_linked_account('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
    'facebook_page', '555000111', 'Northside Page', 'page-token-first-0123456789');
end $$;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$ begin
  begin
    perform token_secret_id from public.linked_accounts;
    raise exception 'owners must not read token_secret_id';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from vault.decrypted_secrets;
    raise exception 'owners must not read Vault';
  exception when insufficient_privilege then null; end;
  begin
    perform public.linked_account_tokens('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001');
    raise exception 'owners must not read tokens';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_linked_account('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
      'instagram', '1784000111', 'mine', 'page-token-owner-0123456789');
    raise exception 'owners must not link directly';
  exception when insufficient_privilege then null; end;
  begin
    perform public.record_content_publication(gen_random_uuid(), 'instagram', '1784');
    raise exception 'owners must not record publications';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

\echo '# unlinking deletes the Vault secret with the row'
begin;
set local role service_role;
do $$ begin
  perform public.save_linked_account('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
    'instagram', '1784000111', 'northside_ig', 'page-token-unlink-0123456789');
end $$;
set local role authenticated;
set local request.jwt.claims to :'mario';
delete from public.linked_accounts where external_id = '1784000111';
reset role;
do $$ begin
  assert not exists (select 1 from public.linked_accounts where external_id = '1784000111'), 'row not deleted';
  assert not exists (select 1 from vault.secrets where secret = 'page-token-unlink-0123456789'), 'secret left in Vault';
end $$;
rollback;

\echo '# a Story Pack is published only after every targeted platform posted'
begin;
update public.jobs set state = 'done' where id = '80000000-0000-4000-8000-000000000001';
insert into public.media (id, conversation_id, job_id, kind, role, story_role, storage_path, mime_type)
values
 ('60000000-0000-4000-8000-000000000071', '40000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001',
  'image', 'before_photo', 'before', 'conversations/40000000-0000-4000-8000-000000000001/meta-before.jpg', 'image/jpeg'),
 ('60000000-0000-4000-8000-000000000072', '40000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001',
  'image', 'after_photo', 'after', 'conversations/40000000-0000-4000-8000-000000000001/meta-after.jpg', 'image/jpeg');
insert into public.consents (conversation_id, kind, granted, source_message_id, at)
values ('40000000-0000-4000-8000-000000000001', 'photos_for_marketing', true, null, '2099-02-01 00:00:00+00');
set local role authenticated;
set local request.jwt.claims to :'mario';
insert into public.content_drafts (tenant_id, source, source_job_id, source_media_ids, title, caption, platforms, slides)
values ('10000000-0000-4000-8000-000000000001', 'story_pack', '80000000-0000-4000-8000-000000000001',
 array['60000000-0000-4000-8000-000000000071'::uuid, '60000000-0000-4000-8000-000000000072'::uuid],
 'Meta publishing fixture', 'A completed repair.', array['facebook_page', 'instagram']::public.social_platform[],
 '[{"title":"Before","body":"Leak"},{"title":"After","body":"Repaired"},{"title":"Contact","body":"Message us"}]');
do $$
declare d public.content_drafts;
begin
  select * into d from public.content_drafts where title = 'Meta publishing fixture';
  perform public.review_content_draft(d.id, true, d.updated_at,
    private.story_pack_media_snapshot(d.source_job_id, d.source_media_ids));
end $$;
set local role service_role;
do $$
declare d public.content_drafts;
begin
  select * into d from public.content_drafts where title = 'Meta publishing fixture';
  d := public.record_content_publication(d.id, 'facebook_page', '555000111_9001');
  assert d.status = 'approved' and d.published_at is null, 'published before Instagram posted';
  begin
    perform public.record_content_publication(d.id, 'facebook_page', '555000111_9002');
    raise exception 'a platform was recorded twice';
  exception when unique_violation then null; end;
  d := public.record_content_publication(d.id, 'instagram', '1789000');
  assert d.status = 'published' and d.published_at is not null, 'not published after every platform posted';
  begin
    perform public.record_content_publication(d.id, 'instagram', '1789001');
    raise exception 'recorded a post on a published draft';
  exception when sqlstate '22023' then null; end;
end $$;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$ begin
  assert (select count(*) from public.content_publications) = 2, 'Mario should see both posts';
end $$;
set local request.jwt.claims to :'eastside';
do $$ begin
  assert (select count(*) from public.content_publications) = 0, 'Eastside sees Northside posts';
end $$;
rollback;

\echo '# an OAuth state nonce is consumed once; expired nonces are purged'
begin;
set local role service_role;
do $$ begin
  assert public.consume_meta_oauth_nonce('nonce-once-0123456789', now() + interval '10 minutes'), 'first callback refused';
  assert not public.consume_meta_oauth_nonce('nonce-once-0123456789', now() + interval '10 minutes'), 'the same state was accepted twice';
  assert public.consume_meta_oauth_nonce('nonce-other-0123456789', now() + interval '10 minutes'), 'another state refused';
end $$;
reset role;
insert into private.meta_oauth_nonces (nonce, expires_at) values ('nonce-stale-0123456789', now() - interval '2 hours');
set local role service_role;
do $$ begin
  perform public.consume_meta_oauth_nonce('nonce-purge-0123456789', now() + interval '10 minutes');
end $$;
reset role;
do $$ begin
  assert not exists (select 1 from private.meta_oauth_nonces where nonce = 'nonce-stale-0123456789'), 'an expired nonce was kept';
end $$;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$ begin
  perform public.consume_meta_oauth_nonce('nonce-owner-0123456789', now() + interval '10 minutes');
  raise exception 'owners must not consume OAuth nonces';
exception when insufficient_privilege then null;
end $$;
rollback;

\echo '# one request at a time posts each platform; a failed post releases it; posted platforms stay claimed'
begin;
update public.jobs set state = 'done' where id = '80000000-0000-4000-8000-000000000001';
insert into public.media (id, conversation_id, job_id, kind, role, story_role, storage_path, mime_type)
values
 ('60000000-0000-4000-8000-000000000073', '40000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001',
  'image', 'before_photo', 'before', 'conversations/40000000-0000-4000-8000-000000000001/claim-before.jpg', 'image/jpeg'),
 ('60000000-0000-4000-8000-000000000074', '40000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001',
  'image', 'after_photo', 'after', 'conversations/40000000-0000-4000-8000-000000000001/claim-after.jpg', 'image/jpeg');
insert into public.consents (conversation_id, kind, granted, source_message_id, at)
values ('40000000-0000-4000-8000-000000000001', 'photos_for_marketing', true, null, '2099-02-01 00:00:00+00');
set local role authenticated;
set local request.jwt.claims to :'mario';
insert into public.content_drafts (tenant_id, source, source_job_id, source_media_ids, title, caption, platforms, slides)
values ('10000000-0000-4000-8000-000000000001', 'story_pack', '80000000-0000-4000-8000-000000000001',
 array['60000000-0000-4000-8000-000000000073'::uuid, '60000000-0000-4000-8000-000000000074'::uuid],
 'Meta claim fixture', 'A completed repair.', array['facebook_page', 'instagram']::public.social_platform[],
 '[{"title":"Before","body":"Leak"},{"title":"After","body":"Repaired"},{"title":"Contact","body":"Message us"}]');
do $$
declare d public.content_drafts;
begin
  select * into d from public.content_drafts where title = 'Meta claim fixture';
  perform public.review_content_draft(d.id, true, d.updated_at,
    private.story_pack_media_snapshot(d.source_job_id, d.source_media_ids));
end $$;
do $$
declare d public.content_drafts;
begin
  select * into d from public.content_drafts where title = 'Meta claim fixture';
  perform public.claim_content_publication(d.id, 'facebook_page');
  raise exception 'owners must not claim publications';
exception when insufficient_privilege then null;
end $$;
set local role service_role;
do $$
declare d public.content_drafts;
begin
  select * into d from public.content_drafts where title = 'Meta claim fixture';
  assert public.claim_content_publication(d.id, 'facebook_page'), 'first claim refused';
  assert not public.claim_content_publication(d.id, 'facebook_page'), 'a second request claimed the same platform';
  assert public.claim_content_publication(d.id, 'instagram'), 'the other platform could not be claimed';
  perform public.release_content_publication(d.id, 'instagram');
  assert public.claim_content_publication(d.id, 'instagram'), 'a released platform could not be claimed again';
  d := public.record_content_publication(d.id, 'facebook_page', 'AbC-123_9');
  assert (select external_id from public.content_publications where draft_id = d.id and platform = 'facebook_page') = 'AbC-123_9',
    'a Graph post id was not recorded';
  perform public.release_content_publication(d.id, 'facebook_page');
  assert not public.claim_content_publication(d.id, 'facebook_page'), 'a posted platform was claimed again';
end $$;
reset role;
update private.content_publication_claims set claimed_at = now() - interval '16 minutes' where platform = 'instagram';
set local role service_role;
do $$
declare d public.content_drafts;
begin
  select * into d from public.content_drafts where title = 'Meta claim fixture';
  assert public.claim_content_publication(d.id, 'instagram'), 'an abandoned claim was never taken over';
end $$;
rollback;

\echo '# owners keep editing Story Packs; the server-side helpers stay closed to them'
begin;
update public.jobs set state = 'done' where id = '80000000-0000-4000-8000-000000000001';
insert into public.media (id, conversation_id, job_id, kind, role, story_role, storage_path, mime_type)
values
 ('60000000-0000-4000-8000-000000000075', '40000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001',
  'image', 'before_photo', 'before', 'conversations/40000000-0000-4000-8000-000000000001/grant-before.jpg', 'image/jpeg'),
 ('60000000-0000-4000-8000-000000000076', '40000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001',
  'image', 'after_photo', 'after', 'conversations/40000000-0000-4000-8000-000000000001/grant-after.jpg', 'image/jpeg');
insert into public.consents (conversation_id, kind, granted, source_message_id, at)
values ('40000000-0000-4000-8000-000000000001', 'photos_for_marketing', true, null, '2099-02-01 00:00:00+00');
set local role authenticated;
set local request.jwt.claims to :'mario';
insert into public.content_drafts (tenant_id, source, source_job_id, source_media_ids, title, caption, platforms, slides)
values ('10000000-0000-4000-8000-000000000001', 'story_pack', '80000000-0000-4000-8000-000000000001',
 array['60000000-0000-4000-8000-000000000075'::uuid, '60000000-0000-4000-8000-000000000076'::uuid],
 'Meta grant fixture', 'A completed repair.', array['facebook_page']::public.social_platform[],
 '[{"title":"Before","body":"Leak"},{"title":"After","body":"Repaired"},{"title":"Contact","body":"Message us"}]');
update public.content_drafts set caption = 'An edited caption.' where title = 'Meta grant fixture';
do $$
declare d public.content_drafts;
begin
  assert (select caption from public.content_drafts where title = 'Meta grant fixture') = 'An edited caption.', 'caption not edited';
  select * into d from public.content_drafts where title = 'Meta grant fixture';
  begin
    perform private.has_unposted_platform(d);
    raise exception 'owners must not call has_unposted_platform';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.content_publications (draft_id, tenant_id, platform, external_id)
    values (d.id, d.tenant_id, 'facebook_page', '1');
    raise exception 'owners must not insert publications';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert not has_function_privilege('anon', 'private.has_unposted_platform(public.content_drafts)', 'execute'), 'anon can run it';
  assert not has_table_privilege('anon', 'public.content_publications', 'insert'), 'anon can insert publications';
  assert not has_table_privilege('authenticated', 'public.content_publications', 'update'), 'owners can update publications';
  assert not has_table_privilege('authenticated', 'public.content_publications', 'delete'), 'owners can delete publications';
end $$;
rollback;
