---
status: in-progress
---

# Owner app on the live API: content post review

Objective: the content tab lists and reviews posts from `/v1/owner/content` in live mode.

## Specs

- S1: live mode lists the owner's drafts from GET /v1/owner/content/drafts; demo unchanged.
- S2: opening a draft shows it.
- S3: approving calls POST /content/drafts/:id/review and the list shows the new status.
- S4: operations with no API equivalent keep the screen working.
- S5: HTTP errors reject; no silent empty lists.

## Tasks

- T1 (S1-S5) live posts client + content runtime — delegated (Muse), commit `ecb195e`.
- T2 seed a reviewable draft for the demo owner — delegated (Muse), pending.

## Log

- L1 (2026-10-31) Session repositories-0a orchestrating Muse/Gemini. T1 done: owner 948/948, API 279/279, typecheck clean. Live check: Content tab reads the API but the demo owner has 0 sources/drafts, so T2 seeds one. Gaps: edited caption is not persisted on approve (OwnerApi has no `patch`); job photos in post review return null in live mode; regenerate has no API.
