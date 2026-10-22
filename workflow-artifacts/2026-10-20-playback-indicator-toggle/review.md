# Independent review

Verdict: **pass**. No actionable findings and no open blocking findings. Review completed 2026-10-22 against the original incremental request, unchanged requirements and plan. Physical-device/Safari/hearing limits below are outside required acceptance for this run; no user risk acceptance is inferred.

## Reviewed version and scope

Reviewer: independent `/root/playback_review`, requested Sol/high for the async session/timer and adapter-contract risk; actual runtime model metadata is not exposed. Implementer was quiescent. Reviewer changed only this report and review-specific evidence.

Baseline and HEAD: `a85907f30c80036fe1754e81540f21e77cf11a5a`. Reviewed the actual working-tree diff, all 14 relevant changed/new files, including the untracked `scripts/playback-indicator-smoke.mjs`, plus surrounding App, native adapter, trim validation and board/UI routing. Exact captured change: `reviewed-diff.patch`, SHA-256 `ca17cea9a7c89f047ac698bcace3983f46c8ede0fd669e672469af01df067723`. Per-file SHA-256 values are in `reviewed-version.json`; all 14 rechecked unchanged after independent tests/browser execution. Volatile reports, fixtures, screenshots and dist output are excluded from the reviewed change snapshot.

Read request.md, requirements.md, plan.md, implementation.md, state.md, the review/quality/workflow instructions, actual tests and the recorded Red/Green logs. Adapter Red fails on undefined position, service Red includes absent published position and timer, toggle Red reproduces restart instead of stop and pending-start races, and browser Red reaches actual preview playback before asserting the missing position element. Setup/sandbox failures are correctly excluded from behavioral Red claims.

## Acceptance and design assessment

| Criteria | Reviewed implementation and evidence |
| --- | --- |
| AC-POS-01a–d | Web handle reports absolute offset plus AudioContext time, with finite clamp/freeze. Native reuses the existing status subscription, accepts confirmed nonbuffering playing positions and holds the cached value during buffering. Service adds no loading timer or wall-time extrapolation. Focused adapter/service tests and real exported Chrome samples verify bounds, nonzero start, progression, engine agreement and full-file marker geometry. |
| AC-POS-02a–d | Generation and handle identity guard each poll; stop clears timer before abort/handle cleanup. Poll rechecks after subscriber publication. Tests cover terminal events, delayed handles, stale queued callbacks, throwing reads, synchronous subscriber stop, pre-adoption terminal event and repeated cycles. Editor gates position on matching sound and playing state. Browser verifies stop/end/change/reset/save/cancel/reload removal and no reappearance. |
| AC-TOGGLE-01a–e | Playback owns concrete boardId/buttonId origin, assigned before awaits and cleared through the shared stop path. Explicit play remains a restart. Real BoardSession/Playback tests cover same-sound different buttons, identical button IDs across boards, loading A–A/A–B/A–A–A, delayed old handle/events, and terminal/global/external-play/mode/board release. Chrome verifies second press produces no new source and third restarts, with maximum active source count one. |
| AC-COMPAT-01a–d | Existing board/edit/mode/global-stop paths remain intact, preview still passes validated draft range, persistence/files/dependencies are unchanged, gesture unlock still runs synchronously before awaits, and WebAudio still enforces offset/duration in the engine. Existing error/abort/interruption tests remain. Recorded playback and board regression outputs substantiate trim/asset integrity, decoder failure/recovery, explicit restarts, shared trims and board behavior. |
| AC-UX-01a–b | Actual active desktop and 390px screenshots independently opened and inspected: marker is distinguishable, seconds/fields/actions are readable and fit without overlap or horizontal clipping. Position text has no live ancestor; unchanged status announcements remain separate. Chrome exercises Enter/Space and touch for stop. README matches the new board semantics. |

The change follows the existing adapter → service → UI ownership boundaries. A required internal position getter makes overlooked adapters/doubles type-visible. One service polling timeout and the existing generation mechanism avoid duplicate lifecycle ownership; the scheduler seam supports deterministic lifecycle checks without UI timing infrastructure. The native finite endpoint guard also prevents Infinity falsely ending playback. No new dependency, persistence format, general framework or unrelated application change was introduced. The small ongoing polling cost for board/library playback is the explicitly planned simplicity tradeoff.

## Independent checks

- `node --experimental-strip-types --test tests/playback.test.ts tests/board-session.test.ts tests/native-playback.test.ts tests/web-audio.test.ts`: exit 0, **32/32**, `review-tests.txt`.
- `SOUNDBOARD_URL=http://localhost:8082 SOUNDBOARD_EVIDENCE_DIR=workflow-artifacts/2026-10-20-playback-indicator-toggle/review-evidence node scripts/playback-indicator-smoke.mjs`: exit 0, Chrome 155, `review-browser-escalated.txt` and `review-evidence/indicator-browser-evidence.json`. First sandbox attempt terminated Chrome at launch (`review-browser.txt`); approved escalated execution resolved the environment restriction, with no application failure.
- Fresh browser samples progressed **1.104 → 1.360 s** on both desktop and 390px; engine difference stayed below the documented 0.2s scheduler tolerance. Draft source start was 1s with 1.8s duration; full-file timeline used the 4s fixture. Stop/end/editor/global/mode/board paths, keyboard/touch and maximum-one-source assertions passed. Both freshly captured active screenshots were visually inspected.
- Independently matched Web and iOS sourcemap source content for each applicable changed runtime module to the current workspace: **8/8 exact matches**, `review-export-source-match.json`. This connects browser/export evidence to the reviewed production source. Initial map probe assumed a flat Web map; adapting the inspection to indexed map sections resolved that inspection-only failure.
- `git diff --check`: exit 0. Final per-file hash recheck: exit 0, 14 unchanged files.

Reviewed, without needlessly repeating: developer's final 87/87 suite, both TypeScript resolutions, actual Web export and iOS/Hermes export, plus existing playback and board regression runs. Their logs contain the corresponding successful results; exports contain the reviewed runtime sources as independently checked above.

## Findings and inspection limits

Findings: **none**; no F IDs assigned. Feedback rounds consumed by actionable findings: **0**. No unresolved correctness, security, integrity, required-test or material architecture defect identified.

Native status/clock tests and iOS export verify the internal contract and bundling, not physical iPhone/iPad execution. Safari/iOS browser operation and human listening were not performed. Headless Chrome is muted. Native endpoint enforcement remains the existing status/timer approach rather than sample exact. These scope limits are explicit in request/requirements/plan and remain visible; this verdict makes no universal platform or hearing claim. No required in-scope check remains unavailable.
