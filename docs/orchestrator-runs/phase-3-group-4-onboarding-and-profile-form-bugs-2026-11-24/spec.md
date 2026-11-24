# Specification: Phase 3 — Group 4 (Onboarding & Profile Form Bugs)

- **Run ID:** `phase-3-group-4-onboarding-and-profile-form-bugs-2026-11-24`
- **Phase:** Phase 3 (`REFACTOR_PLAN.md` — Fix smaller bugs, Group 4: 2 items)
- **Source Plan:** `REFACTOR_PLAN.md` (lines 126–127)
- **CSS / Styling Impact:** **None.** All UI states reuse existing verified classes in `src/css/index.css` and `src/css/utils.css` (`.alert-error`, `.card`, `.animate-spin`, `.button`, `.btn-primary`, `.btn-secondary`, `.text-error`, `.text-muted`, `.text-lg`, `.text-base`, `.font-bold`, `.uppercase`, `.letter-spacing-2`, `.shrink-0`, flex/gap/padding utilities). Zero inline styles and zero hardcoded colors are permitted. **`styler` is NOT needed in Stage 6.**

---

## Persisted Profile Data Shape & Backward Compatibility Notice (`AGENTS.md` Approval Gate)

Per `AGENTS.md` (*"Stop and ask before changing the plan/profile data shape — it is persisted in Firestore and cached in `localStorage`"*), this change affects the default runtime type written for **untouched** optional profile fields in `users/{uid}.profile`:

1. **Previous behavior:**
   - `ProfileSetupForm` initialized `formData.exclusions` and `formData.priorities` as `[]` (empty arrays).
   - If a user **typed into** Step 7 (`Constraints`) or Step 8 (`Priorities`), cleared the input, or clicked `"No Constraints"` / `"No Priorities"`, `users/{uid}.profile.exclusions` / `priorities` was **already persisted as a `string`** (e.g., `"knee pain"`, `""`, or `"None"`).
   - Only when a user **never touched** Step 7 or Step 8 did the buggy initial `[]` leak into `users/{uid}.profile` in Firestore (and broke both `generateInitialPlan`, where `Boolean([]) === true` interpolated `""` instead of `"None"`, and `ProfileScreen`, where `[] !== "None"` rendered `"Exclusions: "`).
2. **New behavior:**
   - `ProfileSetupForm` initializes `exclusions: ""` and `priorities: ""` instead of `[]`.
   - Newly saved profiles therefore persist `exclusions` and `priorities` consistently as `string` (`""`, `"None"`, or user-entered text). No fields are added, renamed, or removed, and `localStorage` (`fitgen:active:v1`) is completely untouched.
3. **Full backward compatibility with legacy Firestore documents:**
   - A new pure normalizer `src/utils/normalizeProfileText.js` is used by both `generateInitialPlan.js` and `ProfileScreen.jsx`.
   - Legacy persisted documents with `[]`, `["", "None"]`, `["knee pain", "back injury"]`, `""`, `"   "`, `"None"` / `"none"`, `null`, or `undefined` all continue to read, prompt, and display cleanly without requiring a Firestore migration.
4. **Human approval:** Approving this spec via `APPROVED: docs/orchestrator-runs/phase-3-group-4-onboarding-and-profile-form-bugs-2026-11-24/spec.md` explicitly approves changing the untouched default for `profile.exclusions` and `profile.priorities` from `[]` to `""`.

---

## 1. Scope & Objectives

1. **Exclusions / priorities type & normalization:**
   - Default `formData.exclusions` and `formData.priorities` to `""` (empty string) instead of `[]` in `ProfileSetupForm.jsx`.
   - Introduce pure utility `src/utils/normalizeProfileText.js` that normalizes empty strings, whitespace-only strings, case-insensitive `"none"`, legacy `[]`, arrays of empty/`"none"` items, `null`, `undefined`, and invalid types to `"None"`, while preserving trimmed non-empty text (and joining legacy non-empty `string[]` with `", "`).
   - Use `normalizeProfileText` in `src/utils/generateInitialPlan.js` so empty/legacy values interpolate as `"None"` in both the profile section and `DOUBLE-CHECK` rules of the initial-plan prompt.
   - Use `normalizeProfileText` in `src/components/screens/ProfileScreen.jsx` so empty/legacy values display `"No exclusions requested"` and `"No priorities requested"`, while non-empty values display `"Exclusions: <value>"` and `"Priorities: <value>"`.
2. **Setup errors & step/async UX in `ProfileSetupForm` & `handleNextStep`:**
   - Fix always-truthy `{errors ? ... : null}` in `ProfileSetupForm.jsx` so no error container (and no empty `role="alert"` node or phantom flex gap) is rendered when `errors` has no active non-empty entries.
   - Reset errors (`setErrors({})`) inside `handleNextStep.js` whenever step validation passes before advancing to the next step.
   - Reset errors (`setErrors({})`) on Back navigation and at the start of `handleGenerate` retry in `ProfileSetupForm.jsx`.
   - Separate loading/pending vs failed states cleanly for both Step 8 plan generation (`isGenerating` spinner + `"Generating..."` + `aria-busy` + disabled Back/Submit + `useRef` double-submit guard vs `role="alert"` `.alert-error` + `"Retry"`) and cloud sync (`isSyncPending` `role="status"` vs `isSyncFailed` `role="alert"` + `"Retry Sync"` button), ensuring errors are never masked by loading messages.

### Non-Goals (Out of Scope for Group 4)
- Do **not** rewrite `renderStep.jsx` into a config array or merge `handleNextStep.js` into `renderStep.jsx` (Phase 6).
- Do **not** modify `generateNextWeekPlan.js` (does not consume `exclusions`/`priorities`; `duration` was fixed in Group 1).
- Do **not** modify `PlanDashboard.jsx` or `DayDetailModal.jsx` (Group 3).
- Do **not** modify `InputStep.jsx`, `DisplayStep.jsx`, `SliderStep.jsx`, `Slider.jsx`, `TextInput.jsx`, `Button.jsx`, `App.jsx`, `useCloudSync.js`, or any CSS file.
- Do **not** remove unrelated known debt (such as the unused `Settings` import in `ProfileScreen.jsx`, which is tracked in Phase 6).

---

## 2. Exact File Plan

### 2.1 Production Files to Create (`implementer` scope)
| Path | Purpose |
| :--- | :--- |
| `src/utils/normalizeProfileText.js` | Pure default-exported helper `normalizeProfileText(value)` converting empty/`[]`/`"none"`/`null`/`undefined`/invalid values to `"None"` and normalizing strings and legacy `string[]` arrays |

### 2.2 Production Files to Modify (`implementer` scope)
| Path | Summary of Changes |
| :--- | :--- |
| `src/features/onboarding/ProfileSetupForm.jsx` | Default `exclusions: ""`, `priorities: ""`; fix always-truthy `errors ? ...` using `errorEntries.length > 0` with `role="alert"` `.alert-error`; clear `errors` on Back navigation and `handleGenerate` start; add `useRef` double-submit guard, accessible `"Generating..."` + `aria-busy` pending state, `"Retry"` on Step 8 error, Back disabled while generating; render distinct cloud-sync pending (`role="status"`) vs failed (`role="alert"` + `"Retry Sync"`) banners and disable Step 8 submission while sync is pending/failed |
| `src/features/onboarding/helpers/handleNextStep.js` | Call `setErrors({})` before `setStep(...)` whenever `isValid` is `true`; guard `selectedDays` array check and positive `duration`/`weeks` defensively while preserving exact 5-argument signature and default export |
| `src/utils/generateInitialPlan.js` | Import and apply `normalizeProfileText` to `formData.exclusions` and `formData.priorities`, interpolating the normalized values into both the profile lines and `DOUBLE-CHECK` rules |
| `src/components/screens/ProfileScreen.jsx` | Import and apply `normalizeProfileText` to `profile?.exclusions` and `profile?.priorities` when constructing `planDetails` |

### 2.3 CSS Files (`styler` scope)
- **None.** Do **not** edit `src/css/index.css`, `src/css/utils.css`, or `src/css/animations.css`. **`styler` is NOT invoked in Stage 6.**

### 2.4 Test Files to Create / Modify (`tester` scope)
| Path | Env | Coverage |
| :--- | :--- | :--- |
| `src/utils/normalizeProfileText.test.js` (create) | node | Exhaustive edge-case table (strings, whitespace, case-insensitive `"none"`, legacy `[]`, mixed/non-empty arrays, `null`/`undefined`, numbers/booleans/objects), non-empty trimmed invariant, idempotency, array immutability |
| `src/utils/generateInitialPlan.test.js` (create) | node | Prompt output verification with mocked `callModel` + `getUserToken`: `""`, `"   "`, `[]`, `["", "None"]`, `"None"`, `"none"`, `null`, `undefined`, `"knee pain"`, `"  knee pain  "`, `["knee pain", "shoulder"]` across both profile block and `DOUBLE-CHECK` rules |
| `src/features/onboarding/helpers/handleNextStep.test.js` (create) | node | Every step (1–7) valid & invalid cases: verifies `setErrors({})` + `setStep` updater (clamped to `totalSteps`) on valid step, exact error object + zero `setStep` calls on invalid step, defensive checks for missing `selectedDays` / `duration <= 0` / `weeks <= 0` |
| `src/features/onboarding/ProfileSetupForm.test.jsx` (create) | jsdom | Zero `role="alert"` on clean mount; Step 3 validation failure -> fix -> Next clears alert and advances to Step 4; Back clears errors; untouched Step 7/8 inputs default to `""` and submit `exclusions: ""` and `priorities: ""`; `"No Constraints"`/`"No Priorities"` and custom text submit strings; Step 8 generating pending state (`Generating...`, `aria-busy`, disabled Back & Submit, double-submit blocked); Step 8 failure (`role="alert"`, fallback message, `"Retry"` button, Back clears error & restores `"INITIATE PLAN"`, retry clears stale error & succeeds); distinct cloud sync pending (`role="status"`) vs failed (`role="alert"` + `"Retry Sync"`, never masked as syncing, disables Step 8 submit while Steps 1–7 stay navigable) |
| `src/components/screens/ProfileScreen.test.jsx` (modify) | jsdom | Preserve all existing tests untouched; add `describe("exclusions and priorities display", ...)` covering `""`, `"   "`, `[]`, `["", "None"]`, `"None"`, `"none"`, `null`, `undefined`, trimmed strings, and legacy non-empty arrays |

---

## 3. Detailed Module & Component Specifications

### 3.1 `src/utils/normalizeProfileText.js` (New Pure Utility)

#### Export & Signature (per `.memory/knowledge/coding-standards.md`)
```js
const DEFAULT_EMPTY_VALUE = "None";

const isEmptyOrNone = (text) => {
  const trimmed = text.trim();
  return trimmed === "" || trimmed.toLowerCase() === "none";
};

const normalizeProfileText = (value) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return isEmptyOrNone(trimmed) ? DEFAULT_EMPTY_VALUE : trimmed;
  }

  if (Array.isArray(value)) {
    const items = value
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => !isEmptyOrNone(item));
    return items.length > 0 ? items.join(", ") : DEFAULT_EMPTY_VALUE;
  }

  return DEFAULT_EMPTY_VALUE;
};

export default normalizeProfileText;
```

#### Invariants
1. Always returns a non-empty, trimmed `string` (`typeof out === "string" && out.trim().length > 0 && out === out.trim()`).
2. Idempotent: `normalizeProfileText(normalizeProfileText(x)) === normalizeProfileText(x)` for all `x`.
3. Pure: no React/DOM dependencies, no side effects, never mutates input arrays.
4. Preserves original casing of non-empty user preferences (e.g., `"Knee Pain"` -> `"Knee Pain"`).

#### Exhaustive Edge-Case Table
| Input | Expected Output | Rationale |
| :--- | :--- | :--- |
| `""` | `"None"` | New default empty string |
| `"   "` | `"None"` | Whitespace-only string |
| `"\t\n "` | `"None"` | Control whitespace |
| `"None"` | `"None"` | Canonical `"None"` from `"No Constraints"` / `"No Priorities"` button |
| `"none"` | `"None"` | Case-insensitive `"none"` |
| `"  NONE  "` | `"None"` | Whitespace-padded case-insensitive `"none"` |
| `"knee pain"` | `"knee pain"` | Plain preference text |
| `"  Knee Pain, Back Injury  "` | `"Knee Pain, Back Injury"` | Trimmed, preserves casing |
| `"None of the overhead presses"` | `"None of the overhead presses"` | Partial word `"None"` is meaningful text, NOT bare `"none"` |
| `[]` | `"None"` | Legacy untouched Firestore profile array |
| `[""]` | `"None"` | Legacy array containing empty string |
| `["  ", "None", "none"]` | `"None"` | Legacy array with only empty / `"none"` entries |
| `["knee pain"]` | `"knee pain"` | Legacy single-item array |
| `["knee pain", "back injury"]` | `"knee pain, back injury"` | Legacy multi-item array joined with `", "` |
| `["  knee pain  ", "", "None", null, 42, "shoulder"]` | `"knee pain, shoulder"` | Filters non-strings, empties, and `"none"` entries |
| `null` | `"None"` | Null field |
| `undefined` | `"None"` | Missing field |
| `0` / `42` / `NaN` | `"None"` | Non-string/non-array |
| `true` / `false` | `"None"` | Booleans must not coerce to `"true"` / `"false"` |
| `{}` | `"None"` | Objects must not coerce to `"[object Object]"` |

---

### 3.2 `src/utils/generateInitialPlan.js`

- Import `normalizeProfileText` from `"./normalizeProfileText"`.
- Replace lines 6–7:
  ```js
  const exclusions = normalizeProfileText(formData.exclusions);
  const priorities = normalizeProfileText(formData.priorities);
  ```
- In the prompt template:
  - Line 48:
    `- **EXCLUSIONS & INJURIES (CRITICAL):** ${exclusions} (You MUST filter out any exercises, distinct muscle groups, or movement patterns that conflict with these exclusions. Failure to do so is a safety violation.)`
  - Line 49:
    `- **PRIORITIZE MUSCLE GROUPS:** ${priorities} (You MUST focus on the user's priority muscle groups or movement patterns.)`
  - Line 94–96:
    `5. **Safety:** DOUBLE-CHECK Exclusions: '${exclusions}'. If user excludes "Running", do NOT include treadmill warmups. If "Shoulder Pain", avoid overhead pressing.`
  - Line 97–99:
    `6. **Focus:** DOUBLE-CHECK Prioritize: '${priorities}'. If user prioritizes "Legs", focus on leg exercises.`
- Result: When `formData.exclusions` / `formData.priorities` is `""`, `"   "`, `[]`, `["", "None"]`, `"None"`, `"none"`, `null`, or `undefined`, BOTH the profile summary lines AND the `DOUBLE-CHECK` lines receive `"None"` (never `""`, never `''`, never `"Any"`). When non-empty (e.g., `"  knee pain  "` or `["knee pain", "shoulder"]`), both receive the normalized trimmed text (`"knee pain"`, `"knee pain, shoulder"`).

---

### 3.3 `src/components/screens/ProfileScreen.jsx`

- Import `normalizeProfileText` from `"../../utils/normalizeProfileText"`.
- Replace lines 48–56:
  ```js
  const exclusions = normalizeProfileText(profile?.exclusions);
  const priorities = normalizeProfileText(profile?.priorities);

  const planDetails = [
    `Equipment: ${profile.equipment}`,
    exclusions !== "None"
      ? `Exclusions: ${exclusions}`
      : "No exclusions requested",
    priorities !== "None"
      ? `Priorities: ${priorities}`
      : "No priorities requested",
  ];
  ```
- Keep all other parts of `ProfileScreen.jsx` (layout, modals, sync banners, logout/reset/delete flows, existing imports) completely unchanged.

---

### 3.4 `src/features/onboarding/helpers/handleNextStep.js`

#### Signature (Unchanged)
`const handleNextStep = (step, totalSteps, setStep, formData, setErrors) => { ... };`
`export default handleNextStep;`

#### Exact Behavior
```js
const handleNextStep = (step, totalSteps, setStep, formData, setErrors) => {
  let isValid = true;
  let newErrors = {};

  switch (step) {
    case 1:
      if (!formData.goal) {
        isValid = false;
        newErrors.goal = "Goal is required";
      }
      break;
    case 2:
      if (!formData.level) {
        isValid = false;
        newErrors.level = "Level is required";
      }
      break;
    case 3:
      if (!Array.isArray(formData.selectedDays) || !formData.selectedDays.length) {
        isValid = false;
        newErrors.selectedDays = "At least one day is required";
      }
      break;
    case 4:
      if (!formData.equipment) {
        isValid = false;
        newErrors.equipment = "Equipment is required";
      }
      break;
    case 5:
      if (!formData.duration || formData.duration <= 0) {
        isValid = false;
        newErrors.duration = "Duration is required";
      }
      break;
    case 6:
      if (!formData.weeks || formData.weeks <= 0) {
        isValid = false;
        newErrors.weeks = "Weeks is required";
      }
      break;
  }

  if (isValid) {
    setErrors({});
    setStep((prevStep) => Math.min(totalSteps, prevStep + 1));
  } else {
    setErrors(newErrors);
  }
};

export default handleNextStep;
```

- **Key contracts:**
  - When `isValid === true`: MUST call `setErrors({})` AND `setStep((prevStep) => Math.min(totalSteps, prevStep + 1))`.
  - When `isValid === false`: MUST call `setErrors(newErrors)` with the exact step error key/message and MUST NOT call `setStep`.
  - Step 7 (`exclusions`) is optional: `exclusions: ""` passes validation, calls `setErrors({})`, and advances to Step 8.

---

### 3.5 `src/features/onboarding/ProfileSetupForm.jsx`

#### Component Hierarchy & Props
- **Signature:** `export default function ProfileSetupForm()` (reads from `useAppContext()`, no props).
- **Context consumed:**
  ```js
  const {
    handleSavePlan: onSavePlan,
    user = null,
    isSynced = true,
    syncError = null,
    retrySync,
  } = useAppContext();
  ```
  *(Defaulting `user = null`, `isSynced = true`, `syncError = null` ensures backward compatibility with any context provider or test passing only `{ handleSavePlan }`.)*
- **Children rendered:**
  1. Setup header (`Settings` icon + `<h1>Setup</h1>` + `STEP {step}/{totalSteps}`)
  2. Cloud sync status banner (conditional, strictly mutually exclusive):
     - If `isSyncFailed` (`Boolean(user && !isSynced && syncError)`):
       ```jsx
       <div
         role="alert"
         className="alert-error flex items-center justify-between gap-3"
       >
         <span className="text-lg font-bold">
           {syncError?.message || "Failed to sync your cloud data."}
         </span>
         <Button
           text="Retry Sync"
           onClick={() => retrySync?.()}
           className="button btn-primary text-base font-bold uppercase p-2 letter-spacing-2 shrink-0"
         />
       </div>
       ```
     - Else if `isSyncPending` (`Boolean(user && !isSynced && !syncError)`):
       ```jsx
       <div
         role="status"
         aria-live="polite"
         className="card p-3 flex items-center justify-center gap-2 text-muted text-lg font-bold"
       >
         <Loader2 className="animate-spin" size={16} aria-hidden="true" />
         <span>Syncing your cloud data...</span>
       </div>
       ```
  3. Validation / generation error banner (conditional — ONLY rendered when `errorEntries.length > 0`):
     ```js
     const errorEntries = Object.entries(errors).filter(([, value]) =>
       Boolean(value)
     );
     ```
     ```jsx
     {errorEntries.length > 0 && (
       <div role="alert" className="alert-error flex flex-col gap-2">
         {errorEntries.map(([key, value]) => (
           <p key={key} className="text-error text-lg font-bold">
             {value}
           </p>
         ))}
       </div>
     )}
     ```
     - **Critical fix:** Replaces always-truthy `{errors ? <div ...>...</div> : null}` so when `errors` is `{}` (or contains only falsy values), **nothing** is mounted in the DOM (no empty `<div>`, no phantom `gap-4` spacing, no empty `role="alert"` region).
  4. Active step card via `renderStep(step, setFormData, formData)` (unchanged).
  5. Navigation footer (`Back` button + `Next` / `INITIATE PLAN` / `Retry` / `Generating...` button).

#### Initial State
```js
const [step, setStep] = useState(1);
const totalSteps = 8;
const [formData, setFormData] = useState({
  goal: "build muscle",
  level: "beginner",
  selectedDays: ["Monday", "Wednesday", "Friday"],
  equipment: "full gym",
  duration: 60,
  weeks: 6,
  exclusions: "",
  priorities: "",
});
const [isGenerating, setIsGenerating] = useState(false);
const [errors, setErrors] = useState({});
const isGeneratingRef = useRef(false);
```

#### Handlers & State Transitions
1. **`handleGenerate`:**
   ```js
   const handleGenerate = async () => {
     if (isGeneratingRef.current || isSyncPending || isSyncFailed) {
       return;
     }
     isGeneratingRef.current = true;
     setIsGenerating(true);
     setErrors({});
     try {
       const plan = await generateInitialPlan(formData);
       await onSavePlan(plan, formData);
     } catch (error) {
       setErrors({
         error: error?.message || "Failed to generate plan. Please try again.",
       });
     } finally {
       isGeneratingRef.current = false;
       setIsGenerating(false);
     }
   };
   ```
2. **`handleClickNext`:**
   ```js
   const handleClickNext = () => {
     if (step === totalSteps) {
       handleGenerate();
     } else {
       handleNextStep(step, totalSteps, setStep, formData, setErrors);
     }
   };
   ```
3. **`handleBack`:**
   ```js
   const handleBack = () => {
     if (isGeneratingRef.current || isGenerating) {
       return;
     }
     setErrors({});
     setStep((prevStep) => Math.max(1, prevStep - 1));
   };
   ```

#### Footer Buttons Contract
```jsx
<div className="flex gap-4 mt-4">
  <Button
    onClick={handleBack}
    disabled={step === 1 || isGenerating}
    className="button btn-secondary text-xl font-bold w-full p-4"
    text="Back"
  />
  <Button
    onClick={handleClickNext}
    disabled={
      isGenerating ||
      (step === totalSteps && (isSyncPending || isSyncFailed))
    }
    aria-busy={isGenerating}
    className="button btn-primary text-xl font-bold w-full p-4"
    text={
      isGenerating ? (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="animate-spin" size={16} aria-hidden="true" />
          Generating...
        </span>
      ) : step === totalSteps ? (
        errors.error ? (
          "Retry"
        ) : (
          "INITIATE PLAN"
        )
      ) : (
        "Next"
      )
    }
  />
</div>
```

---

## 4. Distinct Async & Sync-Guarded State Matrix

Every async or sync-guarded flow strictly separates **loading/pending** from **failed (`error` / `syncError` with retry)** so errors are never masked by loading indicators or messages.

| Flow | Idle / Ready | Loading / Pending | Failed (`error` / `syncError`) | Success |
| :--- | :--- | :--- | :--- | :--- |
| **Step Validation** (`handleNextStep` + `ProfileSetupForm`) | `errors = {}` -> zero `role="alert"` nodes rendered | N/A (synchronous) | `errors = { [field]: message }` -> `role="alert"` `.alert-error` renders message; step stays put | Next click passes validation -> `setErrors({})`, `role="alert"` unmounts, step increments; Back click -> `setErrors({})`, step decrements |
| **Cloud Sync Guard** (`ProfileSetupForm` + `AppContext`) | `isSynced === true, syncError === null` -> no sync banner, Step 8 submit enabled | `user && !isSynced && !syncError` -> `role="status"` `"Syncing your cloud data..."` + spinner; Steps 1–7 navigable; Step 8 `"INITIATE PLAN"` disabled | `user && !isSynced && syncError` -> `role="alert"` `.alert-error` shows `syncError.message` + **"Retry Sync"** calling `retrySync?.()` (NEVER shows `"Syncing..."` spinner); Steps 1–7 navigable; Step 8 `"INITIATE PLAN"` disabled | `isSynced === true` -> sync banner clears, Step 8 submit enabled |
| **Plan Generation & Save** (Step 8 `handleGenerate`) | `isGenerating === false, errors = {}` -> `"INITIATE PLAN"` enabled, `"Back"` enabled | `isGenerating === true` (`isGeneratingRef` locked) -> prior `errors` cleared; Submit disabled + `aria-busy="true"` + spinner + `"Generating..."`; `"Back"` disabled; double-clicks blocked | `isGenerating === false, errors.error` set -> `role="alert"` `.alert-error` shows error message (with fallback); Submit re-enabled as `"Retry"`; `"Back"` re-enabled (and clears error if clicked) | `generateInitialPlan` + `onSavePlan` succeed -> `App.handleSavePlan` switches view to `"plan"` |

---

## 5. Design Tokens, CSS Classes & Accessibility

### Verified Existing CSS Classes Used (Zero CSS Edits)
- `src/css/index.css`: `.alert-error` (`--bg-card`, `--danger`, `--radius`), `.card` (`--bg-card`, `--border-color`, `--radius`), `.animate-spin`, `.btn-primary`, `.btn-secondary`.
- `src/css/utils.css`: `.flex`, `.flex-col`, `.items-center`, `.justify-between`, `.justify-center`, `.gap-2`, `.gap-3`, `.gap-4`, `.mt-4`, `.p-2`, `.p-3`, `.p-4`, `.w-full`, `.shrink-0`, `.text-base`, `.text-lg`, `.text-xl`, `.text-2xl`, `.font-bold`, `.uppercase`, `.letter-spacing-2`, `.text-primary`, `.text-muted`, `.text-error`.

### Accessibility Requirements
1. **No empty live regions:** `role="alert"` MUST only be mounted in the DOM when at least one non-empty error string exists (or `isSyncFailed` is true).
2. **Distinguish status vs alert:** Pending cloud sync uses `role="status"` + `aria-live="polite"`; sync failure and validation/generation errors use `role="alert"`.
3. **Accessible pending button name:** During Step 8 generation, the submit button MUST include visible text `"Generating..."` alongside `aria-busy="true"`, and decorative `<Loader2>` icons MUST set `aria-hidden="true"`.
4. **Input labels:** Step 7 (`Constraints`) and Step 8 (`Priorities`) continue to use `<TextInput id={label} label={label} ... />` with `value` strictly typed as `string` (`""` initially, never `[]`).

---

## 6. Acceptance Criteria (`AC-*`)

Every criterion below MUST be directly asserted by Vitest / React Testing Library tests.

- **AC-1 (`normalizeProfileText` pure utility):**
  1. All inputs in Section 3.1's Edge-Case Table return their exact expected outputs (`""`, `"   "`, `"\t\n "`, `"None"`, `"none"`, `"  NONE  "`, `[]`, `[""]`, `["  ", "None", "none"]`, `null`, `undefined`, `0`, `42`, `NaN`, `true`, `false`, `{}` -> `"None"`; `"knee pain"` -> `"knee pain"`; `"  Knee Pain, Back Injury  "` -> `"Knee Pain, Back Injury"`; `"None of the overhead presses"` -> `"None of the overhead presses"`; `["knee pain"]` -> `"knee pain"`; `["knee pain", "back injury"]` -> `"knee pain, back injury"`; `["  knee pain  ", "", "None", null, 42, "shoulder"]` -> `"knee pain, shoulder"`).
  2. Output is always a non-empty trimmed string, idempotent (`normalizeProfileText(normalizeProfileText(x)) === normalizeProfileText(x)`), and never mutates input arrays.

- **AC-2 (`generateInitialPlan` prompt normalization):**
  1. Calling `generateInitialPlan` with `exclusions` / `priorities` set to `""`, `"   "`, `[]`, `["", "None"]`, `"None"`, `"none"`, `null`, or `undefined` produces a prompt containing:
     - `**EXCLUSIONS & INJURIES (CRITICAL):** None `
     - `**PRIORITIZE MUSCLE GROUPS:** None `
     - `DOUBLE-CHECK Exclusions: 'None'.`
     - `DOUBLE-CHECK Prioritize: 'None'.`
  2. Calling `generateInitialPlan` with `"  knee pain  "` and `"  legs, back  "` (or legacy arrays `["knee pain", "shoulder"]` and `["legs", "core"]`) interpolates the trimmed/joined text into both the profile lines and the `DOUBLE-CHECK` rules.

- **AC-3 (`ProfileScreen` exclusions & priorities display):**
  1. Rendering `ProfileScreen` when `profile.exclusions` / `profile.priorities` are `""`, `"   "`, `[]`, `["", "None"]`, `"None"`, `"none"`, `null`, or `undefined` displays `"No exclusions requested"` and `"No priorities requested"`, and NEVER renders `"Exclusions: "` / `"Priorities: "` / `"undefined"` / `"null"`.
  2. Rendering `ProfileScreen` with `"knee pain"` / `"  legs, back  "` displays `"Exclusions: knee pain"` and `"Priorities: legs, back"`.
  3. Rendering `ProfileScreen` with legacy arrays `["knee pain", "shoulder"]` / `["legs", "core"]` displays `"Exclusions: knee pain, shoulder"` and `"Priorities: legs, core"`.
  4. All existing `ProfileScreen.test.jsx` tests continue to pass unchanged.

- **AC-4 (`handleNextStep` validation & error clearing):**
  1. For each required step (Steps 1–6), invalid data calls `setErrors` with the exact field error (`goal`, `level`, `selectedDays`, `equipment`, `duration`, `weeks`) and does NOT call `setStep`. Includes defensive checks for non-array/empty `selectedDays` and `<= 0` `duration`/`weeks`.
  2. For each valid step (Steps 1–7, including Step 7 with `exclusions: ""`), `handleNextStep` calls `setErrors({})` AND calls `setStep` with an updater function that increments `prevStep` clamped to `totalSteps`.

- **AC-5 (`ProfileSetupForm` error rendering, clearing & navigation):**
  1. On initial mount (no errors), `screen.queryByRole("alert")` is `null` and no empty error container is rendered in the DOM.
  2. On Step 3, unselecting all days (`Monday`, `Wednesday`, `Friday`) and clicking `"Next"` renders `role="alert"` containing `"At least one day is required"` and stays on `"STEP 3/8"`.
  3. Re-selecting a day (e.g., `"MONDAY"`) and clicking `"Next"` clears the alert (`screen.queryByRole("alert") === null`) and advances to `"STEP 4/8"`.
  4. Clicking `"Back"` from Step 3 while `"At least one day is required"` is shown clears the alert and navigates to `"STEP 2/8"`.

- **AC-6 (`ProfileSetupForm` `exclusions` / `priorities` string defaults):**
  1. Navigating to Step 7 (`Constraints`) and Step 8 (`Priorities`) without editing shows empty string inputs (`value === ""`).
  2. Clicking `"INITIATE PLAN"` without editing Step 7 or Step 8 passes `formData` with `exclusions: ""` and `priorities: ""` (both `typeof === "string"`, NOT arrays) to both `generateInitialPlan` and `onSavePlan`.
  3. Clicking `"No Constraints"` / `"No Priorities"` sets `"None"`; typing custom values submits those strings.

- **AC-7 (`ProfileSetupForm` async generation & cloud-sync states):**
  1. While `generateInitialPlan` or `onSavePlan` is pending on Step 8:
     - Submit button shows `"Generating..."`, is `disabled`, and has `aria-busy="true"`.
     - `"Back"` button is `disabled` and clicking it does not change step.
     - Repeated clicks on submit do NOT trigger a second `generateInitialPlan` call.
  2. When generation or save rejects:
     - `role="alert"` displays `error.message` (or `"Failed to generate plan. Please try again."` when message is missing).
     - Submit button re-enables with label `"Retry"`, and `"Back"` re-enables.
     - Clicking `"Retry"` clears the previous alert while pending, shows `"Generating..."`, and completes cleanly when the retry resolves.
     - Clicking `"Back"` after a generation error clears the error and navigates to Step 7; advancing back to Step 8 displays `"INITIATE PLAN"` (not `"Retry"`).
  3. When cloud sync is pending (`user` present, `isSynced: false, syncError: null`):
     - Renders `role="status"` `"Syncing your cloud data..."` and NO `role="alert"`.
     - Steps 1–7 remain navigable via `"Next"`, and Step 8 `"INITIATE PLAN"` is `disabled` (with zero `generateInitialPlan` calls).
  4. When cloud sync has failed (`user` present, `isSynced: false, syncError: new Error(...)`):
     - Renders `role="alert"` containing `syncError.message` and a `"Retry Sync"` button calling `retrySync`, and does NOT render `"Syncing your cloud data..."`.
     - Step 8 `"INITIATE PLAN"` is `disabled` (with zero `generateInitialPlan` calls).

---

## 7. Verification Checklist

- [ ] `npx eslint src api` exits `0` (zero errors, zero warnings).
- [ ] `npm test` exits `0` (all existing + new test suites pass; frozen test hashes `HOLD`).
- [ ] `npm run build` exits `0`.
- [ ] Zero CSS files modified (`src/css/*` untouched).
- [ ] Zero references to `exclusions: []` or `priorities: []` in `src/features/onboarding/ProfileSetupForm.jsx`.
- [ ] Manual smoke path verified: onboarding Steps 1–8 (trigger Step 3 error -> fix -> verify error clears; skip Steps 7–8 -> verify plan generates with `"None"` and `ProfileScreen` shows `"No exclusions requested"` / `"No priorities requested"`).
