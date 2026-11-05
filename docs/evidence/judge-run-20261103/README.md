# Judge run evidence, 2026-11-03

The same demo, run twice with `scripts/local/judge.sh` from a fresh clone: once with no key (recorded answers) and once with a Meta key (live models). Both reached an approved visit in the owner app.

| | [`replay/`](replay/) | [`live/`](live/) |
|---|---|---|
| Models | Recorded answers, no call to Meta | `muse-spark-1.3` and `sam-3.1` called live |
| Chat page says | `Recorded model answers: this run does not call Meta.` | `Live models: this run calls Meta.` |
| API log says | `not calling Meta` | The models the key can see |
| Media check | Not run (it needs a key) | `media-flow.mjs`: PASS, two media get different readings |
| Screen recording | None | [`both-sides.mp4`](live/both-sides.mp4), 1:41, customer left and owner right |

## Files in each folder

| File | What it shows |
|---|---|
| `terminal.txt` | What `judge.sh` printed |
| `api.txt` | The API log |
| `customer-chat.txt` | The customer's whole conversation |
| `01-customer-valve-marked.png` | The photo with the shut-off valve circled |
| `02-owner-request.png` | The request in the owner app |
| `03-owner-quote.png` | The quote before sending |
| `04-customer-approved.png` | The customer approving the visit |
| `05-owner-job.png` | The approved job in the owner app |

`replay/models.txt` is the log of the server that replays the recordings. Its two `no recording` lines come from requests sent by hand to confirm that it refuses anything it has no recording for.

## How to read it

- **Answers differ between runs.** The replay's job title is `Sink pipe leaking onto floor`; the live one is `Fuga de agua bajo lavabo`.
- **The clone had two local changes.** A temporary Supabase project name, so the run started from an empty database, and the chat page's model note, which this same change adds to the repo.
- **The live run came second, on the same database.** So its Jobs screen also shows the replay's job.
- **What was removed.** Paths to temp folders, signed URLs and the key's fingerprint were replaced with placeholders, and setup noise such as migration lines was dropped from the logs.
- **Not covered here.** Voice notes, Polish with Zukki, Test Zukki and posting to Facebook or Instagram were not run.
- **WhatsApp was simulated in both runs.** See [what is real and what is simulated](../../../README.md#what-is-real-what-is-simulated).

## The models step by step

[`under-the-hood.mp4`](under-the-hood.mp4) is an earlier cut of the demo video. It shows real output recorded from a live run on Nov 2: the same answers the no-key demo replays. [`under-the-hood.gif`](under-the-hood.gif) is its silent preview for the README.
