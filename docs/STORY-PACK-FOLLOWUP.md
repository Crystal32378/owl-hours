# Story Pack concurrent-edit follow-up

This follow-up preserves the team's split Story Pack components and current owner
onboarding. It does not restore the earlier standalone magic-link screens.

The editor keeps a separate write version while local copy is dirty. Server status
and eligibility can refresh without authorizing a stale save. Every editor save
sends that original version, and the API in this follow-up applies it atomically. Successful
saves and explicit discards reset the baseline. A late save receipt cannot replace
a newer server approval, while an ordinary save followed by approval works even
before a parent-prop refresh arrives.

Dirty local copy cannot be exported. **Discard local edits** restores the current
saved copy before export. Approval and handoff require exactly one selected
before/after pair; live approval revisions must match the shared 64-hex contract.
Synthetic demo identifiers remain confined to demo mode.

## Deletion scope and confirmation

There is no job/conversation delete control or owner DELETE endpoint in the
inspected app. This follow-up adds an explanatory notice, not a delete action or
a simulated confirmation dialog. A notice cannot enforce confirmation for
privileged SQL or administrative operations.

Crystal selected deletion of linked Story Pack draft database rows when their
source job is deleted. The separate [data follow-up #58](https://github.com/ikabeee/owl-hours/pull/58) implements that policy; this
UI change alone does not activate it. Before any maintenance deletion, obtain
explicit confirmation of the target job and affected draft rows. Any future
owner-facing delete action must show and enforce that confirmation before calling
a destructive operation.

Draft database rows, original photo Storage objects, and backups are separate.
The Story-only deletion policy must not delete original photos used elsewhere.
Do not generalize job deletion to conversation/customer purges, which can have
broader database cascades. No production deletion was performed here. Hosted
backup configuration and retention have not been verified; no backup-erasure claim
is made. Previously downloaded ZIPs are also outside this database operation.

## Validation boundary

Mounted React hook regressions exercise both the editor and draft-action hooks,
including stale-save retention, remote approval, discard, pending edits and a
successful multi-version approval. API version-conflict tests are included here. SQL deletion and full PostGIS
validation belong to the separate deletion follow-up #58. Local tests and web/Android bundles are not hosted Auth/Storage or
physical-device acceptance. Those acceptance checks remain pending.
