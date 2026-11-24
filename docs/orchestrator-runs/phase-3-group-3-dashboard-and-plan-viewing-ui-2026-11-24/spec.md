# Phase 3 — Group 3 Specification: Dashboard & Workout Plan Viewing UI Bugs

**Run ID:** `phase-3-group-3-dashboard-and-plan-viewing-ui-2026-11-24`  
**Phase Objective (`REFACTOR_PLAN.md`, Phase 3 — Group 3):**
1. **Week tab jumps:** `PlanDashboard` currently runs `useEffect([plan])` and unconditionally jumps `weekIndex` to `plan.weeks.length - 1` whenever the `plan` object reference changes (e.g., swapping an exercise in an earlier week or cloud sync re-hydration). Only advance `weekIndex` to the newest week when `plan.weeks.length` grows, while keeping `weekIndex` safely in bounds when `plan.weeks.length` shrinks, resets, or becomes empty/null.
2. **Props edited in place:** Remove the direct prop mutation `details.exercises[index].name = alt` in `DayDetailModal.jsx`. Rely strictly on the immutable data flow (`DayDetailModal` -> `PlanDashboard` -> `useWorkout.handleReplaceExercise` -> updated `userData.plan` -> derived `activeDayDetails`), with proper async loading/pending state, synchronous double-click protection, distinct error + retry handling inside the modal, distinct cloud-sync pending vs. failed (`syncError` + Retry Sync) states, and accessible icon-only button labels.

**Persisted Data Shape Impact:** **NONE.**
- Firestore `users/{uid}` (`{ profile, plan, createdAt, updatedAt }`) and `users/{uid}/workouts/{autoId}` shapes are untouched.
- `localStorage` (`fitgen:active:v1`, `fitgen-active`) and `STORAGE_KEYS` are untouched.
- `AppContext` (exact 16 keys from Phase 3 Group 2) is untouched; `src/App.jsx` requires zero changes.

**Styler / CSS Verdict:** **NO CSS file changes required — `styler` does NOT need to be invoked in Stage 6.**
- Zero edits to `src/css/index.css`, `src/css/utils.css`, or `src/css/animations.css`.
- All UI states reuse existing verified design-system classes from `src/css/index.css` and `src/css/utils.css` (`.view-container`, `.card`, `.alert-error`, `.button`, `.btn-primary`, `.btn-muted`, `.bg-primary`, `.bg-muted`, `.animate-spin`, `.scrollable-list`, `.text-primary`, `.text-dark`, `.text-muted`, `.text-error`, `.font-bold`, `.font-semibold`, `.text-base`, `.text-lg`, `.text-xl`, `.text-2xl`, `.text-3xl`, `.uppercase`, `.flex`, `.flex-col`, `.items-center`, `.items-start`, `.justify-between`, `.justify-center`, `.gap-1`, `.gap-2`, `.gap-3`, `.gap-4`, `.gap-5`, `.mb-4`, `.mt-4`, `.p-2`, `.p-3`, `.p-4`, `.p-6`, `.px-2`, `.py-1`, `.w-full`, `.shrink-0`, `.letter-spacing-2`, `.overflow-x-auto`).
- Zero inline `style={{ ... }}` attributes, zero hardcoded hex/rgb colors, and zero non-existent utility classes in added/modified JSX.

---

## 1. Exact File Plan

### 1.1 Production Files to Modify (`implementer` scope)
| Path | Summary of Changes |
| :--- | :--- |
| `src/features/dashboard/PlanDashboard.jsx` | (1) Replace `useEffect([plan])` week-jumping logic with render-time previous-length comparison state (`prevWeeksLength`) + clamped `activeWeekIndex` so `weekIndex` advances to `weeksLength - 1` **only** when `plan.weeks.length` grows, stays unchanged on non-growing `plan` reference changes, clamps when `plan.weeks.length` shrinks below `weekIndex`, and resets cleanly when `plan` becomes null/empty; remove unused `useEffect` import; (2) Guard `activeDayDetails` after `if (!currentWeek)` and reset `activeDayIndex` on week tab click or week jump/shrink/clear; (3) Add `type="button"` and `aria-pressed={activeWeekIndex === index}` to week selector buttons; (4) Render distinct top-level cloud-sync status banner (`isSyncFailed` with `role="alert"` + **"Retry Sync"** vs. `isSyncPending` with `role="status"` + spinner); (5) Conditionally render `<DayDetailModal />` when `activeDayDetails` is truthy, forwarding `activeWeekIndex` and propagating `handleReplaceExercise` rejections directly to `DayDetailModal` (no longer swallowing swap errors into the hidden background `error` state) alongside sync status props (`isSyncPending`, `isSyncFailed`, `syncError`, `onRetrySync`). |
| `src/features/workout/DayDetailModal.jsx` | (1) Remove in-place prop mutation `details.exercises[index].name = alt`; (2) Make exercise swap async (`await onReplaceExercise(index, alt)`) with synchronous `isReplacingRef` double-submit guard, pending UI state (`isReplacing`, `pendingSwap`, spinner + `"Swapping..."`, `aria-busy`, disabled buttons, close blocked while saving), and inline `role="alert"` `.alert-error` + **"Retry"** button (`swapError`, `failedSwap`) on failure while leaving `details` untouched; (3) Surface distinct optional cloud-sync pending (`role="status"`) vs. failed (`role="alert"` + **"Retry Sync"**) states inside the modal and disable swap buttons while sync-blocked; (4) Add `type="button"`, `aria-label={`Swap ${exercise.name}`}`, and `aria-expanded={expandedIndex === index}` to the icon-only shuffle toggle button; remove non-existent classes (`bg-light`, `pt-4`) from touched elements; guard `!isOpen || !details` and non-array `details.exercises`; reset local state on close. |
| `src/features/dashboard/Schedule.jsx` | Add `type="button"` and accessible names (`aria-label={`View ${day.dayName} workout details`}` and `aria-label={`Start ${day.dayName} workout`}`) to the two icon-only action buttons (Settings and Play) so screen readers and RTL queries can identify them semantically without breaking existing index-based queries. |
| `src/hooks/useWorkout.js` | Destructure `syncError` alongside `isSynced` from `useAppContext()` and distinguish `syncError` (`SYNC_FAILED_ERROR = "Cloud sync failed. Please retry sync before saving changes."`) from pending sync (`SYNC_PENDING_ERROR = "Still syncing your data from the cloud. Please try again in a moment."`) in `handleGenerateNextWeek`, `handleReplaceExercise`, and `handleFinishWorkout` so failed cloud sync is never masked as "Still syncing...". |

### 1.2 Production Files to Create (`implementer` scope)
- **None.**

### 1.3 CSS Files (`styler` scope)
- **None.** Stage 6 (`styler`) is **skipped**.

### 1.4 Test Files to Create / Modify (`tester` scope)
| Path | Type | Coverage |
| :--- | :--- | :--- |
| `src/features/dashboard/PlanDashboard.test.jsx` | Modify | Expand with Group 3 tests covering: initial mount to latest week, staying on selected earlier week across non-growing `plan` reference updates (exercise swap & cloud re-hydration), advancing to latest week when `plan.weeks.length` grows (including from `null`/`[]` -> `N` and `2` -> `3`), clamping when `plan.weeks.length` shrinks while viewing a removed week vs. staying put when still in bounds, `plan` reset to `null`/empty -> new plan load, end-to-end immutable exercise swap in Week 1 of a multi-week plan (with deeply frozen `plan` verifying modal updates from new `plan` and week tab does NOT jump), and distinct `isSyncPending` vs. `syncError` + **Retry Sync** banners. |
| `src/features/workout/DayDetailModal.test.jsx` | Create | Dedicated unit & accessibility test suite covering: rendering day header/exercises, hiding swap button when `alternatives` is missing/empty, accessible `Swap <name>` toggle with `aria-expanded`, zero in-place mutation against deeply `Object.freeze()`d `details` prop, async pending state (`Swapping...`, `aria-busy`, disabled controls, close blocked, synchronous double-click guard invoking `onReplaceExercise` once), async rejection showing inline `role="alert"` + **Retry** while preserving original exercise name, successful retry collapsing panel and clearing alert, state reset on close/reopen, and distinct `isSyncPending` vs. `isSyncFailed` + **Retry Sync** states. |
| `src/hooks/useWorkout.test.jsx` | Modify | Add tests verifying that when `user` is signed in, `isSynced` is `false`, and `syncError` is non-null, `handleReplaceExercise`, `handleGenerateNextWeek`, and `handleFinishWorkout` reject with `"Cloud sync failed. Please retry sync before saving changes."` (rather than the pending message) without calling Firestore or mutating state. |

### 1.5 Out of Scope (Do NOT Modify in Phase 3 — Group 3)
- `src/App.jsx` (all 16 `AppContext` keys are already wired).
- `src/features/onboarding/ProfileSetupForm.jsx`, `src/features/onboarding/helpers/handleNextStep.js`, `src/components/screens/ProfileScreen.jsx` (`exclusions`/`priorities` and onboarding setup errors belong to Group 4).
- `src/features/workout/FeedbackModal.jsx` (check-in feedback UI is out of Group 3 scope).
- `src/components/ui/Modal.jsx` and `src/components/ui/Button.jsx` (already support `role="dialog"`, `aria-modal`, and `...rest` forwarding).
- Any CSS file under `src/css/`.
- Any persisted Firestore or `localStorage` data shape.

---

## 2. Component Hierarchy & Data Flow

```text
App (AppContext: user, isSynced, syncError, retrySync, userData, setUserData, setView, setActiveWorkout)
 └── PlanDashboard
      ├── Cloud Sync Banner (mutually exclusive: isSyncFailed [role="alert" + Retry Sync] | isSyncPending [role="status"])
      ├── Week Selector Tabs (Button[aria-pressed={activeWeekIndex === index}])
      ├── Coach Notes Card (when currentWeek.coachNotes is truthy)
      ├── Schedule (currentWeek, setDetails={setActiveDayIndex}, onCompleted, onStartWorkout)
      │    └── Day Cards -> Settings Button ("View <dayName> workout details") + Play Button ("Start <dayName> workout")
      ├── Next-Week Check-in / Program Complete Footer
      ├── FeedbackModal
      ├── DayDetailModal (conditionally rendered when activeDayDetails is truthy)
      │    └── Modal[role="dialog", title="WORKOUT DETAILS"]
      │         ├── Cloud Sync Banner (when isSyncFailed or isSyncPending)
      │         ├── Swap Error Banner (role="alert" + Retry when swapError is non-null)
      │         ├── Exercise Cards
      │         │    ├── Header + Swap Toggle Button (aria-label="Swap <name>", aria-expanded)
      │         │    └── Expandable Alternatives List -> Alternative Buttons (pending "Swapping..." + aria-busy)
      │         └── CLOSE Button (disabled while isReplacing)
      └── Paused-Workout Conflict Modal
```

### Immutable Exercise Replacement Flow
1. `PlanDashboard` stores ONLY indices: `weekIndex` (clamped to `activeWeekIndex`) and `activeDayIndex` (`number | null`). It NEVER copies a day object into local state.
2. `activeDayDetails` is always derived directly from the current `userData.plan`:
   `currentWeek.schedule[activeDayIndex] ?? null`.
3. When the user picks an alternative `alt` for exercise `index` in `DayDetailModal`:
   - `DayDetailModal` acquires synchronous `isReplacingRef.current = true`, sets pending state, and `await`s `onReplaceExercise(index, alt)` **without mutating `details`**.
   - `PlanDashboard` forwards `(activeWeekIndex, activeDayIndex, exIndex, newEx)` directly to `useWorkout.handleReplaceExercise`.
   - `useWorkout.handleReplaceExercise` checks `assertCloudSynced()`, builds a brand-new immutable `newPlan` (updating `exercise.name` and rotating the previous `exercise.name` into `alternatives`), awaits `firestoreService.saveUserData(user.uid, { plan: newPlan })` when `user` is present, and updates `userData.plan = newPlan`.
   - `PlanDashboard` re-renders with the new `plan` object. Because `plan.weeks.length` did **not** grow, `activeWeekIndex` does **not** jump. `activeDayIndex` remains unchanged, so `activeDayDetails` automatically points to the new immutable day object from `newPlan`.
   - `onReplaceExercise` resolves -> `DayDetailModal` collapses `expandedIndex` to `null`, clears errors, releases pending state, and displays the updated `exercise.name` (and updated `alternatives` on next expand) directly from its fresh `details` prop.
   - If `handleReplaceExercise` rejects -> `userData.plan` and `details` remain completely unchanged; `DayDetailModal` catches the error, keeps the modal open, renders an inline `role="alert"` `.alert-error` message with a **Retry** button, and releases pending state.

---

## 3. Exact Component & Hook Contracts

### 3.1 `src/features/dashboard/PlanDashboard.jsx`

#### Context & Derived Sync Flags
```js
const {
  user,
  userData,
  isSynced = true,
  syncError = null,
  retrySync,
} = useAppContext();
const { plan, history } = userData;

const isSyncFailed = Boolean(user && !isSynced && syncError);
const isSyncPending = Boolean(user && !isSynced && !syncError);
```

#### Week Index State & Growth-Only Auto-Advance (ESLint v7 `react-hooks` Safe)
Do **NOT** use `useEffect` calling `setWeekIndex` (which violates `react-hooks/set-state-in-effect` and causes extra render commits) and do **NOT** read/write a `useRef` during render (which violates `react-hooks/refs`). Use React's canonical previous-value state comparison pattern:

```js
const weeksLength = Array.isArray(plan?.weeks) ? plan.weeks.length : 0;

const [weekIndex, setWeekIndex] = useState(() =>
  weeksLength > 0 ? weeksLength - 1 : 0
);
const [prevWeeksLength, setPrevWeeksLength] = useState(weeksLength);
const [activeDayIndex, setActiveDayIndex] = useState(null);

if (weeksLength !== prevWeeksLength) {
  setPrevWeeksLength(weeksLength);
  if (weeksLength > prevWeeksLength) {
    setWeekIndex(weeksLength - 1);
    setActiveDayIndex(null);
  } else if (weeksLength === 0) {
    setWeekIndex(0);
    setActiveDayIndex(null);
  } else if (weekIndex >= weeksLength) {
    setWeekIndex(weeksLength - 1);
    setActiveDayIndex(null);
  }
}

const activeWeekIndex =
  weeksLength > 0 ? Math.min(Math.max(weekIndex, 0), weeksLength - 1) : 0;
```

#### Transition Matrix for `weekIndex` / `activeWeekIndex`
| Scenario | `prevWeeksLength` -> `weeksLength` | Prior `weekIndex` | Next `activeWeekIndex` | `activeDayIndex` |
| :--- | :--- | :--- | :--- | :--- |
| Initial mount with 3 weeks | `3` (init) | `2` (init) | `2` (Week 3) | `null` |
| Initial mount with 1 week | `1` (init) | `0` (init) | `0` (Week 1) | `null` |
| Initial mount with `plan: null` or `weeks: []` | `0` (init) | `0` (init) | `0` | `null` |
| User selects Week 1 tab | `3 -> 3` | `2 -> 0` | `0` (Week 1) | `null` |
| `plan` ref changes, same length (exercise swap / cloud re-hydration) | `3 -> 3` | `0` | `0` (unchanged!) | unchanged (modal stays open on updated day) |
| New week generated (`plan.weeks.length` grows) | `2 -> 3` | `0` or `1` | `2` (Week 3) | `null` |
| Plan hydrates from `null`/`[]` to 2 weeks | `0 -> 2` | `0` | `1` (Week 2) | `null` |
| Plan shrinks, current week now out of bounds | `3 -> 1` | `2` | `0` (clamped to Week 1) | `null` |
| Plan shrinks, current week still in bounds | `3 -> 2` | `0` | `0` (stays on Week 1) | unchanged (`activeDayDetails` safely `null` if day index out of bounds) |
| Plan becomes `null` or `weeks: []` | `3 -> 0` | `2` | `0` | `null` |
| New 2-week plan loaded after `null` | `0 -> 2` | `0` | `1` (Week 2) | `null` |

#### Empty / Guard Ordering
Place `if (!currentWeek)` **before** indexing `currentWeek.schedule` so an empty `plan.weeks` array never throws `TypeError`:
```jsx
if (!plan || !Array.isArray(plan.weeks) || plan.totalWeeks === 0)
  return (
    <div className="text-center text-2xl text-muted p-6">NO DATA FOUND</div>
  );

const currentWeek = plan.weeks[activeWeekIndex] || plan.weeks[0];
if (!currentWeek)
  return (
    <div className="text-center text-2xl text-muted p-6">LOADING...</div>
  );

const activeDayDetails =
  activeDayIndex !== null && Array.isArray(currentWeek.schedule)
    ? currentWeek.schedule[activeDayIndex] ?? null
    : null;
```
Also update `isLastAvailableWeek` to use `activeWeekIndex`:
```js
const isLastAvailableWeek = activeWeekIndex === plan.weeks.length - 1;
```

#### Top-Level Cloud Sync Status Banner
Rendered inside `.view-container` directly below the header block (above the week selector tabs). Strictly mutually exclusive — `syncError` is NEVER masked by a loading spinner:
- When `isSyncFailed`:
  ```jsx
  <div
    role="alert"
    className="alert-error flex items-center justify-between gap-3 mt-4"
  >
    <span className="text-lg font-bold">
      {syncError?.message || "Failed to sync your cloud data."}
    </span>
    <Button
      type="button"
      text="Retry Sync"
      onClick={() => retrySync?.()}
      className="button btn-primary text-base font-bold uppercase p-2 letter-spacing-2 shrink-0"
    />
  </div>
  ```
- When `isSyncPending`:
  ```jsx
  <div
    role="status"
    aria-live="polite"
    className="card p-3 mt-4 flex items-center justify-center gap-2 text-muted text-lg font-bold"
  >
    <Loader2 className="animate-spin" size={16} aria-hidden="true" />
    <span>Syncing your cloud data...</span>
  </div>
  ```

#### Week Selector Tabs
```jsx
<div className="flex gap-4 mt-4 overflow-x-auto">
  {plan.weeks.map((week, index) => (
    <div
      key={`${week.weekNumber}-${index}`}
      className={`p-2 shrink-0 ${
        activeWeekIndex === index ? "bg-primary" : "bg-muted"
      }`}
    >
      <Button
        type="button"
        onClick={() => {
          setWeekIndex(index);
          setActiveDayIndex(null);
        }}
        aria-pressed={activeWeekIndex === index}
        className={`letter-spacing-2 font-semibold ${
          activeWeekIndex === index ? "text-dark" : "text-primary"
        }`}
        text={`Week ${week.weekNumber}`}
      />
    </div>
  ))}
</div>
```

#### `DayDetailModal` Wiring in `PlanDashboard`
Conditionally render `DayDetailModal` when `activeDayDetails` is truthy so modal-internal state cleanly resets on unmount, and forward `handleReplaceExercise` directly so rejections reach `DayDetailModal`:
```jsx
{activeDayDetails && (
  <DayDetailModal
    isOpen
    onClose={() => setActiveDayIndex(null)}
    details={activeDayDetails}
    isSyncPending={isSyncPending}
    isSyncFailed={isSyncFailed}
    syncError={syncError}
    onRetrySync={retrySync}
    onReplaceExercise={(exIndex, newEx) =>
      handleReplaceExercise(activeWeekIndex, activeDayIndex, exIndex, newEx)
    }
  />
)}
```

---

### 3.2 `src/features/workout/DayDetailModal.jsx`

#### Props Signature
```jsx
export default function DayDetailModal({
  isOpen,
  onClose,
  details,
  onReplaceExercise,
  isSyncPending = false,
  isSyncFailed = false,
  syncError = null,
  onRetrySync,
})
```
All four sync props are optional and default to non-blocking values (`false` / `null` / `undefined`), keeping `DayDetailModal` cleanly testable and backwards-compatible for standalone callers.

#### Internal State & Synchronous Guard
- `expandedIndex` (`number | null`, initial `null`): index of the currently expanded exercise alternatives panel.
- `isReplacing` (`boolean`, initial `false`): true while `onReplaceExercise` promise is in flight.
- `pendingSwap` (`{ exerciseIndex: number, altName: string } | null`, initial `null`): identifies which alternative button shows the inline spinner + `"Swapping..."`.
- `swapError` (`string | null`, initial `null`): error message from a failed `onReplaceExercise` call.
- `failedSwap` (`{ exerciseIndex: number, altName: string } | null`, initial `null`): captures the failed swap target so the **Retry** button can re-invoke it.
- `isReplacingRef = useRef(false)`: synchronous double-click / concurrent-swap lock.

#### Guard Clause
```js
if (!isOpen || !details) return null;
const exercises = Array.isArray(details.exercises) ? details.exercises : [];
```
Note: hooks (`useState`, `useRef`) MUST all be declared before `if (!isOpen || !details) return null;` (Rules of Hooks).

#### Handlers
1. **`handleClose`:**
   ```js
   const handleClose = () => {
     if (isReplacingRef.current || isReplacing) {
       return;
     }
     setExpandedIndex(null);
     setSwapError(null);
     setFailedSwap(null);
     onClose();
   };
   ```
   Blocks backdrop click, modal X button, and CLOSE button while a swap save is in flight.

2. **`handleExpand(index)`:**
   ```js
   const handleExpand = (index) => {
     if (isReplacingRef.current || isReplacing) {
       return;
     }
     setSwapError(null);
     setFailedSwap(null);
     setExpandedIndex((prev) => (prev === index ? null : index));
   };
   ```

3. **`handleSelectAlternative(index, alt)`:**
   ```js
   const handleSelectAlternative = async (index, alt) => {
     if (isReplacingRef.current || isSyncPending || isSyncFailed) {
       return;
     }
     isReplacingRef.current = true;
     setIsReplacing(true);
     setPendingSwap({ exerciseIndex: index, altName: alt });
     setSwapError(null);

     try {
       await onReplaceExercise(index, alt);
       setExpandedIndex(null);
       setFailedSwap(null);
     } catch (error) {
       setSwapError(
         error?.message || "Failed to replace exercise. Please try again."
       );
       setFailedSwap({ exerciseIndex: index, altName: alt });
     } finally {
       isReplacingRef.current = false;
       setIsReplacing(false);
       setPendingSwap(null);
     }
   };
   ```
   **Hard invariant:** ZERO mutation of `details`, `details.exercises`, `exercise`, or `exercise.alternatives`. `details.exercises[index].name = alt` MUST be completely removed.

#### Modal Markup & Design-System Classes
- Wrapper: `<Modal isOpen={isOpen} onClose={handleClose} title="WORKOUT DETAILS">`
- Header: `details.dayName` (`h1.text-3xl.font-bold`) and `details.focus` (`span.text-primary.text-lg`).
- Sync banner (mutually exclusive, inside modal above exercise list):
  - When `isSyncFailed`:
    ```jsx
    <div
      role="alert"
      className="alert-error flex items-center justify-between gap-3"
    >
      <span className="text-lg font-bold">
        {syncError?.message || "Failed to sync your cloud data."}
      </span>
      <Button
        type="button"
        text="Retry Sync"
        onClick={() => onRetrySync?.()}
        className="button btn-primary text-base font-bold uppercase p-2 letter-spacing-2 shrink-0"
      />
    </div>
    ```
  - Else when `isSyncPending`:
    ```jsx
    <div
      role="status"
      aria-live="polite"
      className="card p-3 flex items-center justify-center gap-2 text-muted text-lg font-bold"
    >
      <Loader2 className="animate-spin" size={16} aria-hidden="true" />
      <span>Still syncing your cloud data...</span>
    </div>
    ```
- Swap error banner (rendered when `swapError` is non-null):
  ```jsx
  {swapError && (
    <div
      role="alert"
      className="alert-error flex items-center justify-between gap-3"
    >
      <span className="text-lg font-bold">{swapError}</span>
      {failedSwap && (
        <Button
          type="button"
          text="Retry"
          onClick={() =>
            handleSelectAlternative(
              failedSwap.exerciseIndex,
              failedSwap.altName
            )
          }
          disabled={isReplacing || isSyncPending || isSyncFailed}
          className="button btn-primary text-base font-bold uppercase p-2 letter-spacing-2 shrink-0"
        />
      )}
    </div>
  )}
  ```
- Exercise list:
  - Swap toggle button (rendered only when `Array.isArray(exercise.alternatives) && exercise.alternatives.length > 0`):
    ```jsx
    <Button
      type="button"
      onClick={() => handleExpand(index)}
      Icon={Shuffle}
      iconSize={20}
      disabled={isReplacing}
      aria-label={`Swap ${exercise.name}`}
      aria-expanded={expandedIndex === index}
      className={`px-2 py-1 ${
        expandedIndex === index ? "text-primary" : "text-muted"
      }`}
      text=""
    />
    ```
  - Alternatives panel (rendered when `expandedIndex === index`):
    ```jsx
    <div className="mt-4">
      <p className="text-base text-muted uppercase letter-spacing-2 mb-4">
        Select Alternative
      </p>
      <div className="flex flex-col gap-5 scrollable-list">
        {exercise.alternatives.map((alt, altIndex) => {
          const isThisPending =
            pendingSwap?.exerciseIndex === index &&
            pendingSwap?.altName === alt;
          return (
            <div key={`${alt}-${altIndex}`}>
              <Button
                type="button"
                text={
                  isThisPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2
                        className="animate-spin"
                        size={16}
                        aria-hidden="true"
                      />
                      Swapping...
                    </span>
                  ) : (
                    alt
                  )
                }
                Icon={isThisPending ? null : RotateCcw}
                iconSize={16}
                disabled={isReplacing || isSyncPending || isSyncFailed}
                aria-busy={isThisPending}
                className="button btn-primary text-lg letter-spacing-2 font-bold w-full flex items-center gap-2 p-2"
                onClick={() => handleSelectAlternative(index, alt)}
              />
            </div>
          );
        })}
      </div>
    </div>
    ```
- Footer Close button:
  ```jsx
  <Button
    type="button"
    text="CLOSE"
    disabled={isReplacing}
    className="button btn-muted p-2 w-full font-bold text-xl uppercase"
    onClick={handleClose}
  />
  ```

---

### 3.3 `src/features/dashboard/Schedule.jsx`

Add `type="button"` and `aria-label` to the two icon-only buttons inside `!done` without altering button order, structure, or callbacks:
```jsx
<Button
  type="button"
  onClick={() => setDetails(index)}
  Icon={Settings}
  iconSize={20}
  className="px-2 py-1 btn-muted"
  text=""
  aria-label={`View ${day.dayName} workout details`}
/>
<Button
  type="button"
  onClick={() =>
    onStartWorkout({
      ...day,
      weekNumber: currentWeek.weekNumber,
    })
  }
  Icon={Play}
  iconSize={20}
  className="px-2 py-1 btn-primary"
  text=""
  aria-label={`Start ${day.dayName} workout`}
/>
```

---

### 3.4 `src/hooks/useWorkout.js`

- Destructure `syncError` alongside `isSynced` from `useAppContext()`:
  ```js
  const {
    user,
    isSynced,
    syncError,
    userData,
    setUserData,
    setView,
    setActiveWorkout,
  } = useAppContext();
  ```
- Define distinct constants:
  ```js
  const SYNC_PENDING_ERROR =
    "Still syncing your data from the cloud. Please try again in a moment.";
  const SYNC_FAILED_ERROR =
    "Cloud sync failed. Please retry sync before saving changes.";
  ```
- Define internal helper inside `useWorkout`:
  ```js
  const assertCloudSynced = () => {
    if (user && !isSynced) {
      if (syncError) {
        throw new Error(SYNC_FAILED_ERROR);
      }
      throw new Error(SYNC_PENDING_ERROR);
    }
  };
  ```
- Replace the 3 inline `if (user && !isSynced) { throw new Error(SYNC_PENDING_ERROR); }` checks in `handleGenerateNextWeek`, `handleReplaceExercise`, and `handleFinishWorkout` with `assertCloudSynced()`.
- Return shape remains identical (exact 6 handlers).

---

## 4. Distinct Async & Sync-Guarded UX / State Matrix

Every async or sync-guarded flow strictly separates **loading/pending** from **failed (`error` / `syncError` with retry)** so errors are never masked by loading messages.

| Flow | Idle / Ready | Loading / Pending | Failed (`error` / `syncError`) | Success |
| :--- | :--- | :--- | :--- | :--- |
| **Cloud Sync on `PlanDashboard` & `DayDetailModal`** | `isSynced === true, syncError === null` — no sync banner; exercise swaps enabled | `user && !isSynced && !syncError` — `role="status"` `"Syncing your cloud data..."` (dashboard) / `"Still syncing your cloud data..."` (modal) + spinner; modal alternative buttons disabled; `useWorkout` writes reject with `SYNC_PENDING_ERROR` | `user && !isSynced && syncError` — `role="alert"` `.alert-error` with `syncError.message` + **"Retry Sync"** calling `retrySync()` (NEVER shows `"Syncing..."` spinner); modal alternative buttons disabled; `useWorkout` writes reject with `SYNC_FAILED_ERROR` | `isSynced === true`, alerts cleared, `userData` hydrated from cloud |
| **Exercise Swap (`DayDetailModal` + `PlanDashboard` + `useWorkout.handleReplaceExercise`)** | Modal open showing immutable `details.exercises`; user expands alternatives via `Swap <name>` button | `isReplacing === true` (`isReplacingRef` locked) — clicked alternative shows spinner + `"Swapping..."` + `aria-busy="true"`; all alternative buttons, swap toggles, and CLOSE/backdrop/X blocked; duplicate clicks ignored; original exercise name remains visible (never mutated optimistically in place) | `isReplacing === false, swapError !== null` — modal stays open; `details` and `userData.plan` untouched (original exercise name stays intact); inline `role="alert"` `.alert-error` shows error + **"Retry"** button; controls re-enabled | `handleReplaceExercise` resolves with new immutable `plan`; `PlanDashboard` keeps current `weekIndex` (does NOT jump tabs); `activeDayDetails` updates from new `plan`; `DayDetailModal` collapses panel, clears error, and displays new exercise name & rotated alternatives |

---

## 5. Accessibility & Interaction Requirements

1. **Week selector tabs (`PlanDashboard.jsx`):** Every week button is a real `<button type="button">` exposing `aria-pressed={activeWeekIndex === index}` so active selection is programmatically exposed to assistive technologies.
2. **Icon-only buttons (`DayDetailModal.jsx`, `Schedule.jsx`):**
   - Swap toggle button in `DayDetailModal`: `type="button"`, `aria-label={`Swap ${exercise.name}`}`, `aria-expanded={expandedIndex === index}`.
   - Day details button in `Schedule`: `type="button"`, `aria-label={`View ${day.dayName} workout details`}`.
   - Start workout button in `Schedule`: `type="button"`, `aria-label={`Start ${day.dayName} workout`}`.
3. **Status vs. Alert live regions:**
   - Pending sync messages use `role="status"` with `aria-live="polite"` and decorative spinners use `aria-hidden="true"`.
   - Sync errors and exercise-swap errors use `role="alert"` with `.alert-error` styling and an explicit recovery button (**Retry Sync** / **Retry**).
4. **Pending action locking:** While an exercise replacement is saving, the active alternative button sets `aria-busy="true"`, all interactive modal buttons are `disabled`, and closing via CLOSE / X / backdrop is blocked until the request settles.

---

## 6. Strict Acceptance Criteria (`AC-*`) & Vitest Verification Contract

Every criterion below MUST be asserted in Vitest + React Testing Library tests.

### A. Week Tab Selection & Non-Jumping Behavior (`PlanDashboard.test.jsx`)
- **AC-1 (Initial mount to latest week):** Mounting `PlanDashboard` with a multi-week plan (e.g., 3 weeks) selects the latest week (Week 3) immediately (`WK 3/4`, Week 3 button `aria-pressed="true"`, Week 1 & Week 2 buttons `aria-pressed="false"`).
- **AC-2 (Manual week switch & no jump on non-growing plan update):** After selecting Week 1 (`aria-pressed="true"`), re-rendering `PlanDashboard` with a **new `plan` object reference** that has the **same `plan.weeks.length`** (simulating exercise replacement or cloud sync re-hydration) keeps Week 1 selected (`WK 1/4`, Week 1 button `aria-pressed="true"`). It MUST NOT jump to the last week.
- **AC-3 (Advance when `plan.weeks.length` grows):** When `plan.weeks.length` increases (e.g., `2 -> 3` after generating Week 3, even if the user was viewing Week 1, OR `0/null -> 2` on initial cloud load), `PlanDashboard` advances selection to the newly added last week (`weeks.length - 1`) and updates `aria-pressed` accordingly.
- **AC-4 (In-bounds clamping when `plan.weeks.length` shrinks):**
  - If the user is viewing Week 3 (`index 2`) and `plan.weeks.length` shrinks to `1`, selection clamps to Week 1 (`index 0`), Week 1 button has `aria-pressed="true"`, and `CHECK-IN & GENERATE WEEK 2` is shown (`isLastAvailableWeek === true`).
  - If the user is viewing Week 1 (`index 0`) of a 3-week plan and `plan.weeks.length` shrinks to `2`, selection stays on Week 1 (`index 0`) without jumping to Week 2.
- **AC-5 (`plan` becomes `null` or `weeks: []`, then reloads):** Transitioning `plan` to `null` renders `"NO DATA FOUND"` (and `weeks: []` renders `"LOADING..."` without throwing even if a day modal had been open). Subsequently providing a new 2-week plan selects Week 2 (`index 1`).

### B. Immutable Exercise Replacement & `DayDetailModal` (`DayDetailModal.test.jsx` & `PlanDashboard.test.jsx`)
- **AC-6 (No in-place prop mutation — frozen object invariant):** Passing a deeply `Object.freeze()`d `details` prop (frozen day, `exercises` array, exercise objects, and `alternatives` arrays) to `DayDetailModal` and selecting an alternative MUST NOT throw `TypeError` and MUST NOT mutate `details.exercises[index].name`. The displayed exercise name updates strictly when the parent supplies a new immutable `details` prop.
- **AC-7 (End-to-end immutable swap on earlier week without tab jump):** In `PlanDashboard` with a deeply frozen 2-week plan, switching to Week 1, opening Monday's workout details modal (via `"View Monday workout details"`), expanding `"Swap Bench Press"`, and selecting `"Dumbbell Press"` awaits `firestoreService.saveUserData`, updates `userData.plan` immutably for week `0` (leaving original frozen plan untouched), keeps Week 1 selected (`WK 1/4`, Week 1 `aria-pressed="true"`), keeps the modal open on Monday, collapses the alternatives list, and displays `"Dumbbell Press"` (with `"Bench Press"` now available if re-expanded).
- **AC-8 (Pending state & double-click guard in `DayDetailModal`):** While `onReplaceExercise` is pending:
  - The clicked alternative button displays `"Swapping..."`, has `aria-busy="true"`, and is `disabled`.
  - Other alternative buttons, swap toggle buttons, and `"CLOSE"` are `disabled`, and clicking `"Close modal"` (X) or backdrop does NOT invoke `onClose`.
  - Clicking rapidly twice (or clicking two alternatives before resolution) invokes `onReplaceExercise` **exactly once**.
  - The exercise heading continues showing the original exercise name until `onReplaceExercise` resolves and new `details` arrive.
- **AC-9 (Error state & Retry in `DayDetailModal`):** When `onReplaceExercise` rejects:
  - Modal stays open and original exercise name remains displayed (never mutated).
  - An inline `role="alert"` banner renders the error message alongside a **"Retry"** button.
  - Controls re-enable (`aria-busy` clears, buttons enabled).
  - Clicking **"Retry"** re-invokes `onReplaceExercise(index, alt)` with the same arguments; when retry resolves, the alert clears and the alternatives list collapses.
- **AC-10 (Accessibility, empty alternatives & close reset in `DayDetailModal`):**
  - Exercises without `alternatives` (undefined, null, or `[]`) render no swap toggle button.
  - Exercises with alternatives render a button found by `getByRole("button", { name: "Swap <exercise.name>" })` whose `aria-expanded` toggles between `"false"` and `"true"`.
  - Closing and reopening `DayDetailModal` resets `expandedIndex` and `swapError`.

### C. Distinct Cloud Sync Pending vs. Failed States (`PlanDashboard.test.jsx`, `DayDetailModal.test.jsx`, `useWorkout.test.jsx`)
- **AC-11 (`PlanDashboard` sync banners):**
  - When `user` is signed in, `isSynced` is `false`, and `syncError` is `null`: renders `role="status"` `"Syncing your cloud data..."` and does NOT render `role="alert"` or `"Retry Sync"`.
  - When `user` is signed in, `isSynced` is `false`, and `syncError` is an `Error`: renders `role="alert"` with `syncError.message` and a **"Retry Sync"** button that invokes `retrySync()`, and does NOT render `"Syncing your cloud data..."`.
- **AC-12 (`DayDetailModal` sync states):**
  - When `isSyncPending` is `true` (and `isSyncFailed` is `false`): renders `role="status"` `"Still syncing your cloud data..."` and disables alternative selection buttons.
  - When `isSyncFailed` is `true`: renders `role="alert"` with `syncError.message` and a **"Retry Sync"** button calling `onRetrySync`, disables alternative selection buttons, and does NOT render `"Still syncing..."`.
- **AC-13 (`useWorkout` sync guard distinguishes `syncError` vs. pending):**
  - When `user` is signed in, `isSynced` is `false`, and `syncError` is `null`: `handleReplaceExercise`, `handleGenerateNextWeek`, and `handleFinishWorkout` reject with `"Still syncing your data from the cloud. Please try again in a moment."` (preserving existing contract).
  - When `user` is signed in, `isSynced` is `false`, and `syncError` is non-null: all three handlers reject with `"Cloud sync failed. Please retry sync before saving changes."` without writing to Firestore or mutating state.

---

## 7. Verification Gates (Definition of Done)

- `npx eslint src api` exits `0` (0 errors, 0 warnings — including `eslint-plugin-react-hooks` v7 rules).
- `npm test` exits `0` (all existing suites + new/expanded Group 3 suites pass; all frozen test file hashes HOLD).
- `npm run build` exits `0`.
- `git diff` touches ONLY the 4 authorized production files, 3 test files, and run artifacts under `docs/orchestrator-runs/phase-3-group-3-dashboard-and-plan-viewing-ui-2026-11-24/`; zero CSS files modified.
