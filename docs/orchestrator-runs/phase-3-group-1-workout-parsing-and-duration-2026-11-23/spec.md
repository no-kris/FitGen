# Specification: Phase 3 — Group 1 (Workout Parsing & Plan Generation Domain Logic)

- **Run ID:** `phase-3-group-1-workout-parsing-and-duration-2026-11-23`
- **Phase:** Phase 3 (Fix smaller bugs — Group 1: 3 items)
- **Source Plan:** `REFACTOR_PLAN.md` (lines 117–119)
- **Data Shape Impact:** None. Persisted Firestore (`users/{uid}`, `users/{uid}/workouts/{id}`) and `localStorage` (`fitgen:active:v1`) schemas remain unchanged.
- **CSS / Styling Impact:** **None.** No CSS files, class names, layout rules, or inline styles are added or modified. **`styler` is NOT needed for this run.**

---

## 1. Scope & Objectives

1. **Session duration ignored (`generateNextWeekPlan`):** Read the canonical `profile.duration` field instead of the non-existent `profile.sessionDuration` field, falling back to `60` minutes only when `profile.duration` is missing or invalid. Remove all stale `sessionDuration` references across `src/`.
2. **Rest timer parsing (`parseRestSeconds`):** Introduce a pure utility `src/utils/parseRestSeconds.js` that parses rest specifications (seconds, minutes, ranges using the upper end, compound `Xm Ys`, clock `M:SS`, numeric values) into a positive integer number of seconds, defaulting to `90` for invalid/empty/zero/negative/`"N/A"` inputs. Wire it into `WorkoutCard.jsx` and defensively into `RestTimer.jsx`.
3. **Sets count parsing (`parseSetsCount`):** Introduce a pure utility `src/utils/parseSetsCount.js` that parses exercise set counts (numbers, numeric strings, `"N sets"`, ranges using the upper end) into a positive integer count, defaulting to `3` for invalid/empty/zero/negative/`"AMRAP"` inputs. Wire it into `ActiveWorkout.jsx` and `useWorkout.js` (`syncSavedLogsWithDay`).

### Non-Goals
- Do not change persisted Firestore or `localStorage` data shapes.
- Do not modify `exercise.rest` or `exercise.sets` display strings in `WorkoutCard.jsx`, `DayDetailModal.jsx`, `Schedule.jsx`, or `LogsScreen.jsx`.
- Do not modify unrelated Phase 3 items (week tab jumps, `DayDetailModal` mutation, account deletion order, reset history, logout storage, exclusions/priorities type, setup errors).
- Do not mix known-debt cleanups (e.g., adding `aria-label` to existing icon buttons in `WorkoutCard.jsx`, wrapping `KeepAwake` in `try/catch`, or reformatting untouched lines).

---

## 2. File Inventory

### Production Files to Create
1. `src/utils/parseRestSeconds.js` — pure rest-duration parser (`default` export `parseRestSeconds`).
2. `src/utils/parseSetsCount.js` — pure set-count parser (`default` export `parseSetsCount`).

### Production Files to Modify
1. `src/utils/generateNextWeekPlan.js` — read `profile.duration` instead of `profile.sessionDuration` with safe positive-minute validation and `60`-minute default.
2. `src/features/workout/WorkoutCard.jsx` — replace `parseInt(exercise.rest)` with `parseRestSeconds(exercise.rest)`.
3. `src/features/workout/RestTimer.jsx` — defensively normalize `restTime` through `parseRestSeconds(restTime)` so `RestTimer` can never stall on `NaN`, `0`, negative, or string inputs.
4. `src/features/workout/ActiveWorkout.jsx` — replace `parseInt(e.sets)` with `parseSetsCount(e.sets)` when initializing `logs`.
5. `src/hooks/useWorkout.js` — replace `parseInt(exercise.sets, 10) || 1` with `parseSetsCount(exercise.sets)` in `syncSavedLogsWithDay`.

### Test Files to Create / Modify
1. `src/utils/parseRestSeconds.test.js` (create, node env) — exhaustive unit tests for `parseRestSeconds`.
2. `src/utils/parseSetsCount.test.js` (create, node env) — exhaustive unit tests for `parseSetsCount`.
3. `src/utils/generateNextWeekPlan.test.js` (modify, node env) — update fixture from `sessionDuration` to `duration`; add unit tests for `profile.duration` handling and fallback.
4. `src/features/workout/WorkoutCard.test.jsx` (create, `// @vitest-environment jsdom`) — integration tests for rest timer parsing from `exercise.rest` (`"2-3m"`, `"60-90s"`, `"N/A"`, etc.) and countdown completion.
5. `src/features/workout/RestTimer.test.jsx` (create, `// @vitest-environment jsdom`) — defensive countdown tests for valid numeric, `NaN`, `0`, and string `restTime` props.
6. `src/features/workout/ActiveWorkout.test.jsx` (modify, jsdom env) — integration tests verifying rendered set-row count for `"AMRAP"`, `"3-4"`, `0`, `-2`, `undefined`, and numeric `sets`.
7. `src/hooks/useWorkout.test.jsx` (modify, jsdom env) — hook test verifying `syncSavedLogsWithDay` defaults unlogged exercises with `"AMRAP"` or negative `sets` to `3` set rows.

---

## 3. Detailed Specifications

### 3.1 Item 1 — Session Duration in `src/utils/generateNextWeekPlan.js`

#### Problem
Line 45 currently reads:
```js
${profile.sessionDuration || 60}
```
The canonical profile field created in `ProfileSetupForm.jsx` and consumed by `generateInitialPlan.js` is `profile.duration` (integer minutes, onboarding slider range `15`–`120`). Because `profile.sessionDuration` is always `undefined`, Week 2+ prompts always instruct the model to fit `60` minutes.

#### Contract
- **Canonical field:** `profile.duration` ONLY. Do **not** fall back to `profile.sessionDuration` (per `.memory/knowledge/coding-standards.md`, no aliases or synonyms).
- **Resolution formula:**
  ```js
  const DEFAULT_DURATION_MINUTES = 60;
  ```
  Given `rawDuration = profile?.duration`:
  1. If `typeof rawDuration === "number"` or `(typeof rawDuration === "string" && rawDuration.trim() !== "")`:
     - Compute `parsed = Number(rawDuration)`.
     - Compute `rounded = Math.round(parsed)`.
     - If `Number.isFinite(parsed) && rounded > 0`, use `rounded`.
  2. Otherwise, use `DEFAULT_DURATION_MINUTES` (`60`).
  - Note: Booleans (`true`/`false`), objects, arrays, `null`, `undefined`, `""`, `"   "`, `0`, negatives, `NaN`, `Infinity`, and non-numeric strings MUST resolve to `60`.
- **Prompt output:**
  ```text
  - **CRITICAL**: Adjust volume to fit ${durationMinutes} minutes.
  ```
- **Codebase sweep:** Verify zero remaining occurrences of `sessionDuration` anywhere under `src/` (including tests).

#### Input / Output Table (`profile.duration` -> prompt minutes)
| `profile` input | Resolved `durationMinutes` | Prompt substring |
|---|---|---|
| `{ duration: 45, ... }` | `45` | `Adjust volume to fit 45 minutes.` |
| `{ duration: 30, ... }` | `30` | `Adjust volume to fit 30 minutes.` |
| `{ duration: 90, ... }` | `90` | `Adjust volume to fit 90 minutes.` |
| `{ duration: 120, ... }` | `120` | `Adjust volume to fit 120 minutes.` |
| `{ duration: "45", ... }` | `45` | `Adjust volume to fit 45 minutes.` |
| `{ duration: " 30 ", ... }` | `30` | `Adjust volume to fit 30 minutes.` |
| `{ duration: 45.6, ... }` | `46` | `Adjust volume to fit 46 minutes.` |
| `{ duration: 0.4, ... }` | `60` | `Adjust volume to fit 60 minutes.` |
| `{ duration: 0, ... }` | `60` | `Adjust volume to fit 60 minutes.` |
| `{ duration: -30, ... }` | `60` | `Adjust volume to fit 60 minutes.` |
| `{ duration: NaN, ... }` | `60` | `Adjust volume to fit 60 minutes.` |
| `{ duration: Infinity, ... }` | `60` | `Adjust volume to fit 60 minutes.` |
| `{ duration: "", ... }` | `60` | `Adjust volume to fit 60 minutes.` |
| `{ duration: "abc", ... }` | `60` | `Adjust volume to fit 60 minutes.` |
| `{ duration: null, ... }` | `60` | `Adjust volume to fit 60 minutes.` |
| `{ duration: undefined, ... }` | `60` | `Adjust volume to fit 60 minutes.` |
| `{ duration: true, ... }` | `60` | `Adjust volume to fit 60 minutes.` |
| `{ sessionDuration: 45, ... }` (no `duration`) | `60` | `Adjust volume to fit 60 minutes.` |

---

### 3.2 Item 2 — Rest Timer Parsing (`src/utils/parseRestSeconds.js`)

#### Module & Signature
- **File:** `src/utils/parseRestSeconds.js`
- **Export convention (per `coding-standards.md`):**
  ```js
  const DEFAULT_REST_SECONDS = 90;

  const parseRestSeconds = (input) => {
    ...
  };

  export default parseRestSeconds;
  ```
- **Input:** `input` (`string | number | unknown`)
- **Output:** `number` — ALWAYS a positive finite integer (`Number.isInteger(out) && out >= 1`).
- **Invariants:**
  1. `Number.isInteger(parseRestSeconds(x)) && parseRestSeconds(x) >= 1` for all `x`.
  2. Idempotency: `parseRestSeconds(parseRestSeconds(x)) === parseRestSeconds(x)` for all `x`.
  3. Pure function: no side effects, no mutation, no React or browser API dependencies.

#### Canonical Grammar & Mathematical Rules

**Unit multipliers (case-insensitive after `.trim().toLowerCase()`):**
- Seconds (`× 1`): `""` (unitless), `"s"`, `"sec"`, `"secs"`, `"second"`, `"seconds"`
- Minutes (`× 60`): `"m"`, `"min"`, `"mins"`, `"minute"`, `"minutes"`

**Regex token for units** (longest match first in alternation):
```text
UNIT = (seconds?|secs?|s|minutes?|mins?|m)
```

**Evaluation order:**

1. **Number input (`typeof input === "number"`):**
   - If `!Number.isFinite(input) || input <= 0`, return `90`.
   - `const rounded = Math.round(input);`
   - Return `rounded > 0 ? rounded : 90`.

2. **Non-string input (`typeof input !== "string"`):**
   - Return `90`. (Explicitly rejects `null`, `undefined`, booleans, arrays, objects, functions.)

3. **String normalization:**
   - `const normalized = input.trim().toLowerCase();`
   - If `!normalized`, return `90`.

4. **Pattern A — Compound minute + second format:**
   - Regex: `/^(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)\s*(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)$/`
   - Formula: `total = Math.round(Number(m[1]) * 60 + Number(m[2]))`
   - Return `Number.isFinite(total) && total > 0 ? total : 90`.

5. **Pattern B — Clock `M:SS` format:**
   - Regex: `/^(\d+):([0-5]\d)$/`
   - Formula: `total = Number(m[1]) * 60 + Number(m[2])`
   - Return `Number.isFinite(total) && total > 0 ? total : 90`.

6. **Pattern C — Range format (upper end):**
   - Regex: `/^(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m)?\s*(?:[-–—]|\bto\b)\s*(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m)?$/`
   - Range separators supported: ASCII hyphen `-`, en-dash `–` (`\u2013`), em-dash `—` (`\u2014`), or word `to` (word-bounded via `\bto\b`).
   - Unit inheritance when only one side specifies a unit:
     - `lowUnit = m[2] || m[4] || ""`
     - `highUnit = m[4] || m[2] || ""`
   - Formula:
     - `lowSeconds = Number(m[1]) * unitMultiplier(lowUnit)`
     - `highSeconds = Number(m[3]) * unitMultiplier(highUnit)`
     - `total = Math.round(Math.max(lowSeconds, highSeconds))`
   - Return `Number.isFinite(total) && total > 0 ? total : 90`.
   - Note: Leading negative signs (e.g., `"-2-3m"`, `"-60-90s"`) and double hyphens (`"2--3m"`) do NOT match and fall through to `90`.

7. **Pattern D — Single value format:**
   - Regex: `/^(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m)?$/`
   - Formula: `total = Math.round(Number(m[1]) * unitMultiplier(m[2] || ""))`
   - Return `Number.isFinite(total) && total > 0 ? total : 90`.

8. **Fallback:**
   - Any input not matching Patterns A–D returns `90`.

#### Exhaustive Edge-Case Behavior Table (`parseRestSeconds`)
| Category | Input | Expected Output | Notes |
|---|---|---|---|
| Seconds (units) | `"60s"` | `60` | Standard shorthand |
| Seconds (units) | `"90S"` | `90` | Case-insensitive |
| Seconds (units) | `"45 s"` | `45` | Space before unit |
| Seconds (units) | `"45 sec"` | `45` | `sec` unit |
| Seconds (units) | `"45 secs"` | `45` | `secs` unit |
| Seconds (units) | `"1 second"` | `1` | Singular `second` |
| Seconds (units) | `"120 seconds"` | `120` | Plural `seconds` |
| Minutes (units) | `"2m"` | `120` | Standard shorthand |
| Minutes (units) | `"3M"` | `180` | Case-insensitive |
| Minutes (units) | `"2 m"` | `120` | Space before unit |
| Minutes (units) | `"1 min"` | `60` | `min` unit |
| Minutes (units) | `"2 mins"` | `120` | `mins` unit |
| Minutes (units) | `"1 minute"` | `60` | Singular `minute` |
| Minutes (units) | `"3 minutes"` | `180` | Plural `minutes` |
| Decimals | `"1.5m"` | `90` | `1.5 × 60 = 90` |
| Decimals | `"0.5 min"` | `30` | `0.5 × 60 = 30` |
| Decimals | `"1.25m"` | `75` | `1.25 × 60 = 75` |
| Decimals | `"45.6s"` | `46` | Rounded to nearest integer |
| Decimals | `"0.5s"` | `1` | Rounds to `1` |
| Decimals | `"0.4s"` | `90` | Rounds to `0` -> default `90` |
| Ranges (minutes) | `"2-3m"` | `180` | Upper end (`3 × 60`) |
| Ranges (minutes) | `"1.5-2m"` | `120` | Upper end (`2 × 60`) |
| Ranges (minutes) | `"1.5-2.5 min"` | `150` | Upper end (`2.5 × 60`) |
| Ranges (minutes) | `"2–3m"` | `180` | En-dash (`\u2013`) |
| Ranges (minutes) | `"2—3 minutes"` | `180` | Em-dash (`\u2014`) |
| Ranges (minutes) | `"2 - 3 mins"` | `180` | Spaces around hyphen |
| Ranges (minutes) | `"2 to 3 min"` | `180` | Word separator `to` |
| Ranges (seconds) | `"60-90s"` | `90` | Upper end (`90`) |
| Ranges (seconds) | `"30–45 sec"` | `45` | En-dash with seconds |
| Ranges (seconds) | `"60s-90s"` | `90` | Unit on both bounds |
| Ranges (mixed units) | `"90s-2m"` | `120` | `max(90, 120) = 120` |
| Ranges (mixed units) | `"2m-90s"` | `120` | `max(120, 90) = 120` |
| Ranges (reversed) | `"3-2m"` | `180` | `max(180, 120) = 180` |
| Ranges (unitless) | `"60-120"` | `120` | Unitless defaults to seconds |
| Ranges (zero low) | `"0-30s"` | `30` | Upper end is positive (`30`) |
| Ranges (zero both) | `"0-0s"` | `90` | Zero -> default `90` |
| Compound | `"1m 30s"` | `90` | `60 + 30` |
| Compound | `"1m30s"` | `90` | No inner space |
| Compound | `"2 min 15 sec"` | `135` | `120 + 15` |
| Compound | `"0m 45s"` | `45` | `0 + 45` |
| Compound | `"0m 0s"` | `90` | Zero -> default `90` |
| Clock | `"1:30"` | `90` | `60 + 30` |
| Clock | `"2:00"` | `120` | `120 + 0` |
| Clock | `"0:45"` | `45` | `0 + 45` |
| Clock (invalid) | `"0:00"` | `90` | Zero -> default `90` |
| Clock (invalid) | `"1:60"` | `90` | Seconds must be `00`–`59` |
| Numeric inputs | `60` | `60` | Positive integer number |
| Numeric inputs | `120` | `120` | Positive integer number |
| Numeric inputs | `45.6` | `46` | Positive float rounded |
| Numeric inputs | `0.4` | `90` | Rounds to `0` -> default `90` |
| Numeric string | `"60"` | `60` | Unitless string = seconds |
| Numeric string | `"  120  "` | `120` | Whitespace trimmed |
| Zero / Negative | `0` | `90` | Zero -> default |
| Zero / Negative | `"0"` | `90` | Zero -> default |
| Zero / Negative | `"0s"` | `90` | Zero -> default |
| Zero / Negative | `"0m"` | `90` | Zero -> default |
| Zero / Negative | `-30` | `90` | Negative -> default |
| Zero / Negative | `"-30s"` | `90` | Negative -> default |
| Zero / Negative | `"-2m"` | `90` | Negative -> default |
| Zero / Negative | `"-2-3m"` | `90` | Negative range -> default |
| Non-finite | `NaN` | `90` | Non-finite -> default |
| Non-finite | `Infinity` | `90` | Non-finite -> default |
| Non-finite | `-Infinity` | `90` | Non-finite -> default |
| Invalid / Empty | `""` | `90` | Empty string -> default |
| Invalid / Empty | `"   "` | `90` | Whitespace-only -> default |
| Invalid / Empty | `"N/A"` | `90` | Non-numeric -> default |
| Invalid / Empty | `"none"` | `90` | Non-numeric -> default |
| Invalid / Empty | `"as needed"` | `90` | Non-numeric -> default |
| Invalid / Empty | `"2h"` | `90` | Unsupported unit -> default |
| Invalid / Empty | `"60x"` | `90` | Invalid unit -> default |
| Invalid / Empty | `"1.2.3m"` | `90` | Malformed number -> default |
| Invalid / Empty | `"2--3m"` | `90` | Malformed range -> default |
| Invalid types | `null` | `90` | Non-string/number -> default |
| Invalid types | `undefined` | `90` | Non-string/number -> default |
| Invalid types | `true` / `false` | `90` | Booleans must NOT coerce to `1`/`0` |
| Invalid types | `{}` / `[60]` | `90` | Objects/arrays must NOT coerce |

#### Wiring
1. **`src/features/workout/WorkoutCard.jsx`:**
   - Import `parseRestSeconds` from `"../../utils/parseRestSeconds"`.
   - Line 167: replace `restTime={parseInt(exercise.rest)}` with `restTime={parseRestSeconds(exercise.rest)}`.
2. **`src/features/workout/RestTimer.jsx`:**
   - Import `parseRestSeconds` from `"../../utils/parseRestSeconds"`.
   - At top of `RestTimer({ restTime, onRestComplete })`:
     ```js
     const initialRestTime = parseRestSeconds(restTime);
     const [timeLeft, setTimeLeft] = useState(initialRestTime);
     //  `useRef` discards the value on subsequent renders.
     // eslint-disable-next-line
     const endTimeRef = useRef(Date.now() + initialRestTime * 1000);
     ```
   - This guarantees `RestTimer` always receives a positive integer even if invoked directly with `NaN`, `0`, `undefined`, or a raw rest string.

---

### 3.3 Item 3 — Sets Count Parsing (`src/utils/parseSetsCount.js`)

#### Module & Signature
- **File:** `src/utils/parseSetsCount.js`
- **Export convention (per `coding-standards.md`):**
  ```js
  const DEFAULT_SETS_COUNT = 3;

  const parseSetsCount = (input) => {
    ...
  };

  export default parseSetsCount;
  ```
- **Input:** `input` (`string | number | unknown`)
- **Output:** `number` — ALWAYS a positive finite integer (`Number.isInteger(out) && out >= 1`).
- **Invariants:**
  1. `Number.isInteger(parseSetsCount(x)) && parseSetsCount(x) >= 1` for all `x`.
  2. Idempotency: `parseSetsCount(parseSetsCount(x)) === parseSetsCount(x)` for all `x`.
  3. Pure function: no side effects, no mutation, no React or browser API dependencies.

#### Canonical Grammar & Mathematical Rules

**Rounding rule for positive floats:** `Math.floor(value)` (partial sets cannot be logged as fractional rows; values whose floor is `< 1`, such as `0.5`, fall back to `3`).

**Evaluation order:**

1. **Number input (`typeof input === "number"`):**
   - If `!Number.isFinite(input) || input <= 0`, return `3`.
   - `const count = Math.floor(input);`
   - Return `count >= 1 ? count : 3`.

2. **Non-string input (`typeof input !== "string"`):**
   - Return `3`. (Explicitly rejects `null`, `undefined`, booleans, arrays, objects, functions.)

3. **String normalization:**
   - `const normalized = input.trim().toLowerCase();`
   - If `!normalized`, return `3`.

4. **Pattern A — Range format (upper end):**
   - Regex: `/^(\d+(?:\.\d+)?)\s*(?:sets?)?\s*(?:[-–—]|\bto\b)\s*(\d+(?:\.\d+)?)\s*(?:sets?)?$/`
   - Range separators supported: ASCII hyphen `-`, en-dash `–` (`\u2013`), em-dash `—` (`\u2014`), or word `to` (`\bto\b`).
   - Formula: `count = Math.floor(Math.max(Number(m[1]), Number(m[2])))`
   - Return `Number.isFinite(count) && count >= 1 ? count : 3`.

5. **Pattern B — Single value format:**
   - Regex: `/^(\d+(?:\.\d+)?)\s*(?:sets?)?$/`
   - Formula: `count = Math.floor(Number(m[1]))`
   - Return `Number.isFinite(count) && count >= 1 ? count : 3`.

6. **Fallback:**
   - Any input not matching Patterns A–B returns `3`.

#### Exhaustive Edge-Case Behavior Table (`parseSetsCount`)
| Category | Input | Expected Output | Notes |
|---|---|---|---|
| Positive integers | `1` | `1` | Minimum valid positive integer |
| Positive integers | `3` | `3` | Standard count |
| Positive integers | `5` | `5` | Standard count |
| Positive integers | `10` | `10` | High-volume count |
| Positive floats | `3.9` | `3` | `Math.floor(3.9)` |
| Positive floats | `4.2` | `4` | `Math.floor(4.2)` |
| Positive floats | `0.9` | `3` | `Math.floor(0.9) === 0` -> default `3` |
| Numeric strings | `"4"` | `4` | Plain string |
| Numeric strings | `"  5  "` | `5` | Whitespace trimmed |
| Numeric strings | `"4.7"` | `4` | `Math.floor(4.7)` |
| Numeric strings | `"0.5"` | `3` | Floor `< 1` -> default `3` |
| With `set(s)` suffix | `"1 set"` | `1` | Singular suffix |
| With `set(s)` suffix | `"4 sets"` | `4` | Plural suffix |
| With `set(s)` suffix | `"4SETS"` | `4` | Case-insensitive, no space |
| Ranges | `"3-4"` | `4` | Upper end (`4`) |
| Ranges | `"3 - 5"` | `5` | Spaces around hyphen |
| Ranges | `"3–4"` | `4` | En-dash (`\u2013`) |
| Ranges | `"3—5"` | `5` | Em-dash (`\u2014`) |
| Ranges | `"3 to 4"` | `4` | Word separator `to` |
| Ranges | `"3-4 sets"` | `4` | Range with `sets` suffix |
| Ranges | `"3 sets to 5 sets"` | `5` | Suffix on both bounds |
| Ranges (reversed) | `"5-3"` | `5` | `max(5, 3) = 5` |
| Ranges (zero low) | `"0-4"` | `4` | Upper end is positive (`4`) |
| Ranges (zero both) | `"0-0"` | `3` | Zero -> default `3` |
| Non-numeric strings | `"AMRAP"` | `3` | Core bug fix -> default `3` |
| Non-numeric strings | `"amrap"` | `3` | Case-insensitive |
| Non-numeric strings | `"N/A"` | `3` | Default `3` |
| Non-numeric strings | `"to failure"` | `3` | Default `3` |
| Non-numeric strings | `"100% effort"` | `3` | Must NOT parse `100` rows -> default `3` |
| Non-numeric strings | `"4x10"` | `3` | Malformed sets string -> default `3` |
| Zero / Negative | `0` | `3` | Zero -> default `3` |
| Zero / Negative | `"0"` | `3` | Zero -> default `3` |
| Zero / Negative | `"0 sets"` | `3` | Zero -> default `3` |
| Zero / Negative | `-2` | `3` | Negative -> default `3` |
| Zero / Negative | `"-2"` | `3` | Negative -> default `3` |
| Zero / Negative | `"-3-4"` | `3` | Negative range -> default `3` |
| Non-finite | `NaN` | `3` | Non-finite -> default `3` |
| Non-finite | `Infinity` / `-Infinity` | `3` | Non-finite -> default `3` |
| Empty / Invalid types | `""` / `"   "` | `3` | Empty -> default `3` |
| Empty / Invalid types | `null` / `undefined` | `3` | Missing -> default `3` |
| Empty / Invalid types | `true` / `false` | `3` | Booleans must NOT coerce |
| Empty / Invalid types | `{}` / `[4]` | `3` | Objects/arrays must NOT coerce |

#### Wiring
1. **`src/features/workout/ActiveWorkout.jsx`:**
   - Import `parseSetsCount` from `"../../utils/parseSetsCount"`.
   - Line 21: replace `Array.from({ length: parseInt(e.sets) }, ...)` with `Array.from({ length: parseSetsCount(e.sets) }, ...)`.
2. **`src/hooks/useWorkout.js`:**
   - Import `parseSetsCount` from `"../utils/parseSetsCount"`.
   - Line 27 inside `syncSavedLogsWithDay`: replace `const setCount = parseInt(exercise.sets, 10) || 1;` with `const setCount = parseSetsCount(exercise.sets);`.

---

## 4. Acceptance Criteria (Testable in Isolation)

### AC-1: Session Duration in `generateNextWeekPlan`
1. Calling `generateNextWeekPlan` with `profile.duration = 45` passes a prompt to `callModel` containing `"Adjust volume to fit 45 minutes."`.
2. Calling `generateNextWeekPlan` with `profile.duration = "30"` passes a prompt containing `"Adjust volume to fit 30 minutes."`.
3. Calling `generateNextWeekPlan` with `profile.duration` omitted, `undefined`, `null`, `0`, `-15`, `NaN`, `Infinity`, `""`, or `"invalid"` passes a prompt containing `"Adjust volume to fit 60 minutes."`.
4. Calling `generateNextWeekPlan` with `{ sessionDuration: 45 }` (and no `duration`) ignores `sessionDuration` and falls back to `"Adjust volume to fit 60 minutes."`.
5. `grep -rn sessionDuration src` returns zero matches.

### AC-2: `parseRestSeconds` Pure Utility
1. All rows in the Section 3.2 Edge-Case Table pass in `src/utils/parseRestSeconds.test.js` (including seconds units, minutes units, decimals, ranges with `-`/`–`/`—`/`to`, mixed units, reversed ranges, compound `Xm Ys`, clock `M:SS`, unitless numbers/strings, zero, negative, non-finite, empty, `"N/A"`, booleans, objects/arrays, malformed strings).
2. Output is always a positive integer (`Number.isInteger(out) && out >= 1`) and idempotent (`parseRestSeconds(parseRestSeconds(x)) === parseRestSeconds(x)`).

### AC-3: `WorkoutCard` & `RestTimer` Integration
1. In `WorkoutCard.test.jsx` (with `vi.useFakeTimers()`), completing a set on an exercise with `rest: "2-3m"` displays `RestTimer` starting at `"3:00"` (180s), and advancing timers by 180s completes the rest timer and dismisses it.
2. Completing a set on an exercise with `rest: "60-90s"` displays `RestTimer` starting at `"1:30"` (90s).
3. Completing a set on an exercise with `rest: "N/A"` displays `RestTimer` starting at `"1:30"` (90s), and advancing timers by 90s completes and dismisses the timer (never displays `NaN:NaN` and never hangs indefinitely).
4. In `RestTimer.test.jsx` (with `vi.useFakeTimers()`), rendering `<RestTimer restTime={NaN} onRestComplete={onComplete} />` or `restTime={0}` or `restTime="N/A"` starts at `"1:30"` and calls `onComplete` after 90s; rendering `restTime={45}` starts at `"0:45"` and calls `onComplete` after 45s.

### AC-4: `parseSetsCount` Pure Utility
1. All rows in the Section 3.3 Edge-Case Table pass in `src/utils/parseSetsCount.test.js` (including positive integers, floats floored, numeric strings, `"N set(s)"`, ranges with `-`/`–`/`—`/`to`, `"AMRAP"`, `"N/A"`, `"100% effort"`, zero, negative, non-finite, empty, booleans, objects/arrays).
2. Output is always a positive integer (`Number.isInteger(out) && out >= 1`) and idempotent (`parseSetsCount(parseSetsCount(x)) === parseSetsCount(x)`).

### AC-5: `ActiveWorkout` & `useWorkout` Integration
1. In `ActiveWorkout.test.jsx`, starting a fresh workout containing an exercise with `sets: "AMRAP"` renders `3` set rows (verifiable via 3 `"WEIGHT"` inputs and 3 `"REPS"` inputs).
2. Starting a fresh workout with `sets: "3-4"` renders `4` set rows; `sets: 0`, `sets: -2`, or `sets: undefined` each render `3` set rows; `sets: 2` renders `2` set rows.
3. In `useWorkout.test.jsx`, resuming a paused workout whose `saved.logs` is shorter than `day.exercises` (so `syncSavedLogsWithDay` synthesizes rows for the unlogged exercise) creates `3` set rows when the unlogged exercise has `sets: "AMRAP"` or `sets: -1`, and `4` set rows when it has `sets: "3-4"`.

### AC-6: Verification Gates
- `npx eslint src api` exits `0` (zero errors, zero warnings).
- `npm test` exits `0` (all existing and new suites pass).
- `npm run build` exits `0`.
- No CSS files or persisted data shapes were modified.
