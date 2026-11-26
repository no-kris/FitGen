# Phase 5 — Group 2 Specification: Server-Side Prompting, Dedicated AI Endpoints & Client Migration

**Run ID:** `phase-5-group-2-server-prompting-and-ai-endpoints-2026-11-25`  
**Phase:** Phase 5 — Move AI work to the server (Group 2 of 3; builds on Group 1 commit `555f86d`)  
**Scope Items:** `REFACTOR_PLAN.md` Items **5.1**, **5.2**, **5.4**, and **5.8** (client cleanup & Phase 5 "Done when")  
**Deferred (Out of Scope):** Item **5.5** (per-user server-side rate limiting on `api/generatePlan.js` and `api/generateWeek.js` — Group 3)

---

## 1. Summary & Architectural Guarantees

This group eliminates the generic raw-prompt proxy (`api/callModel.js`) and moves all prompt engineering, AI provider orchestration, JSON extraction, and plan validation strictly to Vercel Edge Functions:

1. **Zero prompt text in the client bundle:** Prompt construction moves completely from `src/utils/generateInitialPlan.js` and `src/utils/generateNextWeekPlan.js` into `api/_prompts.js`.
2. **Dedicated, schema-validated endpoints:** `POST /api/generatePlan` and `POST /api/generateWeek` accept structured JSON inputs, validate request bodies (`400`), enforce non-anonymous Firebase auth via `withAuth` (`401`/`403`/`405`), call the AI provider via `api/_aiClient.js` (`500`/`502`/`504`), extract JSON via `api/_extractJsonFromText.js`, validate/sanitize plans via `api/_validatePlan.js` (`422`), and return `{ plan }` (`200`).
3. **Strict client retry policy:** Centralized in `src/services/api/callModel.js` (respecting `AGENTS.md`). Retries up to **3 total attempts** **only** on HTTP `5xx`, HTTP `422`, network errors, or per-attempt timeouts. **Never** retries on `400`, `401`, `403`, `405`, or any other non-`422` `4xx` status.
4. **Malformed AI output never reaches Firestore:** Server-side `extractJsonFromText` + `validatePlan` reject invalid output with `422`, and the client rejects any non-conforming `200` envelope before returning to callers.
5. **No Firestore data-shape breaking changes:** Persisted `users/{uid}` (`profile`, `plan`) and `users/{uid}/workouts/{id}` schemas remain fully backward-compatible (additive `restSeconds` alongside canonical `rest: "${restSeconds}s"` was already established in Group 1's `api/_validatePlan.js`).
6. **No UI or CSS changes required:** Existing error surfaces (`ProfileSetupForm.jsx` and `PlanDashboard.jsx`) already display `error.message` from rejected generation promises. **Stage 6 (`styler`) is not needed.**

---

## 2. File Change Inventory

### Create
| Path | Responsibility |
|---|---|
| `api/_prompts.js` | Server-only prompt builders (`buildInitialPlanPrompt`, `buildNextWeekPrompt`), single-source JSON schema snippet (`buildPlanSchemaSnippet`), and pure normalizers (`normalizeProfileText`, `resolveDurationMinutes`, `formatRecentWorkouts`). |
| `api/_requestValidation.js` | Edge-safe request body validators & normalizers (`validateGeneratePlanBody`, `validateGenerateWeekBody`) for `POST /api/generatePlan` and `POST /api/generateWeek`. |
| `api/_aiClient.js` | Edge-safe OpenRouter/model provider client (`callAIProvider`, `AIProviderError`) with env validation, optional fallback model chain, timeout handling, and sanitized upstream error mapping. |
| `api/generatePlan.js` | Deployable Vercel Edge Function (`POST /api/generatePlan`). |
| `api/generateWeek.js` | Deployable Vercel Edge Function (`POST /api/generateWeek`). |
| `tests/api/_prompts.test.js` | Unit tests for `api/_prompts.js`. |
| `tests/api/generatePlan.test.js` | Handler integration tests for `api/generatePlan.js` (including deletion check for `api/callModel.js`). |
| `tests/api/generateWeek.test.js` | Handler integration tests for `api/generateWeek.js`. |
| `src/services/api/callModel.test.js` | Unit tests for `src/services/api/callModel.js` retry policy, URL resolution, and `ApiError` (including deletion check for `src/utils/extractJsonFromText.js`). |

### Modify
| Path | Change Summary |
|---|---|
| `src/services/api/callModel.js` | Refactor into centralized authenticated AI endpoint client (`ApiError`, `isRetryableStatus`, `resolveEndpointUrl`, `requestAiEndpoint`, `requestInitialPlan`, `requestNextWeekPlan`) with strict retry policy; remove `extractJsonFromText` import and raw-prompt proxy behavior. |
| `src/utils/generateInitialPlan.js` | Remove all prompt text/instructions; send structured profile payload to `requestInitialPlan(payload, token)`. |
| `src/utils/generateNextWeekPlan.js` | Remove all prompt text/instructions and raw-week fallback; send structured `{ profile, programName, lastWeek, recentWorkouts, feedback }` payload to `requestNextWeekPlan(payload, token)`. |
| `src/utils/generateInitialPlan.test.js` | Update unit tests for structured payload delegation, token passing, error propagation, and zero prompt text in module source. |
| `src/utils/generateNextWeekPlan.test.js` | Update unit tests for structured payload delegation, last-10 history slicing, `sessionDuration` exclusion, precondition/response guards, and zero prompt text in module source. |

### Delete
| Path | Reason |
|---|---|
| `api/callModel.js` | Replaced by `api/generatePlan.js` and `api/generateWeek.js` (Item 5.1). |
| `src/utils/extractJsonFromText.js` | Moved to server `api/_extractJsonFromText.js` in Group 1; client copy removed (Item 5.8). |

### Explicitly Untouched (Keep Frozen / Preserve)
- `api/_utils.js`, `api/_extractJsonFromText.js`, `api/_validatePlan.js` and their tests in `tests/api/_*.test.js`
- `src/utils/normalizeProfileText.js` and `src/utils/normalizeProfileText.test.js` (still used by `ProfileScreen.jsx` and `generateInitialPlan.js`)
- `src/features/onboarding/ProfileSetupForm.jsx`, `src/hooks/useWorkout.js`, `src/features/dashboard/PlanDashboard.jsx`, and all CSS files
- Out-of-band files: `.agents/agents/tester.md`, `docs/prds/tester-agent-prd.md`, `docs/rubrics/tester-agent-rubric.md`, `MODULARIZATION_TS_PLAN.md`

---

## 3. Environment Variables (Names Only)

- **Server (`api/*`, via `process.env`):**
  - `VITE_FIREBASE_API_KEY` — required (already read by `api/_utils.js`).
  - `PROVIDER_API_KEY` — required by `api/_aiClient.js`.
  - `API_URL` — required by `api/_aiClient.js`.
  - `MODEL` — required by `api/_aiClient.js`.
  - `MODEL_FALLBACK_1` — optional fallback model in `api/_aiClient.js`.
  - `MODEL_FALLBACK_2` — optional fallback model in `api/_aiClient.js`.
- **Client (`src/*`, via `import.meta.env`):**
  - `VITE_API_BASE_URL` — optional API origin/base URL (preferred when set).
  - `VITE_BACKEND_URL` — optional legacy backend URL (normalized cleanly if set to an origin, `/api`, or legacy `.../api/callModel`).
  - **Constraint:** No server-only env vars may appear in `src/`. Never echo or include secret values in responses or logs.

---

## 4. Server Module Contracts

### 4.1 `api/_prompts.js`

Pure, side-effect-free, Edge-compatible module containing all prompt text and single-source schema templates.

#### Exports
- `export const DEFAULT_DURATION_MINUTES = 60;`
- `export function normalizeProfileText(value)`
  - Exact parity with `src/utils/normalizeProfileText.js`:
    - Strings: trim; if empty or case-insensitive `"none"` -> `"None"`; else trimmed string (preserving original casing).
    - Arrays: filter to string items, trim each, drop empties and case-insensitive `"none"`, join remaining with `", "`; if none remain -> `"None"`. Does not mutate input.
    - All other values (`null`, `undefined`, numbers, booleans, objects) -> `"None"`.
- `export function resolveDurationMinutes(rawDuration)`
  - Exact parity with Phase 3 Group 1 fix:
    - Accepts finite `number` or non-whitespace `string` convertible via `Number(rawDuration)`.
    - Rounds via `Math.round(parsed)`; returns rounded value if `Number.isFinite(parsed) && rounded > 0`.
    - Otherwise returns `DEFAULT_DURATION_MINUTES` (`60`). Ignores booleans, objects, arrays, `0`, `0.4`, negatives, `NaN`, `Infinity`, empty/whitespace/non-numeric strings.
- `export function formatRecentWorkouts(recentWorkouts)`
  - If `!Array.isArray(recentWorkouts)` or empty -> returns `"No logs recorded yet (assume standard progression)."`.
  - Slices the last 10 entries (`.slice(-10)`), filters to non-null objects, and formats each line as:
    ```text
    ${focus}: ${exerciseCount} exercises completed. Duration: ${durationMinutes} minutes.
    ```
    where:
    - `focus = typeof log?.focus === "string" && log.focus.trim() ? log.focus.trim() : (typeof log?.workout?.focus === "string" && log.workout.focus.trim() ? log.workout.focus.trim() : "Workout")`
    - `exerciseCount = Array.isArray(log?.logs) ? log.logs.length : 0`
    - `rawDurationSec = typeof log?.duration === "number" && Number.isFinite(log.duration) && log.duration > 0 ? log.duration : 0`
    - `durationMinutes = Math.floor(rawDurationSec / 60)`
  - If no valid object entries remain -> returns `"No logs recorded yet (assume standard progression)."`.
- `export function buildPlanSchemaSnippet({ mode = "initial", weekNumber = 1, totalWeeks } = {})`
  - **Single source of truth** for the JSON output structure included in both prompts (neither prompt builder may redeclare the exercise/schedule schema inline).
  - Emits JSON structure matching `api/_validatePlan.js`:
    - `"initial"` mode: includes `"programName"`, `"description"`, `"totalWeeks": ${totalWeeks}`, `"weeks": [{ "weekNumber": 1, "description", "coachNotes", "schedule": [{ "dayNumber": 1, "dayName": "Monday", "focus", "exercises": [{ "name", "sets": 3, "reps": "8-12", "restSeconds": 60, "rest": "60s", "notes", "alternatives": ["Exact Alt 1", "Exact Alt 2", "Exact Alt 3"] }] }] }]`.
    - `"week"` mode: includes `"programName"`, `"description"`, `"weeks": [{ "weekNumber": ${weekNumber}, "description", "coachNotes", "schedule": [...] }]` (omits `"totalWeeks"`).
- `export function buildInitialPlanPrompt(profile)`
  - Expects normalized profile `{ goal, level, selectedDays, equipment, duration, weeks, exclusions, priorities }`.
  - Normalizes `exclusions` and `priorities` via `normalizeProfileText(...)` and `duration` via `resolveDurationMinutes(profile.duration)`.
  - Equipment instructions (case-insensitive trimmed match, with safe fallback so `"undefined"` is never interpolated):
    - `"full gym"` -> `"Use a full gym with a wide range of equipment to perform a variety of exercises."`
    - `"home gym (basic equipment)"` -> `"Use basic equipment at home, such as dumbbells, resistance bands, and a mat."`
    - `"bodyweight"` -> `"Use only bodyweight exercises to perform a variety of exercises."`
    - default -> `` `Use only the user's available equipment: ${equipment}.` ``
  - Goal instructions (case-insensitive trimmed match, with safe fallback):
    - `"build muscle"` -> `"Focus on higher reps (8-12), moderate weights, and shorter rest periods (2-3m) to build muscle."`
    - `"lose weight"` -> `"Focus on metabolic conditioning, high reps (12-15+), circuit training or supersets, and short rest periods (1-2m) to keep heart rate up."`
    - `"gain strength"` -> `"Focus on lower reps (4-6), heavy weights, and longer rest periods (3-5m) to maximize strength."`
    - default -> `` `Tailor reps, intensity, and rest periods specifically to achieve: ${goal}.` ``
  - Preserves all core directives:
    - Profile block: Primary Goal, Experience Level, Schedule (`selectedDays.join(", ")`), Session Duration (`${durationMinutes} minutes`), Available Equipment, `**EXCLUSIONS & INJURIES (CRITICAL):** ${exclusions} `, `**PRIORITIZE MUSCLE GROUPS:** ${priorities} `.
    - Task: strictly **WEEK 1** of a `${totalWeeks}`-week program.
    - Output format: strict parseable JSON (no markdown, no preambles) using `buildPlanSchemaSnippet({ mode: "initial", weekNumber: 1, totalWeeks })`.
    - Rules: strict scheduling on `days`, time management for `${durationMinutes}` minutes, 3 equipment-valid alternatives per exercise, goal specificity, `DOUBLE-CHECK Exclusions: '${exclusions}'.`, `DOUBLE-CHECK Prioritize: '${priorities}'.`.
- `export function buildNextWeekPrompt({ profile, programName = "", lastWeek, recentWorkouts = [], feedback = "" })`
  - Computes `nextWeekNumber = lastWeek.weekNumber + 1`.
  - Strictly reads canonical `profile?.duration` via `resolveDurationMinutes(profile?.duration)` (never reads any legacy `sessionDuration` alias; defaults to `60`).
  - Normalizes `exclusions = normalizeProfileText(profile?.exclusions)` and `priorities = normalizeProfileText(profile?.priorities)`.
  - Formats `safeProgramName = typeof programName === "string" && programName.trim() ? programName.trim() : "their training program"`.
  - Formats `safeFeedback = typeof feedback === "string" && feedback.trim() ? feedback.trim() : "None"`.
  - Serializes previous week schedule as `JSON.stringify(lastWeek.schedule.map((d) => ({ day: d.dayName, focus: d.focus, exercises: d.exercises.map((e) => e.name) })))`.
  - Formats recent performance summary via `formatRecentWorkouts(recentWorkouts)`.
  - Preserves all core directives:
    - References finished Week `${lastWeek.weekNumber}` of `"${safeProgramName}"`.
    - Includes user profile (`goal`, `level`, `equipment`, `exclusions`, `priorities`), schedule (`days`), and Week `${lastWeek.weekNumber}` feedback.
    - Task: generate full schedule for **WEEK ${nextWeekNumber}**, adapt for pain/injury feedback or apply progressive overload, respect profile exclusions/priorities, write tactical `coachNotes`, schedule strictly on `${days}`, include `Adjust volume to fit ${targetDurationMinutes} minutes.`, provide 3 alternatives per exercise.
    - Output format: strict parseable JSON using `buildPlanSchemaSnippet({ mode: "week", weekNumber: nextWeekNumber })`.

---

### 4.2 `api/_requestValidation.js`

Pure, Edge-safe request validation module (collects all errors in a single pass; never mutates input; prototype-safe via `Object.hasOwn`).

#### Exports
- `export function validateGeneratePlanBody(body)`
  - Returns `{ ok: true, data }` or `{ ok: false, errors: string[] }`.
  - Rules:
    - `body`: plain object.
    - `goal`: required non-empty string after trim, length `1..100`.
    - `level`: required non-empty string after trim, length `1..100`.
    - `equipment`: required non-empty string after trim, length `1..150`.
    - `selectedDays`: required non-empty array (`1..7` entries). Every entry must be a string matching a known weekday (full name or standard abbreviation, case-insensitive, optional trailing `.`, prototype-safe lookup). Deduplicated in input order into canonical names (`"Monday"`..`"Sunday"`).
    - `duration`: required; finite number or numeric string (`/^\s*\d+(?:\.\d+)?\s*$/`) whose `Math.round(Number(val))` is an integer in `[10, 240]`. Rejects booleans, objects, arrays, `NaN`, `Infinity`, `<= 0`, out-of-range.
    - `weeks`: required; integer number or integer string (`/^\s*\d+\s*$/`) in `[1, 52]`. Rejects floats (`2.5`), `<= 0`, out-of-range, booleans, non-numeric strings.
    - `exclusions`: optional (`undefined`/`null` -> `"None"`). If string: length `<= 500`, normalized via `normalizeProfileText`. If array: length `<= 20`, every element must be a string with length `<= 100`, normalized via `normalizeProfileText`. Any other type -> error.
    - `priorities`: optional (same rules as `exclusions`).
  - Normalized `data`: `{ goal, level, selectedDays, equipment, duration, weeks, exclusions, priorities }`.

- `export function validateGenerateWeekBody(body)`
  - Returns `{ ok: true, data }` or `{ ok: false, errors: string[] }`.
  - Rules:
    - `body`: plain object.
    - `profile`: required plain object:
      - `goal`: required non-empty trimmed string (`1..100`).
      - `level`: required non-empty trimmed string (`1..100`).
      - `equipment`: required non-empty trimmed string (`1..150`).
      - `selectedDays`: required non-empty array (`1..7`) of valid weekday names (canonicalized & deduplicated).
      - `duration`: **optional** — never fails validation when omitted/null/legacy-invalid; normalized via `resolveDurationMinutes(profile.duration)` (falls back to `60`). Legacy alias fields (e.g. `sessionDuration`) are ignored and stripped.
      - `exclusions`: optional; if string with length `> 500` -> error; otherwise normalized via `normalizeProfileText(profile.exclusions)`.
      - `priorities`: optional; if string with length `> 500` -> error; otherwise normalized via `normalizeProfileText(profile.priorities)`.
    - `programName`: optional (`undefined`/`null` -> `""`); if provided, must be a string with length `<= 200` (trimmed).
    - `lastWeek`: required plain object:
      - `weekNumber`: required safe integer in `[1, 100]`.
      - `schedule`: required non-empty array (`1..7` entries). Each entry must be a plain object with:
        - `dayName`: required non-empty trimmed string (`1..50`).
        - `focus`: required non-empty trimmed string (`1..150`).
        - `exercises`: required non-empty array (`1..30` entries), each a plain object with non-empty trimmed string `name` (`1..150`).
    - `recentWorkouts`: optional (`undefined`/`null` -> `[]`); if provided, must be an `Array` (`<= 50` entries) where every entry is a plain object.
    - `feedback`: optional (`undefined`/`null` -> `""`); if provided, must be a `string` (`<= 1000` chars), trimmed.
  - Normalized `data`: `{ profile, programName, lastWeek, recentWorkouts, feedback }`.

---

### 4.3 `api/_aiClient.js`

Edge-safe provider client shared by `api/generatePlan.js` and `api/generateWeek.js`.

#### Exports
- `export class AIProviderError extends Error`
  - Properties: `name = "AIProviderError"`, `status` (`500 | 502 | 504`), `code` (`"CONFIG_ERROR" | "UPSTREAM_ERROR" | "UPSTREAM_INVALID_RESPONSE" | "UPSTREAM_TIMEOUT"`).
- `export async function callAIProvider(prompt, options = {})`
  - `options`: `{ timeoutMs = 25000, fetchImpl = fetch }` (defaults to global `fetch` at call time so test mocks on `globalThis.fetch` work automatically).
  - Validates `process.env.PROVIDER_API_KEY`, `process.env.API_URL`, and `process.env.MODEL` are non-empty trimmed strings. If any is missing -> throws `new AIProviderError("Server configuration error: Missing AI provider configuration", { status: 500, code: "CONFIG_ERROR" })` without calling `fetch`.
  - Builds deduplicated ordered candidate models: `[MODEL, MODEL_FALLBACK_1, MODEL_FALLBACK_2]` filtered to non-empty trimmed strings.
  - Iterates candidate models:
    - Creates an `AbortController` + `setTimeout(..., timeoutMs)` (always cleared in `finally`).
    - Sends `POST ${API_URL}` with headers `{ "Content-Type": "application/json", Authorization: "Bearer ${PROVIDER_API_KEY}" }` and body `JSON.stringify({ model, messages: [{ role: "user", content: prompt }] })` and `signal`.
    - On `AbortError` / timeout: logs sanitized timeout message and immediately throws `new AIProviderError("AI provider request timed out", { status: 504, code: "UPSTREAM_TIMEOUT" })` (does NOT burn remaining time on fallback models).
    - On non-2xx HTTP status or network error: logs sanitized status/error (never logs API keys or full prompts) and continues to the next fallback model; if no fallback remains, throws `new AIProviderError("AI provider request failed", { status: 502, code: "UPSTREAM_ERROR" })`.
    - On 2xx HTTP status: parses response JSON.
      - If JSON parsing fails or `!Array.isArray(data?.choices) || data.choices.length === 0 || !data.choices[0]?.message`: logs sanitized error and continues to fallback or throws `new AIProviderError("Invalid response from AI provider", { status: 502, code: "UPSTREAM_INVALID_RESPONSE" })`.
      - Returns `typeof data.choices[0].message.content === "string" ? data.choices[0].message.content : ""` (empty string flows to `extractJsonFromText` -> `422` in the endpoint handler).

---

### 4.4 Deployable Edge Endpoints

#### `POST /api/generatePlan` (`api/generatePlan.js`)
- `export const config = { runtime: "edge" };`
- Wrapped with `withAuth(async (body) => { ... })` from `./_utils.js`.
- Flow:
  1. `const reqCheck = validateGeneratePlanBody(body);`
     - If `!reqCheck.ok` -> `return createJsonResponse({ error: "Invalid request payload", code: "INVALID_REQUEST", details: reqCheck.errors }, 400);`
  2. `const prompt = buildInitialPlanPrompt(reqCheck.data);`
  3. `let aiText; try { aiText = await callAIProvider(prompt); } catch (err) { if (err instanceof AIProviderError) return createJsonResponse({ error: err.message, code: err.code }, err.status); throw err; }`
  4. `const parsed = extractJsonFromText(aiText);`
     - If `parsed === null` -> `return createJsonResponse({ error: "AI response could not be parsed as valid JSON", code: "INVALID_AI_OUTPUT" }, 422);`
  5. `const planCheck = validatePlan(parsed, { mode: "initial", selectedDays: reqCheck.data.selectedDays, expectedWeekNumber: 1, expectedTotalWeeks: reqCheck.data.weeks });`
     - If `!planCheck.ok` -> `return createJsonResponse({ error: "AI response failed plan validation", code: "PLAN_VALIDATION_FAILED", details: planCheck.errors }, 422);`
  6. `return createJsonResponse({ plan: planCheck.plan }, 200);`

#### `POST /api/generateWeek` (`api/generateWeek.js`)
- `export const config = { runtime: "edge" };`
- Wrapped with `withAuth(async (body) => { ... })` from `./_utils.js`.
- Flow:
  1. `const reqCheck = validateGenerateWeekBody(body);`
     - If `!reqCheck.ok` -> `return createJsonResponse({ error: "Invalid request payload", code: "INVALID_REQUEST", details: reqCheck.errors }, 400);`
  2. `const { profile, programName, lastWeek, recentWorkouts, feedback } = reqCheck.data;`
  3. `const expectedWeekNumber = lastWeek.weekNumber + 1;`
  4. `const prompt = buildNextWeekPrompt({ profile, programName, lastWeek, recentWorkouts, feedback });`
  5. `let aiText; try { aiText = await callAIProvider(prompt); } catch (err) { if (err instanceof AIProviderError) return createJsonResponse({ error: err.message, code: err.code }, err.status); throw err; }`
  6. `const parsed = extractJsonFromText(aiText);`
     - If `parsed === null` -> `return createJsonResponse({ error: "AI response could not be parsed as valid JSON", code: "INVALID_AI_OUTPUT" }, 422);`
  7. `const planCheck = validatePlan(parsed, { mode: "week", selectedDays: profile.selectedDays, expectedWeekNumber });`
     - If `!planCheck.ok` -> `return createJsonResponse({ error: "AI response failed plan validation", code: "PLAN_VALIDATION_FAILED", details: planCheck.errors }, 422);`
  8. `return createJsonResponse({ plan: planCheck.plan }, 200);`

---

## 5. Error Response Shapes, Status Codes & Rate Limits

| HTTP Status | Trigger | Response Body | CORS Headers | Client Retries? |
|---|---|---|---|---|
| `200` | `OPTIONS` preflight | `null` (empty) | Yes | N/A |
| `200` | Validated plan generated | `{ plan: Object }` | Yes | N/A |
| `400` | Malformed / non-object JSON body (`withAuth`) | `{ error: "Invalid JSON body" }` | Yes | **No** |
| `400` | Request payload validation failed | `{ error: "Invalid request payload", code: "INVALID_REQUEST", details: string[] }` | Yes | **No** |
| `401` | Missing/malformed `Authorization` header | `{ error: "Missing authorization header" }` | Yes | **No** |
| `401` | Invalid or expired Firebase ID token | `{ error: "Unauthorized: Invalid token" }` | Yes | **No** |
| `403` | Anonymous Firebase token | `{ error: "Forbidden: Anonymous accounts are not allowed" }` | Yes | **No** |
| `403` | Disabled Firebase account | `{ error: "Forbidden: Account is disabled" }` | Yes | **No** |
| `405` | Non-POST method | `{ error: "Method not allowed" }` | Yes | **No** |
| `422` | AI text fails `extractJsonFromText` | `{ error: "AI response could not be parsed as valid JSON", code: "INVALID_AI_OUTPUT" }` | Yes | **Yes** (max 3 attempts) |
| `422` | Extracted JSON fails `validatePlan` | `{ error: "AI response failed plan validation", code: "PLAN_VALIDATION_FAILED", details: string[] }` | Yes | **Yes** (max 3 attempts) |
| `500` | Missing server env / unexpected exception | `{ error: string, code?: "CONFIG_ERROR" }` | Yes | **Yes** (max 3 attempts) |
| `502` | Upstream AI provider HTTP/network/envelope error | `{ error: string, code: "UPSTREAM_ERROR" \| "UPSTREAM_INVALID_RESPONSE" }` | Yes | **Yes** (max 3 attempts) |
| `504` | Upstream AI provider timeout | `{ error: "AI provider request timed out", code: "UPSTREAM_TIMEOUT" }` | Yes | **Yes** (max 3 attempts) |

**Rate Limiting:** Per-user server-side rate limiting (`429 Too Many Requests`) is explicitly deferred to **Phase 5 Group 3 (Item 5.5)**. Note that the client retry policy (`status === 422 || (status >= 500 && status < 600)`) already treats `429` as non-retryable so Group 3 integrates cleanly without client retry changes.

---

## 6. Client API Service & Caller Migration Contract

### 6.1 `src/services/api/callModel.js`

Remains the single centralized module for all model HTTP traffic (preserving the `AGENTS.md` rule). Contains zero prompt text and zero JSON extraction logic.

#### Exports
- `export class ApiError extends Error`
  - Constructor: `constructor(message, { status = null, code = null, details = null, retryable = false } = {})`
  - Properties: `name = "ApiError"`, `status`, `code`, `details`, `retryable`.
- `export function isRetryableStatus(status)`
  - Returns `true` **iff** `typeof status === "number" && (status === 422 || (status >= 500 && status < 600))`.
  - Returns `false` for `400`, `401`, `403`, `404`, `405`, `429`, all other `4xx`, `2xx`, `3xx`, and non-numbers.
- `export function resolveEndpointUrl(endpointPath, configuredBase = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_BACKEND_URL || "")`
  - Ensures `endpointPath` starts with `/api/`.
  - If `configuredBase` is empty/whitespace -> returns `endpointPath` (e.g., `"/api/generatePlan"`).
  - Otherwise trims `configuredBase`, strips trailing `/`, strips trailing `/api/callModel` (case-insensitive) if present, else strips trailing `/api` (case-insensitive) if present, and returns `${base}${endpointPath}`.
  - Examples:
    - `resolveEndpointUrl("/api/generatePlan", "")` -> `"/api/generatePlan"`
    - `resolveEndpointUrl("/api/generatePlan", "/api/callModel")` -> `"/api/generatePlan"`
    - `resolveEndpointUrl("/api/generatePlan", "https://app.example.com")` -> `"https://app.example.com/api/generatePlan"`
    - `resolveEndpointUrl("/api/generatePlan", "https://app.example.com/api/")` -> `"https://app.example.com/api/generatePlan"`
    - `resolveEndpointUrl("/api/generateWeek", "https://app.example.com/api/callModel")` -> `"https://app.example.com/api/generateWeek"`
- `export async function requestAiEndpoint(endpointPath, payload, token, options = {})`
  - `options`: `{ maxAttempts = 3, baseDelayMs = 300, timeoutMs = 30000, sleep, baseUrl }`
  - Precondition: if `typeof token !== "string" || token.trim().length === 0`, immediately throws `new ApiError("Missing authorization token", { status: 401, code: "MISSING_TOKEN", retryable: false })` without calling `fetch`.
  - Executes up to `maxAttempts` attempts:
    1. Creates per-attempt `AbortController` with `timeoutMs` timer (cleared in `finally`).
    2. Calls `fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token.trim() }, body: JSON.stringify(payload), signal: controller.signal })`.
    3. If `!response.ok`:
       - Attempts to parse JSON `{ error, code, details }` safely.
       - Builds `ApiError(errData?.error || "Failed to call backend API", { status: response.status, code: errData?.code ?? null, details: errData?.details ?? null, retryable: isRetryableStatus(response.status) })`.
       - If `!apiError.retryable`: **immediately throws `apiError`** (0 retries).
       - If `apiError.retryable`: throws into retry loop.
    4. If `response.ok`:
       - Parses response JSON; if invalid JSON -> throws retryable `ApiError("Invalid JSON response from server", { status: 502, code: "INVALID_RESPONSE", retryable: true })`.
       - If `data?.error` -> throws retryable `ApiError(String(data.error), { status: 500, code: data?.code ?? null, retryable: true })`.
       - Validates `data?.plan` is a non-null plain object with `Array.isArray(data.plan.weeks) && data.plan.weeks.length > 0`; if invalid -> throws retryable `ApiError("Invalid plan response from server", { status: 502, code: "INVALID_RESPONSE", retryable: true })`.
       - Returns `data.plan`.
    5. Catch block:
       - If `error instanceof ApiError && !error.retryable`: immediately rethrows without waiting or retrying.
       - Normalizes non-`ApiError` failures (`AbortError` -> `ApiError("Request timed out. Please try again.", { status: null, code: "TIMEOUT", retryable: true })`; network error -> `ApiError(error?.message || "Network error", { status: null, code: "NETWORK_ERROR", retryable: true })`).
       - Logs `console.warn(...)`.
       - If `attempt < maxAttempts - 1`: awaits exponential delay `baseDelayMs * Math.pow(2, attempt)` (via `options.sleep` or `setTimeout`, skipped if delay `<= 0`).
       - After final attempt: throws `lastError`.
- `export function requestInitialPlan(profileData, token, options)`
  - Delegates to `requestAiEndpoint("/api/generatePlan", profileData, token, options)`.
- `export function requestNextWeekPlan(payload, token, options)`
  - Delegates to `requestAiEndpoint("/api/generateWeek", payload, token, options)`.
- `export default requestAiEndpoint;`

### 6.2 `src/utils/generateInitialPlan.js`
- Signature unchanged: `const generateInitialPlan = async (formData) => { ... }; export default generateInitialPlan;`
- Builds structured payload:
  ```js
  const payload = {
    goal: formData?.goal,
    level: formData?.level,
    selectedDays: formData?.selectedDays,
    equipment: formData?.equipment,
    duration: formData?.duration,
    weeks: formData?.weeks,
    exclusions: normalizeProfileText(formData?.exclusions),
    priorities: normalizeProfileText(formData?.priorities),
  };
  ```
- Obtains token via `await getUserToken()`.
- Returns `await requestInitialPlan(payload, token)`.
- Contains **zero** prompt text, goal/equipment prompt strings, or JSON schema text.

### 6.3 `src/utils/generateNextWeekPlan.js`
- Signature unchanged: `const generateNextWeekPlan = async (profile, plan, history, feedback) => { ... }; export default generateNextWeekPlan;`
- Guard: if `!Array.isArray(plan?.weeks) || plan.weeks.length === 0`, throws `new Error("Cannot generate next week without an existing plan")` before fetching a token or calling the API.
- Extracts `lastWeek = plan.weeks[plan.weeks.length - 1]`.
- Builds lean structured payload:
  ```js
  const payload = {
    profile: {
      goal: profile?.goal,
      level: profile?.level,
      equipment: profile?.equipment,
      selectedDays: profile?.selectedDays,
      ...(profile?.duration !== undefined ? { duration: profile.duration } : {}),
      exclusions: normalizeProfileText(profile?.exclusions),
      priorities: normalizeProfileText(profile?.priorities),
    },
    programName: typeof plan?.programName === "string" ? plan.programName : "",
    lastWeek: {
      weekNumber: lastWeek?.weekNumber,
      schedule: Array.isArray(lastWeek?.schedule)
        ? lastWeek.schedule.map((day) => ({
            ...(day?.dayNumber !== undefined ? { dayNumber: day.dayNumber } : {}),
            dayName: day?.dayName,
            focus: day?.focus,
            exercises: Array.isArray(day?.exercises)
              ? day.exercises.map((ex) => ({ name: ex?.name }))
              : [],
          }))
        : [],
    },
    recentWorkouts: Array.isArray(history) ? history.slice(-10) : [],
    feedback: typeof feedback === "string" ? feedback : "",
  };
  ```
- Does **not** read or forward any legacy `sessionDuration` alias field.
- Obtains token via `await getUserToken()`.
- Calls `const result = await requestNextWeekPlan(payload, token);`.
- Defensively verifies `result && Array.isArray(result.weeks) && result.weeks.length > 0`; otherwise throws `new Error("Failed to generate valid plan data")`.
- Returns `result` (`{ programName?, description?, weeks: [validatedWeek] }`).
- Contains **zero** prompt text or JSON schema text.

---

## 7. Acceptance Criteria

1. **AC-1 (Zero prompt text in client source & bundle):**
   - `src/utils/generateInitialPlan.js`, `src/utils/generateNextWeekPlan.js`, `src/services/api/callModel.js`, and the production bundle (`npm run build` -> `dist/assets/*.js`) contain zero prompt text (no `"You are an expert fitness coach"`, `"DOUBLE-CHECK Exclusions"`, `"DOUBLE-CHECK Prioritize"`, `"OUTPUT FORMAT"`, `"STRICT, parseable JSON"`, `"Use a full gym with a wide range"`, or `"Adjust volume to fit"`).
2. **AC-2 (Server prompt parity & single-source schema):**
   - `api/_prompts.js` builds prompts for both initial and next-week generation using one shared `buildPlanSchemaSnippet` helper.
   - Preserves Phase 3 Group 1 canonical `profile.duration` resolution with `60`-minute fallback and ignores legacy `sessionDuration` alias.
   - Preserves Phase 3 Group 4 `normalizeProfileText` behavior for `exclusions`/`priorities` (empty/whitespace/`"none"`/arrays/nullish -> `"None"`).
   - Never interpolates `"undefined"` for unknown goal/equipment values.
   - Formats both flat and legacy nested `recentWorkouts` entries, slicing to the last 10 entries.
3. **AC-3 (`POST /api/generatePlan` end-to-end contract):**
   - Edge runtime configured (`config.runtime === "edge"`), wrapped with `withAuth` (CORS `OPTIONS` 200, non-POST 405, missing/invalid auth 401, anonymous/disabled 403, invalid JSON 400).
   - Rejects invalid/missing profile fields with HTTP `400` and `{ error, code: "INVALID_REQUEST", details }`.
   - Calls AI provider via `api/_aiClient.js` (supporting optional `MODEL_FALLBACK_1`/`MODEL_FALLBACK_2`), extracts JSON via `api/_extractJsonFromText.js`, validates/sanitizes via `api/_validatePlan.js` (`mode: "initial"`, `selectedDays`, `expectedWeekNumber: 1`, `expectedTotalWeeks: weeks`), and returns HTTP `200` `{ plan }` with zero `undefined` values.
   - Returns `422` (`INVALID_AI_OUTPUT` / `PLAN_VALIDATION_FAILED`) when AI output is unparseable or fails validation.
   - Maps missing provider env to `500`, upstream errors/malformed envelopes to `502`, and upstream timeouts to `504` without leaking secrets or raw upstream bodies.
4. **AC-4 (`POST /api/generateWeek` end-to-end contract):**
   - Edge runtime configured (`config.runtime === "edge"`), wrapped with `withAuth`.
   - Accepts `{ profile, lastWeek, recentWorkouts, feedback }` (plus optional `programName`); validates required fields (`400`), allows omitted/legacy `profile.duration` (falling back to 60 minutes) and omitted/empty `recentWorkouts`/`feedback`/`programName`.
   - Calls AI provider, extracts JSON, validates/sanitizes via `api/_validatePlan.js` (`mode: "week"`, `selectedDays`, `expectedWeekNumber: lastWeek.weekNumber + 1`), and returns HTTP `200` `{ plan }`.
   - Returns `422` when AI output is unparseable, has wrong `weekNumber`, schedules days outside `selectedDays`, or fails structural validation.
   - Maps provider failures to `500`/`502`/`504`.
5. **AC-5 (Strict client retry policy):**
   - `src/services/api/callModel.js` retries up to 3 total attempts **only** on HTTP `5xx`, HTTP `422`, network errors, timeouts, or corrupt `200` envelopes.
   - **Never** retries (exactly 1 `fetch` call) on `400`, `401`, `403`, `405`, `429`, or missing token.
   - Exposes `ApiError` with `status`, `code`, `details`, `retryable`, and user-facing `message`.
   - Correctly normalizes relative URLs, origin URLs, `/api` URLs, and legacy `.../api/callModel` `VITE_BACKEND_URL` values.
6. **AC-6 (Cleanup, data-shape preservation & green gates):**
   - `api/callModel.js` and `src/utils/extractJsonFromText.js` are deleted, with zero dangling imports anywhere in `src/`, `api/`, or `tests/`.
   - Persisted Firestore `plan` and `profile` shapes remain unchanged; `ProfileSetupForm.jsx` and `useWorkout.js` continue working without modification.
   - `npx eslint src api` exits 0, `npm test` exits 0, and `npm run build` exits 0.

---

## 8. Test Plan Outline (Keep Each Test File <= ~300 LOC)

All API tests MUST live under `tests/api/` (never inside `api/`). All tests MUST run offline with mocked `fetch` and mocked env vars (restored in `afterEach`).

1. **`tests/api/_prompts.test.js`**
   - `normalizeProfileText` & `resolveDurationMinutes` parity cases (including invalid durations & legacy `sessionDuration` alias ignored).
   - `buildPlanSchemaSnippet` initial vs week shape.
   - `buildInitialPlanPrompt` canonical goals/equipment + unknown fallback (no `"undefined"`), normalized exclusions/priorities in profile block & DOUBLE-CHECK rules.
   - `buildNextWeekPrompt` `nextWeekNumber`, optional `programName`, `profile.duration` resolution, flat + legacy nested `recentWorkouts` + last-10 cap + empty fallback, feedback present/empty, exclusions/priorities.
2. **`tests/api/generatePlan.test.js`**
   - Asserts `api/callModel.js` does not exist; `config.runtime === "edge"`.
   - `withAuth` guards (`OPTIONS` 200, `GET` 405, missing auth 401, anonymous 403, invalid JSON 400).
   - Request validation `400` cases (missing required fields, invalid/prototype-key `selectedDays`, out-of-range `duration`/`weeks`, invalid `exclusions`/`priorities`).
   - Happy path `200` with fenced JSON, sanitized `sets`/`restSeconds`/`rest`/`alternatives`, zero `undefined` values.
   - Fallback chain (`MODEL` fails with 503 -> `MODEL_FALLBACK_1` succeeds).
   - `422` on non-JSON AI output (`INVALID_AI_OUTPUT`) and invalid plan structure/weekday/weekNumber (`PLAN_VALIDATION_FAILED` + `details`).
   - `500` missing provider env, `502` upstream failure / malformed provider JSON, `504` timeout (no fallback burn).
3. **`tests/api/generateWeek.test.js`**
   - Asserts `config.runtime === "edge"`.
   - `withAuth` guards (`OPTIONS` 200, `GET` 405, 401, 403).
   - Request validation `400` cases (missing `profile`/`lastWeek`, bad `weekNumber`, empty `schedule`, invalid `exercises`, non-array `recentWorkouts`, non-string/overlong `feedback`).
   - Happy path `200` for wrapped and bare week outputs, optional `programName`, omitted/legacy `profile.duration` -> 60m fallback, `expectedWeekNumber = lastWeek.weekNumber + 1`.
   - `422` on unparseable output, mismatched `weekNumber`, day not in `selectedDays`.
   - `500`, `502`, `504` provider failures.
4. **`src/services/api/callModel.test.js`**
   - Asserts `src/utils/extractJsonFromText.js` does not exist.
   - `resolveEndpointUrl` matrix (empty, `/api/callModel`, origin, `/api`, origin + `/api/callModel`, trailing slashes).
   - `isRetryableStatus` matrix.
   - `requestInitialPlan` / `requestNextWeekPlan`: 200 happy path (correct URL, Bearer header, structured body, unwrapped `plan`), missing token (401, 0 fetches), non-retryable `400`/`401`/`403`/`405`/`429` (1 fetch, throws `ApiError` with status/code/details), retryable `422`/`500`/`502`/`503`/`504` (retries up to 3, recovers on later 200, throws after 3 failures), network rejection & timeout retries, malformed 200 envelope rejected.
5. **`src/utils/generateInitialPlan.test.js` (updated)**
   - Verifies structured payload (with normalized `exclusions`/`priorities`), `getUserToken` -> `requestInitialPlan`, error propagation, and zero prompt text in `src/utils/generateInitialPlan.js`.
6. **`src/utils/generateNextWeekPlan.test.js` (updated)**
   - Verifies structured payload (`profile`, `programName`, lean `lastWeek`, last-10 `recentWorkouts`, `feedback`), omits `sessionDuration` alias, throws on missing `plan.weeks` or invalid server response, propagates errors, and zero prompt text in `src/utils/generateNextWeekPlan.js`.
