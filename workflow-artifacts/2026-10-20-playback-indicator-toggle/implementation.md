# Implementation evidence

Single writer; baseline main a85907f, only untracked run docs; no applicable AGENTS.md. No commits/push. Node24 PATH used throughout.

## 1 — Adapter positions (POS-01, POS-02, COMPAT-01)

Added controlled engine-clock and native status tests before implementation. `node --experimental-strip-types --test tests/web-audio.test.ts tests/native-playback.test.ts`: exit1, both new tests expected absolute1 but got undefined (adapter-red.txt). Implemented required handle getter, Web AudioContext time minus actual start origin + offset, finite clamp/freeze; native existing subscription caches confirmed playing status, holds through buffering/invalid status and cleanup. Same command exit0,15 tests (adapter-green.txt). `npm run typecheck` exit0, both platform resolutions. Existing handle doubles updated. Native timer now uses the last valid position too; no second subscription or UI clock.

## 2 — Service position lifecycle (POS-01/02, COMPAT-01)

Injected small scheduler and controlled handle positions in tests before production change. `node --experimental-strip-types --test tests/playback.test.ts`: exit1; first new test expected position1 but got undefined, repeated cycles expected one timer but got0 (service-red.txt). Other dependent timer tests could not tick absent timers and are not counted as behavioral Red. Implemented single50ms recursive timeout, generation+handle guards, unchanged-value suppression, finite fallback/clamp, subscriber reentrancy guard and shared failure cleanup. Same command exit0,10 tests (service-green.txt). `npm test` exit0,82 tests (tests-service.txt). Tests cover loading, terminal events, old queued callbacks, stop in subscriber, thrown reads, late handles and repeated cleanup.

## 3 — Boardbutton origin toggle (TOGGLE-01, COMPAT-01)

Real Playback+BoardSession integration tests before production change. `node --experimental-strip-types --test tests/playback.test.ts tests/board-session.test.ts`: exit1, same-button second press remained playing instead of idle, pending A–A still began audio, A–A–A began3 instead of2 (toggle-red.txt). Implemented origin as separate boardId/buttonId fields in Playback, assigned before awaits and cleared by common stop; explicit play retains restart, BoardSession forwards actual identity. Same command exit0,17 tests (toggle-green.txt); `npm test` exit0,87 tests (tests-toggle.txt); `npm run typecheck` exit0. Tests additionally cover same sound in two buttons, other boards, terminal/global/external-play/mode/board reset, loading sequences and stale handle/events. No mirrored origin in BoardSession.

## 4 — Editor/browser (POS-01/02, UX-01, TOGGLE-01, COMPAT-01)

Added `scripts/playback-indicator-smoke.mjs` before changing UI. First sandboxed server/Chrome attempts could not run; escalated local preview/Chrome succeeded. An initial setup run used the existing2s fixture with an invalid2.8s endpoint; corrected to a reproducible generated4s WAV written only in this run. Neither setup failure counts as Red. With real exported pre-UI app, source start observed and “Vorschau läuft” visible, `SOUNDBOARD_URL=http://localhost:8082 node scripts/playback-indicator-smoke.mjs` exited1 at `playing preview must expose an absolute current position` (count0≠1, ui-red.txt).

Implemented finite, matching-sound-only marker and absolute seconds in SoundEditor using service state; no UI timer/live region. Marker has white center/dark edges, with bounds preserved at timeline ends. README documents board stop/restart and explicit play behavior. Existing playback/board scripts accept `SOUNDBOARD_EVIDENCE_DIR` so historical MVP output remains untouched. No App/persistence/dependency changes needed.

Focused browser command after fresh `npm run build:web`: exit0 (ui-green.txt, indicator-browser-evidence.json). Same fixture/draft1–2.8s in4s file observed desktop1.151→1.360s and mobile1.099→1.354s; all samples agree with engine offset+context clock within0.2s, marker fraction with seconds/4 within0.01. Evidence includes start offset/duration and marker boxes. Actual browser verifies stop/end/change/reset/cancel/save/page reload cleanup, invalid draft disabling, preview does not save, board same-button stop/third restart/different same-sound replacement, keyboard Enter/Space, touch tap, global/mode/board stop; maximum active audio sources1. Both final active screenshots opened with view_image and inspected: marker/time readable, start/end and controls fit, no clipping/overlap or horizontal overflow at1024 and390px. Position text has no live ancestor. Screenshots: indicator-desktop-active.png and indicator-mobile-390-active.png.

Supplemental native invalid-status boundary test exposed Infinity falsely terminating playback (native-invalid-red.txt, command `node --experimental-strip-types --test tests/native-playback.test.ts`, exit1, removed1≠0). Added finite endpoint guard; final full suite exit0 includes that case. Strengthened separate-board same-button-ID test to compare the same active buttonId across boards.

## Final checks and handoff

All commands run from repository root, Node24 PATH. Code is quiescent for independent review; no commit/push.

- `npm test`: exit0,87 tests (tests-final.txt).
- `npm run typecheck`: exit0, native+web (typecheck-final.txt).
- `npm run build:web`: exit0, actual final export (build-web.txt). Local `npm run preview:web` running on127.0.0.1:8082 against dist/web; no use of ambient8081 for acceptance.
- `npm run export:ios`: exit0 (export-ios.txt), JavaScript/Hermes bundling only.
- `SOUNDBOARD_URL=http://localhost:8082 node scripts/playback-indicator-smoke.mjs`: exit0 after final marker refinement (ui-green.txt).
- `SOUNDBOARD_URL=http://localhost:8082 SOUNDBOARD_EVIDENCE_DIR=workflow-artifacts/2026-10-20-playback-indicator-toggle node scripts/playback-smoke.mjs`: exit0 (playback-regression.txt, playback-browser-evidence.json): real WAV/MP3 signal/880Hz trim/end boundary, unchanged bytes, save/cancel/reload, explicit restart/stop, context interruption, decoder failure/recovery.
- Same environment `node scripts/board-smoke.mjs`: exit0 (board-regression.txt, board-browser-evidence.json): existing twelve-button, layout/persistence/keyboard/touch/shared-trim/board-stop regression.
- `git diff --check`: exit0. Historical run outputs untouched.

Remaining platform limits: no physical iPhone/iPad execution or Safari/iOS browser test; native status/clock tests and iOS export prove contract/bundling rather than device behavior. Native endpoint remains status/timer based, not sample exact. Headless Chrome is muted and does not establish a human listening check. Existing broader MVP platform/audit limits remain; none claimed newly verified.
