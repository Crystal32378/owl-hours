-- Owners link their Facebook Page (and its Instagram professional account) and
-- approved Story Packs are posted there (odd/tasks/owner-meta-publishing.md S2, S3, S5).
-- The API does the OAuth exchange and the Graph API calls as service_role; each
-- Page token lives only in Supabase Vault (https://supabase.com/docs/guides/database/vault)
-- and linked_accounts keeps its secret id. Owners keep their RLS: they see and unlink
-- their accounts, see their posts, and never reach a token.

-- Supabase installs Vault on every project; the plain-Postgres test run uses a stub.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'supabase_vault') then
    create extension if not exists supabase_vault;
  end if;
end
$$;

-- The business an owner links accounts for: 404 without one, 403 for staff.
create function public.caller_owned_business_id()
returns uuid
language sql stable security invoker
set search_path = ''
as $$ select private.caller_owned_business_id() $$;
revoke all on function public.caller_owned_business_id() from public, anon;
grant execute on function public.caller_owned_business_id() to authenticated, service_role;

-- The OAuth callback has no owner session, so the owner is checked here from the
-- user id the signed state carries.
create function private.assert_business_owner(p_tenant_id uuid, p_user_id uuid)
returns void
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.tenant_users tu
                 where tu.tenant_id = p_tenant_id and tu.user_id = p_user_id and tu.role = 'owner') then
    raise exception 'only the business owner can link accounts' using errcode = '42501';
  end if;
end
$$;

-- Upserts one link and stores its token in Vault, replacing the old token on a relink.
create function private.save_linked_account(p_tenant_id uuid, p_user_id uuid, p_platform public.social_platform,
  p_external_id text, p_display_name text, p_token text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_account public.linked_accounts;
begin
  perform private.assert_business_owner(p_tenant_id, p_user_id);
  if coalesce(char_length(p_token), 0) < 20 then
    raise exception 'access token missing' using errcode = '22023';
  end if;
  insert into public.linked_accounts (tenant_id, platform, external_id, display_name)
  values (p_tenant_id, p_platform, p_external_id, left(p_display_name, 120))
  on conflict (tenant_id, platform, external_id) do update set display_name = excluded.display_name
  returning * into v_account;
  if v_account.token_secret_id is null then
    update public.linked_accounts
    set token_secret_id = vault.create_secret(p_token, 'linked_account_' || v_account.id, 'Meta Page access token')
    where id = v_account.id;
  else
    perform vault.update_secret(v_account.token_secret_id, p_token);
  end if;
  return v_account.id;
end
$$;

create function private.linked_account_tokens(p_tenant_id uuid, p_user_id uuid)
returns table (id uuid, platform public.social_platform, external_id text, access_token text)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  perform private.assert_business_owner(p_tenant_id, p_user_id);
  return query
    select l.id, l.platform, l.external_id, s.decrypted_secret
    from public.linked_accounts l
    join vault.decrypted_secrets s on s.id = l.token_secret_id
    where l.tenant_id = p_tenant_id
    order by l.platform, l.created_at, l.id;
end
$$;

-- An unlink (or a deleted business) takes its token out of Vault too.
create function private.linked_accounts_forget_token()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  delete from vault.secrets where id = old.token_secret_id;
  return old;
end
$$;
create trigger linked_accounts_forget_token after delete on public.linked_accounts
  for each row when (old.token_secret_id is not null) execute function private.linked_accounts_forget_token();

create function public.save_linked_account(p_tenant_id uuid, p_user_id uuid, p_platform public.social_platform,
  p_external_id text, p_display_name text, p_token text)
returns uuid
language sql security invoker
set search_path = ''
as $$ select private.save_linked_account(p_tenant_id, p_user_id, p_platform, p_external_id, p_display_name, p_token) $$;

create function public.linked_account_tokens(p_tenant_id uuid, p_user_id uuid)
returns table (id uuid, platform public.social_platform, external_id text, access_token text)
language sql stable security invoker
set search_path = ''
as $$ select * from private.linked_account_tokens(p_tenant_id, p_user_id) $$;

revoke all on function private.assert_business_owner(uuid, uuid),
  private.save_linked_account(uuid, uuid, public.social_platform, text, text, text),
  private.linked_account_tokens(uuid, uuid),
  private.linked_accounts_forget_token(),
  public.save_linked_account(uuid, uuid, public.social_platform, text, text, text),
  public.linked_account_tokens(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.assert_business_owner(uuid, uuid),
  private.save_linked_account(uuid, uuid, public.social_platform, text, text, text),
  private.linked_account_tokens(uuid, uuid),
  public.save_linked_account(uuid, uuid, public.social_platform, text, text, text),
  public.linked_account_tokens(uuid, uuid)
  to service_role;

-- One post per draft and platform: a retry after a partial failure skips the
-- platforms already posted instead of posting them twice.
create table public.content_publications (
  draft_id uuid not null references public.content_drafts (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  platform public.social_platform not null,
  external_id text not null check (external_id ~ '^[0-9_]{1,64}$'),
  published_at timestamptz not null default now(),
  primary key (draft_id, platform)
);
create index content_publications_tenant_idx on public.content_publications (tenant_id);
alter table public.content_publications enable row level security;
grant select on public.content_publications to authenticated;
grant all on public.content_publications to service_role;
create policy content_publications_select on public.content_publications
  for select to authenticated using (tenant_id in (select private.user_tenant_ids()));

-- Records one platform's post id; the draft becomes published with the last one.
create function public.record_content_publication(p_draft_id uuid, p_platform public.social_platform, p_external_id text)
returns public.content_drafts
language plpgsql security invoker
set search_path = ''
as $$
declare
  d public.content_drafts;
begin
  select * into d from public.content_drafts where id = p_draft_id and deleted_at is null for update;
  if not found then
    raise exception 'draft not found' using errcode = 'P0002';
  end if;
  if d.status <> 'approved' or not (p_platform = any (d.platforms)) then
    raise exception 'draft is % and targets %', d.status, d.platforms using errcode = '22023';
  end if;
  insert into public.content_publications (draft_id, tenant_id, platform, external_id)
  values (d.id, d.tenant_id, p_platform, p_external_id);
  if not private.has_unposted_platform(d) then
    update public.content_drafts set status = 'published', published_at = now() where id = d.id returning * into d;
  end if;
  return d;
end
$$;
revoke all on function public.record_content_publication(uuid, public.social_platform, text) from public, anon, authenticated;
grant execute on function public.record_content_publication(uuid, public.social_platform, text) to service_role;

create function private.has_unposted_platform(d public.content_drafts)
returns boolean
language sql stable security invoker
set search_path = ''
as $$
  select exists (select 1 from unnest(d.platforms) as target(platform)
                 where not exists (select 1 from public.content_publications p
                                   where p.draft_id = d.id and p.platform = target.platform))
$$;

-- Story Packs may now be published, but only once every targeted platform posted.
-- Scheduling and the legacy single image stay manual-only.
create or replace function private.check_story_pack_manual_delivery()
returns trigger language plpgsql set search_path = ''
as $$ begin
  if new.source = 'story_pack' and (new.scheduled_at is not null or new.image_path is not null) then
    raise exception 'Story Packs support manual handoff only' using errcode = '23514';
  end if;
  if new.source = 'story_pack' and new.status = 'published'
     and (tg_op = 'INSERT' or old.status <> 'published') and private.has_unposted_platform(new) then
    raise exception 'a Story Pack is published only after every platform posted' using errcode = '23514';
  end if;
  return new;
end $$;
