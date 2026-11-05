---
status: in-progress
---

# Full flow verified: WhatsApp customer to approved visit

Objective: the flow from "hi" on WhatsApp to "Approve visit" runs against the deployed API and the live owner app, driven and recorded by the agent.

## Specs

- S1: the flow from "hi" on WhatsApp to "Approve visit" runs against the API and the live owner app, driven and recorded by the agent.

## Tasks

- T1 local stack run, recorded (Playwright + signed webhooks) — inline, job reached `customer_approved`.
- T2 same run against the deployed API — blocked on live-environment.

## Log

- L1 (2026-10-31) Local run PASS: customer turns via `scripts/e2e/step.sh`, owner via Playwright on Expo web (sign-in with Mailpit code, accept, quote), customer approves; job `customer_approved`. Video sent to the user in chat.
