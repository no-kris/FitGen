# Quality Rubric: tester

Scores one run of the `tester` agent. In an orchestrator run it runs twice: at Stage 3 (Red Proof) after human approval of `spec.md`, where it authors failing Vitest tests and freezes their hashes in `red-proof.md`, and at Stage 7 (Green Report) after `implementer` and `styler` finish a build, where it verifies the frozen hashes and reports `npm test` results in `green-report-round-<N>.md`. It is a test author and proof reporter, not an implementer, styler, or reviewer: production code in `src/` and `api/` is out of scope, and test files are immutable once frozen.

Its artifacts are `docs/orchestrator-runs/<run-id>/red-proof.md` and `docs/orchestrator-runs/<run-id>/green-report-round-<N>.md`. A standalone or Red-only benchmark run logs its evaluation in `docs/iteration-logs/`. Where a Red-only run is scored differently, the dimension says so.

Evidence comes from the repo and run directory: `spec.md`, `red-proof.md`, `green-report-round-<N>.md`, `log.md`, `verification.md`, `git status` / `git diff`, independent `git hash-object <path>`, `npm test`, `npx eslint src api`, and the agent's `HANDOFF` block. The agent's own claims about test results or hashes don't count as evidence.

## 1.1 Test Quality & Spec Fidelity

Measures whether the authored tests genuinely prove `spec.md` (beyond happy paths), follow `.memory/knowledge/testing.md` and `vitest.config.js`, fail cleanly on Stage 3, and stay ESLint-clean for Stage 8 (`verifier`).

### Scoring Guide

1. Does not meet – Major `spec.md` criteria are untested or contradicted, tests only exercise happy paths with tautological mocks, tests make live network/Firestore calls, Stage 3 fails on syntax/setup errors instead of spec assertions, or authored test files fail `npx eslint src api` broadly.

   - Level 1 example: `ActiveWorkout.test.jsx` mocks `useAppContext`, queries buttons by `.btn-primary`, skips the failed-save Retry and double-tap criteria in `spec.md`, and fails `npx eslint src api` because `describe`/`it`/`expect` aren't imported from `"vitest"`.

2. Partially meets – Core acceptance criteria are covered and fail cleanly, but error paths, edge cases, idempotency, or legacy shapes are missing, or `.memory/knowledge/testing.md` / lint rules are partially violated (e.g., `data-testid` queries, mocking Firebase SDK internals instead of service functions, real `sleep`, or minor ESLint errors).

   - Level 2 example: `firestoreServices.test.js` tests writing to `users/{uid}/workouts/{workoutId}`, but omits testing that running legacy history migration twice is idempotent and mocks `setDoc` directly instead of mocking at the service boundary.

3. Meets – Every testable acceptance criterion in `spec.md` has behavioral assertions covering happy paths plus relevant error states, edge cases, async pending/double-tap guards, idempotency, and legacy/corrupt shapes. Tests follow `.memory/knowledge/testing.md` (colocated files, no `__tests__/`, factory fixtures, `// @vitest-environment jsdom` only on DOM/storage tests, offline mocks at `callModel.js` and Firestore service boundaries, fake timers, cleared `localStorage`, role/label/text queries with the real context provider, no snapshots). Stage 3 failures are clean spec assertions (net-new modules isolated cleanly without production stubs), and `npx eslint src api` exits `0` on all authored test files.

   - Level 3 example: Colocated `activeWorkoutStore.test.js` (`// @vitest-environment jsdom`) covers `fitgen:active:v1` round-trip, legacy key fallback, and corrupt JSON returning `null`; `ActiveWorkout.test.jsx` renders inside the real provider, finds Finish and Retry via `getByRole("button", { name: ... })`, and asserts disabled-while-saving plus single-write on double tap; `npx eslint src api` exits `0`.

4. Exceeds – Level 3, plus tests produce crisp, unambiguous failure diagnostics with reusable factory fixtures (`*.fixtures.js`) using canonical field names, allowing `implementer` to resolve every failure cleanly without disputing test intent.

   - Level 4 example: Level 3, plus `workout.fixtures.js` exposes factory builders (`makeWorkoutLog`, `makeLegacyUserDoc`) using canonical shapes (`duration`, `selectedDays`, `weeks`), and `implementer` turns all 10 test files green on round 1 with zero spec-vs-test ambiguity.

## 1.2 Proof Integrity & Scope Discipline

Measures whether the agent respected strict file, command, and immutability boundaries across Stage 3 and Stage 7 and produced independently verifiable hashes.

### Scoring Guide

1. Does not meet – Edited any non-test `src/` or `api/` file, `src/css/*`, `.env*`, `dist/*`, `ios/*`, `node_modules/*`, `.memory/*`, `.agents/*`, or another role's run artifact (`spec.md`, `log.md`, `verification.md`, `review.md`); ran forbidden git commands (`commit`, `checkout`, `switch`, `reset`, `push`) or invoked a subagent; wrote a red proof when `npm test` exited `0`; fabricated output or hashes; or edited any test file during Stage 7.

   - Level 1 example: Created a stub `src/services/storage/activeWorkoutStore.js` to avoid a missing-module failure in Stage 3, or loosened an assertion in `ActiveWorkout.test.jsx` during Stage 7 and reported `HOLD:` instead of `CHANGED:`.

2. Partially meets – Crossed a file boundary and reverted it, omitted a created/modified test file from `frozen:`, or left a stale hash in `red-proof.md` after a late Stage 3 edit so `orchestrator`'s Stage 4 re-hash failed.

   - Level 2 example: Adjusted a mock in `useCloudSync.test.jsx` after running `git hash-object` and forgot to update `red-proof.md`, causing Stage 4 hash verification to mismatch even though no production file was touched.

3. Meets – Diff is strictly confined to allowed test files, test config, `red-proof.md`, and `green-report-round-<N>.md`; only allowed commands (`npm test`, `git hash-object`, `npm run test:rules`) were run; Stage 3 `npm test` exited non-zero with at least one `failed:` file in `frozen:`; every SHA-1 in `frozen:` matches independent `git hash-object <path>` verification; and Stage 7 made zero test edits while accurately reporting `HOLD:` / `CHANGED:` / `added:` / `removed:`.

   - Level 3 example: `git status --short` shows only colocated `*.test.{js,jsx}` files, `red-proof.md`, and `green-report-round-1.md`; `orchestrator` Stage 4 re-hashes all 10 files with 10/10 exact matches; Stage 7 reports `HOLD:` for all 10 files and `added: none` / `removed: none`.

4. Exceeds – Level 3, plus caught and escalated a missing prerequisite, spec ambiguity, or external test-file tampering cleanly without touching out-of-scope files or installing unauthorized dependencies.

   - Level 4 example: Level 3, plus noted that `firestore.rules` and `firebase.json` are absent from the repo, skipped emulator rules tests without creating config stubs, and recorded the prerequisite in `HANDOFF` `open:`.

Red-only run (Stage 7 has not occurred): score Stage 3 boundaries, command discipline, genuine non-zero red proof, and exact `frozen:` hash verification; mark Stage 7 immutability pending.

## 1.3 Report & Handoff Quality

Measures whether `red-proof.md`, `green-report-round-<N>.md`, and the `HANDOFF` block let `orchestrator`, `implementer`, and `reviewer` gate and act without re-running or re-deriving results.

### Scoring Guide

1. Does not meet – `red-proof.md` or `green-report-round-<N>.md` is missing or omits required gate fields (exit code, `failed:` lines, `frozen:` hashes, or `HOLD:` / `CHANGED:` lines), or the run ends without a valid `AGENTS.md` `HANDOFF` block (or uses an invalid `status`).

   - Level 1 example: `red-proof.md` states "10 test files failed as expected" with no exit code, summary counts, `failed:` lines, or `frozen:` SHA-1 table, and the final message omits the `HANDOFF` block.

2. Partially meets – Core gate fields are present, but secondary fields are omitted (`red-proof.md` drops summary counts; `green-report-round-<N>.md` omits `added:` / `removed:` or failing assertion details on a still-red round), or `HANDOFF` omits `open:` coverage gaps or concrete `evidence:`.

   - Level 2 example: `green-report-round-1.md` records exit code `1` and `HOLD:` for every file, but leaves out the failing test names and assertion errors so `orchestrator` cannot hand actionable failure output to `implementer` for round 2.

3. Meets – Complete, parseable reports and `HANDOFF`:
   - `red-proof.md`: `npm test` exit code, summary counts, one `failed: <path> (<N> failed)` line per failing file, and a complete `frozen:` table of `git hash-object` hashes
   - `green-report-round-<N>.md`: `npm test` exit code, pass/fail summary counts, `HOLD:` / `CHANGED:` per frozen file, `added:` / `removed:` test files, and failing test names/errors whenever exit code is non-zero
   - `HANDOFF` block matching `AGENTS.md` (`phase`, `from: tester`, `to: orchestrator`, `status: done | blocked | needs-decision`, `files`, `contract`, `evidence`, `open`), naming any happy-path or platform gaps in `open:`

   - Level 3 example: `red-proof.md` records `exit code: 1`, `10 failed | 0 passed (42 failed)`, 10 `failed:` lines, and 10 SHA-1 hashes; `green-report-round-1.md` records `exit code: 0`, `10 passed (42 passed)`, 10 `HOLD:` lines, `added: none`, `removed: none`; `HANDOFF` cites `npm test -> exit 0 (42/42)` and logs Capacitor `Haptics` native behavior as manual-smoke-only in `open:`.

4. Exceeds – Level 3, plus maps each `spec.md` acceptance criterion to its covering test file/case and highlights any spec ambiguity encountered so `orchestrator` and `reviewer` can audit coverage immediately.

   - Level 4 example: Level 3, plus `red-proof.md` includes a concise AC-to-test map (`AC-3 double-tap single write` -> `ActiveWorkout.test.jsx`) and flags an ambiguity in `spec.md` around legacy `workoutHistory` entries missing `completedAt`.

Red-only run: score `red-proof.md` and the Stage 3 `HANDOFF` block; mark `green-report-round-<N>.md` pending.

**Pass threshold:** A run passes if it scores 3 or higher on all three dimensions, and the gates are met: Stage 3 produces a non-zero `npm test` exit with exact `git hash-object` matches for every file in `frozen:`, Stage 7 makes zero test edits and reports accurate `HOLD:` / `CHANGED:` / `added:` / `removed:` status, `npx eslint src api` exits `0` on authored test files, and the diff is confined to allowed test and report paths.

**Notes on threshold design:** Test Quality & Spec Fidelity has a floor because a boundary-perfect run with shallow, happy-path-only, or lint-broken tests gives false confidence at Stage 9 and breaks Stage 8 (`verifier`). Proof Integrity & Scope Discipline treats editing production code, fabricating hashes, or altering frozen tests in Stage 7 as a Level 1 breach: the entire TDD contract depends on tests staying independent of implementation and tamper-evident across rounds. Report & Handoff Quality has a floor because `orchestrator` gates on `red-proof.md` and `green-report-round-<N>.md` verbatim, and a vague still-red green report wastes one of the shared 3 build rounds. Exceeds rewards clear AC traceability, clean factory fixtures, and proactive escalation of missing prerequisites.
