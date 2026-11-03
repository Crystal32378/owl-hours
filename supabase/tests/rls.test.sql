-- Tenant isolation and column privacy. Each test runs in its own
-- transaction as a signed-in owner and rolls back.
-- Seed ids: Northside 1..01 (owner Mario 2..01), Eastside 1..02 (owner 2..02),
-- Ana's conversation 4..01 (accepted by Northside), Pedro's 4..02 (offered to Eastside).
\set ON_ERROR_STOP 1
\set mario '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}'
\set eastside '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}'
\set stranger '{"sub":"20000000-0000-4000-8000-000000000099","role":"authenticated"}'

\echo '# every public table has row level security on'
do $$
declare missing text;
begin
  select string_agg(c.relname, ', ') into missing
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  assert missing is null, 'tables without RLS: ' || missing;
end $$;

\echo '# no SECURITY DEFINER function in the API schema is callable by signed-in users'
do $$
declare exposed text;
begin
  select string_agg(p.proname, ', ') into exposed
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute');
  assert exposed is null, 'definer functions exposed over REST: ' || exposed;
end $$;

\echo '# every foreign key has a covering index'
do $$
declare missing text;
begin
  select string_agg(c.conrelid::regclass || '.' || c.conname, ', ') into missing
  from pg_constraint c
  where c.contype = 'f' and c.connamespace = 'public'::regnamespace
    and not exists (
      select 1 from pg_index i
      where i.indrelid = c.conrelid
        and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] @> c.conkey
        and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] <@ c.conkey
    );
  assert missing is null, 'foreign keys without an index: ' || missing;
end $$;

\echo '# an owner sees only conversations handed to their business'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$ begin
  assert (select count(*) from public.conversations) = 1, 'Mario should see 1 conversation';
  assert (select id from public.conversations) = '40000000-0000-4000-8000-000000000001', 'Mario should see Ana';
  assert (select count(*) from public.handoffs) = 1, 'Mario should see only his handoff';
end $$;
rollback;

begin;
set local role authenticated;
set local request.jwt.claims to :'eastside';
do $$ begin
  assert (select count(*) from public.conversations) = 1, 'Eastside should see 1 conversation';
  assert (select id from public.conversations) = '40000000-0000-4000-8000-000000000002', 'Eastside should see Pedro';
  assert (select count(*) from public.messages where conversation_id = '40000000-0000-4000-8000-000000000001') = 0,
    'Eastside must not read Ana''s messages';
end $$;
rollback;

\echo '# an owner reads the Zukki-phase evidence plus their own chat'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$ begin
  assert (select count(*) from public.messages) = 5, 'Mario should see Ana''s 5 messages';
  assert (select count(*) from public.media) = 2, 'Mario should see Ana''s video and voice note';
end $$;
rollback;

\echo '# a user with no business sees nothing private'
begin;
set local role authenticated;
set local request.jwt.claims to :'stranger';
do $$ begin
  assert (select count(*) from public.conversations) = 0, 'stranger sees conversations';
  assert (select count(*) from public.messages) = 0, 'stranger sees messages';
  assert (select count(*) from public.handoffs) = 0, 'stranger sees handoffs';
  assert (select count(*) from public.jobs) = 0, 'stranger sees jobs';
  assert (select count(*) from public.customers) = 0, 'stranger sees customers';
end $$;
rollback;

\echo '# the directory is readable by signed-in users, not anonymously'
begin;
set local role authenticated;
set local request.jwt.claims to :'stranger';
do $$ begin
  assert (select count(*) from public.tenants) = 4, 'directory should list 4 businesses';
  assert (select count(*) from public.price_rules) > 0, 'prices are public directory data';
end $$;
rollback;

begin;
set local role anon;
do $$ begin
  begin
    perform 1 from public.tenants;
    raise exception 'anon must not read tenants';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

\echo '# customer phone numbers are hidden from owners'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$ begin
  assert (select display_name from public.customers) = 'Ana L.', 'Mario should see Ana''s name';
  begin
    perform wa_id from public.customers;
    raise exception 'owners must not read wa_id';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

\echo '# the exact address unlocks only after the customer approves the visit'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$ begin
  assert (select count(*) from public.customer_locations) = 0, 'address visible before approval';
end $$;
reset role;
update public.jobs set state = 'customer_approved' where id = '80000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
  assert (select count(*) from public.customer_locations) = 1, 'address hidden after approval';
end $$;
rollback;

\echo '# owners edit their own profile only, and never their rating'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$
declare changed int;
begin
  update public.tenants set accepts_now = false where id = '10000000-0000-4000-8000-000000000001';
  get diagnostics changed = row_count;
  assert changed = 1, 'Mario should update Northside';
  update public.tenants set accepts_now = false where id = '10000000-0000-4000-8000-000000000002';
  get diagnostics changed = row_count;
  assert changed = 0, 'Mario must not update Eastside';
  update public.price_rules set max_amount = 999 where tenant_id = '10000000-0000-4000-8000-000000000002';
  get diagnostics changed = row_count;
  assert changed = 0, 'Mario must not change Eastside prices';
  begin
    update public.tenants set rating = 5 where id = '10000000-0000-4000-8000-000000000001';
    raise exception 'owners must not set their rating';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

\echo '# owners chat only in conversations they accepted, as written'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
insert into public.messages (conversation_id, tenant_id, sender, author_user_id, body)
values ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner',
        '20000000-0000-4000-8000-000000000001', 'On my way');
do $$ begin
  assert (select delivery from public.messages where body = 'On my way') = 'queued', 'owner message should be queued';
  begin
    insert into public.messages (conversation_id, tenant_id, sender, author_user_id, body)
    values ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'owner',
            '20000000-0000-4000-8000-000000000001', 'Hi Pedro');
    raise exception 'Mario must not write into Pedro''s conversation';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.messages (conversation_id, tenant_id, sender, author_user_id, body)
    values ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'zukki',
            '20000000-0000-4000-8000-000000000001', 'I am Zukki');
    raise exception 'owners must not write as Zukki';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.messages (conversation_id, tenant_id, sender, author_user_id, body, polished)
    values ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner',
            '20000000-0000-4000-8000-000000000001', 'x', true);
    raise exception 'owners must not mark a message as polished';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

\echo '# state and audit rows change only through the checked functions'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$ begin
  begin
    update public.jobs set state = 'done' where id = '80000000-0000-4000-8000-000000000001';
    raise exception 'owners must not write job state directly';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.handoffs set status = 'accepted';
    raise exception 'owners must not write handoff status directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.job_events (job_id, tenant_id, actor, to_state, reason)
    values ('80000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner', 'done', 'x');
    raise exception 'owners must not write audit rows';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.expire_handoffs();
    raise exception 'owners must not run the expiry job';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

\echo '# linked account tokens never leave the vault reference'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$ begin
  assert (select count(*) from public.linked_accounts) = 1, 'Mario should see his linked Page';
  begin
    perform token_secret_id from public.linked_accounts;
    raise exception 'owners must not read token_secret_id';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

begin;
set local role authenticated;
set local request.jwt.claims to :'eastside';
do $$ begin
  assert (select count(*) from public.linked_accounts) = 0, 'Eastside sees Northside accounts';
end $$;
rollback;

\echo '# push tokens belong to their user only'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
insert into public.push_tokens (user_id, expo_token, platform)
values ('20000000-0000-4000-8000-000000000001', 'ExponentPushToken[mario-test]', 'android');
do $$ begin
  begin
    insert into public.push_tokens (user_id, expo_token, platform)
    values ('20000000-0000-4000-8000-000000000002', 'ExponentPushToken[hijack]', 'android');
    raise exception 'users must not register tokens for others';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

\echo '# platform settings are server-only'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$ begin
  begin
    perform 1 from public.platform_settings;
    raise exception 'owners must not read platform settings';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

\echo '# message drafts stay inside the business'
begin;
insert into public.message_drafts (conversation_id, tenant_id, author_user_id, original_body)
values ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001', 'draft');
set local role authenticated;
set local request.jwt.claims to :'eastside';
do $$ begin
  assert (select count(*) from public.message_drafts) = 0, 'Eastside sees Northside drafts';
end $$;
set local request.jwt.claims to :'mario';
do $$ begin
  assert (select count(*) from public.message_drafts) = 1, 'Mario should see his draft';
end $$;
rollback;

\echo 'ok - rls'
