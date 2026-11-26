# Code Review — Phase 5 Group 2: Server-Side Prompting, Dedicated AI Endpoints & Client Migration

**Run ID:** `phase-5-group-2-server-prompting-and-ai-endpoints-2026-11-25`  
**Stage:** Stage 10 — Reviewer (Round 1)  
**Verdict:** **PASS**

---

## 1. Review Scope & Evidence Inspected

- **Approved spec:** [spec.md](file:///workspace/docs/orchestrator-runs/phase-5-group-2-server-prompting-and-ai-endpoints-2026-11-25/spec.md)
- **Coding standards:** [coding-standards.md](file:///workspace/.memory/knowledge/coding-standards.md)
- **Run artifacts:** [red-proof.md](file:///workspace/docs/orchestrator-runs/phase-5-group-2-server-prompting-and-ai-endpoints-2026-11-25/red-proof.md), [green-report-round-1.md](file:///workspace/docs/orchestrator-runs/phase-5-group-2-server-prompting-and-ai-endpoints-2026-11-25/green-report-round-1.md), [verification.md](file:///workspace/docs/orchestrator-runs/phase-5-group-2-server-prompting-and-ai-endpoints-2026-11-25/verification.md), [log.md](file:///workspace/docs/orchestrator-runs/phase-5-group-2-server-prompting-and-ai-endpoints-2026-11-25/log.md)
- **Git inspection (`fitgen-dev-tools-reviewer:git_status_diff`):**
  - `status` (`exitCode: 0`)
  - `diff_stat` (`exitCode: 0`, 10 tracked files changed: 429 insertions, 555 deletions)
  - `diff` (`exitCode: 0`, full working tree diff audited line-by-line)
- **Full source & test audit:** Every created (`api/_prompts.js`, `api/_requestValidation.js`, `api/_aiClient.js`, `api/generatePlan.js`, `api/generateWeek.js`, `tests/api/_prompts.test.js`, `tests/api/generatePlan.test.js`, `tests/api/generateWeek.test.js`, `src/services/api/callModel.test.js`) and modified (`src/services/api/callModel.js`, `src/utils/generateInitialPlan.js`, `src/utils/generateNextWeekPlan.js`, `src/utils/generateInitialPlan.test.js`, `src/utils/generateNextWeekPlan.test.js`) file inspected directly, alongside untouched callers (`ProfileSetupForm.jsx`, `useWorkout.js`) and shared server helpers (`api/_utils.js`, `api/_validatePlan.js`).

---

## 2. Spec & Acceptance Criteria Audit

| Criterion | Status | Findings |
|---|---|---|
| **AC-1 (Zero prompt text in client source & bundle)** | PASS | `src/utils/generateInitialPlan.js`, `src/utils/generateNextWeekPlan.js`, and `src/services/api/callModel.js` contain strictly structured payload/transport logic with zero prompt strings or schema templates. Verified clean in `dist/assets/*.js` by Stage 8 (`verification.md`) and guarded by unit tests. |
| **AC-2 (Server prompt parity & single-source schema)** | PASS | [api/_prompts.js](file:///workspace/api/_prompts.js) centralizes `buildPlanSchemaSnippet` for both `buildInitialPlanPrompt` and `buildNextWeekPrompt`. Preserves exact `normalizeProfileText` parity with [normalizeProfileText.js](file:///workspace/src/utils/normalizeProfileText.js), canonical `resolveDurationMinutes` with `60`-minute fallback (ignoring legacy `sessionDuration`), safe fallbacks for unknown goal/equipment (never interpolating `"undefined"`), and last-10 `formatRecentWorkouts` supporting flat and legacy nested log shapes. |
| **AC-3 (`POST /api/generatePlan` contract)** | PASS | [api/generatePlan.js](file:///workspace/api/generatePlan.js) configures `runtime: "edge"`, wraps handler with `withAuth`, validates request payload (`400 INVALID_REQUEST`), builds prompt via `buildInitialPlanPrompt`, calls `callAIProvider` (with fallback chain, timeout handling, and `500`/`502`/`504` sanitized mapping), parses via `extractJsonFromText` (`422 INVALID_AI_OUTPUT`), validates via `validatePlan` (`422 PLAN_VALIDATION_FAILED`), and returns `200 { plan }` via `createJsonResponse`. |
| **AC-4 (`POST /api/generateWeek` contract)** | PASS | [api/generateWeek.js](file:///workspace/api/generateWeek.js) configures `runtime: "edge"`, wraps handler with `withAuth`, validates request payload via `validateGenerateWeekBody` (`400 INVALID_REQUEST`, tolerant of omitted/legacy `profile.duration` -> `60`m fallback and optional `programName`/`recentWorkouts`/`feedback`), computes `expectedWeekNumber = lastWeek.weekNumber + 1`, calls `callAIProvider`, extracts JSON, validates via `validatePlan({ mode: "week", selectedDays, expectedWeekNumber })`, and returns `200 { plan }`. |
| **AC-5 (Strict client retry policy)** | PASS | [callModel.js](file:///workspace/src/services/api/callModel.js) exposes `ApiError`, `isRetryableStatus`, `resolveEndpointUrl`, `requestAiEndpoint`, `requestInitialPlan`, and `requestNextWeekPlan`. Retries up to 3 attempts strictly on `422`, `5xx`, network errors, timeouts, and malformed `200` envelopes; immediately rethrows non-retryable `4xx` (`400`, `401`, `403`, `405`, `429`) and missing tokens (`401 MISSING_TOKEN`, 0 fetches). Correctly normalizes empty, origin, `/api`, and legacy `.../api/callModel` base URLs. |
| **AC-6 (Cleanup, data-shape preservation & green gates)** | PASS | `api/callModel.js` and `src/utils/extractJsonFromText.js` deleted cleanly with zero dangling imports. Firestore `profile`/`plan`/`workouts` contracts remain backward-compatible with untouched `ProfileSetupForm.jsx` and `useWorkout.js`. Stage 8/9 gates verified `npx eslint src api` exit `0`, `npm test` `34/34` files (`644/644` tests), `npm run build` exit `0`, and `6/6` frozen test hashes `HOLD`. |

---

## 3. Coding Standards, Security & Scope Audit

- **Diff scope discipline:** Every created (9), modified (5), and deleted (2) file matches `spec.md` Section 2 verbatim. The 4 pre-existing out-of-band files (`.agents/agents/tester.md`, `docs/prds/tester-agent-prd.md`, `docs/rubrics/tester-agent-rubric.md`, `MODULARIZATION_TS_PLAN.md`) and all explicitly untouched production/CSS files remain unmodified by this run.
- **Vercel / API layout:** Deployable routes live at `api/generatePlan.js` and `api/generateWeek.js`; shared helpers use the `_` prefix (`api/_prompts.js`, `api/_requestValidation.js`, `api/_aiClient.js`); all API tests live under `tests/api/` (none placed directly in `api/`).
- **Security & secret hygiene:**
  - `api/_aiClient.js` validates `PROVIDER_API_KEY`, `API_URL`, and `MODEL` before fetching, clears timeout timers in `finally`, aborts immediately on `504` timeout without burning fallback models, and never logs API keys, prompts, or raw upstream bodies.
  - `api/_requestValidation.js` uses `Object.hasOwn(WEEKDAY_MAP, key)` (prototype-safe), collects all validation errors in one pass, and never mutates input payloads.
  - Client code reads only `import.meta.env.VITE_API_BASE_URL` and `import.meta.env.VITE_BACKEND_URL`; zero server-only env vars reach `src/`.
- **Coding standards compliance:** Plain JS with consistent 2-space indent, double quotes, semicolons, and trailing commas; no inline styles; no direct `localStorage` access; no un-awaited Firestore writes; no `alert()`/`confirm()`; no unexplained empty `catch` blocks; no new known-debt instances.
- **Test quality & proof integrity:** All 6 authored/updated test files stayed concise (`109–293` LOC), ran offline with mocked `fetch` and restored env vars, proved Red -> Green cleanly (`81` failing spec assertions -> `644/644` passing), and held identical SHA-1 hashes across Stages 3, 4, 7, 8, and 9.

---

## 4. Non-Blocking Observations

1. **Follow-up doc sync (outside this run's scope):** `.memory/knowledge/coding-standards.md` lines 54 and 135 still reference the pre-Phase-5 client prompt/schema locations (`src/utils/planSchema.js` and `src/utils/*Plan.js`). Once Phase 5 finishes, updating those two lines in `.memory/knowledge/coding-standards.md` to reference `api/_prompts.js` will keep the knowledge base in sync.
2. **Response body timeout classification in `src/services/api/callModel.js` (lines 127–136):** If an abort fires while awaiting `response.json()` on a `200` response, the `catch` maps it to retryable `ApiError("Invalid JSON response from server", { status: 502, code: "INVALID_RESPONSE", retryable: true })` rather than `code: "TIMEOUT"`. This matches `spec.md` Section 6.1 literally and remains safely retryable, so it is not a defect.

---

## 5. Verdict

**PASS** — Implementation and tests faithfully satisfy `spec.md` (AC-1 through AC-6), adhere to `.memory/knowledge/coding-standards.md`, preserve existing Firestore/UI data contracts, and maintain clean diff and frozen-test integrity.

```text
HANDOFF
phase: 5
from: reviewer
to: orchestrator
status: pass
files: docs/orchestrator-runs/phase-5-group-2-server-prompting-and-ai-endpoints-2026-11-25/review.md
contract: PASS — Implementation and tests satisfy spec.md AC-1 through AC-6, coding-standards.md, security/env hygiene, backward-compatible plan/profile data shapes, and diff/frozen-test integrity with zero blocking findings.
evidence: fitgen-dev-tools-reviewer:git_status_diff (status, diff_stat, diff) -> exitCode 0; read_file audit of spec.md, coding-standards.md, red-proof.md, green-report-round-1.md, verification.md, log.md, all 9 created files, all 5 modified files, and untouched callers/helpers (api/_utils.js, api/_validatePlan.js, ProfileSetupForm.jsx, useWorkout.js)
open: orchestrator (final run verdict / human commit approval)
```
