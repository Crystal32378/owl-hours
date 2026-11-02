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
- S8. Found by the judge run: an expired or declined request makes `GET /v1/owner/offers` answer 500 and the Requests tab shows "Something went wrong." The card must exist without customer data.

## Tasks

- T1 (S3, inline) Loopback overrides for the Graph host and the model base URL. Status: done, 9e355e7.
- T2 (S3, S4, S5, inline) Fake WhatsApp server and media e2e. Status: done, 9e355e7.
- T3 (S2, S6, S7, inline) Recorded models, judge command and USAGE. Status: done, c105529 and 9935ccb-series fix.
- T4 (S8, inline) Hidden requests keep a card without customer data. Status: done, db5068b. Risk: item 2.

Route: inline; no writer trigger (one behavior chain, each step depends on the last).

## Log

- L1 (2026-11-01, user): "arregla todos esos detalles, haz flujos e2e, checa que se está consumiendo la api y que no son datos estáticos."
- L2 (2026-11-02, Discord paste): hosting not required; see S2. Whether judges may use their own Meta key remains unanswered there; the official rules page returned 404.
- L3 (2026-11-02): on the local stack with fake WhatsApp credentials and the real key: media-flow PASS (different readings; marked frame sent), rejected key PASS (no reading, customer gets the category list again), run-live.sh PASS (job customer_approved), run-live-owner.sh PASS (business, prices, content from the database; switch writes accepts_now), run-live-onboarding.sh flow PASS with row owner-1793599677@e2e.example|plomeria|owner|1 area|21.162,-86.852. The demo owner's re-sign-in failed once on a Maestro openLink, passed on retry.
- L4 (2026-11-02): sample media generated with muse-image-1.0 so no real home goes in the public repo. The answers in scripts/local/recordings/demo.json were recorded from real runs.
- L5 (2026-11-02): from a clean clone with no key: run reached customer_approved in the browser (request card shows the marked photo, one job link in chat, quote sent, customer approved over the webhook). Found and fixed on the way: development overlay covered Send code; `--no-dev` lost the styles; `expo serve` answered Not Found on reload; GET /offers 500 after any expired or declined request; empty Video tile hid the marked photo; job link under every Zukki message; "she" in owner copy.
- L6 (2026-11-02): left for the user: per MESSAGES.md the customer gets no message after approving a visit; seed handoff 02 has no customer location, so its expired notice fails every 5 s in the local log.
- L7 (2026-11-02): a second customer in one judge run failed with EADDRNOTAVAIL. Measured about 600 connections a second to :8081 from Expo Go on the simulator, left open by the earlier e2e; closing it gave 3 of 3 customers connected and marked with no missing recording. Replay answers now cycle per key, which a run with several customers needs. The earlier explanation (only the replay's clamped index) was incomplete.

