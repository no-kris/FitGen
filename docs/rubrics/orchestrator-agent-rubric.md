# Quality Rubric: orchestrator

Scores one run of the `orchestrator` agent. It coordinates the full 11-stage TDD pipeline across specialized subagents (`data`/`domain`/`ui`/`api`, `tester`, `implementer`, `styler`, `verifier`, `reviewer`), enforces every gate (Human Spec Gate, Red Gate, Green Gate, and the 3-round cap), forwards `HANDOFF` blocks verbatim, and records the run in `docs/orchestrator-runs/<slug>-<YYYY-MM-DD>/log.md`. It is a coordinator, not a worker: it never writes production code, CSS, tests, specs, verification logs, or review reports, and it never commits or merges.

Its only writable file is `docs/orchestrator-runs/<run-id>/log.md`. Its closing output is the run verdict (never a `HANDOFF` block of its own), or `status: needs-approval` + spec path at Stage 2. Where a run pauses at Stage 2 or escalates early, dimensions score only the stages executed.

Evidence comes from the run directory (`log.md`, `spec.md`, `red-proof.md`, `green-report-round-<N>.md`, `verification.md`, `review.md`), subagent transcripts / forwarded prompts, `git status` / `git log`, and independent `git hash-object` verification. The orchestrator's summary claims don't count without matching stage artifacts.

## 1.1 Gate Enforcement & Stage Sequencing

Measures whether the orchestrator followed the 11-stage order and enforced every hard gate (Stage 2 Human Gate, Stage 4 Red Gate, Stage 7–8 post-build checks, Stage 9 Green Gate, and Stage 11 3-round cap).

### Scoring Guide

1. Does not meet – Bypassed the Stage 2 Human Gate (proceeded without quoted `APPROVED: <spec path>`), invoked `implementer` after a passing/missing red proof, skipped independent `git hash-object` verification at Stage 4, accepted a modified/added/removed test file at Stage 9, skipped Stages 7–8 after a retry build before calling `reviewer`, exceeded 3 build rounds, or failed to stop on a subagent `blocked` / `needs-decision`.

   - Level 1 example: Designer wrote `spec.md`, and `orchestrator` immediately launched `tester` without halting for `APPROVED: docs/orchestrator-runs/.../spec.md`; or `green-report-round-1.md` reported `CHANGED: ActiveWorkout.test.jsx` and `orchestrator` still forwarded to `reviewer`.

2. Partially meets – Enforced all hard gates, but slipped on sequencing or mechanics: copied `red-proof.md` hashes into `log.md` without independently running `git hash-object`, paraphrased a subagent `HANDOFF` instead of forwarding it verbatim, or forgot to invoke `styler` when `spec.md` explicitly required CSS changes.

   - Level 2 example: Recorded the `frozen:` table in `log.md` by pasting from `red-proof.md` instead of recomputing hashes, or summarized `reviewer`'s findings to `implementer` in round 2 instead of forwarding them verbatim.

3. Meets – Executed every required stage in order with strict gate enforcement: halted at Stage 2 with `status: needs-approval` until resumed with exact `APPROVED: <spec path>`; independently ran `git hash-object <path>` at Stage 4 and recorded the table in `log.md`; ran `styler` when UI/CSS was in scope; ran Stages 7–8 after every build round; enforced Stage 9 (`npm test` exit `0`, all hashes matching Stage 4, zero added/removed tests); respected the shared 3-round cap; and forwarded every `HANDOFF` block and retry finding verbatim.

   - Level 3 example: `log.md` records Stage 2 approval timestamp + exact string, Stage 4 independently verified 10/10 SHA-1 hashes, Round 1 failed `review.md` on an un-awaited write, Round 2 re-ran `implementer` -> `tester` (`green-report-round-2.md`) -> `verifier` (`verification.md`) -> `reviewer` (`PASS`), completing in 2/3 rounds.

4. Exceeds – Level 3, plus handled an edge case cleanly (human spec rejection routed back to designer, subagent `blocked` escalated with precise next action, or missing artifact re-requested from the owning role) with zero wasted rounds.

   - Level 4 example: Level 3, plus when `tester` returned `status: blocked` on sandbox command execution, `orchestrator` paused cleanly, logged the exact error in `log.md`, waited for human authorization, and resumed the existing `tester` subagent rather than restarting from scratch.

Partial run (paused at Stage 2 or escalated early): score only stages reached; verify the stop/escalation condition was handled strictly per `orchestrator.md`.

## 1.2 Delegation & Boundary Discipline

Measures whether the orchestrator remained purely a coordinator and wrote only `docs/orchestrator-runs/<run-id>/log.md`.

### Scoring Guide

1. Does not meet – Edited any file other than `docs/orchestrator-runs/*/log.md` (`src/*`, `api/*`, `*.test.*`, `spec.md`, `red-proof.md`, `green-report-round-*.md`, `verification.md`, `review.md`, `.memory/*`, `.agents/*`), read/displayed `.env*`, ran forbidden git commands (`commit`, `checkout`, `switch`, `reset`, `push`), or launched another `orchestrator`.

   - Level 1 example: `tester` omitted summary counts in `red-proof.md`, so `orchestrator` edited `red-proof.md` directly instead of re-requesting `tester`; or `orchestrator` ran `git commit` after `review.md` passed.

2. Partially meets – Touched no forbidden files, but leaked role work into its own turn (e.g., ran `npm test` or `npx eslint src api` itself to fill in for `tester`/`verifier`, or wrote design decisions into a prompt instead of letting the designer own `spec.md`).

   - Level 2 example: Ran `npx eslint src api` itself after `styler` finished rather than delegating to `verifier`, even though `verification.md` was still later produced by `verifier`.

3. Meets – Wrote exclusively to `docs/orchestrator-runs/<run-id>/log.md`; delegated every artifact to its owning subagent (`spec.md` -> designer, tests/`red-proof.md`/`green-report-round-<N>.md` -> `tester`, logic -> `implementer`, CSS -> `styler`, `verification.md` -> `verifier`, `review.md` -> `reviewer`); never read `.env*`; never ran git mutations; never launched a nested `orchestrator`.

   - Level 3 example: Tool transcript shows `orchestrator` edited only `docs/orchestrator-runs/phase-1-reliable-workout-saves-2026-11-23/log.md` and ran only read-only baseline/hash checks (`git rev-parse`, `git hash-object`), with every run artifact written by its owning subagent.

4. Exceeds – Level 3, plus reused an idle subagent via `send_message` for natural continuations (e.g., resuming `tester` for Stage 7 or `implementer` for Round 2) while preserving clean role boundaries.

   - Level 4 example: Level 3, plus resumed existing `implementer` and `tester` subagents across Round 2 with verbatim findings instead of spawning redundant fresh agents.

## 1.3 Run Log & Final Verdict Quality

Measures whether `log.md` and the closing message to the human provide a complete, auditable record of the run.

### Scoring Guide

1. Does not meet – `log.md` is missing or empty, omits gate results or the Stage 4 frozen hash table, emits a `HANDOFF` block instead of a run verdict, or gives a verdict contradicting `verification.md` / `review.md`.

   - Level 1 example: Closes with "All done, looks great" and a `HANDOFF` block while `log.md` only lists Stages 1–2 and omits Stage 4 hashes, rounds used, and pending manual smoke checks.

2. Partially meets – `log.md` tracks most stages, but drops key fields (baseline commit/branch, per-round count, Stage 4 hash table, or real-vs-pending verification distinction) or uses vague prose in the final verdict.

   - Level 2 example: `log.md` records `PASS` at the end, but omits the baseline commit SHA, doesn't note whether `firestore.rules` emulator tests were pending, and doesn't list which files changed against baseline.

3. Meets – Complete `log.md` and closing verdict:
   - `log.md` holds baseline (branch + commit), per-stage status and artifact paths, Stage 4 independently verified `frozen:` hash table, Stage 9 gate results, `review.md` verdict, rounds used (`N/3`), and final verdict
   - Closing message (no `HANDOFF` block) states: final verdict, what changed against baseline, rounds used, which verification is real versus pending (e.g., manual smoke path or absent rules emulator), anything escalated, and confirms nothing was committed or merged

   - Level 3 example: `log.md` records baseline `refactor/phase-1 @ ff27eda`, all 11 stages with artifact paths, 10/10 verified Stage 4 hashes, `2/3` rounds used, and final `PASS`; closing message lists modified files, real checks (`npm test`, `eslint`, `build`, `review.md`), pending checks (manual smoke path + Phase 0 `firestore.rules`), and awaits human commit approval.

4. Exceeds – Level 3, plus highlights actionable follow-ups surfaced by subagents (coverage gaps from `tester`'s `open:`, deferred items from `implementer`/`styler`) clearly separated from the pass/fail gate verdict.

   - Level 4 example: Level 3, plus a concise "Follow-ups (non-blocking)" section surfacing `tester`'s `open:` note on native Capacitor `Haptics` and `data`'s note on Phase 0 `firestore.rules`.

**Pass threshold:** A run passes if it scores 3 or higher on all three dimensions, and every gate is upheld: Stage 2 halted until exact human `APPROVED: <spec path>`, Stage 4 independently verified and recorded `frozen:` hashes in `log.md`, Stage 9 enforced unchanged hashes and green tests within `<= 3` rounds, Stages 7–8 ran after every build before `reviewer`, and `orchestrator` edited only `log.md` with zero git mutations.

**Notes on threshold design:** Gate Enforcement & Stage Sequencing has a floor because `orchestrator` is the sole structural guarantor of the TDD contract—skipping human approval, hash re-verification, or post-build verification breaks trust in every downstream artifact. Delegation & Boundary Discipline treats editing any file besides `log.md` or committing code as Level 1 so the coordinator can never silently patch over a broken worker or bypass human commit authority. Run Log & Final Verdict Quality has a floor because the human relies on `log.md` and the closing verdict to decide whether to commit, including knowing exactly what was verified automatically versus left pending. Exceeds rewards clean edge-case escalation, subagent reuse, and surfacing non-blocking follow-ups without noise.
