# Phase 5 Group 3 Specification — Per-User Server-Side Rate Limiting on AI Endpoints

- **Refactor Plan Reference:** Phase 5, Item 5.5 (`REFACTOR_PLAN.md` — *"Add a basic per-user rate limit, for example with Vercel KV/Upstash or a Firestore counter"*)
- **Baseline:** `iphone` @ `929af54df6e28bfd023480eadc41fe56f7a8d009`
- **Run ID:** `phase-5-group-3-rate-limiting-2026-11-26`
- **Runtime Target:** Vercel Edge Functions (`runtime: "edge"`), plain JavaScript (no TypeScript, zero new npm dependencies)
- **Styler Stage Needed:** **No** — zero CSS, layout, or UI component changes are required. Both `ProfileSetupForm` and `PlanDashboard` already render `error.message` from `callModel.js` in their existing error UI.

---

## 1. Objectives & Binding Decisions

1. **Backing Store:** Upstash Redis via the HTTP REST API using Web Standard `fetch` only (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`). Edge-safe, no Node-only APIs, zero new npm dependencies.
2. **Strict Fail-Closed Policy:** Protect AI provider spend at all costs. If Upstash credentials are missing/blank/invalid, or Upstash is unreachable, times out, returns a non-2xx HTTP status, returns an Upstash `{ error }` payload, or returns an unexpected/malformed JSON body, the endpoint **MUST** reject the request with HTTP `503` (`RATE_LIMIT_UNAVAILABLE`) and **MUST NOT** call `callAIProvider`.
3. **Per-User Keying:** Rate limits are scoped per endpoint (`generatePlan`, `generateWeek`) and keyed strictly by the verified Firebase `auth.uid` produced by `withAuth()` -> `verifyFirebaseToken()`. Client-supplied identifiers in the request body or headers are never trusted for rate-limit keying.
4. **Atomic Redis Enforcement:** Rate-limit checks and TTL initialization execute in a single atomic Upstash Redis REST `EVAL` Lua script so concurrent requests cannot race on counter increments and keys can never be orphaned without an expiration TTL.
5. **Clean Client Error Handling:** `src/services/api/callModel.js` already treats `429` as non-retryable. Extend `ApiError` and error normalization to surface `retryAfterSeconds` (from JSON payload or `Retry-After` header), provide a user-friendly fallback message on bare `429` responses, and treat `503` with `code === "RATE_LIMIT_UNAVAILABLE"` as non-retryable so fail-closed outages do not trigger client retry storms.

---

## 2. Scope & File Inventory

### Files to Create (Implementer)
- `api/_rateLimit.js` — Edge-safe Upstash Redis REST atomic rate limiter, env configuration parser, rate-limit header builder, and error response factory.

### Files to Modify (Implementer)
- `api/_utils.js` — Add `Access-Control-Expose-Headers` to `corsHeaders`; extend `createJsonResponse(body, status, extraHeaders)` to merge optional response headers while preserving `Content-Type: application/json` and CORS headers.
- `api/generatePlan.js` — Enforce per-user rate limiting (`scope: "generatePlan"`) after request validation and before `buildInitialPlanPrompt` / `callAIProvider`; attach rate-limit headers to post-limiter responses.
- `api/generateWeek.js` — Enforce per-user rate limiting (`scope: "generateWeek"`) after request validation and before `buildNextWeekPrompt` / `callAIProvider`; attach rate-limit headers to post-limiter responses.
- `src/services/api/callModel.js` — Add `retryAfterSeconds` to `ApiError`, add `parseRetryAfterSeconds` and `isRetryableResponse(status, code)`, treat `RATE_LIMIT_UNAVAILABLE` as non-retryable, and format a fallback message for bare `429` responses.

### Files to Create / Modify (Tester)
- **Create** `tests/api/_rateLimit.test.js` — Unit tests for `api/_rateLimit.js`.
- **Update** `tests/api/_utils.test.js` — Update `corsHeaders` expectation for `Access-Control-Expose-Headers` and cover `createJsonResponse` optional `extraHeaders`.
- **Update** `tests/api/generatePlan.test.js` — Configure Upstash test env/mocks for post-validation paths and add full rate-limit integration tests (`429`, `503` fail-closed, ordering, headers, per-user keying, secret non-leakage).
- **Update** `tests/api/generateWeek.test.js` — Mirror rate-limit integration tests for `POST /api/generateWeek`.
- **Update** `src/services/api/callModel.test.js` — Add unit tests for `parseRetryAfterSeconds`, `isRetryableResponse`, `429` `retryAfterSeconds`/fallback messaging, and non-retryable `503 RATE_LIMIT_UNAVAILABLE`.

### Explicitly Out of Scope (Do Not Touch)
- `.env` (never read, display, or modify in git; operator configures env vars out of band)
- `package.json` / `package-lock.json` (zero new dependencies)
- `src/features/onboarding/ProfileSetupForm.jsx`, `src/features/dashboard/PlanDashboard.jsx`, `src/css/*` (no UI or CSS changes required)
- `src/types.js` and persisted Firestore plan/profile/workout shapes

---

## 3. Environment Variables & Default Policies

### Required Server Env Vars (Upstash Redis REST)
Read exclusively in `api/_rateLimit.js` (never in `src/`):
- `UPSTASH_REDIS_REST_URL` — Base URL of the Upstash Redis REST endpoint (must parse via `new URL(...)` with `https:` or `http:` protocol; trailing slashes stripped).
- `UPSTASH_REDIS_REST_TOKEN` — Bearer token for Upstash Redis REST authentication (must be non-empty after `.trim()`).

If either variable is missing, blank, or `UPSTASH_REDIS_REST_URL` is not a valid `http:`/`https:` URL, `checkRateLimit` **MUST** fail closed (`503 RATE_LIMIT_UNAVAILABLE`) without issuing a `fetch` call.

### Optional Override Env Vars & Defaults

Defaults account for `src/services/api/callModel.js` retrying up to `maxAttempts = 3` on transient `422`/`5xx` failures, so legitimate users retrying malformed AI replies are not prematurely throttled while single-account abuse remains tightly capped.

| Endpoint | Scope | Limit Env Var | Default Limit | Valid Range | Window Env Var | Default Window | Valid Range |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `POST /api/generatePlan` | `"generatePlan"` | `RATE_LIMIT_GENERATE_PLAN_MAX` | `10` | `1..1000` | `RATE_LIMIT_GENERATE_PLAN_WINDOW_SEC` | `3600` (1 hr) | `10..86400` |
| `POST /api/generateWeek` | `"generateWeek"` | `RATE_LIMIT_GENERATE_WEEK_MAX` | `20` | `1..1000` | `RATE_LIMIT_GENERATE_WEEK_WINDOW_SEC` | `3600` (1 hr) | `10..86400` |
| Upstash HTTP timeout | shared | `RATE_LIMIT_TIMEOUT_MS` | `3000` (3s) | `100..10000` | — | — | — |

### Safe Env Var Parsing Rules (`parsePositiveIntEnv`)
- If the env value is `undefined`, `null`, or a blank/whitespace string: return the default silently.
- Otherwise, trim the string and verify strict base-10 positive integer format `/^\d+$/`, `Number.isSafeInteger(parsed)`, and `min <= parsed <= max`.
- If invalid or out of range: log a sanitized `console.warn` naming **only** the env var key and fallback value (never echo the raw value) and return the default. Invalid optional overrides must never crash the handler or disable rate limiting.

---

## 4. Redis Key Schema, Atomic Lua Algorithm & Upstash REST Wire Contract

### Key Schema
```text
fitgen:rl:v1:<scope>:<encodeURIComponent(uid.trim())>
```
- Examples:
  - `fitgen:rl:v1:generatePlan:uid-123`
  - `fitgen:rl:v1:generateWeek:uid-123`
- Namespaced (`fitgen:rl`), versioned (`v1`), isolated by endpoint scope and verified Firebase `uid`. Encoding `uid` prevents delimiter injection.

### Atomic Algorithm (TTL-Driven Fixed Window via Redis `EVAL`)
Execute a single atomic Lua script on Redis:

```lua
local limit = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local current = tonumber(redis.call("GET", KEYS[1])) or 0
if current >= limit then
  local pttl = redis.call("PTTL", KEYS[1])
  if pttl < 0 then
    redis.call("PEXPIRE", KEYS[1], windowMs)
    pttl = windowMs
  end
  return {0, current, pttl}
end
current = redis.call("INCR", KEYS[1])
local pttl = redis.call("PTTL", KEYS[1])
if current == 1 or pttl < 0 then
  redis.call("PEXPIRE", KEYS[1], windowMs)
  pttl = windowMs
end
return {1, current, pttl}
```

#### Algorithm Guarantees
1. **Strict atomicity:** `GET`, cap check, `INCR`, `PTTL`, and `PEXPIRE` execute in one atomic Redis Lua invocation (single HTTP round trip, zero TOCTOU race under concurrent requests).
2. **No orphaned keys:** Whenever `current == 1` or `pttl < 0` (`-1` missing TTL or `-2` expired), `PEXPIRE` immediately assigns `windowMs` inside the same atomic execution.
3. **No unbounded counter growth or TTL extension on denied requests:** Once `current >= limit`, denied requests do not increment the counter and do not extend the existing TTL; they return `{0, current, pttl}` with the exact remaining window time.
4. **No wall-clock boundary double-burst on idle keys:** Each user's window begins at their first request and expires `windowMs` later.

### Exact Upstash REST Request / Response Contract

#### Request
```http
POST ${UPSTASH_REDIS_REST_URL (trailing slashes removed)}
Authorization: Bearer ${UPSTASH_REDIS_REST_TOKEN}
Content-Type: application/json

["EVAL", "<RATE_LIMIT_LUA_SCRIPT>", "1", "<key>", "<String(limit)>", "<String(windowMs)>"]
```
- Uses `AbortController` + `setTimeout(() => controller.abort(), timeoutMs)` with `clearTimeout(timerId)` in a `finally` block (matching `api/_aiClient.js` for Edge Runtime and Vitest fake-timer compatibility). The abort signal covers both `fetchImpl(...)` and `response.json()`.

#### Expected Success Response (HTTP `200`)
```json
{ "result": [1, 1, 3600000] }
```
or when rate-limited (HTTP `200` from Upstash):
```json
{ "result": [0, 10, 1842150] }
```

#### Strict Response Validation (Fail-Closed)
Every condition below must hold; any failure returns `{ allowed: false, status: 503, code: "RATE_LIMIT_UNAVAILABLE", reason }`:
1. `response.ok === true` (HTTP 2xx).
2. `response.json()` resolves to a plain object (`data !== null && typeof data === "object" && !Array.isArray(data)`).
3. `data.error` is absent (`!("error" in data) || data.error === null || data.error === undefined`).
4. `Array.isArray(data.result) && data.result.length === 3`.
5. Tuple `[allowedFlag, count, ttlMs] = data.result` satisfies:
   - `allowedFlag === 0 || allowedFlag === 1`
   - `Number.isSafeInteger(count) && count >= 0`
   - `Number.isSafeInteger(ttlMs) && ttlMs >= 0`

#### Derived Values
- `retryAfterSeconds = Math.max(1, Math.ceil(ttlMs / 1000))`
- `resetAtEpochSeconds = Math.ceil((now() + ttlMs) / 1000)`
- `remaining = allowedFlag === 1 ? Math.max(0, limit - count) : 0`

---

## 5. Module Contracts & Signatures

### 5.1 `api/_utils.js`

Update `corsHeaders`:
```js
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Expose-Headers":
    "Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset",
};
```
> **Why:** Capacitor WebViews and cross-origin browser clients cannot read `Retry-After` or `X-RateLimit-*` from `response.headers.get(...)` unless explicitly exposed via `Access-Control-Expose-Headers`.

Update `createJsonResponse`:
```js
export function createJsonResponse(body, status, extraHeaders = {}) {
  const safeExtra =
    extraHeaders && typeof extraHeaders === "object" && !Array.isArray(extraHeaders)
      ? extraHeaders
      : {};
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      ...safeExtra,
      "Content-Type": "application/json",
    },
  });
}
```
- Fully backward-compatible with all existing 2-argument callers.
- `Content-Type: application/json` is always enforced last so callers cannot accidentally override it.
- `withAuth` continues passing `(body, { uid, email, signInProvider })` to handlers unchanged.

---

### 5.2 `api/_rateLimit.js`

#### Exports
1. `RATE_LIMIT_KEY_PREFIX = "fitgen:rl:v1"`
2. `DEFAULT_RATE_LIMIT_TIMEOUT_MS = 3000`
3. `RATE_LIMIT_POLICIES` — Frozen map with entries `generatePlan` and `generateWeek` (`scope`, `maxEnvVar`, `windowSecEnvVar`, `defaultMax`, `defaultWindowSeconds`).
4. `RATE_LIMIT_LUA_SCRIPT` — The atomic Lua script string defined in Section 4.
5. `parsePositiveIntEnv(rawValue, fallback, { min, max, envName } = {}) -> number`
6. `resolveRateLimitConfig(scope, env = process.env) -> { scope, limit, windowSeconds, timeoutMs } | null`
   - Returns `null` if `!Object.hasOwn(RATE_LIMIT_POLICIES, scope)`.
7. `buildRateLimitKey(scope, uid) -> string`
8. `formatRetryWait(retryAfterSeconds) -> string`
   - If `retryAfterSeconds < 60`: returns `"1 second"` when `1`, else `"${retryAfterSeconds} seconds"`.
   - If `retryAfterSeconds >= 60`: `const mins = Math.ceil(retryAfterSeconds / 60)`; returns `"1 minute"` when `1`, else `"${mins} minutes"`.
9. `buildRateLimitHeaders(result) -> Record<string, string>`
   - Returns:
     ```js
     {
       "X-RateLimit-Limit": String(result.limit),
       "X-RateLimit-Remaining": String(result.remaining),
       "X-RateLimit-Reset": String(result.resetAtEpochSeconds),
       ...(!result.allowed && Number.isInteger(result.retryAfterSeconds)
         ? { "Retry-After": String(result.retryAfterSeconds) }
         : {}),
     }
     ```
10. `createRateLimitErrorResponse(result) -> Response`
    - When `result.status === 429`:
      - Status: `429`
      - Headers: `corsHeaders` + `buildRateLimitHeaders(result)` + `Content-Type: application/json`
      - JSON body:
        ```json
        {
          "error": "Too many requests. Please wait <formatted wait> before trying again.",
          "code": "RATE_LIMIT_EXCEEDED",
          "retryAfterSeconds": 1843,
          "limit": 10,
          "windowSeconds": 3600
        }
        ```
    - Otherwise (`result.status === 503`):
      - Status: `503`
      - Headers: `corsHeaders` + `Content-Type: application/json` (no `Retry-After` or `X-RateLimit-*` headers)
      - JSON body:
        ```json
        {
          "error": "Rate limiting service is temporarily unavailable. Please try again shortly.",
          "code": "RATE_LIMIT_UNAVAILABLE"
        }
        ```
11. `checkRateLimit(uid, scope, options = {}) -> Promise<RateLimitResult>`
    - **Injectable testability seams (`options`):**
      - `fetchImpl = globalThis.fetch`
      - `env = process.env`
      - `now = Date.now`
    - **Return shapes (discriminated union on `allowed`):**
      - Allowed:
        ```js
        {
          allowed: true,
          limit,
          remaining,
          count,
          windowSeconds,
          resetAtEpochSeconds,
        }
        ```
      - Exceeded:
        ```js
        {
          allowed: false,
          status: 429,
          code: "RATE_LIMIT_EXCEEDED",
          limit,
          remaining: 0,
          count,
          windowSeconds,
          retryAfterSeconds,
          resetAtEpochSeconds,
        }
        ```
      - Fail-closed unavailable:
        ```js
        {
          allowed: false,
          status: 503,
          code: "RATE_LIMIT_UNAVAILABLE",
          reason, // "invalid_uid" | "invalid_scope" | "missing_config" | "invalid_config" | "timeout" | "network_error" | "upstream_http_error" | "invalid_json" | "invalid_response"
        }
        ```
    - **Logging & Secret Hygiene:**
      - Never log or return `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, raw upstream response text, or user email.
      - Log only sanitized messages containing scope, failure reason/category, or HTTP status code.

---

### 5.3 Endpoint Request Lifecycle (`api/generatePlan.js` & `api/generateWeek.js`)

Both endpoints MUST execute checks in this exact order:

| Step | Component | Failure Status | Error Code | Notes |
| --- | --- | --- | --- | --- |
| 1 | `withAuth` — `OPTIONS` preflight | `200` | — | Returns `corsHeaders` (incl. `Access-Control-Expose-Headers`) |
| 2 | `withAuth` — Method check (`POST` only) | `405` | — | `{ error: "Method not allowed" }` |
| 3 | `withAuth` — `Authorization: Bearer <token>` + `verifyFirebaseToken` | `401` / `403` / `500` | — | Rejects missing/invalid/anonymous/disabled accounts; yields verified `auth.uid` |
| 4 | `withAuth` — JSON body parse + plain-object check | `400` | — | `{ error: "Invalid JSON body" }` |
| 5 | Handler — `validateGeneratePlanBody(body)` / `validateGenerateWeekBody(body)` | `400` | `INVALID_REQUEST` | Pure in-memory validation; runs **before** rate limiting |
| 6 | Handler — `checkRateLimit(auth.uid, scope)` | `429` / `503` | `RATE_LIMIT_EXCEEDED` / `RATE_LIMIT_UNAVAILABLE` | Strictly before prompt build and `callAIProvider` |
| 7 | Handler — `build*Prompt` + `callAIProvider` | `500` / `502` / `504` | `CONFIG_ERROR` / `UPSTREAM_*` | Includes `X-RateLimit-*` headers from step 6 |
| 8 | Handler — `extractJsonFromText` + `validatePlan` | `422` | `INVALID_AI_OUTPUT` / `PLAN_VALIDATION_FAILED` | Includes `X-RateLimit-*` headers from step 6 |
| 9 | Handler — Success | `200` | — | `{ plan }` with `X-RateLimit-*` headers from step 6 |

#### Justification for Step 5 (`validate*Body`) Before Step 6 (`checkRateLimit`)
1. **Zero quota burn on malformed requests:** Legitimate clients encountering a `400` validation error never consume their hourly AI generation quota.
2. **Zero Upstash cost on invalid payloads:** `validateGeneratePlanBody` and `validateGenerateWeekBody` are pure <1ms in-memory checks that never touch the AI provider.
3. **Zero unthrottled AI calls:** Every structurally valid request MUST pass `checkRateLimit` (returning `{ allowed: true }`) before `callAIProvider` can ever be invoked.
4. **Consistency with `withAuth`:** Malformed JSON already returns `400` inside `withAuth` before entering the handler.

---

### 5.4 Client Handling (`src/services/api/callModel.js`)

1. **`ApiError`:**
   - Extend constructor options with `retryAfterSeconds = null` and set `this.retryAfterSeconds = retryAfterSeconds`.
   - Preserve all existing properties: `name`, `message`, `status`, `code`, `details`, `retryable`.
2. **`parseRetryAfterSeconds(headerValue, nowMs = Date.now()) -> number | null` (named export):**
   - Returns `null` if `headerValue` is not a non-empty string.
   - If trimmed string matches `/^\d+$/`: parse integer; return it if `Number.isSafeInteger(parsed) && parsed >= 1`, else `null`.
   - Else attempt `Date.parse(trimmed)`: if `Number.isFinite(timestampMs)`, compute `Math.ceil((timestampMs - nowMs) / 1000)`; return if `>= 1`, else `null`.
   - Otherwise return `null`.
3. **`isRetryableStatus(status)` (existing named export — unchanged):**
   - Continues returning `true` strictly for `422` and `500..599`, `false` for everything else (including `429`).
4. **`isRetryableResponse(status, code = null) -> boolean` (named export):**
   - Returns `false` if `code === "RATE_LIMIT_UNAVAILABLE"`.
   - Otherwise delegates to `isRetryableStatus(status)`.
5. **`requestAiEndpoint` non-`ok` response handling:**
   - Parse `errData` JSON safely as before.
   - Resolve `code = errData?.code ?? (response.status === 429 ? "RATE_LIMIT_EXCEEDED" : null)`.
   - Resolve `retryAfterSeconds`:
     - If `typeof errData?.retryAfterSeconds === "number" && Number.isSafeInteger(errData.retryAfterSeconds) && errData.retryAfterSeconds >= 1`, use `errData.retryAfterSeconds`.
     - Else use `parseRetryAfterSeconds(response.headers?.get?.("Retry-After"))`.
   - Resolve `message`:
     - If `typeof errData?.error === "string" && errData.error.trim().length > 0`, use `errData.error` verbatim (preserves server-authored messages and existing `callModel.test.js` contract).
     - Else if `response.status === 429`, synthesize:
       - With `retryAfterSeconds !== null`: `"Too many requests. Please wait ${formatWait(retryAfterSeconds)} before trying again."` (same seconds/minutes formatting as server).
       - Without `retryAfterSeconds`: `"Too many requests. Please try again shortly."`
     - Else `"Failed to call backend API"`.
   - Throw:
     ```js
     new ApiError(message, {
       status: response.status,
       code,
       details: errData?.details ?? null,
       retryable: isRetryableResponse(response.status, code),
       retryAfterSeconds,
     });
     ```
   - Because `retryable` is `false` for both `429` and `503 RATE_LIMIT_UNAVAILABLE`, `requestAiEndpoint` immediately rethrows after **1 fetch attempt** and **0 sleep calls**, preventing retry storms when rate-limited or when the rate-limit backend is unavailable.
   - Transient `502` / `503` / `504` responses with other codes (e.g., `UPSTREAM_ERROR`, `UPSTREAM_TIMEOUT`) and `422` responses continue retrying up to `maxAttempts` (default `3`) with exponential backoff.

---

## 6. Acceptance Criteria

### Unit Criteria — `api/_rateLimit.js` (`tests/api/_rateLimit.test.js`)
- **AC-1 (Atomic Upstash REST `EVAL` contract):** Calling `checkRateLimit("uid-123", "generatePlan", ...)` sends exactly one `POST` to `${UPSTASH_REDIS_REST_URL}` (trailing slash stripped) with `Authorization: Bearer <token>`, `Content-Type: application/json`, and JSON body `["EVAL", RATE_LIMIT_LUA_SCRIPT, "1", "fitgen:rl:v1:generatePlan:uid-123", "10", "3600000"]`. Special characters in `uid` (e.g., `:`, `/`, spaces) are URI-encoded in the key.
- **AC-2 (Allowed result & headers):** When Upstash returns `{ result: [1, 3, 2500000] }` with `limit = 10`, `now = () => 1_700_000_000_000`, `checkRateLimit` resolves to `{ allowed: true, limit: 10, remaining: 7, count: 3, windowSeconds: 3600, resetAtEpochSeconds: 1700002500 }`, and `buildRateLimitHeaders` produces `X-RateLimit-Limit: "10"`, `X-RateLimit-Remaining: "7"`, `X-RateLimit-Reset: "1700002500"` (without `Retry-After`).
- **AC-3 (Exceeded result, `Retry-After` rounding & `429` response):** When Upstash returns `{ result: [0, 10, 1842150] }`, `checkRateLimit` resolves to `{ allowed: false, status: 429, code: "RATE_LIMIT_EXCEEDED", limit: 10, remaining: 0, count: 10, windowSeconds: 3600, retryAfterSeconds: 1843, resetAtEpochSeconds }`. `ttlMs = 0` clamps `retryAfterSeconds` to `1`. `createRateLimitErrorResponse` returns HTTP `429` with CORS headers (including `Access-Control-Expose-Headers`), `Retry-After`, `X-RateLimit-*` headers, and JSON `{ error, code: "RATE_LIMIT_EXCEEDED", retryAfterSeconds, limit, windowSeconds }`.
- **AC-4 (Scope defaults & safe env overrides):** `generatePlan` defaults to `limit=10, windowSeconds=3600`; `generateWeek` defaults to `limit=20, windowSeconds=3600`; timeout defaults to `3000ms`. Valid env overrides (`RATE_LIMIT_GENERATE_PLAN_MAX`, `RATE_LIMIT_GENERATE_PLAN_WINDOW_SEC`, `RATE_LIMIT_GENERATE_WEEK_MAX`, `RATE_LIMIT_GENERATE_WEEK_WINDOW_SEC`, `RATE_LIMIT_TIMEOUT_MS`) are honored. Invalid/out-of-range overrides (`"0"`, `"-5"`, `"abc"`, `"2.5"`, `"999999"`, `"5"` for window, `"50"` for timeout) fall back to defaults with a sanitized warning that never echoes the invalid value.
- **AC-5 (Strict fail-closed on missing/invalid config):** Missing or whitespace-only `UPSTASH_REDIS_REST_URL` or `UPSTASH_REDIS_REST_TOKEN`, or non-HTTP(S) URL (e.g., `"not-a-url"`, `"ftp://redis.test"`), immediately returns `{ allowed: false, status: 503, code: "RATE_LIMIT_UNAVAILABLE", reason }` with **0** `fetch` calls.
- **AC-6 (Strict fail-closed on Upstash runtime/protocol failures):** Network errors, timeouts (aborted after `timeoutMs`, with timer cleaned up), non-2xx HTTP statuses (`401`, `429`, `500`, `503`), non-JSON bodies, `{ error: "ERR ..." }` payloads, and malformed `result` shapes (`null`, `{}`, `"OK"`, `[1, 2]`, `[2, 1, 1000]`, `[1, -1, 1000]`, `[1, 1, -1]`, `[1, 1.5, 1000]`) all return `{ allowed: false, status: 503, code: "RATE_LIMIT_UNAVAILABLE", reason }`.
- **AC-7 (Strict fail-closed on invalid `uid` or `scope`):** Empty/non-string `uid` or unknown/prototype `scope` (e.g., `"__proto__"`, `"constructor"`, `"other"`) fails closed with `503 RATE_LIMIT_UNAVAILABLE` and **0** `fetch` calls.
- **AC-8 (Zero secret leakage):** Neither `createRateLimitErrorResponse` bodies nor any `console.warn`/`console.error` output ever contains `UPSTASH_REDIS_REST_TOKEN`, `UPSTASH_REDIS_REST_URL`, or raw Upstash error text.

### Unit Criteria — `api/_utils.js` (`tests/api/_utils.test.js`)
- **AC-9 (CORS expose headers & `createJsonResponse` extra headers):** `corsHeaders` includes `"Access-Control-Expose-Headers": "Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset"`. `createJsonResponse(body, status, extraHeaders)` merges custom headers, preserves CORS headers and `Content-Type: application/json` (even if `extraHeaders` attempts to pass `"Content-Type"`), and remains backward-compatible with 2 arguments.

### Integration Criteria — `api/generatePlan.js` & `api/generateWeek.js` (`tests/api/generatePlan.test.js`, `tests/api/generateWeek.test.js`)
- **AC-10 (Exact check ordering on both endpoints):**
  - `OPTIONS` (`200`), non-POST (`405`), missing/invalid auth (`401`), anonymous/disabled (`403`), malformed JSON (`400`), and invalid payload (`400 INVALID_REQUEST`) return **without** calling Upstash or `callAIProvider`.
  - Valid payloads call Upstash **before** `callAIProvider`, keyed by the verified Firebase `auth.uid` (ignoring any `uid` field in the request body).
- **AC-11 (`429` enforcement on both endpoints):** When Upstash denies the request, both `/api/generatePlan` and `/api/generateWeek` return HTTP `429`, `code: "RATE_LIMIT_EXCEEDED"`, `retryAfterSeconds`, `limit`, `windowSeconds`, `Retry-After` header, `X-RateLimit-*` headers, CORS headers (with `Access-Control-Expose-Headers`), and **never** call `callAIProvider`.
- **AC-12 (`503` fail-closed enforcement on both endpoints):** When Upstash env vars are missing/blank or Upstash fails/times out/returns malformed data, both `/api/generatePlan` and `/api/generateWeek` return HTTP `503`, `code: "RATE_LIMIT_UNAVAILABLE"`, CORS headers, **never** call `callAIProvider`, and never leak Upstash credentials.
- **AC-13 (Rate-limit headers on post-limiter responses):** Allowed requests attach `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` to `200`, `422`, and AI provider `5xx` responses on both endpoints.
- **AC-14 (Per-user & per-endpoint isolation):** Distinct authenticated users (`uid-123` vs `uid-456`) and distinct endpoints (`generatePlan` vs `generateWeek`) send distinct Redis keys (`fitgen:rl:v1:<scope>:<uid>`) and enforce their respective default caps (`10` vs `20`).

### Client Criteria — `src/services/api/callModel.js` (`src/services/api/callModel.test.js`)
- **AC-15 (`parseRetryAfterSeconds`):** Parses positive integer delta-seconds (`"120"` -> `120`), future HTTP-dates (`"Thu, 26 Nov 2026 18:05:00 GMT"` -> ceiling seconds delta), and returns `null` for past dates, `"0"`, negative numbers, non-numeric garbage, and missing values.
- **AC-16 (`429` handling in `callModel.js`):**
  - Never retries (`1` fetch call, `0` sleep calls), throws `ApiError` with `status: 429`, `retryable: false`.
  - Extracts `retryAfterSeconds` from JSON body first, falling back to `Retry-After` HTTP header.
  - Preserves server-provided `errData.error` verbatim; when `errData.error` is absent (e.g., bare/non-JSON `429`), sets `code: "RATE_LIMIT_EXCEEDED"` and synthesizes a user-friendly message (including formatted wait duration when `retryAfterSeconds` is present).
- **AC-17 (`503 RATE_LIMIT_UNAVAILABLE` fast-fail vs retryable `503`):**
  - `isRetryableStatus(503)` remains `true`.
  - `isRetryableResponse(503, "RATE_LIMIT_UNAVAILABLE")` returns `false`; `requestAiEndpoint` throws `ApiError` (`status: 503`, `code: "RATE_LIMIT_UNAVAILABLE"`, `retryable: false`) after **1** fetch and **0** sleeps.
  - `isRetryableResponse(503, "UPSTREAM_ERROR")` returns `true`; existing 3-attempt retry behavior for `422` and other `5xx` errors remains intact.

### Quality Gates (Definition of Done)
- **AC-18:** `npx eslint src api` exits `0` (0 errors, 0 warnings).
- **AC-19:** `npm test` exits `0` with all existing and new suites passing.
- **AC-20:** `npm run build` exits `0` and client bundle (`dist/`) contains zero references to `UPSTASH_REDIS_REST_URL` or `UPSTASH_REDIS_REST_TOKEN`.

---

## 7. Operational Rollout Note (Human / Deployment)

Before deploying to production or preview environments on Vercel, configure the following server-side environment variables (and add them to local `.env` for local Vercel Edge dev):
- `UPSTASH_REDIS_REST_URL` (required)
- `UPSTASH_REDIS_REST_TOKEN` (required)
- Optional tuning overrides: `RATE_LIMIT_GENERATE_PLAN_MAX`, `RATE_LIMIT_GENERATE_PLAN_WINDOW_SEC`, `RATE_LIMIT_GENERATE_WEEK_MAX`, `RATE_LIMIT_GENERATE_WEEK_WINDOW_SEC`, `RATE_LIMIT_TIMEOUT_MS`

Because the limiter is strictly fail-closed, AI generation endpoints will return `503 RATE_LIMIT_UNAVAILABLE` until `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set.
