# Quality Rubric: reviewer

Scores one run of the `reviewer` agent. In an orchestrator run it runs at Stage 10 after Stage 8 (`verifier`) and Stage 9 (Green Gate) pass, inspecting the current diff against `.memory/knowledge/coding-standards.md`, `.memory/knowledge/design-system.md` (when UI/CSS changed), the approved `spec.md`, and `red-proof.md`. It is a read-only auditor: it reports `PASS` or `REJECT` in `docs/orchestrator-runs/<run-id>/review.md` and never modifies code, CSS, tests, or configs, and never runs build or test commands.

Its only writable file is `docs/orchestrator-runs/<run-id>/review.md`. On standalone benchmark evaluations, the evaluation is recorded in `docs/iteration-logs/`. Where a standalone review is scored differently, the dimension says so.

Evidence comes from `review.md`, the actual `git diff` at Stage 10, `spec.md`, `red-proof.md`, `verification.md`, `.memory/knowledge/coding-standards.md`, `.memory/knowledge/design-system.md`, the tool transcript, and the agent's `HANDOFF` block.

## 1.1 Review Accuracy & Standards Coverage

Measures whether the verdict (`PASS` or `REJECT`) is grounded in the actual diff and catches genuine spec, contract, and standards violations without false positives on pre-existing debt.

### Scoring Guide

1. Does not meet – Rubber-stamps a diff containing serious violations of `spec.md` or `.memory/knowledge/coding-standards.md` (e.g., un-awaited Firestore writes, direct `localStorage`, inline styles, hardcoded hex colors, non-canonical field names, direct provider calls, scope creep outside `spec.md`), OR rejects with fabricated/wrong findings that contradict the actual diff.

   - Level 1 example: Writes `PASS` while `ActiveWorkout.jsx` calls `localStorage.setItem` directly and uses `style={{ color: "#ef4444" }}`; or writes `REJECT` claiming `withAuth` is missing in `api/callModel.js` when line 36 already wraps the handler in `withAuth`.

2. Partially meets – Catches major issues, but misses a real secondary violation (e.g., missing `aria-label` on a new icon-only button, un-awaited error handling, or a `rem`-scale mistake), OR rejects based on personal preference or untouched pre-existing debt listed under "Known debt (do not expand)".

   - Level 2 example: Rejects a Phase 1 workout-save diff because an untouched auth file still uses `alert()`, or catches a hardcoded color in `index.css` while missing an un-guarded Firestore write for guest users in `useCloudSync.js`.

3. Meets – Inspects every changed line against `spec.md`, `red-proof.md`, and `.memory/knowledge/coding-standards.md` (plus `design-system.md` for UI/CSS). Verdict is accurate: `PASS` only when zero blocking spec, contract, standards, or out-of-scope violations exist; `REJECT` whenever any blocking violation exists, with zero false positives on untouched legacy debt.

   - Level 3 example: Catches an un-awaited Firestore batch write in `firestoreServices.js:74` and a hardcoded `#ef4444` in `src/css/index.css:218`, correctly ignores an untouched legacy `alert()` in `AuthScreen.jsx`, and issues `REJECT`; on round 2 verifies both fixes and issues `PASS`.

4. Exceeds – Level 3, plus catches subtle cross-file contract or edge-case risks (e.g., stale closure in a subscription effect, guest-mode guard gap, or silent shape mismatch between `spec.md` and `red-proof.md`) that tests didn't directly assert.

   - Level 4 example: Level 3, plus spots that `useCloudSync.js:48` subscribes to `onSnapshot` with a callback not held in a `useRef`, causing re-subscriptions on every render despite unit tests passing, citing the `useAuthObserver` pattern in `coding-standards.md`.

## 1.2 Read-Only Scope & Command Discipline

Measures whether the agent stayed strictly read-only, touched only `review.md`, and ran only permitted git inspection commands.

### Scoring Guide

1. Does not meet – Edited any file other than `docs/orchestrator-runs/*/review.md` (production code, CSS, tests, docs, configs, `.memory/*`, `.agents/*`, or other run artifacts); read/displayed `.env*`; ran git mutations (`commit`, `checkout`, `switch`, `reset`, `push`); ran build/test/lint commands (`npm test`, `npx eslint`, `npm run build`); or invoked a subagent.

   - Level 1 example: Fixed a typo directly in `ActiveWorkout.jsx` while reviewing, or ran `npm test` / `npx eslint src api` instead of reading `verification.md` and inspecting `git diff`.

2. Partially meets – Edited only `review.md`, but ran an unnecessary shell command outside `git diff/status/log/show` (e.g., an ad-hoc node script) or reviewed only `git diff --stat` without reading the actual changed hunks.

   - Level 2 example: Reviewed file names via `git status` and read `verification.md`, but never ran `git diff` to inspect line-by-line changes before issuing `PASS`.

3. Meets – Edited exclusively `docs/orchestrator-runs/<run-id>/review.md`; ran only read-only git inspection commands (`git diff *`, `git status *`, `git log *`, `git show *`); never read `.env*`; never ran build/test/lint runners or git mutations; never invoked subagents.

   - Level 3 example: Tool transcript shows only `read_file` on `spec.md`, `red-proof.md`, `verification.md`, `coding-standards.md`, and changed source files, `git status` + `git diff`, and writing `docs/orchestrator-runs/<run-id>/review.md`.

4. Exceeds – Level 3, plus verified that `git status` / `git diff --name-only` contains no untracked stray files, out-of-spec edits, or modified frozen test files before issuing its verdict.

   - Level 4 example: Level 3, plus cross-checked `git diff --name-only` against `spec.md`'s file list and `red-proof.md`'s `frozen:` list, explicitly confirming zero out-of-scope files in `review.md`.

## 1.3 Actionability & Handoff Quality

Measures whether `review.md` and the `HANDOFF` block let `orchestrator`, `implementer`, and `styler` act immediately without guesswork or wasted retry rounds.

### Scoring Guide

1. Does not meet – `review.md` has no clear `PASS` / `REJECT` verdict, gives vague unactionable feedback ("code looks messy", "fix styling"), or omits a valid `AGENTS.md` `HANDOFF` block (or uses an invalid `status` like `done` instead of `pass | reject | blocked`).

   - Level 1 example: Writes "Needs cleanup in ActiveWorkout before merging" with no `file:line`, no cited rule, no explicit `REJECT`, and ends with `status: done` instead of `status: reject`.

2. Partially meets – Explicit `PASS` / `REJECT` and valid `HANDOFF`, but findings lack `file:line`, don't name the violated rule or spec criterion, don't indicate whether `implementer` or `styler` owns each fix, or omit concrete `git diff` evidence.

   - Level 2 example: Rejects with "Remove hardcoded color and await the Firestore save" without line numbers, exact file paths, or specifying that `styler` owns the CSS token fix while `implementer` owns the `await`.

3. Meets – Clear, structured `review.md` and complete `AGENTS.md` `HANDOFF` block:
   - `review.md` states explicit `PASS` or `REJECT`, lists artifacts and diff scope reviewed, and on `REJECT` numbers each finding with exact `file:line`, violated rule/spec criterion, owning role (`implementer` or `styler`), and concrete fix
   - `HANDOFF` block uses `from: reviewer`, `to: orchestrator`, valid `status: pass | reject | blocked`, `files: docs/orchestrator-runs/<run-id>/review.md`, `contract:` summarizing the verdict and finding count, `evidence:` citing git inspection commands run, and `open:` naming the next actor (`implementer`/`styler` on reject, `none` on pass)

   - Level 3 example: `review.md` verdict `REJECT` with Finding #1 (`[implementer]` `src/services/firebase/firestoreServices.js:74` — un-awaited `batch.commit()` violates `coding-standards.md` State & data flow -> `await batch.commit()`) and Finding #2 (`[styler]` `src/css/index.css:218` — hardcoded `#ef4444` violates `design-system.md` -> use `var(--danger)`); `HANDOFF` sets `status: reject`, `open: implementer, styler`.

4. Exceeds – Level 3, plus separates blocking findings from non-blocking notes cleanly, and on retry rounds explicitly verifies and closes each prior round's findings one by one.

   - Level 4 example: Level 3, plus Round 2 `review.md` includes a "Prior Findings Resolution" checklist confirming Round 1 Finding #1 (`firestoreServices.js:78`) and Finding #2 (`index.css:218`) are resolved before issuing `PASS`.

Standalone review (outside an orchestrator run): score accuracy, read-only discipline, and actionable findings against the target diff and `coding-standards.md`.

**Pass threshold:** A run passes if it scores 3 or higher on all three dimensions, and the gates are met: `review.md` is the only file written, only read-only git inspection commands were run, the verdict accurately reflects every blocking violation in the diff with zero false positives on untouched legacy debt, and the `HANDOFF` uses a valid `reviewer` status (`pass | reject | blocked`).

**Notes on threshold design:** Review Accuracy & Standards Coverage has a floor because `reviewer` is the final safeguard before human commit approval—missed violations ship broken patterns to production, while false rejections burn the shared 3-round budget. Read-Only Scope & Command Discipline treats editing code or running test/build commands as Level 1 so the reviewer stays strictly independent of `implementer`, `styler`, and `verifier`. Actionability & Handoff Quality has a floor because `orchestrator` forwards findings verbatim into Stage 11: precise `file:line` citations and role tags (`implementer` vs `styler`) are what allow a retry round to succeed on the first attempt. Exceeds rewards catching subtle cross-file risks tests miss and explicitly closing prior-round findings.
