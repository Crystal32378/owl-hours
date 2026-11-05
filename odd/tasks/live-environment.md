---
status: pending
---

# Live environment: demo owner, owner web deploy, CORS

Objective: a tester can open the owner app at a URL, sign in with an emailed code as a demo business owner, and talk to the deployed API.

## Specs

Blocked on the user: which accounts host the API (Railway config exists), hosted Supabase (migrations, Email provider, `{{ .Token }}` templates) and the owner web app.

## Tasks

- T1 mobile builds: `apps/owner/eas.json` (development, preview APK, production) and ids `com.owlhours.zukki.owner`, commit `f78fd21`; documented in `docs/USAGE.md` section 8.

## Log

- L1 (2026-10-31) No deploy CLI or deployed URL exists on the laptop; deploying is outward-facing, asked the user for accounts. Next: `eas login` + `eas init` (user) for APK and push.
