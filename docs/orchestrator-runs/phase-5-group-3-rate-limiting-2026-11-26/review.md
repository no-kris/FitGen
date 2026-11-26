# Stage 10 Code Review (Round 1) — `phase-5-group-3-rate-limiting-2026-11-26`

- **Run ID:** `phase-5-group-3-rate-limiting-2026-11-26`
- **Phase / Item:** Phase 5 Group 3 — Item 5.5 (Per-User Server-Side Rate Limiting on AI Endpoints)
- **Verdict:** **PASS**

---

## 1. Review Inputs & Git Inspection

- **Standards & Artifacts Reviewed:**
  - `.memory/knowledge/coding-standards.md`
  - `docs/orchestrator-runs/phase-5-group-3-rate-limiting-2026-11-26/spec.md`
  - `docs/orchestrator-runs/phase-5-group-3-rate-limiting-2026-11-26/red-proof.md`
  - `docs/orchestrator-runs/phase-5-group-3-rate-limiting-2026-11-26/green-report-round-1.md`
  - `docs/orchestrator-runs/phase-5-group-3-rate-limiting-2026-11-26/verification.md`
  - `docs/orchestrator-runs/phase-5-group-3-rate-limiting-2026-11-26/log.md`
- **Working Tree Inspected via `fitgen-dev-tools-reviewer:git_status_diff` (`status`, `diff_stat`, `diff`) + Direct Full Reads:**
  - Product files (5/5 in scope):
    - `api/_rateLimit.js` (new, 396 lines)
    - `api/_utils.js` (modified)
    - `api/generatePlan.js` (modified)
    - `api/generateWeek.js` (modified)
    - `src/services/api/callModel.js` (modified)
  - Test files (5/5 in scope):
    - `tests/api/_rateLimit.test.js` (new, 366 lines)
    - `tests/api/_utils.test.js` (modified)
    - `tests/api/generatePlan.test.js` (modified)
    - `tests/api/generateWeek.test.js` (modified)
    - `src/services/api/callModel.test.js` (modified)
  - Out-of-band working tree files (4 pre-existing, untouched throughout run): `.agents/agents/tester.md`, `docs/prds/tester-agent-prd.md`, `docs/rubrics/tester-agent-rubric.md`, `MODULARIZATION_TS_PLAN.md`.

---

## 2. Spec & Acceptance Criteria Audit

| Area | Criteria | Status | Notes |
| --- | --- | --- | --- |
| Upstash REST `EVAL` & Lua atomicity | AC-1..AC-3 | **PASS** | `api/_rateLimit.js` sends one atomic `POST` `["EVAL", RATE_LIMIT_LUA_SCRIPT, "1", key, String(limit), String(windowMs)]` with trailing-slash stripping, `encodeURIComponent(uid.trim())` key construction, exact Lua script preventing orphaned keys and TTL extension on denied calls, `Math.max(1, Math.ceil(ttlMs / 1000))` clamping, and exact `429` / `X-RateLimit-*` / `Retry-After` contract. |
| Policies & safe env overrides | AC-4 | **PASS** | Frozen `RATE_LIMIT_POLICIES` (`generatePlan`: 10/3600s, `generateWeek`: 20/3600s, timeout: 3000ms). `parsePositiveIntEnv` handles unset/blank silently, enforces strict `/^\d+$/` + safe bounds, and logs only env var name + fallback (never raw value). |
| Strict fail-closed & secret hygiene | AC-5..AC-8 | **PASS** | Missing/blank/invalid URL or token, invalid `uid`, unknown/prototype `scope` (`Object.hasOwn`), network errors, `AbortController` timeouts (with `clearTimeout` in `finally`), non-2xx HTTP, invalid JSON, `{ error }` payloads, and malformed `result` tuples all fail closed with `503 RATE_LIMIT_UNAVAILABLE`. Neither responses nor `console.warn`/`console.error` ever emit `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, or raw upstream text. |
| CORS expose headers & `createJsonResponse` | AC-9 | **PASS** | `api/_utils.js` adds `"Access-Control-Expose-Headers": "Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset"` to `corsHeaders` and safely merges optional `extraHeaders` while preserving CORS headers and enforcing `"Content-Type": "application/json"` last. |
| Endpoint lifecycle, headers & isolation | AC-10..AC-14 | **PASS** | Both `api/generatePlan.js` and `api/generateWeek.js` run `validate*Body` before `checkRateLimit(auth?.uid, scope)`, run `checkRateLimit` strictly before prompt building / `callAIProvider`, ignore any client body `uid`, return `429`/`503` without calling AI on denial/failure, and attach `X-RateLimit-*` headers to `200`, `422`, and `AIProviderError` `5xx` responses. |
| Client `callModel.js` handling | AC-15..AC-17 | **PASS** | `ApiError` carries `retryAfterSeconds`. `parseRetryAfterSeconds` handles delta-seconds and HTTP-dates cleanly (and guards against V8 lax numeric `Date.parse` via `/^[+-]?\d+(?:\.\d+)?$/`). `isRetryableStatus(503)` stays `true`, `isRetryableResponse(503, "RATE_LIMIT_UNAVAILABLE")` returns `false` (1 fetch, 0 sleeps), `429` extracts body `retryAfterSeconds` before `Retry-After` header, preserves server `errData.error` verbatim, and formats friendly fallback messages on bare `429`. |
| Quality gates & bundle hygiene | AC-18..AC-20 | **PASS** | `npx eslint src api` exit `0` (0 errors, 0 warnings); `npm test` exit `0` (35/35 files, 690/690 tests); `npm run build` exit `0`; parent-shell bundle hygiene scan (`grep -rnE 'UPSTASH_REDIS_REST_URL|UPSTASH_REDIS_REST_TOKEN' dist/ src/`) exit `1` (0 matches). |

---

## 3. Coding Standards & Contract Compliance

- **Edge runtime & zero dependencies:** `api/_rateLimit.js` uses only Web Standard APIs (`fetch`, `URL`, `AbortController`, `Response`, `setTimeout`/`clearTimeout`) in plain JavaScript; `package.json` and `package-lock.json` are untouched.
- **API boundary & secret hygiene:** Server-only Upstash env vars live strictly in `api/_rateLimit.js` and never enter `src/` or `dist/`. `.env` was not modified or exposed.
- **Layout & naming:** Shared helper uses `_` prefix (`api/_rateLimit.js`); public endpoint tests live under `tests/api/`; no non-`_` test files in `api/`.
- **Prohibited patterns check:** Zero inline styles, zero direct `localStorage` access, zero Firestore writes or persisted data-shape changes (`src/types.js` untouched), zero unrelated reformatting or renames.
- **TDD & hash integrity:** Stage 3 red proof established 55 clean assertion failures across the 5 target test files. The sole test adjustment (`tests/api/_rateLimit.test.js:214`, `logged.replaceAll(String(fallback), "")`) fixed a mathematically unsatisfiable substring check (`"0"` inside `"10"`), was explicitly human-authorized (Option 1), preserves the full non-echo security assertion, and passed Stage 9 Green Gate alongside `HOLD` verification of all 4 other frozen test files.

---

## 4. Findings

- **Blocking findings:** None.
- **Non-blocking notes:**
  1. `formatRetryWait` is intentionally defined in both `api/_rateLimit.js` and `src/services/api/callModel.js` to keep the Edge server module and Vite client bundle decoupled with zero cross-boundary imports.
  2. **Operational rollout reminder (per Spec §7):** Because the limiter is strictly fail-closed, `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` must be configured in Vercel (and local `.env`) before deploying, or AI endpoints will return `503 RATE_LIMIT_UNAVAILABLE`.

---

## 5. Verdict

**PASS** — Implementation and tests satisfy every requirement in `spec.md` (AC-1 through AC-20) and `.memory/knowledge/coding-standards.md` with zero regressions or out-of-scope changes.
