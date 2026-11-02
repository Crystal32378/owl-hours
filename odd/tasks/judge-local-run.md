---
status: in-progress
---
# Judge-runnable local run and e2e against a fake WhatsApp

Objective: anyone can run the customer flow from a clean clone, and our e2e flows prove the replies come from the API and the models, not static data. Branch `feat/judge-local-run`; delivery ask-on-risk, chained PRs of 500 lines at most; runner `node --test`.

## Specs

- S1. Goal: "arregla todos esos detalles, haz flujos e2e, checa que se está consumiendo la api y que no son datos estáticos."
- S2. Organizers: "Hosting is not required. Judges need a project that runs from the public repo's setup instructions, plus the demo video." Judges must run it "without signing up for their own account on an outside service", "for example with a local Postgres and seed data or a mock-data path, and keep keys and passwords out of the repo."
- S3. No e2e or judge run reaches the real WhatsApp API. The Graph host can be overridden only with a loopback URL; production behavior is unchanged when unset.
- S4. A video sent through the signed webhook runs the real pipeline and the customer receives the reading, and the marked frame when a valve is found.
- S5. The e2e proves the data is not static: different media give different readings, and a rejected Meta key produces no reading.
- S6. Without a Meta key the run replays answers recorded from real runs, and says so in the log. It must never pass as live. With a key it calls Meta.
- S7. The judge command never overwrites a developer's `apps/api/.env.local` or `apps/owner/.env.local`.

## Tasks

- T1 (S3, inline) Loopback overrides for the Graph host and the model base URL. Status: pending.
- T2 (S3, S4, S5, inline) Fake WhatsApp server and media e2e. Status: pending.
- T3 (S2, S6, S7, inline) Recorded models, judge command and USAGE. Status: pending.

Route: inline; no writer trigger (one behavior chain, each step depends on the last).

## Log

- L1 (2026-11-01, user): "arregla todos esos detalles, haz flujos e2e, checa que se está consumiendo la api y que no son datos estáticos."
- L2 (2026-11-02, Discord paste): hosting not required; see S2. Whether judges may use their own Meta key remains unanswered there; the official rules page returned 404.
