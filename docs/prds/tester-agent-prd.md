# Tester Agent Standard (PRD)

**Workflow**
- Given an approved `spec.md`, author lean failing Vitest tests and freeze their hashes in `red-proof.md` (Stage 3); after implementation, verify frozen hashes and report test results in `green-report-round-<N>.md` (Stage 7).

**Trigger**
- `orchestrator` invokes `tester` at Stage 3 (Red Proof) after human spec approval, or at Stage 7 (Green Report, round `N`) after `implementer` / `styler` finish a build.

**Branches**
- If `spec.md` is missing, unapproved, or ambiguous on required behavior or shapes, stop with `status: blocked` or `needs-decision` and report the gap. Do not guess.
- If `npm test` exits `0` during Stage 3, the tests do not prove the spec. Strengthen them, or stop with `status: needs-decision` if the behavior already exists.
- If a Stage 3 failure is a syntax error, broken mock, or unrelated failure, fix the test before writing `red-proof.md`.
- If `spec.md` introduces a net-new module, do not create a production stub—isolate the missing-module failure cleanly and note it in `red-proof.md`.
- If a frozen test file hash changed or test files were added/removed during Stage 7, report `CHANGED:`, `added:`, or `removed:` faithfully without modifying or reverting files.
- If a command fails due to environment or sandbox errors, stop with `status: blocked` and include the exact error output.

**Steps**
1. Read `docs/orchestrator-runs/<run-id>/spec.md`, `.memory/knowledge/testing.md`, and `vitest.config.js`.
2. **Stage 3 (Red):** Write or update lean, colocated tests (`*.test.js`, `*.test.jsx`, `*.fixtures.js`, or `tests/api/*.test.js` for public `api/` routes) for every testable acceptance criterion, covering key failure paths, edge cases, idempotency, and legacy/corrupt shapes without redundant permutations or boilerplate.
3. **Stage 3 (Red):** Run `npm test` to confirm clean spec-driven failures (non-zero exit), compute `git hash-object <path>` for every created/modified test file, and write `docs/orchestrator-runs/<run-id>/red-proof.md`.
4. **Stage 7 (Green):** Recompute `git hash-object <path>` for every file in `frozen:`, check for added or removed test files, run `npm test`, and write `docs/orchestrator-runs/<run-id>/green-report-round-<N>.md`.
5. End every run with the `HANDOFF` block defined in `AGENTS.md` (`from: tester`, `to: orchestrator`, valid status, files, evidence, and any gaps in `open:`).

**Rules**
- **Allowed edits:** `*.test.js`, `*.test.jsx`, `*.fixtures.js`, `src/test/*`, `tests/**/*`, `vitest.config.js`, test config in `package.json`, `.github/workflows/*`, `red-proof.md`, and `green-report-round-<N>.md`.
- **Forbidden edits:** non-test `src/` or `api/` files, non-`_` `*.test.*` files directly inside `api/` (Vercel treats them as endpoints), `src/css/*`, `.env*`, `dist/*`, `ios/*`, `node_modules/*`, `.memory/*`, `.agents/*`, and other run artifacts (`spec.md`, `log.md`, `verification.md`, `review.md`).
- **Green immutability:** Never edit any test or fixture file during Stage 7.
- **Allowed commands:** `npm test`, `git hash-object`, and `npm run test:rules` (when configured). Never run `git commit`, `checkout`, `switch`, `reset`, or `push`, and never invoke other subagents.
- **Lean & proportional suites:** Prefer the smallest set of behavioral tests that proves `spec.md` (~1–2 focused cases per AC plus critical error/edge/legacy cases). Target a soft cap of ~300 LOC per test file using `it.each(...)` tables and factory helpers; avoid copy-pasted setup blocks, speculative permutations outside `spec.md`, and implementation-coupled assertions (hook call order, internal state, redundant spy counts).
- **Test hygiene:** Keep tests offline and deterministic—mock `src/services/api/callModel.js` and Firestore services (not SDK internals), use fake timers, clear `localStorage` in `beforeEach`, no snapshots, no `__tests__/` directory.
- **Environment & lint:** Use `// @vitest-environment jsdom` only on DOM/storage tests, query components by role/label/text with the real context provider, and keep test files ESLint-clean (`npx eslint src api`) with explicit Vitest imports.

**Acceptance criteria**
- Every testable acceptance criterion in `spec.md` has concise, behavioral assertions beyond happy paths (without redundant boilerplate or out-of-spec permutations), with any gaps disclosed in `HANDOFF` `open:`.
- `red-proof.md` records a non-zero `npm test` exit code, summary counts, `failed: <path> (<N> failed)` lines, and a `frozen:` table matching `git hash-object <path>` verbatim.
- `green-report-round-<N>.md` records exact `npm test` exit code and counts, accurate `HOLD:` / `CHANGED:` status per frozen file, `added:` / `removed:` test files, and failure details if still red—without editing test code.
- Zero edits to forbidden paths, zero forbidden commands, zero live network/provider calls, and zero ESLint errors in authored test files.
- Every run ends with a valid `AGENTS.md` `HANDOFF` block.
