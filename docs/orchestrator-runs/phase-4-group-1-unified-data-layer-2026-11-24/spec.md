# Phase 4 — Group 1 Specification: Core Unified Data Layer & Legacy Sync Absorption (Items 4.1, 4.5, 4.4)

## 1. Objective & Scope

Consolidate all Firestore user-data reads, writes, initial cloud sync, legacy history migration, and local-to-cloud bootstrap into a single unified data hook (`src/hooks/useUserData.js`), remove `src/hooks/useCloudSync.js`, remove unused `src/utils/saveToLocalStorage.js`, and route every Firestore operation in `src/App.jsx`, `src/hooks/useWorkout.js`, and `src/hooks/useAuth.js` through `useUserData`.

### In Scope (Phase 4 Group 1)
- **Item 4.1 — Unified Data Layer (`src/hooks/useUserData.js`):**
  - Exposes `profile`, `plan`, `workouts`, `status` (`'loading' | 'ready' | 'error'`), `error`, `isSynced`, `syncError`, `retrySync`, promise-returning mutation methods (`savePlan`, `updatePlan`, `addWorkout`, `resetProgram`, `deleteAll`), and `clearLocalData`.
  - Routes all Firestore reads/writes in `App.jsx`, `useWorkout.js`, and `useAuth.js` through `useUserData` (no direct `firestoreService` imports in `src/App.jsx`, `src/hooks/useWorkout.js`, `src/hooks/useAuth.js`, `src/features/**`, or `src/components/**`).
  - Preserves all Phase 1 & Phase 3 contracts (`users/{uid}` + `users/{uid}/workouts/{autoId}` schema, `stripUndefined`, offline cache, `retrySync`, `resetProgram` history preservation, `useAuth` strict deletion order, synchronous double-submit guards, awaited-write semantics, and distinct sync-pending vs. sync-failed UX).
  - Keeps full `AppContext` compatibility (`userData: { profile, plan, history: workouts }`, `isSynced`, `syncError`, `retrySync`, `handleSavePlan`, `handleResetSystem`) while exposing first-class `useUserData` fields ready for Phase 6 (`AuthContext` / `DataContext` split).
- **Item 4.5 — Absorb `useCloudSync` into `useUserData`:**
  - Move initial cloud fetch (`getUserData`, `getWorkouts`), legacy `history` migration (`migrateLegacyHistory`), pre-login local-to-cloud bootstrap, sync-state tracking (`status` / `error` / `isSynced` / `syncError` / `retrySync`), and post-sync callback (`onSyncComplete`) into `src/hooks/useUserData.js`.
  - Delete `src/hooks/useCloudSync.js` and `src/hooks/useCloudSync.test.jsx`.
- **Item 4.4 — Legacy `localStorage` Cleanup:**
  - Delete unused `src/utils/saveToLocalStorage.js`.
  - Confirm zero non-test `localStorage` references remain outside `src/services/storage/activeWorkoutStore.js`.

### Explicitly Out of Scope (Deferred)
- **Item 4.2** (optimistic local state updates with rollback on write failure) — deferred to Phase 4 Group 2. Keep strict awaited-write semantics: local state mutates **only after** the Firestore promise resolves.
- **Item 4.3** (`onSnapshot` real-time listeners replacing `getDoc`/`getDocs`) — deferred to optional Phase 4 Group 3.
- **CSS / Visual Changes:** **None.** All existing banners, spinners, modals, and buttons keep identical classes and markup. The `styler` stage can be skipped.
- **Data Shape Changes:** **None.** Persisted Firestore (`users/{uid}`, `users/{uid}/workouts/{autoId}`) and `localStorage` (`fitgen:active:v1`) shapes remain unchanged.

---

## 2. Exact File List

### Create
- `src/hooks/useUserData.js` — unified data + cloud sync hook wrapping `firestoreService`.
- `src/hooks/useUserData.test.jsx` — unit test suite replacing `useCloudSync.test.jsx` and covering all `useUserData` sync, lifecycle, guard, and mutation behaviors.

### Modify (Product Code)
- `src/App.jsx` — replace `useState(userData)` + `useCloudSync` + direct `firestoreService` calls with `useUserData(user, { onSyncComplete: handleSyncComplete })`; expose unified data properties and backwards-compatible `userData` on `AppContext`; remove `setUserData` bypass setter.
- `src/hooks/useWorkout.js` — remove `firestoreService` import and `setUserData` usage; delegate plan/workout persistence to `updatePlan` and `addWorkout` from `AppContext`; support both `status` and legacy `isSynced`/`syncError` sync-guard checks before AI generation and writes.
- `src/hooks/useAuth.js` — remove `firestoreService` import; accept `deleteAll` in `useAuth({ user, clearStorage, setShowAuth, deleteAll } = {})` and invoke `await deleteAll()` at Stage 2 of `handleDeleteAccount`.
- `src/components/screens/ProfileScreen.jsx` — read `deleteAll` from `useAppContext()` and pass it to `useAuth({ user, clearStorage, deleteAll })`.

### Delete
- `src/hooks/useCloudSync.js`
- `src/hooks/useCloudSync.test.jsx`
- `src/utils/saveToLocalStorage.js`

### Modify (Test Code — `tester` only)
- `src/hooks/useAuth.test.js` — remove `firestoreServices` mock; inject `deleteAll` mock and assert strict ordering + error handling (including missing `deleteAll` fail-closed guard).
- `src/hooks/useWorkout.test.jsx` — remove `firestoreServices` mock; provide `updatePlan` and `addWorkout` via `AppContext.Provider` and test both `status`-based and `isSynced`/`syncError`-based sync guards.
- `src/components/screens/ProfileScreen.test.jsx` — remove `firestoreServices` mock; provide `deleteAll` in `createContextValue` and assert call order in the Delete Account modal flow.
- `src/features/dashboard/PlanDashboard.test.jsx` — remove `firestoreServices` mock; wire `updatePlan` in `renderDashboard` and `StatefulDashboardHarness`.
- `src/features/workout/ActiveWorkout.test.jsx` — remove `firestoreServices` mock; wire `addWorkout` in `renderActiveWorkout`.
- `src/App.test.jsx` — keep `firestoreServices` mock (real `App` -> `useUserData` -> `firestoreService` integration); update the `AppContext` key list assertion (25 keys, no `setUserData`); update `clearStorage` test to populate via `savePlan` + `addWorkout`; add end-to-end `status` / `retrySync` / `deleteAll` integration coverage.

### Unchanged Product & Service Files
- `src/services/firebase/firestoreServices.js` — unchanged (already provides the clean repository boundary: `getUserData`, `saveUserData`, `addWorkout`, `getWorkouts`, `migrateLegacyHistory`, `resetUserProgram`, `deleteUserData`, `stripUndefined`, `normalizeWorkoutEntry`, `buildMigrationWorkoutId`, `COLLECTIONS`). No extra pass-through repository file is needed.
- `src/services/firebase/firebaseHelper.js` — unchanged (keeps `persistentLocalCache` + `persistentMultipleTabManager`).
- `src/services/storage/activeWorkoutStore.js` — unchanged (sole owner of `localStorage` access).
- `src/hooks/useAuthObserver.js` — unchanged.
- `src/context/AppContext.jsx` — unchanged.
- `src/components/screens/LogsScreen.jsx`, `src/features/dashboard/PlanDashboard.jsx`, `src/features/workout/ActiveWorkout.jsx`, `src/features/onboarding/ProfileSetupForm.jsx`, `src/features/workout/DayDetailModal.jsx`, `src/features/auth/AuthModal.jsx`, `src/features/auth/DeleteAccountModal.jsx`, `src/components/layout/Layout.jsx`, `src/features/onboarding/WelcomeScreen.jsx` — unchanged.

---

## 3. Persisted Data Models & Schemas (Unchanged)

No persisted shapes are altered.

### Firestore
1. **User Document — `users/{uid}`**
   ```js
   {
     profile: Profile | null,   // { goal, level, selectedDays, equipment, duration, weeks, exclusions, priorities }
     plan: Plan | null,         // { programName, description, totalWeeks, weeks: Week[] }
     createdAt?: string,        // ISO timestamp (optional existing field)
     updatedAt: string,         // ISO timestamp set on saveUserData / resetUserProgram / migrateLegacyHistory
     // legacy `history` array field is migrated to subcollection and removed via deleteField()
   }
   ```
2. **Workouts Subcollection — `users/{uid}/workouts/{autoId}`** (ordered by `completedAt` ascending on read; deterministic `migrated-w{week}-{day}-{date}` IDs for migrated legacy entries)
   ```js
   {
     id: string,                // Firestore document ID (attached on read/return, not stored inside doc body)
     weekNumber: number,        // non-negative integer, default 0
     dayNumber: number | null,  // integer or null
     dayName: string,           // default ""
     focus: string,             // default ""
     logs: Array<{ name?: string, exercise?: string, sets: Array<{ weight: string, reps: string, completed: boolean }> | number }>,
     duration: number,          // seconds >= 0, default 0
     completedAt: string,       // ISO timestamp string, default ""
   }
   ```

### `localStorage` (Owned Exclusively by `src/services/storage/activeWorkoutStore.js`)
- Versioned key `STORAGE_KEYS.ACTIVE_WORKOUT = "fitgen:active:v1"` (legacy read fallback + cleanup on `"fitgen-active"` and prefix sweep for `"fitgen-active*"` / `"fitgen:active*"`).

---

## 4. Detailed Module Specifications

### 4.1 `src/hooks/useUserData.js`

#### Signature
```js
export function useUserData(user, options = {})
```
- `user`: Firebase Auth user object (`{ uid: string, ... }`) or `null` / `undefined`.
- `options`: optional object:
  - `onSyncComplete?: (hasPlan: boolean) => void` — invoked in the sync effect's `finally` block (guarded by `isMounted`) whenever an authenticated user's sync attempt completes (success or failure). Held in a `useRef` so changing the callback reference does **not** re-trigger Firestore fetches.

#### Internal State & React 19 / ESLint v7 Invariants
To stay 100% compliant with `eslint-plugin-react-hooks` v7 (`react-hooks/set-state-in-effect` and `react-hooks/refs`), **never** call `setState` synchronously inside `useEffect`, and **never** read or write refs during render.

```js
const EMPTY_WORKOUTS = [];
const EMPTY_DATA_STATE = {
  ownerUid: null,
  profile: null,
  plan: null,
  workouts: EMPTY_WORKOUTS,
};
```

- Extract canonical session key: `const uid = user?.uid ?? null;`
- State variables:
  - `const [prevUid, setPrevUid] = useState(uid);`
  - `const [syncAttempt, setSyncAttempt] = useState(0);`
  - `const [syncState, setSyncState] = useState({ uid: null, attempt: 0, status: "ready", error: null });`
  - `const [dataState, setDataState] = useState(EMPTY_DATA_STATE);`
- Refs (updated strictly inside `useEffect`, read strictly inside async callbacks/effects):
  - `currentUidRef = useRef(uid)` — tracks latest `uid` for post-`await` stale-session checks inside mutations.
  - `localDataRef = useRef(dataState)` — tracks latest `dataState` for pre-login local-to-cloud bootstrap inside the sync effect.
  - `onSyncCompleteRef = useRef(onSyncComplete)` — tracks latest `onSyncComplete` callback.
- Render-time `uid` transition reset (identical pattern to `PlanDashboard.jsx` lines 43–55):
  ```js
  if (uid !== prevUid) {
    setPrevUid(uid);
    setSyncState({
      uid: null,
      attempt: syncAttempt,
      status: "ready",
      error: null,
    });
    // Clear previous authenticated user's data immediately on logout (userA -> null)
    // or account switch (userA -> userB).
    // Preserve anonymous/pre-login local data ONLY on null -> user sign-in for bootstrap.
    if (prevUid !== null) {
      setDataState(EMPTY_DATA_STATE);
    }
  }
  ```
  **Why this matters:**
  1. **Logout (`userA -> null`):** Immediately clears `profile`, `plan`, `workouts`, and resets `syncState.uid` to `null`.
  2. **Re-login as the same user (`userA -> null -> userA`):** Because `syncState.uid` was reset to `null` on logout, `isCurrentSync` is `false` when `userA` logs back in, so `status` properly starts at `'loading'` instead of falsely reporting `'ready'` from the previous session.
  3. **Direct account switch (`userA -> userB`):** Immediately clears `userA`'s data before `userB`'s sync effect runs, guaranteeing `userA`'s plan/profile can **never** leak to `userB` or be uploaded to `userB`'s empty cloud doc.
  4. **Pre-login local bootstrap (`null -> userNew`):** Because `prevUid === null`, any local `plan`/`profile` created while logged out stays in `localDataRef` so the sync effect can bootstrap it when cloud has no doc and no workouts.

#### Derived State (Computed on Every Render)
```js
const isCurrentSync = Boolean(
  uid && syncState.uid === uid && syncState.attempt === syncAttempt
);

const status = !uid
  ? "ready"
  : isCurrentSync
    ? syncState.status
    : "loading";

const error = uid && isCurrentSync ? syncState.error : null;
const isSynced = Boolean(uid && status === "ready");
const syncError = uid && status === "error" ? error : null;

const isDataVisible = dataState.ownerUid === uid;
const profile = isDataVisible ? dataState.profile : null;
const plan = isDataVisible ? dataState.plan : null;
const workouts = isDataVisible ? dataState.workouts : EMPTY_WORKOUTS;
```

#### State Transition Table (Distinct Loading/Pending vs. Failed vs. Ready)

| Scenario | `uid` | `status` | `error` | `isSynced` | `syncError` | Visible Data |
|---|---|---|---|---|---|---|
| Logged out initial / after logout | `null` | `'ready'` | `null` | `false` | `null` | `null`, `null`, `[]` (or pre-login local if written while `uid === null`) |
| Authenticated, initial sync in flight | `'u-1'` | `'loading'` | `null` | `false` | `null` | `null`, `null`, `[]` |
| Authenticated, sync succeeded | `'u-1'` | `'ready'` | `null` | `true` | `null` | Hydrated `{ profile, plan, workouts }` |
| Authenticated, sync failed (`err`) | `'u-1'` | `'error'` | `err` | `false` | `err` | Unchanged (empty if initial load failed) |
| Authenticated, `retrySync()` triggered | `'u-1'` | `'loading'` | `null` | `false` | `null` | Retained if same `uid`, error cleared immediately |
| Authenticated, retry succeeded | `'u-1'` | `'ready'` | `null` | `true` | `null` | Hydrated `{ profile, plan, workouts }` |
| Authenticated, retry failed (`err2`) | `'u-1'` | `'error'` | `err2` | `false` | `err2` | Error replaced with `err2`, never masked as `'loading'` |
| User switched (`u-1` -> `u-2`) | `'u-2'` | `'loading'` | `null` | `false` | `null` | Immediately cleared to `null`, `null`, `[]` |

#### Cloud Sync Effect (`useEffect([uid, syncAttempt])`)
1. If `!uid`, return immediately (zero Firestore calls, `onSyncComplete` NOT called).
2. Track `let isMounted = true;` with cleanup `return () => { isMounted = false; };`.
3. Async `syncData()` flow:
   - `let finalHasPlan = false;`
   - `try`:
     1. `const cloudData = await firestoreService.getUserData(uid);`
     2. If `!isMounted`, return.
     3. If `cloudData && Array.isArray(cloudData.history)`:
        - `await firestoreService.migrateLegacyHistory(uid, cloudData.history);`
        - If `!isMounted`, return.
     4. `const cloudWorkouts = await firestoreService.getWorkouts(uid);`
     5. If `!isMounted`, return.
     6. If `cloudData || cloudWorkouts.length > 0`:
        - `setDataState({ ownerUid: uid, profile: cloudData?.profile ?? null, plan: cloudData?.plan ?? null, workouts: cloudWorkouts });`
        - `finalHasPlan = Boolean(cloudData?.plan);`
     7. Else (cloud has neither user doc nor workouts):
        - `const currentLocal = localDataRef.current;`
        - If `currentLocal.ownerUid === null && (currentLocal.plan || currentLocal.profile)`:
          - `await firestoreService.saveUserData(uid, { plan: currentLocal.plan, profile: currentLocal.profile });`
          - If `!isMounted`, return.
          - `setDataState({ ownerUid: uid, profile: currentLocal.profile ?? null, plan: currentLocal.plan ?? null, workouts: EMPTY_WORKOUTS });`
          - `finalHasPlan = Boolean(currentLocal.plan);`
        - Else:
          - `setDataState({ ownerUid: uid, profile: null, plan: null, workouts: EMPTY_WORKOUTS });`
          - `finalHasPlan = false;`
     8. If `isMounted`:
        - `setSyncState({ uid, attempt: syncAttempt, status: "ready", error: null });`
   - `catch (err)`:
     - `console.error("Sync Error:", err);`
     - If `isMounted`:
       - `setSyncState({ uid, attempt: syncAttempt, status: "error", error: err });`
   - `finally`:
     - If `isMounted && onSyncCompleteRef.current`:
       - `onSyncCompleteRef.current(finalHasPlan);`

#### Sync Guard Messages & Helper
Exact error strings preserved for backwards-compatibility with all Phase 1 & Phase 3 specs and UI expectations:
- Pending sync (`uid && status === "loading"`):
  `"Still syncing your data from the cloud. Please try again in a moment."`
- Failed sync (`uid && status === "error"`):
  - `savePlan`: `"Cloud sync failed. Please retry sync before saving your plan."`
  - `updatePlan`: `"Cloud sync failed. Please retry sync before saving changes."`
  - `addWorkout`: `"Cloud sync failed. Please retry sync before saving changes."`
  - `resetProgram`: `"Cloud sync failed. Please retry sync before resetting your program."`

Helper inside `useUserData`:
```js
const assertReadyForWrite = useCallback(
  (failedMessage = SYNC_FAILED_DEFAULT_ERROR) => {
    if (!uid) {
      return;
    }
    if (status === "error") {
      throw new Error(failedMessage);
    }
    if (status !== "ready") {
      throw new Error(SYNC_PENDING_ERROR);
    }
  },
  [uid, status]
);
```

#### Mutation & Control Methods

All 5 mutation methods are `async` (return a `Promise`), preserve strict **awaited-write semantics** (local state updates only after Firestore resolves; on rejection, local state is untouched and the error is rethrown), and check `currentUidRef.current === writeUid` after `await` so late responses after logout/user-switch never mutate the new session's state.

1. **`retrySync()`** (`() => void`)
   - If `!uid`, no-op.
   - Calls `setSyncAttempt((prev) => prev + 1)`.
   - Immediately transitions `status` to `'loading'` and clears `error` / `syncError` until the retry resolves or rejects.

2. **`savePlan(nextPlan, nextProfile)`** (`async (plan, profile) => Promise<{ plan, profile }>`)
   - Calls `assertReadyForWrite("Cloud sync failed. Please retry sync before saving your plan.")`.
   - Captures `const writeUid = uid;`.
   - If `writeUid`: `await firestoreService.saveUserData(writeUid, { plan: nextPlan, profile: nextProfile });`.
   - If `currentUidRef.current === writeUid`:
     `setDataState((prev) => ({ ...prev, ownerUid: writeUid, plan: nextPlan, profile: nextProfile }));`
   - Returns `{ plan: nextPlan, profile: nextProfile }`.

3. **`updatePlan(nextPlan)`** (`async (plan) => Promise<Plan>`)
   - Calls `assertReadyForWrite("Cloud sync failed. Please retry sync before saving changes.")`.
   - Captures `const writeUid = uid;`.
   - If `writeUid`: `await firestoreService.saveUserData(writeUid, { plan: nextPlan });`.
   - If `currentUidRef.current === writeUid`:
     `setDataState((prev) => ({ ...prev, ownerUid: writeUid, plan: nextPlan }));`
   - Returns `nextPlan`.

4. **`addWorkout(workoutPayload)`** (`async (workoutPayload) => Promise<WorkoutLog>`)
   - Calls `assertReadyForWrite("Cloud sync failed. Please retry sync before saving changes.")`.
   - Captures `const writeUid = uid;`.
   - If `writeUid`:
     `savedEntry = await firestoreService.addWorkout(writeUid, workoutPayload);`
   - Else:
     `savedEntry = { id: \`local-${Date.now()}\`, ...workoutPayload };`
   - If `currentUidRef.current === writeUid`:
     `setDataState((prev) => ({ ...prev, ownerUid: writeUid, workouts: [...prev.workouts, savedEntry] }));`
   - Returns `savedEntry`.

5. **`resetProgram()`** (`async () => Promise<void>`)
   - Calls `assertReadyForWrite("Cloud sync failed. Please retry sync before resetting your program.")`.
   - Captures `const writeUid = uid;`.
   - If `writeUid`: `await firestoreService.resetUserProgram(writeUid);`.
   - If `currentUidRef.current === writeUid`:
     `setDataState((prev) => ({ ...prev, ownerUid: writeUid, profile: null, plan: null }));` (preserves `prev.workouts` untouched!).

6. **`deleteAll()`** (`async () => Promise<{ deletedWorkoutsCount: number }>`)
   - **Intentionally NOT sync-guarded** so account deletion works even when initial cloud sync failed or is pending (`firestoreService.deleteUserData(uid)` operates directly on server documents without depending on local state).
   - If `!uid`: `throw new Error("User ID is required to delete user data.");`.
   - Captures `const writeUid = uid;`.
   - `const result = await firestoreService.deleteUserData(writeUid);`
   - If `currentUidRef.current === writeUid`:
     `setDataState({ ownerUid: writeUid, profile: null, plan: null, workouts: EMPTY_WORKOUTS });`
   - Returns `result`.
   - Does **not** clear `activeWorkoutStore` or call `clearStorage`; `useAuth.handleDeleteAccount` clears local storage only after `authService.deleteAccount()` also succeeds.

7. **`clearLocalData()`** (`() => void`)
   - Resets in-memory state via `setDataState(EMPTY_DATA_STATE)` without making any Firestore calls.

#### Exact Return Shape of `useUserData`
```js
return {
  profile,
  plan,
  workouts,
  status,
  error,
  isSynced,
  syncError,
  retrySync,
  savePlan,
  updatePlan,
  addWorkout,
  resetProgram,
  deleteAll,
  clearLocalData,
};
```

---

### 4.2 `src/App.jsx`

- Remove imports of `firestoreService` and `useCloudSync`.
- Import `useUserData` from `./hooks/useUserData`.
- Wire `useAuthObserver` and `useUserData` without circular hook ordering:
  - Keep `clearLocalDataRef = useRef(null)` updated in `useEffect(() => { clearLocalDataRef.current = clearLocalData; }, [clearLocalData]);`.
  - `clearStorage`: calls `clearLocalDataRef.current?.()`, `setActiveWorkout(null)`, `activeWorkoutStore.clear()`.
  - `handleLogoutEvent`: calls `clearStorage()`, `setView("welcome")`.
  - `handleSyncComplete(hasPlan)`: if `view === "welcome"`, calls `setView(hasPlan ? "plan" : "profile")`.
  - `const { user, setUser } = useAuthObserver(handleLogoutEvent);`
  - `const { profile, plan, workouts, status, error, isSynced, syncError, retrySync, savePlan, updatePlan, addWorkout, resetProgram, deleteAll, clearLocalData } = useUserData(user, { onSyncComplete: handleSyncComplete });`
  - Memoize backwards-compatible `userData`:
    `const userData = useMemo(() => ({ profile, plan, history: workouts }), [profile, plan, workouts]);`
- Delegate handlers cleanly:
  ```js
  const handleSavePlan = async (nextPlan, nextProfile) => {
    await savePlan(nextPlan, nextProfile);
    setView("plan");
  };

  const handleResetSystem = async () => {
    await resetProgram();
    activeWorkoutStore.clear();
    setActiveWorkout(null);
    setView("profile");
  };
  ```
- Exact 25 keys exposed on `AppContext.Provider`:
  - Auth: `user`, `setUser`, `showAuth`, `setShowAuth`
  - Unified data layer: `profile`, `plan`, `workouts`, `status`, `error`, `isSynced`, `syncError`, `retrySync`, `savePlan`, `updatePlan`, `addWorkout`, `resetProgram`, `deleteAll`
  - Backwards-compatible composite view: `userData` (`{ profile, plan, history: workouts }`)
  - Shell/orchestration: `view`, `setView`, `activeWorkout`, `setActiveWorkout`, `clearStorage`, `handleSavePlan`, `handleResetSystem`
  - Removed: `setUserData` (prevents raw state bypasses outside `useUserData`).

---

### 4.3 `src/hooks/useWorkout.js`

- Remove `import { firestoreService } from "../services/firebase/firestoreServices";`.
- Read from `useAppContext()`:
  `user`, `status`, `isSynced`, `syncError`, `userData`, `plan: ctxPlan`, `profile: ctxProfile`, `workouts: ctxWorkouts`, `updatePlan`, `addWorkout`, `setView`, `setActiveWorkout`.
- Resolve canonical values with legacy test-harness fallback:
  ```js
  const plan = ctxPlan !== undefined ? ctxPlan : userData?.plan ?? null;
  const profile = ctxProfile !== undefined ? ctxProfile : userData?.profile ?? null;
  const workouts = ctxWorkouts !== undefined ? ctxWorkouts : userData?.history ?? [];
  ```
- Sync guard `assertCloudSynced()`:
  - When `user` is falsy: returns immediately.
  - `isSyncFailed = status === "error" || (!isSynced && Boolean(syncError))` -> throws `new Error(SYNC_FAILED_ERROR)` (`"Cloud sync failed. Please retry sync before saving changes."`).
  - `isSyncPending = !isSyncFailed && (status === "loading" || (status === undefined && !isSynced))` -> throws `new Error(SYNC_PENDING_ERROR)` (`"Still syncing your data from the cloud. Please try again in a moment."`).
  - Keeping this check in `useWorkout` guarantees `handleGenerateNextWeek` rejects **before** calling `generateNextWeekPlan` (avoiding wasted AI requests), while `useUserData` also enforces the guard at the persistence boundary.
- Mutations:
  - `handleGenerateNextWeek(feedback)`:
    1. `assertCloudSynced();`
    2. `const result = await generateNextWeekPlan(profile, plan, workouts, feedback);`
    3. Build immutable `newWeekPlan` with fallback `programName` and `description`.
    4. `await updatePlan(newWeekPlan);`
    5. `setView("plan");`
    6. `return newWeekPlan;`
  - `handleReplaceExercise(weekIndex, dayIndex, exerciseIndex, newExerciseName)`:
    1. `assertCloudSynced();`
    2. Build immutable `newPlan` (guarding `Array.isArray(exercise.alternatives)`).
    3. `await updatePlan(newPlan);`
    4. `return newPlan;`
  - `handleFinishWorkout(log)`:
    1. Synchronous double-submit guard: `if (isFinishingRef.current) return null;`
    2. `assertCloudSynced();`
    3. `isFinishingRef.current = true;`
    4. Inside `try`: build lean `workoutPayload`, `const savedEntry = await addWorkout(workoutPayload);`, `activeWorkoutStore.clear();`, `setActiveWorkout(null);`, `setView("logs");`, `return savedEntry;`.
    5. Inside `finally`: `isFinishingRef.current = false;`.
- Paused-workout handlers (`handleStartWorkout`, `handleResumePausedWorkout`, `handleDiscardAndStartWorkout`) remain unchanged.

---

### 4.4 `src/hooks/useAuth.js` & `src/components/screens/ProfileScreen.jsx`

- **`src/hooks/useAuth.js`:**
  - Remove `import { firestoreService } from "../services/firebase/firestoreServices";`.
  - Signature: `export function useAuth({ user, clearStorage, setShowAuth, deleteAll } = {})`.
  - In `handleDeleteAccount(password)`:
    1. Validate `user && user.uid` -> throw `"No authenticated user found."`
    2. Validate `typeof password === "string" && password.length > 0` -> throw `"Please enter your password to confirm account deletion."`
    3. Validate `typeof deleteAll === "function"` -> throw `"Account deletion is unavailable. Please try again."` (fail-closed before re-authentication).
    4. Stage 1: `await authService.reauthenticate(password)` (on error: map message via `mapReauthErrorMessage`, attach `err.code` and `err.stage = "reauthenticate"`, throw).
    5. Stage 2: `await deleteAll()` (on error: throw `Error("Failed to delete your cloud data. Your account was not deleted. Please try again.")` with `err.code` and `err.stage = "firestore"`).
    6. Stage 3: `await authService.deleteAccount()` (on error: attach `err.code` and `err.stage = "auth"`, preserve `auth/requires-recent-login` vs. generic message, throw).
    7. Stage 4: `activeWorkoutStore.clear()`, call `clearStorage()` if function, return `{ deleted: true }`.
  - `handleSignUp`, `handleLogin`, `handleResetPassword`, `handleLogout` remain unchanged.
- **`src/components/screens/ProfileScreen.jsx`:**
  - Destructure `deleteAll` from `useAppContext()` and pass `{ user, clearStorage, deleteAll }` to `useAuth(...)`. No other changes.

---

### 4.5 Legacy Cleanup (Items 4.5 & 4.4)
- Delete `src/hooks/useCloudSync.js`.
- Delete `src/hooks/useCloudSync.test.jsx`.
- Delete `src/utils/saveToLocalStorage.js`.

---

## 5. Strict Acceptance Criteria (Assertable in Vitest & Static Checks)

### AC-1 — Unified Data Layer Boundary (No Direct Firestore Imports in UI or Feature Hooks)
- `grep -rn firestoreService src/features src/components` returns 0 matches.
- `grep -rn firestoreService src/App.jsx src/hooks/useWorkout.js src/hooks/useAuth.js` returns 0 matches.
- Among non-test files in `src/`, only `src/services/firebase/firestoreServices.js` and `src/hooks/useUserData.js` reference `firestoreService`.

### AC-2 — Legacy Sync & Storage File Removal
- `src/hooks/useCloudSync.js` and `src/hooks/useCloudSync.test.jsx` do not exist; `grep -rn useCloudSync src/` returns 0 matches.
- `src/utils/saveToLocalStorage.js` does not exist; `grep -rn saveToLocalStorage src/` returns 0 matches.
- `grep -rn localStorage src/` (excluding `*.test.*`) matches only `src/services/storage/activeWorkoutStore.js`.

### AC-3 — `useUserData` Lifecycle, Migration, Bootstrap, and Distinct Pending vs. Error States
- When `user` is `null`: `status === 'ready'`, `error === null`, `isSynced === false`, `syncError === null`, `profile === null`, `plan === null`, `workouts === []`; zero Firestore calls; `onSyncComplete` is not called; `retrySync()` is a no-op.
- When `user` signs in: `status` is `'loading'` (`error === null`, `isSynced === false`, `syncError === null`) until `getUserData` -> (optional `migrateLegacyHistory`) -> `getWorkouts` all resolve, then transitions to `status === 'ready'` (`isSynced === true`, `error === null`) with hydrated `profile`, `plan`, `workouts` and calls `onSyncComplete(Boolean(plan))`.
- When cloud doc has legacy `history` array: `migrateLegacyHistory(uid, cloudData.history)` runs strictly after `getUserData` and before `getWorkouts`.
- When cloud has no user doc and no workouts and pre-login local `plan` or `profile` exists (`ownerUid === null`): uploads `{ plan, profile }` (without `history`) via `firestoreService.saveUserData` and calls `onSyncComplete(Boolean(plan))`.
- When cloud doc has `{ plan: null, profile: null }` and non-empty `workouts` (post-Reset-Program reload): hydrates `plan: null`, `profile: null`, `workouts: cloudWorkouts` and calls `onSyncComplete(false)`.
- When any sync step rejects with `err`: `status === 'error'`, `error === err`, `isSynced === false`, `syncError === err` (never masked as `'loading'`), and `onSyncComplete(false)` is called.
- Calling `retrySync()` transitions `'error' -> 'loading'` (clearing `error` / `syncError` immediately), re-runs sync, and reaches `'ready'` on recovery or updates `error` to the new error on repeat failure.

### AC-4 — Session Isolation (Logout, Re-Login, Account Switch, Stale Async Writes)
- Transitioning `user` -> `null` immediately clears `profile`, `plan`, `workouts`, sets `status === 'ready'`, `error === null`, `isSynced === false`, `syncError === null`, and aborts any in-flight sync so late resolutions/rejections do not mutate state or call `onSyncComplete`.
- Logging out and logging back in as the **same** `uid` starts in `status === 'loading'` (`isSynced === false`) and performs a fresh cloud sync.
- Switching directly from `userA` to `userB` immediately clears `userA`'s data, starts in `'loading'`, and **never** bootstraps `userA`'s `plan`/`profile` into `userB`'s empty Firestore doc.
- If `user` logs out while a mutation (`savePlan`, `updatePlan`, `addWorkout`, `resetProgram`, `deleteAll`) is awaiting Firestore, resolving the stale promise does **not** write stale data back into logged-out state.

### AC-5 — `useUserData` Promise-Returning Mutations & Sync Guards (Awaited Semantics)
- `savePlan(plan, profile)`, `updatePlan(nextPlan)`, `addWorkout(payload)`, and `resetProgram()`:
  - When `user` is signed in and `status === 'loading'`: reject with `"Still syncing your data from the cloud. Please try again in a moment."` and make zero Firestore calls.
  - When `user` is signed in and `status === 'error'`: reject with the operation's sync-failed message (`"Cloud sync failed. Please retry sync before ..."`), never the pending message, and make zero Firestore calls.
  - When `status === 'ready'`: await the corresponding `firestoreService` call, update local state **only after** the write resolves, and leave local state untouched while rethrowing on rejection.
  - `resetProgram()` clears only `plan` and `profile` while preserving `workouts`.
  - `savePlan` preserves `workouts`; `updatePlan` preserves `profile` and `workouts`.
- `deleteAll()`:
  - Works even when `status === 'loading'` or `status === 'error'` (not blocked by sync guard).
  - Rejects when `user` is `null` without calling Firestore.
  - Awaits `firestoreService.deleteUserData(uid)`, clears `profile`, `plan`, and `workouts` after resolve, and returns `{ deletedWorkoutsCount }`; leaves state untouched and rethrows on failure.
- `clearLocalData()` resets `profile`, `plan`, `workouts` locally with zero Firestore calls.

### AC-6 — Downstream Consumers (`App`, `useWorkout`, `useAuth`, `ProfileScreen`, `PlanDashboard`, `ActiveWorkout`)
- `App` exposes the exact 25 `AppContext` keys (including `profile`, `plan`, `workouts`, `status`, `error`, `isSynced`, `syncError`, `retrySync`, `savePlan`, `updatePlan`, `addWorkout`, `resetProgram`, `deleteAll`, `userData`, and excluding `setUserData`).
- `App.handleSavePlan` awaits `savePlan` and switches to `"plan"` only on resolve; `App.handleResetSystem` awaits `resetProgram`, clears `activeWorkoutStore` + `activeWorkout`, preserves `workouts`/`history`, and switches to `"profile"` only on resolve.
- `useWorkout` delegates all plan/workout writes to `updatePlan` / `addWorkout`, preserves synchronous double-finish guard (`secondCall` resolves `null`), rejects before calling `generateNextWeekPlan` when sync is pending or failed, and preserves paused-workout conflict/resume flows.
- `useAuth.handleDeleteAccount` enforces strict `validate(user, password, deleteAll) -> authService.reauthenticate -> deleteAll -> authService.deleteAccount -> activeWorkoutStore.clear -> clearStorage` with preserved `stage` (`"reauthenticate" | "firestore" | "auth"`), error codes/messages, and zero `alert()` calls.
- `ProfileScreen` wires `deleteAll` from `AppContext` into `useAuth` and passes all existing Reset Program, Logout, Delete Account, and sync-banner tests.

### AC-7 — Verification Gates
- `npx eslint src api` exits 0 (0 errors, 0 warnings).
- `npm test` exits 0 (all existing unaffected suites + updated suites + new `useUserData.test.jsx` pass).
- `npm run build` exits 0.
