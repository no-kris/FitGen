# Phase 5 — Group 1 Technical Specification: Server Auth Hardening, Endpoint Cleanup & Plan Parsing/Validation Foundation

**Phase:** 5 (`REFACTOR_PLAN.md` — Move AI work to the server)  
**Group:** 1 of 3 (Foundation)  
**Run ID:** `phase-5-group-1-api-auth-and-plan-validation-2026-11-25`  
**Styler needed:** No (backend / `api/*` only; zero UI or CSS changes)

---

## 1. Scope & Boundaries

### In Scope (Group 1)
1. **Item 5.6 — Delete `api/debug.js`:** Remove the unauthenticated edge endpoint that leaks server model environment variables (`MODEL`, `MODEL_FALLBACK_1`, `MODEL_FALLBACK_2`).
2. **Item 5.7 — Harden `verifyFirebaseToken` & `withAuth` in `api/_utils.js`:** Reject anonymous Firebase tokens (`firebase.sign_in_provider === "anonymous"` and provider-less anonymous user records from Firebase `accounts:lookup`), reject malformed/disabled/mismatched tokens, return structured auth results with distinct `401` vs `403` HTTP status codes, and forward verified `{ uid, email, signInProvider }` auth context to handlers for Group 2/3 reuse.
3. **Item 5.8 (Server Foundation) — Add `api/_extractJsonFromText.js`:** Pure, Edge-safe JSON extractor supporting raw JSON, multiple markdown code fences, and string-aware balanced bracket extraction with full unit test coverage. Leave `src/utils/extractJsonFromText.js` intact for existing client callers until Group 2.
4. **Item 5.3 — Add `api/_validatePlan.js`:** Strict, pure schema validator and sanitizer for both initial (`mode: "initial"`) and single next-week (`mode: "week"`) AI plan payloads, enforcing required fields, whole-number `sets`, `restSeconds` (with backward-compatible `rest`), default `alternatives: []`, `scheduledDays ⊆ selectedDays` (unique, non-empty), `weekNumber` matching, zero `undefined` values, and structured `{ ok: false, errors }` output ready for Group 2's HTTP `422` responses.

### Out of Scope (Deferred to Groups 2 & 3)
- Do **NOT** create `api/_prompts.js`, `api/generatePlan.js`, or `api/generateWeek.js` (Items 5.1, 5.2).
- Do **NOT** delete or modify `api/callModel.js` or `src/services/api/callModel.js` (Items 5.1, 5.4).
- Do **NOT** delete `src/utils/extractJsonFromText.js` (Item 5.8 client cleanup — deferred to Group 2).
- Do **NOT** add per-user rate limiting (Item 5.5 — deferred to Group 3).
- Do **NOT** edit any files under `src/`, `css/`, `vitest.config.js`, `eslint.config.js`, or `package.json`.

---

## 2. File Manifest

| Action | Path | Owner | Purpose |
| --- | --- | --- | --- |
| **Delete** | `api/debug.js` | `implementer` | Remove unauthenticated debug endpoint exposing model env vars |
| **Modify** | `api/_utils.js` | `implementer` | Harden `verifyFirebaseToken`, add `decodeJwtPayload`, update `withAuth` status handling & auth context forwarding |
| **Create** | `api/_extractJsonFromText.js` | `implementer` | Server-side pure JSON extractor (`_`-prefixed so Vercel does not deploy it as an endpoint) |
| **Create** | `api/_validatePlan.js` | `implementer` | Server-side plan validator & sanitizer (`_`-prefixed so Vercel does not deploy it as an endpoint) |
| **Create** | `api/_utils.test.js` | `tester` | Unit tests for `decodeJwtPayload`, `verifyFirebaseToken`, `withAuth`, and `createJsonResponse` |
| **Create** | `api/_extractJsonFromText.test.js` | `tester` | Unit tests for `extractJsonFromText` across all parsing/malformed/adversarial edge cases |
| **Create** | `api/_validatePlan.test.js` | `tester` | Unit tests for `validatePlan` across initial/week modes, sanitization, subset checks, immutability, idempotency, and Firestore `undefined` safety |

### Explicitly Unchanged Files
- `api/callModel.js` — continues importing `{ withAuth, createJsonResponse } from "./_utils.js"` and automatically inherits hardened auth without signature changes.
- `src/utils/extractJsonFromText.js` — kept intact until Group 2 migrates client callers.
- `vitest.config.js` — already includes `"api/**/*.test.js"` in `test.include`.
- `eslint.config.js` — already lints `api/**/*.js` under `npx eslint src api` with both `globals.browser` (Web/Edge APIs) and `globals.node` (`process`, `console`).

---

## 3. Detailed Technical Contracts

### 3.1 Item 5.6 — Delete `api/debug.js`

- **Reference audit:** Verified zero references to `api/debug.js` or `/api/debug` across `src/`, `api/`, `vercel.json`, `vite.config.js`, `package.json`, `vitest.config.js`, `eslint.config.js`, `capacitor.config.json`, `index.html`, and `readme.md`.
- **Action:** Delete `api/debug.js`.
- **Runtime impact:** None; `/api/debug` is no longer deployed by Vercel.

---

### 3.2 Item 5.7 — Hardened Auth in `api/_utils.js`

All code in `api/_utils.js` MUST remain **Vercel Edge Runtime compatible** (Web Standard APIs only: `fetch`, `Request`, `Response`, `atob`, `Uint8Array`, `TextDecoder`; **never** use Node-only `Buffer` or `node:*` imports).

#### Exports
```js
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function createJsonResponse(body, status)
export function decodeJwtPayload(token)
export async function verifyFirebaseToken(token)
export function withAuth(handler)
```

#### `decodeJwtPayload(token)`
Pure Edge-safe JWT payload decoder (does **not** verify cryptographic signatures; signature verification is performed by Firebase `accounts:lookup`).

- **Input:** `token` (`unknown`).
- **Validation rules:**
  1. `token` MUST be a non-empty string with no whitespace.
  2. `token.split(".")` MUST have length `3`, and all 3 segments (`header`, `payload`, `signature`) MUST be non-empty base64url strings matching `/^[A-Za-z0-9_-]+$/`.
  3. Decode segment `[1]` (payload) using Edge-safe base64url -> UTF-8 decoding:
     - Validate `segment.length % 4 !== 1`.
     - Replace `-` -> `+`, `_` -> `/`, append `=` padding to multiple of 4.
     - Decode via `atob` -> `Uint8Array` -> `new TextDecoder().decode(bytes)`.
  4. `JSON.parse` the decoded string; result MUST be a plain object (`parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)`).
- **Return:** The parsed payload object on success, or `null` on any failure (never throws).

#### `verifyFirebaseToken(token)`
Verifies a Firebase ID token and enforces non-anonymous, active account policy matching Phase 2 Firestore rules (`request.auth.token.firebase.sign_in_provider != 'anonymous'`).

- **Environment dependency:** Reads `process.env.VITE_FIREBASE_API_KEY` (unchanged env var name; do not introduce undeclared env vars).
- **Step-by-step contract:**
  1. **Server config check:** If `!process.env.VITE_FIREBASE_API_KEY`, `throw new Error("Server configuration error: Missing Firebase API key")`. (Surfaces as `500` in `withAuth`.)
  2. **Token & JWT structure check:** Call `decodeJwtPayload(token)`. If `null`, return:
     ```js
     {
       valid: false,
       status: 401,
       code: "INVALID_TOKEN",
       error: "Unauthorized: Invalid token",
     }
     ```
     (Does **not** call `fetch`.)
  3. **JWT `sign_in_provider` claim check (fast-fail before upstream lookup):**
     - Read `const rawProvider = payload?.firebase?.sign_in_provider`.
     - If `typeof rawProvider === "string" && rawProvider.trim().toLowerCase() === "anonymous"`, return:
       ```js
       {
         valid: false,
         status: 403,
         code: "ANONYMOUS_NOT_ALLOWED",
         error: "Forbidden: Anonymous accounts are not allowed",
       }
       ```
       (Does **not** call `fetch`.)
     - If `typeof rawProvider !== "string" || rawProvider.trim().length === 0`, return `401` `INVALID_TOKEN` (fail-closed; does **not** call `fetch`).
     - Let `signInProvider = rawProvider.trim()`.
  4. **Firebase Auth REST API cryptographic verification (`accounts:lookup`):**
     - `POST https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`
     - Headers: `{ "Content-Type": "application/json" }`
     - Body: `JSON.stringify({ idToken: token })`
     - If `response.status >= 500`: `throw new Error("Auth verification service unavailable")` (surfaces as `500` so transient Google outages do not masquerade as `401`).
     - If `!response.ok` (e.g., `400` expired/revoked/invalid signature): return `401` `INVALID_TOKEN`.
     - Parse JSON body safely (`try { data = await response.json(); } catch { ... }`). If parsing fails or `!Array.isArray(data?.users) || data.users.length === 0`, return `401` `INVALID_TOKEN`.
  5. **User record verification (defense in depth):**
     - Let `user = data.users[0]`.
     - If `!user || typeof user.localId !== "string" || user.localId.length === 0`: return `401` `INVALID_TOKEN`.
     - **UID consistency:** Let `tokenUid = typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : typeof payload.user_id === "string" && payload.user_id.length > 0 ? payload.user_id : null`. If `tokenUid && tokenUid !== user.localId`: return `401` `INVALID_TOKEN`.
     - **Disabled account:** If `user.disabled === true`: return:
       ```js
       {
         valid: false,
         status: 403,
         code: "USER_DISABLED",
         error: "Forbidden: Account is disabled",
       }
       ```
     - **Provider/anonymous record check:**
       - `hasLinkedProvider`: `Array.isArray(user.providerUserInfo) && user.providerUserInfo.some((p) => p && typeof p.providerId === "string" && p.providerId.trim().length > 0 && p.providerId.trim().toLowerCase() !== "anonymous")`.
       - `hasEmail`: `typeof user.email === "string" && user.email.trim().length > 0`.
       - If `!hasLinkedProvider && !hasEmail`: return `403` `ANONYMOUS_NOT_ALLOWED`.
  6. **Success return:**
     ```js
     {
       valid: true,
       uid: user.localId,
       email: typeof user.email === "string" ? user.email : null,
       signInProvider,
     }
     ```

#### `withAuth(handler)`
Higher-order Edge route wrapper handling CORS, HTTP method enforcement, auth verification, JSON body parsing, and unhandled error translation.

- **Request flow & HTTP status / error response shapes:**

| Condition | HTTP Status | Response Body | Retryable by Client (Phase 5 rule) |
| --- | --- | --- | --- |
| `req.method === "OPTIONS"` | `200` | `null` (with `corsHeaders`) | N/A |
| `req.method !== "POST"` | `405` | `{ "error": "Method not allowed" }` | No |
| Missing `Authorization` header, wrong scheme (not `Bearer`), or empty token | `401` | `{ "error": "Missing authorization header" }` | No |
| Malformed JWT, missing `sign_in_provider`, expired/invalid token, UID mismatch | `401` | `{ "error": "Unauthorized: Invalid token" }` | No |
| Anonymous token (`sign_in_provider === "anonymous"` or provider-less anonymous user) | `403` | `{ "error": "Forbidden: Anonymous accounts are not allowed" }` | No |
| Disabled user (`user.disabled === true`) | `403` | `{ "error": "Forbidden: Account is disabled" }` | No |
| Malformed JSON body OR JSON body is not a plain object (`null`, array, primitive) | `400` | `{ "error": "Invalid JSON body" }` | No |
| Unhandled error (missing `VITE_FIREBASE_API_KEY`, upstream auth 5xx, network error, handler throw) | `500` | `{ "error": "<error.message or 'Internal server error'>" }` | Yes (`5xx`) |

- **Header parsing rule:**
  - Match `const match = authHeader?.match(/^Bearer\s+(.+)$/i)`.
  - Trim `const idToken = match ? match[1].trim() : ""`.
  - If `!idToken`, return `createJsonResponse({ error: "Missing authorization header" }, 401)`.
- **JSON body rule:**
  - Parse with `await req.json()`. If it throws OR `!body || typeof body !== "object" || Array.isArray(body)`, return `createJsonResponse({ error: "Invalid JSON body" }, 400)`.
- **Handler invocation:**
  - Call `await handler(body, { uid: authResult.uid, email: authResult.email, signInProvider: authResult.signInProvider })`.
  - Fully backward-compatible with `api/callModel.js`'s 1-argument `async (body) => ...`, while providing `auth.uid` for Group 2 endpoints and Group 3 per-user rate limiting.
- **Rate limits:** Deferred to Group 3 (Item 5.5). None enforced in Group 1.

---

### 3.3 Item 5.8 (Server Foundation) — `api/_extractJsonFromText.js`

Pure, side-effect-free (no `console.error` logging) JSON extractor for untrusted LLM text output.

#### Exports
```js
export function extractJsonFromText(text)
export default extractJsonFromText
```

#### Contract
- **Input:** `text` (`unknown`).
- **Output:** Parsed non-null JSON object or array (`typeof value === "object" && value !== null`), or `null` if no valid JSON object/array can be extracted.
- **Extraction pipeline (in exact precedence order):**
  1. **Input guard:** If `typeof text !== "string"`, return `null`. Let `trimmed = text.trim()`. If `!trimmed`, return `null`.
  2. **Direct parse:** Try `JSON.parse(trimmed)`. If it succeeds and returns a non-null object or array (`parsed !== null && typeof parsed === "object"`), return `parsed`. (Bare JSON primitives like `"42"`, `"true"`, `"null"`, `"\"hello\""` are **not** returned; return `null` unless a fenced or bracketed object/array exists.)
  3. **Markdown code fence extraction (all blocks):**
     - Scan all fenced code blocks matching `` /```(?:json)?\s*([\s\S]*?)```/gi `` (via `matchAll`).
     - For each block, trim its captured inner content and try `JSON.parse`.
     - Return the first block that parses to a non-null object or array.
     - If a fenced block fails `JSON.parse` (e.g., an earlier non-JSON note fence, or prose inside a fence), try extracting a balanced JSON object/array from inside the fence or continue to subsequent fences before falling through to Step 4.
  4. **String-aware balanced bracket scan:**
     - Iterate `start` over indices where `text[start]` is `"{"` or `"["`.
     - Maintain a stack of expected closing brackets (`"}"` for `"{"`, `"]"` for `"["`), plus `inString` (`boolean`) and `escaped` (`boolean`).
     - Ignore `{`, `}`, `[`, `]` characters while `inString === true`.
     - Properly handle backslash escapes inside strings (`\"`, `\\`, `\\"` where `\\` cancels escape before closing quote!).
     - When the stack empties at index `end`, slice `text.slice(start, end + 1)` and try `JSON.parse`. If it succeeds and yields a non-null object/array, return it immediately.
     - If a closing bracket mismatches the top of stack, abort that `start` candidate and advance to the next candidate start index.
     - **Adversarial / DoS guard:** Bound scan work (e.g., max `100` candidate start attempts and max `2_000_000` character steps) so pathological inputs like `"{".repeat(100_000)` terminate quickly and return `null` instead of timing out the Edge worker.
  5. **Fallback failure:** Return `null`.

---

### 3.4 Item 5.3 — `api/_validatePlan.js`

Pure, deterministic validator and sanitizer for AI-generated workout plans. Zero cross-boundary imports from `src/` (keeps Vercel Edge bundle self-contained under `api/`). Never mutates its input; never logs to console; never emits `undefined` anywhere in the returned object.

#### Exports
```js
export function validatePlan(rawPlan, options = {})
export default validatePlan
```

#### Signature & Options
```js
/**
 * @param {unknown} rawPlan - Parsed JSON object from the AI model.
 * @param {Object} [options={}]
 * @param {"initial" | "week"} [options.mode="initial"]
 *   - "initial": validates a newly generated program ({ programName, description, totalWeeks, weeks }).
 *   - "week": validates a single generated next week ({ programName?, description?, weeks: [week] }
 *     or bare single-week object { weekNumber, description?, coachNotes?, schedule }).
 * @param {string[]} [options.selectedDays]
 *   - When provided, MUST be a non-empty array of valid weekday names.
 *   - Every scheduled day in every week MUST normalize to a member of selectedDays
 *     (enforcing non-empty scheduledDays ⊆ selectedDays with no duplicates).
 * @param {number} [options.expectedWeekNumber]
 *   - When provided, MUST be a positive integer (>= 1).
 *   - Enforces weeks.length === 1 and weeks[0].weekNumber === expectedWeekNumber.
 * @param {number} [options.expectedTotalWeeks]
 *   - Used in "initial" mode. When provided, MUST be a positive integer (>= 1),
 *     and sets output plan.totalWeeks = expectedTotalWeeks.
 * @returns {{ ok: true, plan: Object } | { ok: false, errors: string[] }}
 */
```

#### Return Shapes
- **Success:** `{ ok: true, plan }` — `plan` is a freshly constructed, sanitized object containing zero `undefined` values at any nesting depth.
- **Validation failure:** `{ ok: false, errors }` — `errors` is a non-empty `string[]` listing **all** validation issues with clear path prefixes (e.g., `"programName: must be a non-empty string"`, `"weeks[0].weekNumber: expected 2, received 1"`, `"weeks[0].schedule[1].dayName: \"Tuesday\" is not in selectedDays"`). Group 2 endpoints will return HTTP `422` using `{ error: "Generated plan failed validation", details: result.errors }`.

#### Option Validation Rules (Fail-Closed)
- `mode`: must be `"initial"` or `"week"` (defaults to `"initial"` when `options.mode === undefined`). Any other value -> `{ ok: false, errors: ['mode: must be "initial" or "week"'] }`.
- `selectedDays`: when `options.selectedDays !== undefined`, must be a non-empty array where every element normalizes to a canonical English weekday (`"Monday"`..`"Sunday"`). Invalid/empty `selectedDays` -> fail-closed with error.
- `expectedWeekNumber`: when `options.expectedWeekNumber !== undefined`, must satisfy `Number.isInteger(n) && n >= 1`. Invalid value -> fail-closed with error.
- `expectedTotalWeeks`: when `options.expectedTotalWeeks !== undefined`, must satisfy `Number.isInteger(n) && n >= 1`. Invalid value -> fail-closed with error.

#### Canonical Weekday Normalization
Accepts full English weekday names (case-insensitive, trimmed) and standard abbreviations (with optional trailing period):
- `"mon"` / `"monday"` -> `"Monday"`
- `"tue"` / `"tues"` / `"tuesday"` -> `"Tuesday"`
- `"wed"` / `"weds"` / `"wednesday"` -> `"Wednesday"`
- `"thu"` / `"thur"` / `"thurs"` / `"thursday"` -> `"Thursday"`
- `"fri"` / `"friday"` -> `"Friday"`
- `"sat"` / `"saturday"` -> `"Saturday"`
- `"sun"` / `"sunday"` -> `"Sunday"`

#### Structural Validation & Value Sanitization Rules

1. **Top-level object:**
   - Must be a plain object (`rawPlan !== null && typeof rawPlan === "object" && !Array.isArray(rawPlan)`).
   - **In `mode: "initial"`:**
     - `programName`: **REQUIRED** non-empty string (trimmed).
     - `description`: optional string; trim if string, otherwise default to `""`.
     - `totalWeeks`:
       - If `options.expectedTotalWeeks` is provided: set `plan.totalWeeks = options.expectedTotalWeeks`.
       - Else if `rawPlan.totalWeeks` is a positive integer (`>= 1`), or a numeric string representing a positive integer (e.g., `"6"` -> `6`), use that integer.
       - Else default to `sanitizedWeeks.length` (always `>= 1`, ensuring `PlanDashboard`'s `plan.totalWeeks === 0` guard is never tripped).
     - `weeks`: **REQUIRED** non-empty array.
   - **In `mode: "week"`:**
     - Input normalization:
       - If `rawPlan.weeks !== undefined`: `rawPlan.weeks` MUST be an array of length `1`.
       - Else if `rawPlan.schedule !== undefined`: accept bare single-week object `[rawPlan]` (preserving existing `generateNextWeekPlan.js` fallback compatibility).
       - Else: validation error (`"weeks: must be an array with 1 week"`).
     - `programName`: optional; include trimmed string **only** if `typeof rawPlan.programName === "string" && rawPlan.programName.trim().length > 0` (omit key otherwise; never set `undefined`).
     - `description`: optional; include trimmed string **only** if `typeof rawPlan.description === "string" && rawPlan.description.trim().length > 0` (omit key otherwise; never set `undefined`).
     - Do **not** emit `totalWeeks` in `"week"` mode (callers merge into existing `plan` preserving `plan.totalWeeks`).

2. **Week object (`weeks[w]`):**
   - Must be a plain object.
   - If `options.expectedWeekNumber !== undefined`: `weeks.length` MUST equal `1`.
   - `weekNumber`: **REQUIRED** positive integer (`Number.isInteger(n) && n >= 1`). (Reject floats like `1.5`, strings like `"two"`, `0`, negatives, `null`, `undefined`. Do **not** silently coerce wrong week numbers.)
     - If `options.expectedWeekNumber !== undefined` and `weekNumber !== options.expectedWeekNumber`: validation error.
   - `description`: optional string; trim if string, otherwise `""`.
   - `coachNotes`: optional string; trim if string, otherwise `""`.
   - `schedule`: **REQUIRED** non-empty array (`schedule.length >= 1`).

3. **Day object (`weeks[w].schedule[d]`):**
   - Must be a plain object.
   - `dayName`: **REQUIRED** non-empty string (after trimming).
     - Apply canonical weekday normalization if it matches a known weekday name/abbreviation (e.g. `"mon"` / `"MONDAY"` -> `"Monday"`).
     - If `options.selectedDays` is provided: the normalized `dayName` MUST be in the normalized `selectedDays` set (`scheduledDays ⊆ selectedDays`); otherwise validation error.
     - **Uniqueness:** Duplicate `dayName` (case-insensitive) within the same week's `schedule` is a validation error.
   - `dayNumber`:
     - If every day in the week's `schedule` has a valid, unique positive integer `dayNumber` (`Number.isInteger(n) && n >= 1`), preserve them.
     - If any day has a missing, invalid, non-positive-integer, or duplicate `dayNumber`, normalize the week's `dayNumber` values to sequential 1-based integers (`1, 2, ..., schedule.length`). This protects `activeWorkoutStore.matchesDay` and `PlanDashboard.isDayCompleted` from colliding duplicate `dayNumber` values.
   - `focus`: **REQUIRED** non-empty string (trimmed).
   - `exercises`: **REQUIRED** non-empty array (`exercises.length >= 1`).

4. **Exercise object (`weeks[w].schedule[d].exercises[e]`):**
   - Must be a plain object.
   - `name`: **REQUIRED** non-empty string (trimmed).
   - `sets`: **Sanitized** to a whole positive integer (`>= 1`, default `3`), matching `src/utils/parseSetsCount.js` behavior:
     - Positive integers (`1`, `3`, `5`) -> unchanged.
     - Positive floats -> `Math.floor(n)` (if `< 1`, fallback `3`).
     - Numeric strings (`"4"`, `" 5 "`, `"4.7"`) and `"set"`/`"sets"` suffixes (`"4 sets"`, `"4SETS"`) -> floored positive integer.
     - Ranges (`"3-4"`, `"3–5"`, `"3—5"`, `"3 to 4"`, `"3-4 sets"`, `"5-3"`, `"0-4"`) -> `Math.floor(Math.max(low, high))` (fallback `3` if `< 1`).
     - Non-numeric (`"AMRAP"`, `"N/A"`, `"4x10"`), zero, negative, non-finite, or wrong type (`null`, `undefined`, boolean, object, array) -> `3`.
   - `reps`: **REQUIRED**:
     - If `typeof reps === "string" && reps.trim().length > 0` -> `reps.trim()` (allows `"8-12"`, `"10"`, `"AMRAP"`, `"30s"`).
     - If `typeof reps === "number" && Number.isFinite(reps) && reps > 0` -> `String(reps)`.
     - Otherwise -> validation error.
   - `restSeconds` & `rest`: **Sanitized** using exact `src/utils/parseRestSeconds.js` parsing rules (default `90`):
     - Supported formats: positive numbers (rounded; `0.4` -> invalid), unitless numeric strings (`"60"`), seconds (`"60s"`, `"45 sec"`, `"120 seconds"`), minutes (`"2m"`, `"1.5m"`, `"3 minutes"`), ranges using upper bound (`"2-3m"` -> `180`, `"60-90s"` -> `90`, `"90s-2m"` -> `120`, `"2–3m"` -> `180`, `"2 to 3 min"` -> `180`), compound (`"1m 30s"` -> `90`), and clock `M:SS` (`"1:30"` -> `90`, rejecting `SS >= 60`).
     - Precedence: try parsing `exercise.restSeconds` strictly first; if not a valid positive rest duration, try parsing `exercise.rest` strictly; if neither is valid, default to `90`.
     - Emit **both**:
       - `restSeconds`: positive integer (e.g., `180`)
       - `rest`: `` `${restSeconds}s` `` (e.g., `"180s"`)
   - `notes`: optional string; trim if string, otherwise `""`.
   - `alternatives`: **Sanitized** to `string[]` (default `[]`):
     - If not an array -> `[]`.
     - If array -> keep only non-empty trimmed strings, deduplicate case-insensitively (preserving first-seen casing), and filter out any string matching `exercise.name` case-insensitively.

---

## 4. Compatibility Check: Persisted Firestore Schema & UI Consumers

Checked all existing persisted plan/profile fields and consumers (`PlanDashboard.jsx`, `Schedule.jsx`, `DayDetailModal.jsx`, `ActiveWorkout.jsx`, `WorkoutCard.jsx`, `RestTimer.jsx`, `useWorkout.js`, `activeWorkoutStore.js`, `firestoreServices.js`, `generateInitialPlan.js`, `generateNextWeekPlan.js`, `ProfileSetupForm.jsx`, `ProfileScreen.jsx`):

| Persisted Field | Current Consumer(s) | Output of `api/_validatePlan.js` | Compatible? |
| --- | --- | --- | --- |
| `plan.programName` | `PlanDashboard`, `useWorkout`, `generateNextWeekPlan` | Trimmed non-empty string (`initial`); omitted when absent (`week`, preserving `result.programName \|\| plan.programName`) | Yes — identical |
| `plan.description` | `PlanDashboard`, `useWorkout` | Trimmed string / `""` (`initial`); omitted when absent (`week`) | Yes — identical |
| `plan.totalWeeks` | `PlanDashboard` (`WK x/totalWeeks`, `isProgramCompleted`, empty guard) | Positive integer `>= 1` (`initial`); omitted in `week` (preserved from parent `plan`) | Yes — identical |
| `weeks[].weekNumber` | `PlanDashboard`, `Schedule`, `useWorkout`, `activeWorkoutStore`, `generateNextWeekPlan` | Positive integer matching `expectedWeekNumber` | Yes — identical |
| `weeks[].description` | Persisted plan schema | Trimmed string (default `""`) | Yes — identical |
| `weeks[].coachNotes` | `PlanDashboard` (`Coach Logs` card) | Trimmed string (default `""`, falsy when empty) | Yes — identical |
| `schedule[].dayNumber` | `PlanDashboard`, `activeWorkoutStore`, `useWorkout`, `firestoreServices` | Unique positive integer per week | Yes — identical (hardens against duplicates) |
| `schedule[].dayName` | `Schedule`, `DayDetailModal`, `PlanDashboard`, `activeWorkoutStore`, `generateNextWeekPlan` | Canonical English weekday name (`"Monday"`..`"Sunday"`) when matched; subset of `selectedDays` | Yes — identical |
| `schedule[].focus` | `Schedule`, `DayDetailModal`, `ActiveWorkout`, `useWorkout`, `LogsScreen` | Trimmed non-empty string | Yes — identical |
| `exercises[].name` | `Schedule`, `DayDetailModal`, `WorkoutCard`, `ActiveWorkout`, `useWorkout` | Trimmed non-empty string | Yes — identical |
| `exercises[].sets` | `Schedule`, `DayDetailModal`, `WorkoutCard`, `ActiveWorkout`, `useWorkout` | Whole positive integer (`>= 1`, default `3`) | Yes — identical |
| `exercises[].reps` | `Schedule`, `DayDetailModal`, `WorkoutCard` | Trimmed non-empty string (numeric values coerced to string) | Yes — identical |
| `exercises[].rest` | `WorkoutCard` (`/ {exercise.rest} REST` & `parseRestSeconds(exercise.rest)`) | Canonical string `` `${restSeconds}s` `` (e.g., `"90s"`, `"180s"`) | Yes — preserves exact UI display & timer behavior |
| `exercises[].restSeconds` | Phase 5.3 requirement; Group 2+ consumers | Positive integer (`>= 1`, default `90`), matching `parseRestSeconds(exercise.rest)` | Additive & 100% backward-compatible with legacy Firestore docs lacking `restSeconds` |
| `exercises[].notes` | `WorkoutCard` | Trimmed string (default `""`) | Yes — identical |
| `exercises[].alternatives` | `DayDetailModal`, `useWorkout` (`handleReplaceExercise`) | Deduplicated `string[]` (default `[]`) | Yes — identical |

**Verdict:** Zero breaking changes to the persisted Firestore `plan` or `profile` schema. No `localStorage` key or `workouts` subcollection changes.

---

## 5. Test Plan & Acceptance Criteria

### 5.1 Unit Tests (`tester`)

1. **`api/_utils.test.js`:**
   - `decodeJwtPayload`: valid base64url JWT (including `-`, `_`, UTF-8 payload, missing `=` padding); rejects non-string, empty, `<3` or `>3` segments, whitespace, invalid base64, non-JSON payload, JSON array/primitive payload.
   - `verifyFirebaseToken`:
     - Throws `"Server configuration error: Missing Firebase API key"` when `VITE_FIREBASE_API_KEY` is unset (without calling `fetch`).
     - Rejects malformed/non-JWT token with `401` `INVALID_TOKEN` (without calling `fetch`).
     - Rejects anonymous JWT (`firebase.sign_in_provider: "anonymous"` and `"ANONYMOUS"`) with `403` `ANONYMOUS_NOT_ALLOWED` (without calling `fetch`).
     - Rejects JWT missing `firebase` or `firebase.sign_in_provider` with `401` `INVALID_TOKEN` (without calling `fetch`).
     - Valid email/password JWT + `accounts:lookup` 200 with matching `localId`, `email`, `providerUserInfo: [{ providerId: "password" }]` -> returns `{ valid: true, uid, email, signInProvider: "password" }`.
     - Valid OAuth JWT (`sign_in_provider: "google.com"`) + matching `providerUserInfo` -> succeeds.
     - `accounts:lookup` returns `400` (expired/invalid signature) -> returns `401` `INVALID_TOKEN`.
     - `accounts:lookup` returns `500`/`503` -> throws Error (retryable server failure).
     - `accounts:lookup` returns `200` with empty `users: []` or invalid JSON -> returns `401` `INVALID_TOKEN`.
     - `accounts:lookup` returns `localId` mismatching JWT `sub` -> returns `401` `INVALID_TOKEN`.
     - `accounts:lookup` returns `user.disabled: true` -> returns `403` `USER_DISABLED`.
     - `accounts:lookup` returns provider-less user (`providerUserInfo: []` or missing, no `email`) even when JWT claims non-anonymous -> returns `403` `ANONYMOUS_NOT_ALLOWED`.
   - `withAuth`:
     - `OPTIONS` -> `200` with `corsHeaders`.
     - `GET` / `PUT` -> `405` `{ error: "Method not allowed" }` with `corsHeaders`.
     - Missing `Authorization`, non-Bearer scheme (`Basic ...`), empty `Bearer ` -> `401` `{ error: "Missing authorization header" }`.
     - Invalid token -> `401` `{ error: "Unauthorized: Invalid token" }`; handler not called.
     - Anonymous token -> `403` `{ error: "Forbidden: Anonymous accounts are not allowed" }`; handler not called.
     - Disabled user -> `403` `{ error: "Forbidden: Account is disabled" }`; handler not called.
     - Invalid JSON body, JSON `null`, JSON array `[]`, JSON primitive `"str"` -> `400` `{ error: "Invalid JSON body" }`; handler not called.
     - Valid POST with Bearer token (including case-insensitive `bearer `) -> invokes `handler(body, { uid, email, signInProvider })` and returns handler's response.
     - Unhandled error in `verifyFirebaseToken` (missing env var / auth 5xx / fetch rejection) or inside `handler` -> `500` `{ error: "..." }` with `corsHeaders`.

2. **`api/_extractJsonFromText.test.js`:**
   - Raw valid JSON object and JSON array (with leading/trailing whitespace).
   - Non-string inputs (`null`, `undefined`, `123`, `true`, `{}`, `[]`), empty string `""`, whitespace `"   "` -> `null`.
   - Bare JSON primitives (`"null"`, `"true"`, `"false"`, `"42"`, `"\"hello\""`) -> `null`.
   - Fenced ```` ```json ... ``` ```` and unlabeled ```` ``` ... ``` ```` with leading/trailing prose.
   - Multiple fenced blocks where first block is non-JSON text/note and second block is valid JSON.
   - Leading and trailing prose containing stray `{` or `}` characters (e.g., `Note {important}: {"a": 1} Enjoy {your workout}!`).
   - Deeply nested objects and arrays.
   - Escaped quotes `\"`, escaped backslashes `\\`, `\\"` before string close, and `{`/`}`/`[`/`]` characters inside JSON string values.
   - Truncated / malformed JSON (unclosed brace, trailing comma, mismatched brackets `{]`) -> `null`.
   - Pathological unclosed braces `"{".repeat(50_000)` -> returns `null` quickly without throwing or hanging.
   - Pure function check: does not call `console.error`.

3. **`api/_validatePlan.test.js`:**
   - Valid `initial` plan (with `selectedDays`, `expectedWeekNumber: 1`, `expectedTotalWeeks: 6`) passes and preserves all fields cleanly.
   - Valid `week` plan in both wrapped `{ programName?, description?, weeks: [week] }` and bare `{ weekNumber, schedule, ... }` shapes; omits absent `programName`/`description` (never `undefined`).
   - Top-level & structural rejections (non-object, missing/blank `programName` in `initial`, empty/missing `weeks`, `weeks.length > 1` when `expectedWeekNumber` or `mode: "week"`, empty/missing `schedule`, empty/missing `exercises`, missing `focus`, missing `exercise.name`, missing/invalid `exercise.reps`).
   - `weekNumber` enforcement: wrong week number (`1` vs expected `2`), float (`1.5`), `0`, negative, string `"1"`, missing -> `{ ok: false, errors }`.
   - `selectedDays` subset enforcement:
     - Exact match and strict non-empty subset (e.g. `["Monday", "Friday"] ⊆ ["Monday", "Wednesday", "Friday"]`) pass.
     - Case/abbreviation normalization (`"monday"`, `"FRI"`, `"Wed."` -> `"Monday"`, `"Friday"`, `"Wednesday"`).
     - Out-of-subset day (`"Tuesday"`) fails with error.
     - Duplicate day (`["Monday", "Monday"]` or `["Monday", "monday"]`) fails with error.
   - `dayNumber` normalization: preserves valid unique positive integers; normalizes missing/invalid/duplicate `dayNumber`s to sequential `1..N`.
   - `sets` sanitization: integers, floats, strings, ranges (`"3-4"` -> `4`), `"AMRAP"`/`0`/`-1`/`null`/`undefined` -> `3`.
   - `reps` handling: trims strings, coerces positive finite numbers (`10` -> `"10"`), rejects `0`, negative, `""`, `null`, `undefined`.
   - `restSeconds` & `rest` sanitization: `"60s"` -> `60`/`"60s"`, `"2-3m"` -> `180`/`"180s"`, `"1m 30s"` -> `90`/`"90s"`, `"1:30"` -> `90`/`"90s"`, `"N/A"`/missing -> `90`/`"90s"`, `restSeconds` takes precedence over `rest` when valid, falls back to `rest` if `restSeconds` is invalid.
   - `alternatives` sanitization: missing/non-array -> `[]`, trims strings, drops non-strings/empty strings, deduplicates case-insensitively, removes entries equal to `exercise.name`.
   - `notes`, `week.description`, `week.coachNotes` default to `""`.
   - `totalWeeks` handling: uses `expectedTotalWeeks` when provided; coerces valid integer/string when omitted; defaults to `weeks.length` when invalid/missing in `initial` mode.
   - Invalid options (`mode`, empty/invalid `selectedDays`, invalid `expectedWeekNumber`, invalid `expectedTotalWeeks`) fail closed.
   - Collects multiple errors in a single pass.
   - **Immutability:** input object is not mutated.
   - **Idempotency:** `validatePlan(res1.plan, opts)` returns `{ ok: true, plan }` deeply equal to `res1.plan`.
   - **Firestore safety:** zero `undefined` values anywhere in `result.plan` (verified recursively).

### 5.2 Verification Gates (`implementer`, `tester`, `verifier`, `reviewer`)
- `api/debug.js` is deleted and `grep -rn "api/debug" src api` returns zero matches.
- `npx eslint src api` exits `0` (0 errors, 0 warnings).
- `npm test` exits `0` with all existing suites plus all 3 new `api/*.test.js` suites passing.
- `npm run build` exits `0`.
- Zero changes outside `api/` (and `docs/orchestrator-runs/.../spec.md`).
- No `Buffer` or Node-only imports introduced into Edge modules (`api/_utils.js`, `api/_extractJsonFromText.js`, `api/_validatePlan.js`).
