-- Onboarding's business step: the signed-in caller's first business is
-- created here (tenant + owner membership, one transaction); a caller who
-- already has a business updates it instead, so the step is idempotent.
-- Owners cannot insert tenants or memberships under row-level security, so
-- the write runs in a private definer that only ever touches the caller's
-- own business; the public entry point is security invoker.

create function private.create_or_update_caller_business(
  p_name text,
  p_category text,
  p_website text,
  p_owner_name text
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user is null then
    raise exception 'sign in to create a business' using errcode = '42501';
  end if;
  -- Two first calls at once must not create two businesses.
  perform pg_advisory_xact_lock(hashtextextended('owner_create_business:' || v_user::text, 0));

  v_id := private.caller_business_id();
  if v_id is null then
    perform private.insert_caller_business(v_user, p_name, p_category, p_website, p_owner_name);
    return;
  end if;
  if v_id not in (select private.user_owner_tenant_ids()) then
    raise exception 'only the business owner can change it' using errcode = '42501';
  end if;
  -- Same rule as owner_update_business: null keeps the website, empty clears it.
  -- The category is set once: owners have no grant on it, and customers search by it.
  update public.tenants set
    name = p_name,
    website = case when p_website is null then website else nullif(p_website, '') end
  where id = v_id;
end
$$;

-- Runs inside the definer above. The location is a placeholder (0, 0) until
-- onboarding asks for one; the business is not taking requests until its
-- owner switches it on.
create function private.insert_caller_business(
  p_user uuid,
  p_name text,
  p_category text,
  p_website text,
  p_owner_name text
)
returns void
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_short_name text := left(split_part(btrim(p_name), ' ', 1), 28);
  v_id uuid;
begin
  insert into public.tenants (slug, name, short_name, category, location, website)
  values (private.business_slug(p_name), p_name, v_short_name, p_category,
          private.geo_point(0, 0), nullif(p_website, ''))
  returning id into v_id;

  insert into public.tenant_users (tenant_id, user_id, role, display_name)
  values (v_id, p_user, 'owner', coalesce(nullif(left(btrim(p_owner_name), 80), ''), v_short_name));
end
$$;

-- "Ana's Locksmith & Keys" -> "anas-locksmith-keys-3f9a1c": the name in
-- slug form plus a random suffix, so two businesses with one name both fit.
create function private.business_slug(p_name text)
returns text
language sql volatile
set search_path = ''
as $$
  select coalesce(nullif(rtrim(left(base, 41), '-'), ''), 'business') || '-' || left(md5(gen_random_uuid()::text), 6)
  from (select btrim(regexp_replace(replace(lower(p_name), '''', ''), '[^a-z0-9]+', '-', 'g'), '-') as base) named
$$;

create function public.owner_create_business(
  p_name text,
  p_category text,
  p_website text default null,
  p_owner_name text default null
)
returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
begin
  perform private.create_or_update_caller_business(p_name, p_category, p_website, p_owner_name);
  return public.owner_business();
end
$$;

revoke all on function
  private.create_or_update_caller_business(text, text, text, text),
  private.insert_caller_business(uuid, text, text, text, text),
  private.business_slug(text),
  public.owner_create_business(text, text, text, text)
from public, anon;
grant execute on function
  private.create_or_update_caller_business(text, text, text, text),
  public.owner_create_business(text, text, text, text)
to authenticated, service_role;
grant execute on function
  private.insert_caller_business(uuid, text, text, text, text),
  private.business_slug(text)
to service_role;
