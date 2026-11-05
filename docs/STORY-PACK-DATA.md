# Story Pack data contract

This slice provides owner-scoped photo assignment, saved three-slide drafts,
atomic owner approval and short-lived export authorization. It contains no owner
screen, native sharing or social publishing integration. See [API endpoints](API.md).

## Photo selection and text limits

Story Pack accepts and enforces exactly two photos: one `before` and one `after` photo.
Both the draft creation schema (`selectedMediaSchema`), review approval schema
(`expectedMedia`), API eligibility verification, and database function
`private.story_pack_is_eligible` require `cardinality = 2` with distinct IDs and
one `before` and one `after` role.

Text lengths are bounded by `STORY_PACK_LIMITS`:
- Slide title: 60 characters
- Slide body: 280 characters
- Title: 80 characters
- Caption: 2200 characters

## Evidence and attribution

`media.role` continues to describe the original customer evidence or job photo.
Story Pack uses nullable `media.story_role` (`before` / `after`) independently.
Choosing or replacing a pair never rewrites the original role. Replaced photos
keep their exact job and original `job_assigned_by` / `job_assigned_at`; only the
active Story role is cleared. Initially unassigned photos receive their first job
attribution once. Request evidence remains visible through `owner_offers`.

The assignment RPC still requires an owner membership, completed job, accepted
handoff, unambiguous conversation, original image and existing customer consent.
It cannot grant consent. Shared SQL helpers supply these rules and produce the
storage-path revision used by both the API and approval snapshot.

## Review and delivery

Approval compares the owner's displayed `updatedAt` and exact media IDs, Story
roles and revisions inside the locked database transition. SQL orders both
snapshots by ID text with the same C collation; API comparison matches fields by ID, independent of JSON key
order. A changed displayed version returns a conflict.

The review response is a receipt with `canHandoff: false`. Draft refresh and the
handoff endpoint obtain current eligibility. API review does not scan sources
before and after the authoritative RPC. Where signing requires external Storage
I/O, a post-sign read remains deliberate: revoked consent or reassignment during
signing must not cause stale links to be returned. This cannot recall a link
already issued; links expire after ten minutes. No-source/no-sign paths skip the
second read. Every actual export must authorize again.

## Source-job deletion: active database, photos, and backups

A new forward migration removes all linked `source = 'story_pack'` rows when the
source job is deleted, including approved packs. Its job trigger matches both
`source_job_id` and `tenant_id`; it does not change the shared foreign key or
cascade unrelated legacy marketing drafts. This deletes the draft copy, approval
snapshot and review metadata from the active database rather than merely hiding
the row. It is not a claim of secure erasure from database pages or backups.

There is currently no owner job/conversation DELETE API or deletion button. This
schema policy does not introduce one or execute a deletion. Any future UI or
maintenance procedure must show the job, affected draft counts and scope below,
and obtain explicit confirmation before the destructive operation.

- **Job deletion:** original `media` records remain and `job_id` becomes null.
  Photo roles, storage paths and other uses are not deleted by this trigger.
  The change calls no Storage delete operation and adds no garbage collector.
- **Legacy job-derived drafts:** the existing `source = 'job'` constraint can
  still block deletion. The whole transaction, including any Story draft deletion,
  rolls back. Do not silently remove those legacy drafts to bypass the constraint.
- **Conversation purge:** outside this change's authorized deletion scope. Its
  existing cascade removes media database rows, even where another draft's UUID
  array references them. Storage objects are not automatically removed and may
  become orphaned. Job-only photo preservation must not be claimed for a broader
  conversation purge.
- **Historical tombstones:** already detached rows with `deleted_at` remain
  unchanged. Story APIs hide them and reject writes/review/export; existing direct
  table SELECT permissions can still expose them to authorized tenant members.
  This migration does not perform a retrospective purge.
- **Backups and exported copies:** backup/PITR configuration and retention have
  not been verified. Do not promise immediate removal from backups or a retention
  duration. Previously downloaded ZIPs/images and external copies are not recalled.

Read-only preflight (bind `:job_id` to the exact reviewed job; no deletion occurs):

```sql
select j.id, j.title, j.tenant_id,
  count(*) filter (where d.source = 'story_pack') as story_pack_rows,
  count(*) filter (where d.source = 'story_pack' and d.status = 'approved') as approved_story_pack_rows,
  count(*) filter (where d.source = 'job') as blocking_legacy_job_drafts
from public.jobs j
left join public.content_drafts d
  on d.source_job_id = j.id and d.tenant_id = j.tenant_id
where j.id = :job_id
 group by j.id, j.title, j.tenant_id;
```

Suggested confirmation for a future deletion surface or maintenance review:

> Delete job “{jobTitle}” and its {storyPackCount} linked Story Pack drafts,
> including {approvedCount} approved packs, from the active database? Original
> photo records and Storage files are retained by this job deletion. Downloaded
> files are not recalled, and backup retention has not been verified. This action
> cannot be undone through the app.

If the preflight returns no job, stop. If it reports legacy blockers, stop and
review their retention policy separately. Recheck scope when executing; the preview is not a lock and a later
implementation must guard against changes between preview and confirmation.

Concurrent approval locks the draft before the job; job deletion takes those locks
in the opposite order. PostgreSQL can abort a transaction with deadlock code
`40P01`; that transaction rolls back, including its draft deletions. A maintenance
operator must stop, reload the preflight and reconfirm scope before retrying.
Do not blindly retry the destructive operation. A two-session concurrency test
remains pending; the focused single-session PostgreSQL WASM proof does not cover it.

T6's scheduling permissions and two-argument review remain available for its
existing sources. Story Pack independently blocks scheduling and publication.

## Migration and checks

The merged Story Pack history consolidated intermediate definitions into one
feature migration plus its preceding enum addition. This follow-up does not
rewrite those migrations or run any hosted migration. Current hosted deployment
state has not been verified. The enum must be committed before use, and the DB
harness applies each file transactionally.

Only disposable development/test databases that applied withdrawn round-2 Story
migration versions (`20261030102000`, `20261030103000`) may need recreation/reset
to adopt the consolidated history. Shared or production databases require a
separately reviewed forward migration and data-preservation plan. No reset is
authorized by this document. The source-job deletion policy is a new forward
migration; it does not rewrite the merged migration history.

Run `npm test`, `npm run typecheck`, and `bash scripts/db-test.sh`. SQL regressions
cover evidence visibility and original audit preservation, tenant boundaries,
consent revocation, exact selected photos, stale copy, role swaps and T6 behavior.
These local fixtures do not establish hosted Auth/Storage or device acceptance.

Follow-up local validation: the workspace JavaScript tests and all five TypeScript
checks pass. A disposable PostgreSQL 16.4 WASM fixture ran the exact new deletion
migration: the pre-migration test failed because linked Story rows remained;
after the migration all three focused cases passed (Story-row removal with
unrelated rows preserved, photo preservation, and mixed-legacy rollback).
This is not the full PostGIS/RLS suite or hosted Storage acceptance. The full
`bash scripts/db-test.sh` run remains required in the database CI job; the local
Docker engine was unavailable. No hosted migration, deletion, reset or backup
change was performed.
