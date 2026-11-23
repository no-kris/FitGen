# Quality Rubric: implementer

Scores one run of the `implementer` agent. In an orchestrator run it starts at Stage 5 after Stage 4 (Red Gate) freezes `red-proof.md`, and makes the smallest production JS/JSX change in `src/` and `api/` that matches `spec.md` and turns the tests green. It also runs on retry rounds (up to 3 total rounds) after a still-red Green Gate (Stage 9) or a `reviewer` reject (Stage 11). It is a logic builder, not a styler, tester, or reviewer: `src/css/*` belongs to `styler`, tests belong to `tester`, and run artifacts belong to their respective owners.

It writes no run artifact of its own; its output is the production diff plus its `HANDOFF` block (and on standalone benchmarks, an evaluation entry in `docs/iteration-logs/`). Where a standalone run is scored differently, the dimension says so.

Evidence comes from the repo and run directory: `spec.md`, `red-proof.md`, `green-report-round-<N>.md`, `verification.md`, `review.md`, `log.md`, `git status` / `git diff`, independent `npm test`, `npx eslint src api`, `npm run build`, and the agent's `HANDOFF` block. The agent's own claims about test or lint results don't count as evidence.

## 1.1 Feature Correctness & Standards Compliance

Measures whether the production change satisfies `spec.md`, turns every frozen test green, and adheres to `.memory/knowledge/coding-standards.md`, as confirmed by Stage 7 (`tester`), Stage 8 (`verifier`), and Stage 10 (`reviewer`).

### Scoring Guide

1. Does not meet – Contradicts `spec.md` contracts or canonical field names, leaves frozen tests failing in `green-report-round-<N>.md`, introduces forbidden debt (un-awaited Firestore writes, direct `localStorage`, `alert()`, direct provider calls bypassing `callModel.js`, inline styles), fails `npx eslint src api` or `npm run build`, or claims tests passed without running them.

   - Level 1 example: Writes `sessionDuration` instead of `duration`, calls `localStorage.setItem` directly inside `ActiveWorkout.jsx`, and `green-report-round-1.md` shows 3 of 10 test files still failing while `HANDOFF` says "all tests pass".

2. Partially meets – Happy paths work, but a frozen test remains red, or `review.md` rejects because an error path, async pending/double-tap guard, legacy-shape fallback, or coding standard was missed.

   - Level 2 example: `green-report-round-1.md` is green except `ActiveWorkout.test.jsx` fails double-tap single-write protection; or all tests pass, but `review.md` rejects because `firestoreServices.saveWorkout` swallows errors in an empty `catch`.

3. Meets – Every test in `red-proof.md` passes in `green-report-round-<N>.md` with every frozen hash holding (`HOLD:`), `verification.md` shows `npx eslint src api` and `npm run build` exiting `0`, `review.md` passes with zero standards violations, and every implemented contract matches `spec.md`.

   - Level 3 example: `green-report-round-2.md` shows 10/10 test files passing with all 10 `HOLD:`, `verification.md` records `eslint` exit `0` and `build` exit `0`, and `review.md` passes after round 2 resolves the un-awaited write finding.

4. Exceeds – Level 3 on round 1: zero still-red Green Gate loops and zero `reviewer` rejections.

   - Level 4 example: Level 3 reached in round 1; `log.md` shows one `implementer` build, Stage 9 Green Gate pass, and Stage 10 `review.md` pass.

Standalone run (no Stage 7/10 run): score against `spec.md` and `.memory/knowledge/coding-standards.md` by inspecting `git diff` and running `npm test`, `npx eslint src api`, and `npm run build`; mark `green-report-round-<N>.md` and `review.md` checks pending.

## 1.2 Scope & Boundary Discipline

Measures whether the agent edited only in-scope production JS/JSX files and stayed strictly inside its tool and command boundaries.

### Scoring Guide

1. Does not meet – Edited any test file (`*.test.*`, `*.fixtures.js`, `src/test/*`), `vitest.config.js`, `src/css/*`, `docs/orchestrator-runs/*`, `.env*`, `dist/*`, `ios/*`, `node_modules/*`, `.memory/*`, or `.agents/*`; installed unauthorized dependencies; ran forbidden git commands (`commit`, `checkout`, `switch`, `reset`, `push`); or invoked a subagent.

   - Level 1 example: Edited `ActiveWorkout.test.jsx` to relax a failing assertion (causing Stage 9 `CHANGED:` failure), or added CSS rules to `src/css/index.css` instead of leaving styling to `styler`.

2. Partially meets – Crossed a boundary and reverted it, reformatted or renamed unrelated production files outside `spec.md`'s file list, or invented an unapproved contract instead of stopping with `needs-decision`.

   - Level 2 example: Reformatted 120 untouched lines in `src/App.jsx` and renamed an unrelated helper while implementing Phase 1, bloating `git diff --stat`.

3. Meets – Diff is strictly limited to the production `.js` / `.jsx` files named in `spec.md`; zero test, CSS, dependency, or run-artifact edits; zero unrelated reformatting; only `npm test`, `npx eslint src api`, and `npm run build` were executed; zero forbidden git commands or subagents.

   - Level 3 example: `git diff --name-only` matches `spec.md`'s production file list exactly; `src/css/*` and all 10 `*.test.*` files are untouched (`HOLD:` across the board in `green-report-round-1.md`).

4. Exceeds – Level 3, plus caught a spec/test contradiction or needed CSS/shared-code follow-up and escalated it cleanly (`needs-decision` or `open:`) instead of guessing or crossing boundaries.

   - Level 4 example: Level 3, plus noticed `spec.md` left `completedAt` fallback unspecified for legacy logs, stopped with `status: needs-decision` citing the exact file and spec section instead of guessing.

## 1.3 Handoff Quality

Measures whether the agent's `HANDOFF` block lets `styler`, `tester`, `orchestrator`, and `reviewer` verify the build without re-deriving changes or chasing retry context.

### Scoring Guide

1. Does not meet – Missing `AGENTS.md` `HANDOFF` block, invalid `status`, omits changed files, or omits real command evidence.

   - Level 1 example: Ends with "Implemented Phase 1 workout saves; tests are green." with no `HANDOFF` block, no file list, and no `npm test` or `npx eslint src api` results.

2. Partially meets – Valid `HANDOFF` block, but omits `npx eslint src api` evidence, routes to the wrong next agent (e.g., skips `styler` when UI styling is in scope), omits a contract decision, or on a retry round says "fixed findings" without answering each failure/finding individually.

   - Level 2 example: Lists changed files and `npm test -> exit 0`, but omits `npx eslint src api` and in round 2 writes "addressed review comments" without mapping each `review.md` finding to the fix.

3. Meets – Complete `AGENTS.md` `HANDOFF` block:
   - `phase`, `from: implementer`, `to: styler` (when CSS/UI styling is needed) or `to: tester` / `orchestrator`, and valid `status` (`done | blocked | needs-decision`)
   - `files:` listing every production file created or changed
   - `contract:` naming any signature, shape, or JSX hook/class touchpoint relevant to `styler` or `reviewer` (and on retry rounds, answering each failing test or `review.md` finding one by one)
   - `evidence:` holding exact `npm test` and `npx eslint src api` (and `npm run build` if applicable) results
   - `open:` empty (`none`) when the spec was followed completely, or clearly stating the blocker/decision needed

   - Level 3 example: "`from: implementer`, `to: styler`, `status: done`, `files: src/services/firebase/firestoreServices.js, src/services/storage/activeWorkoutStore.js, src/features/workout/ActiveWorkout.jsx`. `contract: ActiveWorkout renders error banner + Retry button without inline styles; ready for styler classes per spec section 6`. `evidence: npm test -> exit 0 (42/42); npx eslint src api -> exit 0`. `open: none`."

4. Exceeds – Level 3, plus concisely maps key spec criteria or retry findings to `file:line` so `styler` and `reviewer` can jump straight to the exact code.

   - Level 4 example: Level 3, plus maps Round 2 fixes verbatim: "`review.md` finding #1 (`firestoreServices.js:74` un-awaited batch) -> awaited chunked `writeBatch` at `firestoreServices.js:78`; finding #2 (`ActiveWorkout.jsx:112` missing disabled prop) -> bound `disabled={isSaving}`."

**Pass threshold:** A run passes if it scores 3 or higher on all three dimensions, and the gates are met: `green-report-round-<N>.md` shows every `red-proof.md` test passing with all frozen hashes `HOLD:`, `verification.md` shows `npx eslint src api` and `npm run build` exiting `0`, `review.md` passes, and the diff is confined to in-scope production JS/JSX files.

**Notes on threshold design:** Feature Correctness & Standards Compliance has a floor because a clean diff that misses a spec error path or introduces known-debt patterns (`localStorage`, un-awaited writes, non-canonical fields) fails production reliability. Exceeds rewards a round-1 pass because every retry consumes one of the shared 3-round budget. Scope & Boundary Discipline treats editing any test file or `src/css/*` as Level 1: keeping `implementer` out of tests preserves Stage 9 tamper-evidence, and keeping it out of CSS preserves `styler`'s design-system ownership. Handoff Quality has a floor because `styler` and `reviewer` depend on accurate file lists, contracts, and retry-finding responses to avoid redundant discovery or wasted rounds.
