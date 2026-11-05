---
status: done
---

# Accepting an offer opens a job the owner can quote

Objective: a live request accepted in the owner app becomes a job, so the owner can send the quote the customer approves on WhatsApp.
Branch: `feat/live-accept-creates-job` from `main` d240ea1. Delivery: one work-unit commit, PR is the user's decision.
Test runner: `npm run test:db` (PostGIS container, `supabase/tests/*.test.sql`); `npm test`, `npm run typecheck`.

## Specs

Evidence: no migration or API code inserts into `public.jobs` (only `supabase/seed.sql:135`), while `send_quote` requires a job in `proposed` or `owner_confirmed` (`20261028113954_align_app_and_payloads.sql:186`). The flow in L1/L2 ("accepting it, sending a quote") cannot run for a new request.

- S1 When the owner accepts an offer in time, `accept_handoff` creates exactly one job for that handoff: same tenant and conversation, state `proposed`, title from the conversation title (fallback "Service request" when the conversation has none), `total_min`/`total_max` from the handoff's suggested range (currency keeps the jobs default; businesses have no currency column). Assumption: `proposed` matches the seeded demo job, so the job enters the existing quote path unchanged.
- S2 The creation is logged in `job_events` (`from_state` null → `proposed`, actor `owner`).
- S3 A late accept (offer expired) and a decline create no job.
- S4 The owner who accepted can send a quote on the new job with `send_quote`, and the job then moves to `owner_confirmed` (the existing approve-visit path takes it to `customer_approved`).
- S5 Tenant isolation holds: the new job is not visible to another business.

## Tasks

- [x] T1 S1–S5 — inline — RED migration test, then migration replacing `private.accept_handoff`; `docs/DECISIONS.md` D24. Risk: item 1 (migration of a live function) → independent verifier. Commit 946cd02. RED: "one job per accepted handoff"; GREEN: `npm run test:db` passed.

## Log

- L1 (2026-10-31) User: "Vamos a organizar un goal para dejar la aplicacion funcional. Y cuando acabes mandar un video y un tutorial (readme) de como usar el proyecto. TU MISMO HARAS LAS PRUEBAS Y NO VAS A PARAR HASTA QUE TENGAMOS UN FLUJO ENTERO DE DESARROLLO, EN CASO DE NECESITAR ALGUNA RESPUESTA HARAS UN CHAT EN LA UI DE CLAUDE PARA AVISARME SOBRE LO QUE NECESITAS"
- L2 (2026-10-31) Team request pasted by the user: customer records "from saying “hi” on WhatsApp through “Approve visit.”"; owner records "receiving the request, accepting it, sending a quote, and reviewing the post."
- L3 (2026-10-31) Map: owner app features other than auth, push tokens and story-pack default to fakes; Requests and Chats tabs are placeholders; no job is created on accept; owner onboarding creates no server business; owner web has no deploy. Baseline `npm run test:db` passes on d240ea1.
- L4 (2026-10-31) Close: `npm run test:db`, `npm test`, `npm run typecheck` pass (needed `CI=true pnpm install --frozen-lockfile`: node_modules was stale). Independent verifier: PASS on S1–S5 and invariants (rejected accepts change nothing, open_job not executable by authenticated/anon, full path to `customer_approved`, no double job insert). Advisories: no one-job-per-conversation constraint (re-offer after cancel would allow a second job); a job without a suggested range has no totals until the quote. Native review: medium, user declined for this candidate. Pending: the migration is not applied to the live Supabase (question 1 in https://claude.ai/artifact/S5we7oz7u4kFbSZmAPT1co). Next: live-owner-core.
