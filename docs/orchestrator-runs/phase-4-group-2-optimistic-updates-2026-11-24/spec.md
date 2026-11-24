# Technical Specification — Phase 4, Group 2: Optimistic Local Updates & Rollback on Failure

**Phase:** 4 (One Data Layer — Item 4.2 from `REFACTOR_PLAN.md`, building on Group 1 commit `eaba70b`)
**Run ID:** `phase-4-group-2-optimistic-updates-2026-11-24`
**Owner Role:** `data`
**Styling / CSS Impact:** **None.** No CSS files or class names are added or modified; Stage 6 (`styler`) is not required.

---

## 1. Objective & Scope

### In Scope
1. Upgrade write mutations in `src/hooks/useUserData.js` (`savePlan`, `updatePlan`, `addWorkout`, `resetProgram`) to apply **immediate optimistic local state updates** and **cleanly roll back** on Firestore write rejection while preserving promise rejection (re-throwing errors) so caller error banners and Retry flows continue working verbatim.
2. Keep `deleteAll` **explicitly non-optimistic** (awaited-then-clear) with in-flight write epoch invalidation on success, preventing premature modal unmount or inconsistent local/auth state on failure.
3. Guarantee correctness under all concurrency and lifecycle edge cases:
   - Temp ID insertion, in-place Firestore ID reconciliation, and targeted rollback for `addWorkout`.
   - Overlapping / out-of-order writes on the `plan`/`profile` document slice and the `workouts` subcollection slice without clobbering newer state or reverting committed cloud writes.
   - Session / UID isolation across logout, account switch (`userA -> userB`), and logout + re-login as the same `uid`.
   - Sync-guard enforcement (`status !== "ready"` when signed in rejects *before* any optimistic mutation).
   - Hydration / `retrySync` / `clearLocalData` / `deleteAll` invalidation of stale in-flight mutations.
4. Harden `src/App.jsx` and `src/components/screens/ProfileScreen.jsx` so optimistic `savePlan` and `resetProgram` transitions do not prematurely unmount `ProfileSetupForm` / `ProfileScreen` (which would lose form state or error/Retry alerts on rollback) or throw when `profile` is transiently `null`.

### Out of Scope
- **Item 4.3** (`onSnapshot` real-time Firestore listeners) — deferred to Group 3.
- Any changes to persisted Firestore schemas (`users/{uid}`, `users/{uid}/workouts/{autoId}`), `firestoreServices.js`, or `localStorage` keys (`fitgen:active:v1`).
- Any changes to `AppContext`'s 25-key public contract or `useUserData`'s 14-key return shape.
- Any edits to pre-existing out-of-band working tree files (`REFACTOR_PLAN.md`, `MODULARIZATION_TS_PLAN.md`).

---

## 2. Exact Files to Modify

### Product Code (`implementer`)
1. **`src/hooks/useUserData.js`** — Optimistic state updates, committed-baseline + pending-patch rollback engine, temp ID workout reconciliation, session/hydration epoch isolation, and `deleteAll` epoch invalidation.
2. **`src/App.jsx`** — Track `isSavingPlan` and `isResettingProgram` locally to keep `ProfileSetupForm` / `ProfileScreen` mounted while `handleSavePlan` / `handleResetSystem` are in flight.
3. **`src/components/screens/ProfileScreen.jsx`** — Null-safe `profile` property reads so staying mounted during an in-flight optimistic `resetProgram()` never throws `TypeError`.

### Test Code (`tester`)
4. **`src/hooks/useUserData.test.jsx`** — Update Group 1 awaited-only mutation assertions to verify immediate optimistic updates + rollback, and add full concurrency, reconciliation, session isolation, sync-guard, `retrySync`, `clearLocalData`, and `deleteAll` test suites.
5. **`src/App.test.jsx`** — Add integration tests verifying optimistic state visibility, preserved screen mounting (`ProfileSetupForm` / `ProfileScreen`), view-transition deferral, and rollback on failure for `handleSavePlan` and `handleResetSystem`.
6. **`src/components/screens/ProfileScreen.test.jsx`** — Add test verifying `ProfileScreen` renders safely when `userData.profile` is transiently `null` during an in-flight optimistic reset and surfaces error + Retry on failure.

### Explicitly Untouched Files
- `src/services/firebase/firestoreServices.js` (no schema or service signature changes)
- `src/hooks/useWorkout.js`
- `src/hooks/useAuth.js`
- `src/features/workout/ActiveWorkout.jsx`
- `src/features/dashboard/PlanDashboard.jsx`
- `src/features/workout/DayDetailModal.jsx`
- `src/features/onboarding/ProfileSetupForm.jsx`
- `src/features/auth/DeleteAccountModal.jsx`
- `src/components/screens/LogsScreen.jsx`
- All CSS files (`src/css/*.css`)

---

## 3. Data Models, Collection Schemas & Public Contracts (Unchanged)

### Persisted Firestore Schemas (Strictly Unchanged)
- `users/{uid}`:
  ```js
  {
    profile: Profile | null,
    plan: Plan | null,
    createdAt?: string,   // ISO timestamp
    updatedAt: string,    // ISO timestamp (set by firestoreService)
  }
  ```
- `users/{uid}/workouts/{autoId}`:
  ```js
  {
    weekNumber: number,        // non-negative integer, default 0
    dayNumber: number | null,  // integer or null
    dayName: string,           // default ""
    focus: string,             // default ""
    logs: Array<object>,       // default []
    duration: number,          // non-negative finite number, default 0
    completedAt: string,       // ISO timestamp string, default ""
  }
  ```
- `localStorage` (`src/services/storage/activeWorkoutStore.js`): versioned key `fitgen:active:v1`, unchanged.

### `useUserData` Public Return Shape (Exact 14 Keys — Unchanged)
```js
{
  profile,        // Profile | null
  plan,           // Plan | null
  workouts,       // Array<WorkoutEntry> (each has { id, weekNumber, dayNumber, dayName, focus, logs, duration, completedAt })
  status,         // "loading" | "ready" | "error"
  error,          // Error | null (sync error when status === "error", else null)
  isSynced,       // boolean (Boolean(uid && status === "ready"))
  syncError,      // Error | null (uid && status === "error" ? error : null)
  retrySync,      // () => void
  savePlan,       // (nextPlan, nextProfile) => Promise<{ plan, profile }>
  updatePlan,     // (nextPlan) => Promise<Plan>
  addWorkout,     // (workoutPayload) => Promise<WorkoutEntry>
  resetProgram,   // () => Promise<void>
  deleteAll,      // () => Promise<{ deletedWorkoutsCount: number }>
  clearLocalData, // () => void
}
```

### `AppContext` Public Contract (Exact 25 Keys — Unchanged)
`isSavingPlan` and `isResettingProgram` are private local state inside `App.jsx` and MUST NOT be added to `AppContext`.

---

## 4. Internal State & Ref Architecture (`src/hooks/useUserData.js`)

> **ESLint / React 19 Compliance (`react-hooks/refs`):** `eslint.config.js` enables `reactHooks.configs.flat.recommended`. Refs MUST NEVER be read or written during the render body. All ref mutations occur exclusively inside `useEffect` and async/event callbacks (`useCallback`).

### 4.1 Pure Module-Level Helpers (Outside `useUserData`)

#### Document-Slice Patch Engine (`plan` & `profile`)
```js
function createEmptyDocSlice(nextId = 1) {
  return {
    committed: { plan: null, profile: null },
    committedPlanId: 0,
    committedProfileId: 0,
    pending: [],
    nextId,
  };
}

function computeDocState(slice) {
  let plan = slice.committed.plan;
  let profile = slice.committed.profile;

  for (const patch of slice.pending) {
    if (patch.hasPlan && patch.id > slice.committedPlanId) {
      plan = patch.plan;
    }
    if (patch.hasProfile && patch.id > slice.committedProfileId) {
      profile = patch.profile;
    }
  }

  return { plan, profile };
}
```

Each pending entry in `slice.pending` has the exact shape:
```js
{
  id: number,               // strictly monotonic sequence from slice.nextId++
  hasPlan: boolean,         // true for savePlan, updatePlan, resetProgram
  plan: Plan | null,        // ignored when hasPlan === false
  hasProfile: boolean,      // true for savePlan, resetProgram; false for updatePlan
  profile: Profile | null,  // ignored when hasProfile === false
}
```

#### Optimistic Workout Entry Normalizer
Do **not** add a new named import `normalizeWorkoutEntry` from `../services/firebase/firestoreServices` in `useUserData.js`, because existing Vitest suites (`src/App.test.jsx`, `src/hooks/useUserData.test.jsx`) mock `firestoreServices` with `{ firestoreService }` only and Vitest ESM rejects unmocked named imports at module load time.

Instead, define a pure local helper matching `firestoreServices.normalizeWorkoutEntry` field-for-field:
```js
function buildOptimisticWorkoutEntry(id, rawEntry, fallbackCompletedAt = "") {
  const entry = rawEntry && typeof rawEntry === "object" ? rawEntry : {};
  const nested =
    entry.workout && typeof entry.workout === "object" ? entry.workout : {};

  const rawWeek = entry.weekNumber ?? nested.weekNumber;
  const weekNumber =
    typeof rawWeek === "number" && Number.isFinite(rawWeek) && rawWeek >= 0
      ? Math.trunc(rawWeek)
      : 0;

  const rawDayNumber = entry.dayNumber ?? nested.dayNumber;
  const dayNumber =
    typeof rawDayNumber === "number" && Number.isFinite(rawDayNumber)
      ? Math.trunc(rawDayNumber)
      : null;

  const rawDayName = entry.dayName ?? nested.dayName;
  const dayName = typeof rawDayName === "string" ? rawDayName : "";

  const rawFocus = entry.focus ?? nested.focus;
  const focus = typeof rawFocus === "string" ? rawFocus : "";

  const logs = Array.isArray(entry.logs) ? entry.logs : [];

  const rawDuration = entry.duration;
  const duration =
    typeof rawDuration === "number" &&
    Number.isFinite(rawDuration) &&
    rawDuration >= 0
      ? rawDuration
      : 0;

  const rawCompletedAt =
    entry.completedAt ?? nested.date ?? fallbackCompletedAt;
  const completedAt =
    typeof rawCompletedAt === "string" ? rawCompletedAt : "";

  return {
    id,
    weekNumber,
    dayNumber,
    dayName,
    focus,
    logs,
    duration,
    completedAt,
  };
}
```
Note: `firestoreService.addWorkout(writeUid, workoutPayload)` MUST still receive the caller's original `workoutPayload` verbatim (unmutated, without `id` attached).

### 4.2 Refs Inside `useUserData`
In addition to existing `currentUidRef`, `localDataRef`, and `onSyncCompleteRef`:
```js
const sessionEpochRef = useRef(0);
const docSliceRef = useRef(createEmptyDocSlice(1));
const optimisticWorkoutSeqRef = useRef(1);
```

### 4.3 Epoch & Baseline Lifecycle Rules
| Event | `sessionEpochRef.current` | `docSliceRef.current` | `dataState` |
|---|---|---|---|
| `useEffect([uid, syncAttempt])` runs (login, logout, account switch, re-login, `retrySync`) | `+= 1` | Reset to `createEmptyDocSlice(docSliceRef.current.nextId)` | Already cleared on `uid !== prevUid` when `prevUid !== null`; preserved across `null -> uid` for pre-login bootstrap via `localDataRef` |
| `syncData()` hydrates cloud or bootstrapped data (while `isMounted`) | unchanged (already bumped by `[uid, syncAttempt]`) | Reset to `{ committed: { plan: hydratedPlan, profile: hydratedProfile }, committedPlanId: 0, committedProfileId: 0, pending: [], nextId }` | Set to `{ ownerUid: uid, profile: hydratedProfile, plan: hydratedPlan, workouts: hydratedWorkouts }` |
| `retrySync()` called (when `uid` is truthy) | `+= 1` synchronously | `pending = []` | Preserved until hydration completes or fails (`status` transitions immediately to `"loading"`, clearing `error`/`syncError`) |
| `retrySync()` called (when `!uid`) | No-op | No-op | No-op |
| `clearLocalData()` called | `+= 1` synchronously | Reset to `createEmptyDocSlice(nextId)` | Set to `EMPTY_DATA_STATE` |
| `deleteAll()` resolves (and epoch + uid still match) | `+= 1` | Reset to `createEmptyDocSlice(nextId)` | Set to `{ ownerUid: writeUid, profile: null, plan: null, workouts: EMPTY_WORKOUTS }` |

---

## 5. Step-by-Step Mutation & Rollback Specifications

### 5.1 Sync Guard Invariant (Applies to `savePlan`, `updatePlan`, `addWorkout`, `resetProgram`)
Before **any** ref or React state mutation occurs, call `assertReadyForWrite(failedMessage)`:
- If `uid` is falsy (`null`): guard passes (logged-out local-only mode).
- If `uid` is truthy and `status === "error"`: throw `new Error(failedMessage)` (`SYNC_FAILED_SAVE_PLAN_ERROR`, `SYNC_FAILED_DEFAULT_ERROR`, or `SYNC_FAILED_RESET_ERROR`). **Zero optimistic updates, zero Firestore calls.**
- If `uid` is truthy and `status !== "ready"` (i.e. `"loading"`): throw `new Error(SYNC_PENDING_ERROR)`. **Zero optimistic updates, zero Firestore calls.**

Errors are never masked as loading states: `status === "error"` always produces the distinct sync-failed message and exposes `error` / `syncError` with `retrySync`, while `status === "loading"` produces `SYNC_PENDING_ERROR`.

---

### 5.2 Shared Helper for Document-Slice Optimistic Writes (`savePlan`, `updatePlan`, `resetProgram`)

Let `runOptimisticDocWrite({ writeUid, patchSpec, writeFn })` execute:
1. **Logged-out branch (`!writeUid`):**
   - Apply `patchSpec` directly to `docSliceRef.current.committed` (`pending = []`, `committedPlanId = 0`, `committedProfileId = 0`).
   - Update `dataState`:
     ```js
     setDataState((prev) => ({
       ...prev,
       ownerUid: null,
       plan: docSliceRef.current.committed.plan,
       profile: docSliceRef.current.committed.profile,
     }));
     ```
   - Do **not** call Firestore.
2. **Logged-in branch (`writeUid` truthy):**
   - Capture `writeEpoch = sessionEpochRef.current`.
   - Allocate `patchId = docSliceRef.current.nextId++`.
   - Create `patch = { id: patchId, ...patchSpec }`.
   - Append `patch` to `docSliceRef.current.pending`.
   - Compute `optimistic = computeDocState(docSliceRef.current)`.
   - Immediately call `setDataState((prev) => ({ ...prev, ownerUid: writeUid, plan: optimistic.plan, profile: optimistic.profile }))` — **preserving `prev.workouts`**.
   - `try { await writeFn(); }`
   - **On resolve:**
     - Check `if (sessionEpochRef.current === writeEpoch && currentUidRef.current === writeUid)`:
       - Advance committed baseline per field ONLY if `patchId` is newer than the last committed patch for that field:
         ```js
         const slice = docSliceRef.current;
         if (patch.hasPlan && patchId > slice.committedPlanId) {
           slice.committed = { ...slice.committed, plan: patch.plan };
           slice.committedPlanId = patchId;
         }
         if (patch.hasProfile && patchId > slice.committedProfileId) {
           slice.committed = { ...slice.committed, profile: patch.profile };
           slice.committedProfileId = patchId;
         }
         slice.pending = slice.pending.filter((item) => item.id !== patchId);
         const nextDoc = computeDocState(slice);
         setDataState((prev) => ({
           ...prev,
           ownerUid: writeUid,
           plan: nextDoc.plan,
           profile: nextDoc.profile,
         }));
         ```
     - If epoch or uid changed mid-flight: do **not** touch `docSliceRef` or `dataState`.
   - **On reject (`catch (err)`):**
     - Check `if (sessionEpochRef.current === writeEpoch && currentUidRef.current === writeUid)`:
       - Remove ONLY `patchId` from `docSliceRef.current.pending`:
         ```js
         const slice = docSliceRef.current;
         slice.pending = slice.pending.filter((item) => item.id !== patchId);
         const rolledBack = computeDocState(slice);
         setDataState((prev) => ({
           ...prev,
           ownerUid: writeUid,
           plan: rolledBack.plan,
           profile: rolledBack.profile,
         }));
         ```
     - **Always rethrow `err`** so callers (`App.jsx`, `useWorkout`, `ProfileSetupForm`, `ProfileScreen`, `DayDetailModal`, `PlanDashboard`) receive the rejection and render their error/Retry UX.

---

### 5.3 Per-Mutation Contracts

#### 1. `savePlan(nextPlan, nextProfile)`
- **Guard:** `assertReadyForWrite(SYNC_FAILED_SAVE_PLAN_ERROR)`
- **Patch:** `{ hasPlan: true, plan: nextPlan, hasProfile: true, profile: nextProfile }`
- **Firestore call (when signed in):** `firestoreService.saveUserData(writeUid, { plan: nextPlan, profile: nextProfile })`
- **Optimistic effect:** Immediately sets `plan = nextPlan`, `profile = nextProfile`; preserves `workouts`.
- **On resolve:** Advances committed `plan` and `profile`, returns `{ plan: nextPlan, profile: nextProfile }`.
- **On reject:** Removes this patch from `pending`, recomputes `plan`/`profile` from committed + remaining newer pending patches (rolling back to prior state if no newer write superseded it), preserves `workouts`, rethrows error.

#### 2. `updatePlan(nextPlan)`
- **Guard:** `assertReadyForWrite(SYNC_FAILED_DEFAULT_ERROR)`
- **Patch:** `{ hasPlan: true, plan: nextPlan, hasProfile: false, profile: undefined }`
- **Firestore call (when signed in):** `firestoreService.saveUserData(writeUid, { plan: nextPlan })`
- **Optimistic effect:** Immediately sets `plan = nextPlan`; preserves `profile` and `workouts`.
- **On resolve:** Advances committed `plan` (if `patchId > committedPlanId`), preserves `profile` and `workouts`, returns `nextPlan`.
- **On reject:** Removes this patch from `pending`, recomputes `plan` (rolling back cleanly without touching `profile` or `workouts` and without clobbering newer `updatePlan`/`savePlan`/`resetProgram`), rethrows error.

#### 3. `resetProgram()`
- **Guard:** `assertReadyForWrite(SYNC_FAILED_RESET_ERROR)`
- **Patch:** `{ hasPlan: true, plan: null, hasProfile: true, profile: null }`
- **Firestore call (when signed in):** `firestoreService.resetUserProgram(writeUid)`
- **Optimistic effect:** Immediately sets `plan = null`, `profile = null`; preserves `workouts`.
- **On resolve:** Advances committed `plan = null` and `profile = null`, preserves `workouts`, resolves `undefined`.
- **On reject:** Removes this patch from `pending`, recomputes `plan`/`profile` (restoring prior plan/profile or committed state if an earlier write succeeded), preserves `workouts`, rethrows error.

#### 4. `addWorkout(workoutPayload)`
- **Guard:** `assertReadyForWrite(SYNC_FAILED_DEFAULT_ERROR)`
- **Logged-out branch (`!writeUid`):**
  - Generate `localId = \`local-${Date.now()}-${optimisticWorkoutSeqRef.current++}\``.
  - Build `localEntry = buildOptimisticWorkoutEntry(localId, workoutPayload, new Date().toISOString())`.
  - Append `localEntry` to `dataState.workouts` (`ownerUid: null`).
  - Return `localEntry` (zero Firestore calls).
- **Logged-in branch (`writeUid` truthy):**
  - Capture `writeEpoch = sessionEpochRef.current`.
  - Generate unique monotonic temp ID: `tempId = \`__optimistic_workout_${optimisticWorkoutSeqRef.current++}\``.
  - Build normalized optimistic entry: `optimisticEntry = buildOptimisticWorkoutEntry(tempId, workoutPayload, new Date().toISOString())`.
  - Immediately append `optimisticEntry` to `dataState.workouts` (preserving `plan` and `profile`).
  - Call `const savedEntry = await firestoreService.addWorkout(writeUid, workoutPayload)`.
  - **On resolve:**
    - If `sessionEpochRef.current === writeEpoch && currentUidRef.current === writeUid`:
      - Reconcile **in place** by replacing the item whose `entry.id === tempId` with `savedEntry` (preserving exact array index/order and preventing duplicates; if `tempId` was somehow absent, append `savedEntry` once).
    - Return `savedEntry` (with the real Firestore document `id`).
  - **On reject (`catch (err)`):**
    - If `sessionEpochRef.current === writeEpoch && currentUidRef.current === writeUid`:
      - Remove **only** the failed optimistic item: `prev.workouts.filter((entry) => entry.id !== tempId)` (preserving all committed workouts and any other concurrent optimistic workouts).
    - **Always rethrow `err`**.

#### 5. `deleteAll()` — Non-Optimistic (Awaited-Then-Clear)
- **Rationale for staying non-optimistic:**
  1. `deleteUserData` is a destructive, irreversible multi-batch Firestore delete invoked mid-pipeline inside `useAuth.handleDeleteAccount` (`reauthenticate -> deleteAll -> deleteAccount -> cleanup`), while `DeleteAccountModal` already blocks UI interaction with a `"Deleting..."` spinner.
  2. Optimistically clearing `plan`/`profile` before `deleteUserData` settles would risk unmounting `ProfileScreen` / `DeleteAccountModal` or leaving the UI wiped if deletion fails (`permission-denied`, offline), hiding the `stage: "firestore"` error alert and Retry flow.
  3. `deleteAll` intentionally bypasses sync guards (`status === "loading"` or `status === "error"`) so account deletion always remains possible.
- **Exact contract:**
  1. If `!uid`: throw `new Error("User ID is required to delete user data.")` (zero Firestore calls).
  2. Capture `writeUid = uid` and `writeEpoch = sessionEpochRef.current`.
  3. `const result = await firestoreService.deleteUserData(writeUid);` (do **not** mutate local state before this resolves).
  4. If `sessionEpochRef.current === writeEpoch && currentUidRef.current === writeUid`:
     - Increment `sessionEpochRef.current += 1` (invalidating any earlier in-flight optimistic writes so their late settlement or rollback cannot resurrect deleted data!).
     - Reset `docSliceRef.current = createEmptyDocSlice(docSliceRef.current.nextId)`.
     - Call `setDataState({ ownerUid: writeUid, profile: null, plan: null, workouts: EMPTY_WORKOUTS })`.
  5. Return `result`.
  6. On rejection: local state (`profile`, `plan`, `workouts`), `sessionEpochRef`, and `docSliceRef` remain completely untouched; rethrow error.

---

## 6. Concurrency & Edge-Case Matrix

| Scenario | State While In Flight | Final State After Settlement |
|---|---|---|
| `updatePlan(P1)` (#1) then `updatePlan(P2)` (#2); **#1 fails, #2 succeeds** | `P1` → `P2` → stays `P2` on #1 fail | `P2` (#1 failure never clobbers #2) |
| `updatePlan(P1)` (#1) then `updatePlan(P2)` (#2); **#1 succeeds, #2 fails** | `P1` → `P2` → stays `P2` on #1 resolve | `P1` (#2 rolls back to committed `P1`, NOT `P0`) |
| `updatePlan(P1)` (#1) then `updatePlan(P2)` (#2); **#2 fails first, then #1 fails** | `P1` → `P2` → `P1` on #2 fail | `P0` (reverts to committed baseline) |
| `updatePlan(P1)` (#1) then `updatePlan(P2)` (#2); **#2 succeeds first, then #1 fails or succeeds** | `P1` → `P2` → stays `P2` (`committedPlanId = 2 > 1`) | `P2` (stale #1 neither clobbers nor regresses #2) |
| `updatePlan(P1)` (#1) then `resetProgram()` (#2); **#1 fails, #2 succeeds** | `{P1, Pr0}` → `{null, null}` | `{null, null}` (`workouts` preserved) |
| `updatePlan(P1)` (#1) then `resetProgram()` (#2); **#1 succeeds, #2 fails** | `{P1, Pr0}` → `{null, null}` | `{P1, Pr0}` (`workouts` preserved) |
| `updatePlan(P1)` (#1) then `resetProgram()` (#2); **#2 succeeds first, #1 settles later** | `{P1, Pr0}` → `{null, null}` | `{null, null}` (`committedPlanId = 2 > 1`) |
| `savePlan(P1, Pr1)` (#1) then `updatePlan(P2)` (#2); **#1 succeeds, #2 fails** | `{P1, Pr1}` → `{P2, Pr1}` | `{P1, Pr1}` (profile preserved) |
| `savePlan(P1, Pr1)` (#1) then `updatePlan(P2)` (#2); **#1 fails, #2 succeeds** | `{P1, Pr1}` → `{P2, Pr1}` | `{P2, null}` (matches Firestore merge) |
| `addWorkout(A)` (#1) + `addWorkout(B)` (#2); **#1 fails, #2 succeeds** (either order) | `[...prev, temp1, temp2]` | `[...prev, docB]` (only `temp1` removed; `temp2` reconciled to `docB`) |
| `addWorkout(A)` (#1) + `addWorkout(B)` (#2); **#2 resolves before #1** | `[...prev, temp1, temp2]` → `[...prev, temp1, docB]` | `[...prev, docA, docB]` (exact order preserved, zero duplicates) |
| `updatePlan` / `resetProgram` + `addWorkout` concurrently | Both slices update independently | Neither slice clobbers the other on resolve or rollback |
| Logout (`userA -> null`) mid-write (resolve or reject) | Cleared immediately on logout | Remains `{ null, null, [] }`; stale settle/rollback ignored |
| Account switch (`userA -> userB`) mid-write (resolve or reject) | `userA` cleared immediately; `userB` loads | `userB`'s hydrated state untouched |
| Logout + re-login as same `uid` (`userA -> null -> userA`) mid-write | Cleared on logout; Session 2 loads with new epoch | Session 1's late settle/rollback ignored; Session 2 intact |
| `retrySync()` called mid-write | `status -> "loading"`, `sessionEpoch` bumped | Late settle/rollback ignored; freshly hydrated cloud state wins |
| `clearLocalData()` or `deleteAll()` resolves mid-write | Cleared + `sessionEpoch` bumped | Earlier write's late settle/rollback cannot resurrect data |
| Write attempted while `status === "loading"` or `status === "error"` | Guard throws immediately | Zero optimistic mutations, zero Firestore calls |

---

## 7. Caller Impact Analysis & Minimal Caller Hardening

### Callers Requiring Hardening

#### 1. `src/App.jsx`
**Root problem discovered:** Line 121 renders `{userData.plan ? <ProfileScreen /> : <ProfileSetupForm />}` while `view === "profile"`.
- During `handleSavePlan` (called from `ProfileSetupForm` at Step 8/8): optimistic `savePlan` sets `userData.plan` truthy *before* `setView("plan")` runs. Without pinning, `App` immediately unmounts `ProfileSetupForm` (wiping all 8 steps of `formData` and swallowing the `catch` error alert + Retry button if Firestore rejects!).
- During `handleResetSystem` (called from `ProfileScreen`'s `"Reset Program?"` modal): optimistic `resetProgram` sets `userData.plan = null` immediately. Without pinning, `App` immediately unmounts `ProfileScreen` and its confirmation modal (swallowing the `catch` error alert + Retry button if Firestore rejects!).

**Exact change in `src/App.jsx`:**
```jsx
const [isSavingPlan, setIsSavingPlan] = useState(false);
const [isResettingProgram, setIsResettingProgram] = useState(false);
```
- In `clearStorage`: also call `setIsSavingPlan(false); setIsResettingProgram(false);`.
- In `handleSavePlan`:
  ```jsx
  const handleSavePlan = async (nextPlan, nextProfile) => {
    setIsSavingPlan(true);
    try {
      await savePlan(nextPlan, nextProfile);
      setView("plan");
    } finally {
      setIsSavingPlan(false);
    }
  };
  ```
- In `handleResetSystem`:
  ```jsx
  const handleResetSystem = async () => {
    setIsResettingProgram(true);
    try {
      await resetProgram();
      activeWorkoutStore.clear();
      setActiveWorkout(null);
      setView("profile");
    } finally {
      setIsResettingProgram(false);
    }
  };
  ```
- In JSX (`view === "profile"` branch):
  ```jsx
  {view === "profile" && (
    <div className="view-container">
      {(userData.plan || isResettingProgram) && !isSavingPlan ? (
        <ProfileScreen />
      ) : (
        <ProfileSetupForm />
      )}
    </div>
  )}
  ```
- `contextValue` remains the exact same 25 keys.

#### 2. `src/components/screens/ProfileScreen.jsx`
**Root problem discovered:** While `App.jsx` keeps `<ProfileScreen />` mounted during an in-flight optimistic `resetProgram()`, `userData.profile` is optimistically `null`. Lines 48, 50, 58, 128, 131 previously dereferenced `profile.goal`, `profile.equipment`, `profile.level`, and `profile.selectedDays.length` unconditionally, which would throw `TypeError`.

**Exact change in `src/components/screens/ProfileScreen.jsx`:**
- Extract null-safe local values:
  ```jsx
  const goal = profile?.goal ?? "";
  const level = profile?.level ?? "";
  const selectedDaysCount = Array.isArray(profile?.selectedDays)
    ? profile.selectedDays.length
    : 0;
  const equipment = profile?.equipment ?? "";
  ```
- Use `goal.toLowerCase()` for `Icon`, `equipment` in `planDetails`, and `{goal}` / `{level} // {selectedDaysCount} DAYS/WEEK` in JSX.
- Existing behavior when `profile` is populated is 100% identical; when `profile` is transiently `null` during an in-flight optimistic reset, `ProfileScreen` renders safely behind the open `"Reset Program?"` modal without throwing, then switches to `ProfileSetupForm` on resolve or restores full profile + `role="alert"` + Retry on reject.

### Callers Verified Compatible (No Changes Needed)
- **`src/hooks/useWorkout.js`:** `handleGenerateNextWeek`, `handleReplaceExercise`, and `handleFinishWorkout` check `assertCloudSynced()`, await `updatePlan` / `addWorkout`, and only clear `activeWorkoutStore` / `activeWorkout` / navigate (`setView`) after the promise resolves. `isFinishingRef` resets in `finally`, and rejections propagate unchanged.
- **`src/features/workout/ActiveWorkout.jsx`:** Mounted via `view === "active" && activeWorkout` (independent of `workouts`). Shows `Saving...` with `aria-busy` while `addWorkout` is in flight; on failure, `addWorkout` removes the temp entry and rejects, keeping the active workout, paused storage, `role="alert"` banner, and Retry button intact.
- **`src/features/dashboard/PlanDashboard.jsx`:** Render-time `weeksLength !== prevWeeksLength` logic advances `weekIndex` to `weeksLength - 1` when `updatePlan` optimistically appends a week; if `updatePlan` fails and rolls back `weeksLength` from `N + 1` to `N`, the `else if (weekIndex >= weeksLength)` branch automatically clamps `weekIndex` back to `N - 1` (the exact week the user checked in from, since Check-in only renders on `isLastAvailableWeek`). `handleCheckin` catches the rejection and displays the error.
- **`src/features/workout/DayDetailModal.jsx`:** Displays the swapped exercise heading immediately upon optimistic `updatePlan`, keeps all buttons and close controls disabled while `isReplacing` is `true`, and on rejection rolls back `details` to the original exercise + alternatives while rendering `role="alert"` with Retry for `failedSwap`.
- **`src/features/onboarding/ProfileSetupForm.jsx`:** Kept mounted during `handleSavePlan` by `App.jsx`'s `isSavingPlan` flag; catches save rejections and renders `role="alert"` + Retry with all 8 steps of `formData` intact.
- **`src/hooks/useAuth.js` & `src/features/auth/DeleteAccountModal.jsx`:** Unaffected because `deleteAll` stays non-optimistic; strict `reauthenticate -> deleteAll -> deleteAccount -> cleanup` ordering and error-stage handling are preserved.
- **`src/components/screens/LogsScreen.jsx`:** Keys rows by `entry?.id ?? index` and reads the 7 canonical flat fields, so optimistic entries (`__optimistic_workout_*`) render cleanly and reconcile seamlessly to Firestore IDs.

---

## 8. Acceptance Criteria (Vitest-Assertable)

- **AC-1 (Immediate optimistic `savePlan` & rollback):** Calling `savePlan(nextPlan, nextProfile)` while synced updates `plan` and `profile` immediately *before* `firestoreService.saveUserData` resolves (preserving `workouts`), resolves to `{ plan: nextPlan, profile: nextProfile }`, and on rejection rolls `plan` and `profile` back to the prior state while rethrowing the error.
- **AC-2 (Immediate optimistic `updatePlan` & rollback):** Calling `updatePlan(nextPlan)` while synced updates `plan` immediately *before* `firestoreService.saveUserData` resolves (preserving `profile` and `workouts`), resolves to `nextPlan`, and on rejection rolls `plan` back while rethrowing the error.
- **AC-3 (Immediate optimistic `addWorkout`, temp ID reconciliation, & rollback):** Calling `addWorkout(payload)` while synced immediately appends a normalized 7-field entry with a unique `__optimistic_workout_*` ID *before* `firestoreService.addWorkout` resolves, forwards original `payload` to `firestoreService.addWorkout(uid, payload)`, replaces that entry **in place** with the Firestore-returned entry on resolve (preserving order, zero duplicates, returning `savedEntry`), and removes **only** that temp entry on rejection while rethrowing the error.
- **AC-4 (Immediate optimistic `resetProgram` & rollback):** Calling `resetProgram()` while synced immediately sets `plan` and `profile` to `null` (preserving `workouts`) *before* `firestoreService.resetUserProgram` resolves, and on rejection restores the prior `plan` and `profile` (still preserving `workouts`) while rethrowing the error.
- **AC-5 (Non-optimistic `deleteAll` + in-flight invalidation):** `deleteAll()` does **not** mutate `plan`, `profile`, or `workouts` before `firestoreService.deleteUserData` resolves; preserves state and rethrows on rejection; clears all three slices on resolve and invalidates any earlier in-flight optimistic writes so their late settlement or rollback cannot resurrect deleted data.
- **AC-6 (Concurrent overlapping doc-slice writes):**
  - Two overlapping `updatePlan` calls where #1 fails and #2 succeeds leave `plan` at #2 (never clobbered by #1's rollback).
  - Two overlapping `updatePlan` calls where #1 succeeds and #2 fails roll `plan` back to #1's committed value (not initial `P0`).
  - Two overlapping `updatePlan` calls where #2 fails first then #1 fails roll back to #1 then `P0`.
  - Two overlapping `updatePlan` calls where #2 succeeds before #1 settles keep `plan` at #2 whether #1 resolves or rejects.
  - `updatePlan` followed by `resetProgram` (and `savePlan` followed by `updatePlan`) maintain consistent per-field committed/pending replay under every failure/resolution order.
- **AC-7 (Concurrent overlapping `addWorkout` calls & slice isolation):**
  - Two concurrent `addWorkout` calls get distinct temp IDs; if #1 fails and #2 succeeds (in either settlement order), only #1 is removed and #2 reconciles to its Firestore ID.
  - If two concurrent `addWorkout` calls resolve out-of-order (#2 before #1), both reconcile in place in their original insertion order with zero duplicates.
  - Concurrent `addWorkout` and `updatePlan`/`resetProgram` do not clobber each other's slice.
- **AC-8 (Session / UID isolation):** Logging out (`userA -> null`), switching accounts (`userA -> userB`), or logging out and re-logging in as the same `uid` (`userA -> null -> userA`) while optimistic writes are in flight prevents both late resolution and late rollback from mutating the new session's state.
- **AC-9 (Sync guard before optimistic mutation):** When signed in and `status === "loading"` or `status === "error"`, `savePlan`, `updatePlan`, `addWorkout`, and `resetProgram` reject with the exact existing pending or operation-specific sync-failed error messages **before** any optimistic state mutation occurs and with zero Firestore writes. Loading and error states remain strictly distinct (`status: "loading"` vs `status: "error"` with `error`/`syncError` and `retrySync`).
- **AC-10 (`retrySync` and `clearLocalData` isolation):** Invoking `retrySync()` or `clearLocalData()` while an optimistic write is in flight invalidates the prior epoch so the write's late resolution or rollback cannot overwrite freshly hydrated or cleared state.
- **AC-11 (Caller resilience in `App.jsx` & `ProfileScreen.jsx`):**
  - In `App`, `handleSavePlan` optimistically updates `plan`/`profile` immediately while keeping `<ProfileSetupForm />` mounted and `view !== "plan"` until resolve, rolling back cleanly on failure so `ProfileSetupForm` remains mounted to display errors/Retry.
  - In `App`, `handleResetSystem` optimistically clears `plan`/`profile` (preserving `workouts`) while keeping `<ProfileScreen />` mounted until resolve, rolling back cleanly on failure so `ProfileScreen` remains mounted to display errors/Retry.
  - `ProfileScreen` renders without throwing when `userData.profile` is transiently `null`.
  - `AppContext` exposes the exact same 25 keys and `useUserData` exposes the exact same 14 keys.
- **AC-12 (Quality gates):** `npm test`, `npx eslint src api`, and `npm run build` all exit 0 with zero new warnings or errors, and persisted Firestore / `localStorage` data shapes are untouched.

---

## 9. Test Plan (`tester`)

### `src/hooks/useUserData.test.jsx`
1. **Optimistic single mutations + rollback:**
   - `savePlan`: immediate optimistic update (preserving `workouts`), resolve returns `{ plan, profile }`, reject rolls back & rethrows.
   - `updatePlan`: immediate optimistic update (preserving `profile` & `workouts`), resolve returns `nextPlan`, reject rolls back & rethrows.
   - `addWorkout`: immediate optimistic append with `__optimistic_workout_*` ID & normalized 7-field shape (including legacy nested payload input), original payload forwarded to `firestoreService.addWorkout`, in-place reconciliation to Firestore doc ID on resolve (preserving position, zero duplicates), targeted removal on reject & rethrow.
   - `resetProgram`: immediate optimistic clear of `plan`/`profile` (preserving `workouts`), reject restores prior `plan`/`profile` & rethrows.
   - `deleteAll`: non-optimistic (state untouched while pending and on reject), clears state on resolve, invalidates concurrent earlier optimistic writes so late resolve/reject cannot resurrect deleted data.
2. **Concurrency & out-of-order settlement:**
   - Overlapping `updatePlan` #1 fail / #2 succeed.
   - Overlapping `updatePlan` #1 succeed / #2 fail (rollback to #1, not initial `P0`).
   - Overlapping `updatePlan` #2 fail first / #1 fail second.
   - Overlapping `updatePlan` #2 succeed first / #1 fail or succeed (no regression).
   - Overlapping `updatePlan` + `resetProgram` (#1 fail/#2 succeed, #1 succeed/#2 fail, #2 succeed first).
   - Overlapping `savePlan` + `updatePlan` (#1 succeed/#2 fail preserves profile; #1 fail/#2 succeed preserves plan).
   - Concurrent `addWorkout` #1 fail + #2 succeed (both settlement orders).
   - Concurrent `addWorkout` #1 & #2 succeeding out-of-order (order preserved, zero duplicates).
   - Concurrent `addWorkout` + `resetProgram` / `updatePlan` slice isolation.
3. **Session, hydration, sync-guard & cleanup invariants:**
   - Sync guard rejects before optimistic state mutation for both `status === "loading"` and `status === "error"` (asserting `plan`, `profile`, `workouts` remain unchanged before & after rejection).
   - Logout mid-write (both resolve and reject) does not mutate logged-out state.
   - Direct account switch `userA -> userB` mid-write (both resolve and reject) does not pollute `userB`.
   - Logout + same-UID re-login (`userA -> null -> userA`) mid-write (both resolve and reject) does not corrupt Session 2.
   - `retrySync()` mid-write prevents late resolve or reject from overwriting freshly hydrated data.
   - `clearLocalData()` mid-write prevents late resolve or reject from resurrecting cleared data.
   - Logged-out mode + pre-login bootstrap remains intact.

### `src/App.test.jsx`
- `handleSavePlan`: while Firestore write is pending, `plan`/`profile` are optimistically updated in context, `view` stays `"profile"`, and `Profile Setup View` remains mounted (never swaps to `Profile View`); on reject, `plan`/`profile` roll back to `null` and `Profile Setup View` remains mounted; on resolve, `view` switches to `"plan"`.
- `handleResetSystem`: while Firestore reset is pending, `plan`/`profile` are optimistically `null`, `workouts` are preserved, and `Profile View` remains mounted; on reject, `plan`/`profile` roll back and `Profile View` remains mounted; on resolve, `activeWorkout`/storage clear and `Profile Setup View` mounts.
- Exact 25 `AppContext` keys preserved.

### `src/components/screens/ProfileScreen.test.jsx`
- Renders safely without throwing when `userData.profile` is transiently `null` (as occurs while an optimistic `resetProgram()` is in flight), keeping the Reset Program modal visible and interactive for error/Retry.
