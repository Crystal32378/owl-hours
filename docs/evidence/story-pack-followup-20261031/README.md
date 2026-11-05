# Story Pack follow-up browser evidence

Actual browser captures of implementation `405d12b`, based on main `6af6cad`,
with `EXPO_PUBLIC_STORY_PACK_MODE=demo`. The narrow browser viewport is 507 × 841;
it is not iOS/Android device acceptance. All records/images are fictional.

Verified through the visible UI: create a demo draft, save caption A, type B,
discard local edits (A is restored), choose an export format, and approve.
The final Download control is enabled after approval; no platform post was sent.
The deletion notice is visible in both the overview and editor. No delete action
exists here, and no job, photo, Storage object or backup was deleted.

- [Overview and deletion scope](01-deletion-scope.jpg)
- [Unsaved copy and discard action](02-unsaved-discard.jpg)
- [Approved saved copy and enabled export](03-approved-export.jpg)

Mounted hook and API tests separately cover concurrency/late-response cases that
this single-tab demo does not establish. Hosted Auth/Storage, concurrent database
acceptance and physical-device login/rendering/sharing remain separate checks.
The database deletion policy is reviewed in [PR #58](https://github.com/ikabeee/owl-hours/pull/58).
