-- Remove derived Story Pack rows when their source job is explicitly deleted.
-- Preserve the shared FK and legacy marketing retention. No media or Storage
-- objects are deleted here; historical detached tombstones are unchanged.
create function private.delete_job_story_packs()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.content_drafts
  where source = 'story_pack'
    and source_job_id = old.id
    and tenant_id = old.tenant_id;
  return old;
end;
$$;
revoke all on function private.delete_job_story_packs() from public, anon, authenticated;

create trigger jobs_delete_story_packs
  before delete on public.jobs
  for each row execute function private.delete_job_story_packs();
