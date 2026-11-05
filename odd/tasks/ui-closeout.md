---
status: in-progress
---

# UI close-out

Objective 7 of the owner UI build. Branch `chore/ui-closeout-handoff`, stacked on the payload chain (#78). Runner: owner `npm test`.

## Specs

- S1: Delete the `handoff-ui/` artifacts the live app replaced, per the AGENTS.md handoff retirement rule: the owner screen HTML/PNG pairs (OwChat, OwChatPolish, OwRequest) and `handoff-ui/owner-app/starter/`. Docs point at `apps/owner` instead.
- S2: The demo path runs on a real Android phone and an iPhone, WhatsApp + app, with no dead ends (`handoff-ui/HANDOFF-UI.md` §6); then delete its `handoff-ui/demo/{png,html}` pieces.

## Tasks

- T1: S1, route: inline, status: done (this branch).
- T2: S2, route: inline with the user (needs the mobile builds and two phones), status: pending; the user asked to leave the mobile builds for last.

## Log

- L1 (user, 2026-10-28): "Para tener toda la UI cual es la lista de tareas que faltan?" (objective 7 of that list).
- L2 (user, 2026-10-31): "continúa el goal anterior (cierra las sesiones que tengo en el zed)" and "deja las builds móviles al final". T1 done: the three remaining screen pairs and the starter deleted (every owner screen is live in `apps/owner`; the starter's demo numbers all appear in `apps/owner/shared/data/mock.ts`; its owl frames live in `apps/owner/shared/mascot/owl/`). AGENTS.md, HANDOFF-UI.md and the mascot README point at `apps/owner`. Next: T2 after the EAS builds.
