# Zukki mascot assets

This folder contains the supplied nine-action 2D owl sprite export. DOM screens consume these assets through `shared/mascot/Owl.tsx` and the per-state data-URI modules in `shared/mascot/owl/`. It is a web sprite export, not a newly installable ChatGPT v2 Pet.

## Files

- owl-nine-actions.png — transparent 8-column atlas, 1536 × 1872 pixels.
- animations/*.webp — transparent animated WebP files, one per action.
- owl-static.png — idle frame 0 for a reduced-motion fallback.
- animations.json — row order, frame counts, frame durations, looping, and file paths.

Each atlas cell is 192 × 208 pixels. Use the state row and frameCount in animations.json; do not render unused cells at the end of shorter rows. Keep the native cell bounds (or scale them uniformly) so the baseline and jump height stay aligned. The running state means active processing; use running-left or running-right for locomotion. For reduced motion, show owl-static.png.

## Consumers

The Content / Story Pack screen uses `review` in its drafts headers, `idle`
for empty states, and `failed` for errors, following the owner UI handoff's
placement rules. It reuses the shared component's static reduced-motion
fallback and uniform 192×208 cell scaling. The other six states remain
available to their existing workflow moments; Content does not import them.

This pack is the single source of truth for the owl. The UI handoff used to
carry its own copies (9 WebP + `static.png`, md5-identical) under `handoff-ui/`
in `owner-app/assets/owl/` and `demo/html/img/zukki/`; those were removed. Each of those folders keeps a
`README.md` with the restore command, plus an `avatar.png` (192x192 chat avatar
used by the handoff HTML mocks) that has no counterpart here yet.

Note: `apps/owner/shared/mascot/owl/static.ts` embeds the same idle frame as a
base64 data URI for the reduced-motion path.

## Source and usage

The supplied `golden-owl-nine-actions.zip` was checked against this folder and
the decoded DOM modules on 2026-10-29. All nine animated WebP files, the static
PNG, and the atlas PNG match the archive byte for byte (the atlas has no DOM
module). The repo's animation metadata additionally includes consumer paths.
Archive size: 9,578,949 bytes. Archive SHA-256:
`25742a9478680ff7d566305285fbb0cab4a7771d56c428aaae1d5e650fd1d760`.

The supplied archive describes the pack as intended for a teammate's home screen. Its QA export review says it was built with built-in image_gen. The archive contains no license file or redistribution statement, and the repository has no declared license. Please confirm the asset creator's rights and desired license before broader redistribution or commercial use.
