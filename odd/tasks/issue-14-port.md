---
status: done
---

# Issue #14 port onto main

Port the still-needed parts of `fix/issue-14` onto main without the double job on accept, matching the migration history of the hosted Supabase project. Branch `fix/issue-14-port` (chained PRs, ≤500 lines each). Runners: root `npm test`, `npm run typecheck`, `npm run test:db`.

## Specs

- S1 — Agent, customer and system job moves follow the same edge table as owner moves, enforced in SQL (`record_job_transition`); issue #14 item 1.
- S2 — Accepting an offer opens exactly one `proposed` job. The hosted project already ran `20261029101127_job_rules_and_accept_job` (job opened in `resolve_handoff`) and main adds `20261031120000_accept_opens_job` (`open_job`): together they must not insert two jobs. Keep the three hosted migration versions (`20261029101127`, `20261029101147`, `20261029101214`) byte-identical so the repo history matches the hosted `schema_migrations`.
- S3 — Model and ffmpeg calls time out and fall back to the apology copy (issue #14 item 2).
- S4 — Outbox sends retry 429/5xx with backoff and reclaim rows stuck in `sent` without a `wa_message_id`; inbound messages with no reply are answered after a restart.
- S5 — A new category from the model replaces the old one while Zukki still has the chat.
- S6 — `public.owner_offer(id)` and the `approxLocation` "N km away" fallback; no duplicate of main's suggested-quote code.
- Out of scope: the branch's owner live clients (`2e02e3b`) and web push guards (`a707785`), both covered differently on main.

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S1, S2 | inline | done (`92ea6c2`, `63de58c`) | RED `accept_creates_job.test.sql` "one job per accepted handoff" → GREEN `npm run test:db` |
| T2 | S3, S5 | inline | done | `0d007c5`, `1d9800a`; api 294/294, meta-models 15/15 |
| T3 | S4 | inline | done | `c1c8aca`, `4fc2c13`, `364fa52`; api 300/300, DB outbox retry test |
| T4 | S6 | inline | done | api 302/302, `npm run test:db` |

## Log

- L1 (user, 2026-11-01): "Checa esta rama https://github.com/ikabeee/owl-hours/tree/fix/issue-14 Despues de checar esa rama haremos un PR y encontraremos una solucion para poder deployear una db en railway"
- L2: mapping (explorer, spot-checked): keep 779e323 edge table, d46c807, 1ef783e, 5401d74, 3f7b4f6, parts of 6a4f1a3; drop 2e02e3b, a707785 and the `resolve_handoff` job insert (with main's `open_job` it inserts two jobs per accept; `jobs.handoff_id` has no unique index).
- L3 (user, 2026-11-01): hosted `schema_migrations` = main's first 13 + `20261029101127/101147/101214`; missing `20261031120000_accept_opens_job` and `20261101000000_story_pack_job_delete`.
- L4: all four units GREEN. The three hosted migrations are byte-identical to `fix/issue-14` under `20261029101127/101147/101214`; `20261101100000_accept_opens_one_job` makes `open_job` return the job `resolve_handoff` opened (D28). Root `npm test` and `npm run typecheck` 5/5, `npm run test:db` passed. Applying main to the hosted project now adds `20261031120000`, `20261101000000` and `20261101100000`. Next: the Railway deploy (API on Railway; the database question decides where Postgres lives).
