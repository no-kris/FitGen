# Phase 4 — Group 3: Real-Time Multi-Device Sync via `onSnapshot`

**Run ID:** `phase-4-group-3-realtime-sync-2026-11-24`  
**Phase Reference:** `REFACTOR_PLAN.md` — Phase 4 (One data layer), item 4.3 (building on Group 1 `eaba70b` and Group 2 `74b612a`)  
**Designer Role:** `data`

---

## 1. Objective & Scope

Replace the one-time `getUserData` / `getWorkouts` reads in `src/hooks/useUserData.js` with live Firestore `onSnapshot` subscriptions provided by `src/services/firebase/firestoreServices.js`, so updates to `profile`, `plan`, and `workouts` made on another device (or tab) propagate automatically in real time while preserving:

1. All Phase 4 Group 1 contracts (`useUserData` 14-key return shape, `AppContext` 25-key shape, legacy `history` migration, pre-login local bootstrap, `isSynced`/`syncError`/`status` semantics, offline `persistentLocalCache`).
2. All Phase 4 Group 2 optimistic-write & concurrency invariants (`docSliceRef` field-level pending patch overlay, `__optimistic_workout_*` optimistic entries, rollback to latest committed baseline, `sessionEpochRef`/`currentUidRef` isolation, non-optimistic `deleteAll`).
3. Zero changes to persisted Firestore document/subcollection schemas, zero changes to `localStorage` keys/shapes, and zero CSS or visual changes.

---

## 2. Exact Files to Modify

### Product Code (`implementer` only)
1. `src/services/firebase/firestoreServices.js`
   - Import `onSnapshot` from `"firebase/firestore"`.
   - Add `firestoreService.subscribeUserData(userId, onData, onError)`.
   - Add `firestoreService.subscribeWorkouts(userId, onData, onError)`.
   - Keep all 7 existing `firestoreService` methods and all named exports (`COLLECTIONS`, `stripUndefined`, `normalizeWorkoutEntry`, `buildMigrationWorkoutId`) completely unchanged.
2. `src/hooks/useUserData.js`
   - Switch cloud hydration from one-time `getUserData` / `getWorkouts` calls to live `subscribeUserData` / `subscribeWorkouts` subscriptions.
   - Coordinate one-time initial readiness, one-time legacy `history` migration, one-time pre-login bootstrap, and one-time `onSyncComplete` per sync cycle.
   - Reconcile live `users/{uid}` and `users/{uid}/workouts` snapshots with optimistic writes (`docSliceRef` and `workoutSliceRef`), `resetProgram`, `deleteAll`, `clearLocalData`, `retrySync`, and listener errors.

### Test Code (`tester` only)
3. `src/services/firebase/firestoreServices.test.js`
   - Mock `onSnapshot` in `firebase/firestore` mock.
   - Update exported API surface assertion to the 9 sorted keys of `firestoreService`.
   - Add unit tests for `subscribeUserData` and `subscribeWorkouts`.
4. `src/hooks/useUserData.test.jsx`
   - Add `subscribeUserData` and `subscribeWorkouts` to `firestoreServiceMock` and adapt existing sync/mutation tests from one-time `getUserData`/`getWorkouts` stubs to subscription helpers.
   - Add dedicated test suites for live multi-device updates, live snapshot + optimistic write reconciliation (both doc and workout slices, pre-resolve and post-resolve echo timing), mid-session listener errors and `retrySync()` recovery, listener teardown on unmount/logout/UID switch/`deleteAll`/`clearLocalData`, and one-time guards (`onSyncComplete`, legacy migration, bootstrap).
5. `src/App.test.jsx`
   - Add `subscribeUserData` and `subscribeWorkouts` to `firestoreServiceMock` and adapt sync stubs in existing tests to emit snapshots.
   - Add integration coverage verifying live multi-device `plan`/`profile`/`workouts` updates flow through `AppContext` (`userData`, `plan`, `profile`, `workouts`) without re-triggering welcome-view navigation or breaking sync-error banners.

### Explicitly Untouched Files
- `src/App.jsx`, `src/hooks/useWorkout.js`, `src/hooks/useAuth.js`, `src/hooks/useAuthObserver.js`, `src/services/firebase/firebaseHelper.js`, `src/components/**`, `src/features/**`, `src/css/**` — **no changes required**.
- `REFACTOR_PLAN.md`, `MODULARIZATION_TS_PLAN.md`, `firestore.rules` — **do not edit**.

---

## 3. Data Models, Collection Schemas & Ordering Contract

### 3.1 Persisted Firestore Schemas (UNCHANGED)
- **User document:** `users/{uid}`
  ```js
  {
    profile: Profile | null,
    plan: Plan | null,
    createdAt?: string,   // ISO timestamp
    updatedAt: string,    // ISO timestamp
    history?: Array<any>, // Legacy field only; migrated once then deleted via deleteField()
  }
  ```
- **Workouts subcollection:** `users/{uid}/workouts/{autoId | migrated-*}`
  ```js
  {
    weekNumber: number,
    dayNumber: number | null,
    dayName: string,
    focus: string,
    logs: Array<ExerciseLog>,
    duration: number,
    completedAt: string, // ISO timestamp
  }
  ```
- **In-memory normalized workout item returned by `getWorkouts`, `addWorkout`, and `subscribeWorkouts`:**
  ```js
  {
    id: string,          // Firestore doc.id (or __optimistic_workout_<n> / local-* transiently)
    weekNumber: number,
    dayNumber: number | null,
    dayName: string,
    focus: string,
    logs: Array<ExerciseLog>,
    duration: number,
    completedAt: string,
  }
  ```

### 3.2 Explicit Workout Ordering Reconciliation (`completedAt` `"asc"`)
`subscribeWorkouts` **MUST** query `users/{uid}/workouts` with:
```js
query(workoutsRef, orderBy("completedAt", "asc"))
```
**Codebase verification (why `"asc"` is canonical and MUST NOT be changed to `"desc"`):**
1. `firestoreService.getWorkouts` (`src/services/firebase/firestoreServices.js:185`) uses `orderBy("completedAt", "asc")` (asserted in `firestoreServices.test.js:461`).
2. `LogsScreen` (`src/components/screens/LogsScreen.jsx:21-24`) renders `history.slice().reverse()` to display newest workouts first (asserted in `LogsScreen.test.jsx:110-156`).
3. `generateNextWeekPlan` (`src/utils/generateNextWeekPlan.js:25-26`) slices `(history || []).slice(-10)` to take the 10 most recent workouts.
4. `useUserData.addWorkout` appends newly completed workouts to the end of `workouts`.

Changing to `"desc"` would invert `LogsScreen`, feed the oldest 10 workouts to `generateNextWeekPlan`, and mis-order optimistic appends. Therefore, `"asc"` is mandatory.

---

## 4. Specification: Firestore Real-Time Subscription Layer

**File:** `src/services/firebase/firestoreServices.js`

Import `onSnapshot` from `"firebase/firestore"`.

### 4.1 `firestoreService.subscribeUserData(userId, onData, onError)`

**Signature:**
```js
subscribeUserData: (userId, onData, onError) => () => void
```

**Behavior:**
1. **Synchronous validation (before calling `onSnapshot`):**
   - If `!userId`: throw `new Error("User ID is required to subscribe to user data.")`.
   - If `typeof onData !== "function"`: throw `new Error("onData callback is required to subscribe to user data.")`.
   - Never register a listener when validation fails.
2. **Reference:** `const userRef = doc(db, COLLECTIONS.USERS, userId);`
3. **Listener registration:**
   ```js
   return onSnapshot(
     userRef,
     (docSnap) => {
       onData(docSnap.exists() ? docSnap.data() : null);
     },
     (error) => {
       console.error("Error subscribing to user data:", error);
       if (typeof onError === "function") {
         onError(error);
       }
     }
   );
   ```
4. **Callbacks & Return Value:**
   - Calls `onData` with a single argument: `docSnap.data()` when `docSnap.exists()` is `true`, or `null` when `docSnap.exists()` is `false` (100% consistent with `getUserData`).
   - On snapshot error, logs via `console.error("Error subscribing to user data:", error)` and forwards `error` to `onError(error)` if `typeof onError === "function"`.
   - Returns the `unsubscribe` function returned by `onSnapshot`.

### 4.2 `firestoreService.subscribeWorkouts(userId, onData, onError)`

**Signature:**
```js
subscribeWorkouts: (userId, onData, onError) => () => void
```

**Behavior:**
1. **Synchronous validation (before calling `onSnapshot`):**
   - If `!userId`: throw `new Error("User ID is required to subscribe to workouts.")`.
   - If `typeof onData !== "function"`: throw `new Error("onData callback is required to subscribe to workouts.")`.
   - Never register a listener when validation fails.
2. **Query:**
   ```js
   const workoutsRef = collection(
     db,
     COLLECTIONS.USERS,
     userId,
     COLLECTIONS.WORKOUTS
   );
   const q = query(workoutsRef, orderBy("completedAt", "asc"));
   ```
3. **Listener registration:**
   ```js
   return onSnapshot(
     q,
     (snapshot) => {
       const workouts = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
       onData(workouts);
     },
     (error) => {
       console.error("Error subscribing to workouts:", error);
       if (typeof onError === "function") {
         onError(error);
       }
     }
   );
   ```
4. **Callbacks & Return Value:**
   - Calls `onData` with a single argument: an array of `{ id: d.id, ...d.data() }` objects ordered by `completedAt` `"asc"` (empty array `[]` when no docs exist; 100% consistent with `getWorkouts`).
   - On snapshot error, logs via `console.error("Error subscribing to workouts:", error)` and forwards `error` to `onError(error)` if `typeof onError === "function"`.
   - Returns the `unsubscribe` function returned by `onSnapshot`.

### 4.3 Exported `firestoreService` API Surface
Sorted keys (9 total):
```js
[
  "addWorkout",
  "deleteUserData",
  "getUserData",
  "getWorkouts",
  "migrateLegacyHistory",
  "resetUserProgram",
  "saveUserData",
  "subscribeUserData",
  "subscribeWorkouts",
]
```
All 7 pre-existing methods remain intact with unchanged behavior.

---

## 5. Specification: Real-Time Integration in `useUserData`

**File:** `src/hooks/useUserData.js`

### 5.1 Public API Contract (UNCHANGED)
`useUserData(user, options = {})` continues to accept `{ onSyncComplete }` in `options` and return the exact 14 keys:
```js
{
  profile,
  plan,
  workouts,
  status,        // "loading" | "ready" | "error"
  error,         // Error | null
  isSynced,      // boolean: Boolean(uid && status === "ready")
  syncError,     // Error | null: uid && status === "error" ? error : null
  retrySync,
  savePlan,
  updatePlan,
  addWorkout,
  resetProgram,
  deleteAll,
  clearLocalData,
}
```

### 5.2 Internal Slice State Models & Refs

#### A. Document Slice (`docSliceRef`) — unchanged structure from Group 2
```js
function createEmptyDocSlice(nextId = 1) {
  return {
    committed: { plan: null, profile: null },
    committedPlanId: 0,
    committedProfileId: 0,
    pending: [], // Array<{ id, hasPlan, plan, hasProfile, profile }>
    nextId,
  };
}
```
`computeDocState(slice)` overlays `slice.pending` patches (where `patch.id > slice.committedPlanId` for plan and `patch.id > slice.committedProfileId` for profile) onto `slice.committed`.

#### B. Workout Slice (`workoutSliceRef`) — new slice for live snapshot + optimistic reconciliation
```js
function createEmptyWorkoutSlice() {
  return {
    snapshot: EMPTY_WORKOUTS, // Latest authoritative array from subscribeWorkouts
    localEntries: [],         // Ordered list of in-flight / awaiting-echo local addWorkout items
  };
}
```
Each item in `localEntries` has one of two shapes:
- Pending optimistic entry (created synchronously in `addWorkout` before Firestore resolves):
  ```js
  {
    status: "pending",
    tempId: string,           // "__optimistic_workout_<seq>"
    entry: WorkoutEntry,      // normalized 7-field entry with id: tempId
    baselineIds: Set<string>, // IDs present in slice.snapshot at enqueue time
  }
  ```
- Resolved awaiting-echo entry (after `firestoreService.addWorkout` resolves, if `savedEntry.id` is not yet in `slice.snapshot`):
  ```js
  {
    status: "resolved",
    tempId: string,
    entry: WorkoutEntry,      // savedEntry returned by firestoreService.addWorkout
  }
  ```

#### C. Subscription & Deletion-Suppression Refs
- `activeUnsubscribersRef = useRef([])`: holds unsubscribe callbacks for the current active sync cycle.
- `activeHandlersRef = useRef(null)`: holds `{ epoch, onUserSnap, onWorkoutsSnap, onSnapError }` for the active cycle (used only if `deleteAll` fails and needs to replay a snapshot buffered during the failed deletion).
- `deleteSuppressionRef = useRef({ count: 0, bufferedUser: { hasValue: false, value: null }, bufferedWorkouts: { hasValue: false, value: null }, bufferedError: null })`: tracks in-flight `deleteAll` calls so intermediate deletion snapshots do not flicker or partially mutate state while `deleteAll` is pending.

#### D. Idempotent `teardownSubscriptions()` Helper
```js
const teardownSubscriptions = useCallback(() => {
  activeHandlersRef.current = null;
  const unsubs = activeUnsubscribersRef.current;
  activeUnsubscribersRef.current = [];
  for (const unsub of unsubs) {
    if (typeof unsub === "function") {
      try {
        unsub();
      } catch (err) {
        console.error("Error unsubscribing Firestore listener:", err);
      }
    }
  }
}, []);
```
Clearing `activeUnsubscribersRef.current = []` **before** invoking each `unsub()` guarantees each listener is unsubscribed at most once even if teardown is triggered by both an error and unmount cleanup.

### 5.3 Initial Sync Lifecycle, Migration, Bootstrap & `onSyncComplete`

Inside `useEffect(() => { ... }, [uid, syncAttempt])`:

1. **Cycle initialization:**
   - Increment `sessionEpochRef.current += 1` and capture `const runEpoch = sessionEpochRef.current`.
   - Reset `docSliceRef.current = createEmptyDocSlice(docSliceRef.current.nextId)`.
   - Reset `workoutSliceRef.current = createEmptyWorkoutSlice()`.
   - Call `teardownSubscriptions()`.
   - If `!uid`, return immediately (no Firestore calls; `status` is `"ready"`, `isSynced` is `false`, `error`/`syncError` are `null`).

2. **Per-cycle local closure state:**
   - `let isMounted = true;`
   - `let hasFailed = false;`
   - `let hasReceivedInitialUser = false;`
   - `let hasAttachedWorkouts = false;`
   - `let hasHandledInitialWorkouts = false;`
   - `let isInitialReady = false;`
   - `let hasCalledSyncComplete = false;`
   - `let latestUserData = null;`
   - `let latestWorkouts = EMPTY_WORKOUTS;`
   - `const isActive = () => isMounted && !hasFailed && sessionEpochRef.current === runEpoch && currentUidRef.current === uid;`
   - `const fireSyncCompleteOnce = (hasPlan) => { if (!hasCalledSyncComplete && isMounted && currentUidRef.current === uid) { hasCalledSyncComplete = true; onSyncCompleteRef.current?.(hasPlan); } };`

3. **Causal subscription startup sequence (`subscribeUserData` → optional one-time `migrateLegacyHistory` → `subscribeWorkouts`):**
   - **Step A — Subscribe to `users/{uid}`:**
     Call `firestoreService.subscribeUserData(uid, onUserSnap, onSnapError)` inside `try/catch` (any synchronous throw routes to `handleSyncFailure(err)`).
     Immediately after `subscribeUserData` returns `unsubUser`:
     - If `!isActive()`, immediately invoke `unsubUser?.()` and return (prevents listener leaks if `onError` fired synchronously inside `subscribeUserData`).
     - Otherwise push `unsubUser` into `activeUnsubscribersRef.current`.
   - **Step B — First `users/{uid}` snapshot (`!hasReceivedInitialUser`):**
     - Set `hasReceivedInitialUser = true` and `latestUserData = cloudData`.
     - **One-time legacy migration guard:**
       If `cloudData && Array.isArray(cloudData.history)`:
       - Run `firestoreService.migrateLegacyHistory(uid, cloudData.history)` asynchronously.
       - If migration rejects, call `handleSyncFailure(err)` (do **not** attach `subscribeWorkouts`).
       - If migration resolves and `isActive()` is still `true`, call `attachWorkoutsListener()`.
       - Note: While migration is in flight, if a second `users/{uid}` snapshot arrives, `hasReceivedInitialUser` is already `true` and `isInitialReady` is still `false`, so it ONLY updates `latestUserData = nextCloudData` — it **never** re-runs `migrateLegacyHistory` and **never** attaches a second `subscribeWorkouts` listener.
     - Otherwise (no legacy `history` array):
       - Immediately call `attachWorkoutsListener()`.
   - **Step C — Attach `subscribeWorkouts` (`attachWorkoutsListener()`):**
     - Guard: if `!isActive() || hasAttachedWorkouts`, return.
     - Set `hasAttachedWorkouts = true`.
     - Call `firestoreService.subscribeWorkouts(uid, onWorkoutsSnap, onSnapError)` inside `try/catch` (synchronous throw routes to `handleSyncFailure(err)`).
     - Immediately after `subscribeWorkouts` returns `unsubWorkouts`:
       - If `!isActive()`, immediately invoke `unsubWorkouts?.()` and return.
       - Otherwise push `unsubWorkouts` into `activeUnsubscribersRef.current`.
   - **Step D — First `workouts` snapshot (`!hasHandledInitialWorkouts`):**
     - Set `hasHandledInitialWorkouts = true`.
     - `const normalizedWorkouts = Array.isArray(cloudWorkouts) ? cloudWorkouts : EMPTY_WORKOUTS;`
     - `latestWorkouts = normalizedWorkouts;`
     - **Check cloud data vs. one-time pre-login local bootstrap:**
       - If `latestUserData || latestWorkouts.length > 0`:
         - Finalize hydration synchronously:
           - `hydratedProfile = latestUserData?.profile ?? null`
           - `hydratedPlan = latestUserData?.plan ?? null`
           - `hydratedWorkouts = latestWorkouts`
           - `finalHasPlan = Boolean(hydratedPlan)`
           - Commit baseline + set `status: "ready"` + fire `onSyncComplete(finalHasPlan)` once (see Step E).
       - Else (`latestUserData === null && latestWorkouts.length === 0`):
         - Read `currentLocal = localDataRef.current`.
         - If `currentLocal.ownerUid === null && (currentLocal.plan || currentLocal.profile)`:
           - Run one-time bootstrap: `await firestoreService.saveUserData(uid, { plan: currentLocal.plan, profile: currentLocal.profile })` (do **not** bootstrap pre-login local workouts, matching Group 1/2 contract).
           - While bootstrap `saveUserData` is in flight, `isInitialReady` remains `false`; any echoed `users/{uid}` or `workouts` snapshots simply update `latestUserData` / `latestWorkouts` without re-triggering bootstrap or completing early.
           - If bootstrap `saveUserData` rejects -> `handleSyncFailure(err)` (preserves `localDataRef.current` with `ownerUid: null` so `retrySync()` can retry bootstrap).
           - If bootstrap `saveUserData` resolves and `isActive()`:
             - `hydratedProfile = latestUserData?.profile ?? currentLocal.profile ?? null`
             - `hydratedPlan = latestUserData?.plan ?? currentLocal.plan ?? null`
             - `hydratedWorkouts = latestWorkouts`
             - `finalHasPlan = Boolean(hydratedPlan)`
             - Finalize hydration (Step E).
         - Else (empty cloud & no pre-login local data):
           - Finalize hydration with `{ profile: null, plan: null, workouts: EMPTY_WORKOUTS }`, `finalHasPlan = false` (Step E).
   - **Step E — Finalize Initial Hydration (`finalizeInitialHydration`):**
     - Guard: if `!isActive() || isInitialReady`, return.
     - Set `isInitialReady = true`.
     - Initialize committed slices:
       ```js
       docSliceRef.current = {
         committed: { plan: hydratedPlan, profile: hydratedProfile },
         committedPlanId: 0,
         committedProfileId: 0,
         pending: [],
         nextId: docSliceRef.current.nextId,
       };
       workoutSliceRef.current = {
         snapshot: hydratedWorkouts,
         localEntries: [],
       };
       ```
     - `setDataState({ ownerUid: uid, profile: hydratedProfile, plan: hydratedPlan, workouts: hydratedWorkouts });`
     - `setSyncState({ uid, attempt: syncAttempt, status: "ready", error: null });`
     - `fireSyncCompleteOnce(finalHasPlan);`

4. **Subsequent live snapshots (when `isInitialReady === true`):**
   - **NEVER** re-run `migrateLegacyHistory`.
   - **NEVER** re-run pre-login bootstrap.
   - **NEVER** re-invoke `onSyncComplete`.
   - Reconcile live updates into `docSliceRef` / `workoutSliceRef` and `dataState` as defined in Sections 5.4 and 5.5.

5. **Effect cleanup (`return () => { ... }`):**
   - Set `isMounted = false`.
   - Call `teardownSubscriptions()`.

### 5.4 Live `users/{uid}` Snapshot Reconciliation with `docSliceRef`

When `onUserSnap(cloudData)` fires after `isInitialReady === true`:
1. Guard: if `!isActive()`, return.
2. Deletion suppression guard: if `deleteSuppressionRef.current.count > 0`, store `deleteSuppressionRef.current.bufferedUser = { hasValue: true, value: cloudData }` and return.
3. Update the committed baseline while keeping `committedPlanId`, `committedProfileId`, and `pending` intact:
   ```js
   const slice = docSliceRef.current;
   slice.committed = {
     plan: cloudData?.plan ?? null,
     profile: cloudData?.profile ?? null,
   };
   const nextDoc = computeDocState(slice);
   setDataState((prev) => ({
     ...prev,
     ownerUid: uid,
     plan: nextDoc.plan,
     profile: nextDoc.profile,
   }));
   ```

**Guaranteed invariants:**
- **Remote update while idle (`pending` empty):** immediately updates `plan` and `profile` to match the live snapshot (including `{ plan: null, profile: null }` when another device resets the program or deletes the doc), without touching `workouts`.
- **Remote update while local write is in flight (`pending` non-empty):**
  - Fields touched by an active pending patch (with `patch.id > committedPlanId` / `committedProfileId`) retain their optimistic local value (live snapshots never clobber in-flight local edits).
  - Fields NOT touched by pending patches (e.g., remote `profile` change while local `updatePlan` is in flight) update immediately.
  - If the in-flight local write later **rejects**, removing the patch from `pending` and calling `computeDocState(slice)` rolls back to the **latest committed live snapshot baseline** (not stale pre-snapshot state!).
  - If an older patch `#1` resolves late after newer patch `#2` already committed (`1 <= committedPlanId`), `#1` still does not regress `slice.committed` or overwrite a newer remote snapshot.

### 5.5 Live `users/{uid}/workouts` Snapshot Reconciliation with `workoutSliceRef`

#### Helper: Pre-resolve echo matching
```js
function isMatchingWorkoutEcho(snapshotDoc, optimisticEntry) {
  if (!snapshotDoc || !optimisticEntry) {
    return false;
  }
  if (
    typeof optimisticEntry.completedAt !== "string" ||
    optimisticEntry.completedAt === "" ||
    snapshotDoc.completedAt !== optimisticEntry.completedAt
  ) {
    return false;
  }
  const snapshotLogsLen = Array.isArray(snapshotDoc.logs)
    ? snapshotDoc.logs.length
    : 0;
  const optimisticLogsLen = Array.isArray(optimisticEntry.logs)
    ? optimisticEntry.logs.length
    : 0;

  return (
    snapshotDoc.weekNumber === optimisticEntry.weekNumber &&
    snapshotDoc.dayNumber === optimisticEntry.dayNumber &&
    snapshotDoc.dayName === optimisticEntry.dayName &&
    snapshotDoc.focus === optimisticEntry.focus &&
    snapshotDoc.duration === optimisticEntry.duration &&
    snapshotLogsLen === optimisticLogsLen
  );
}
```

#### Helper: `computeWorkouts(slice)`
```js
function computeWorkouts(slice) {
  if (slice.localEntries.length === 0) {
    return slice.snapshot;
  }

  const snapshotIds = new Set(
    slice.snapshot.map((w) => w?.id).filter((id) => id != null)
  );
  const matchedEchoIds = new Set();
  const tail = [];

  for (const item of slice.localEntries) {
    if (item.status === "resolved") {
      if (item.entry?.id != null && snapshotIds.has(item.entry.id)) {
        continue;
      }
      tail.push(item.entry);
    } else {
      const echoMatch = slice.snapshot.find(
        (doc) =>
          doc?.id != null &&
          !item.baselineIds.has(doc.id) &&
          !matchedEchoIds.has(doc.id) &&
          isMatchingWorkoutEcho(doc, item.entry)
      );
      if (echoMatch) {
        matchedEchoIds.add(echoMatch.id);
      } else {
        tail.push(item.entry);
      }
    }
  }

  if (tail.length === 0) {
    return slice.snapshot;
  }

  return [...slice.snapshot, ...tail];
}
```

#### Live `onWorkoutsSnap(cloudWorkouts)` reconciliation (when `isInitialReady === true`)
1. Guard: if `!isActive()`, return.
2. Deletion suppression guard: if `deleteSuppressionRef.current.count > 0`, store `deleteSuppressionRef.current.bufferedWorkouts = { hasValue: true, value: cloudWorkouts }` and return.
3. Update `workoutSliceRef.current`:
   ```js
   const nextSnapshot = Array.isArray(cloudWorkouts)
     ? cloudWorkouts
     : EMPTY_WORKOUTS;
   const nextIds = new Set(
     nextSnapshot.map((w) => w?.id).filter((id) => id != null)
   );
   const slice = workoutSliceRef.current;
   slice.snapshot = nextSnapshot;
   slice.localEntries = slice.localEntries.filter(
     (item) =>
       !(
         item.status === "resolved" &&
         item.entry?.id != null &&
         nextIds.has(item.entry.id)
       )
   );
   const nextWorkouts = computeWorkouts(slice);
   setDataState((prev) => ({
     ...prev,
     ownerUid: uid,
     workouts: nextWorkouts,
   }));
   ```

#### Updated `addWorkout(workoutPayload)` reconciliation (authenticated path)
1. Assert ready for write (`assertReadyForWrite(SYNC_FAILED_DEFAULT_ERROR)`).
2. Logged-out path (`!writeUid`): unchanged (appends `local-*` entry directly to `dataState.workouts`).
3. Authenticated path (`writeUid` truthy):
   - Capture `writeEpoch = sessionEpochRef.current`.
   - Create `tempId = "__optimistic_workout_" + (optimisticWorkoutSeqRef.current++)`.
   - Build `optimisticEntry = buildOptimisticWorkoutEntry(tempId, workoutPayload, new Date().toISOString())`.
   - Capture `baselineIds = new Set(workoutSliceRef.current.snapshot.map((w) => w?.id).filter((id) => id != null))`.
   - Push `{ status: "pending", tempId, entry: optimisticEntry, baselineIds }` to `workoutSliceRef.current.localEntries`.
   - Update `dataState.workouts` with `computeWorkouts(workoutSliceRef.current)`.
   - `try`:
     - `const savedEntry = await firestoreService.addWorkout(writeUid, workoutPayload);` (forwarding `workoutPayload` verbatim without mutation).
     - If `sessionEpochRef.current === writeEpoch && currentUidRef.current === writeUid`:
       - `const slice = workoutSliceRef.current;`
       - Check if `savedEntry?.id != null && slice.snapshot.some((w) => w?.id === savedEntry.id)`:
         - **Case A (`onSnapshot` already echoed `savedEntry.id` BEFORE `addWorkout` resolved):** remove `tempId` from `slice.localEntries` so there is strictly one entry (the authoritative snapshot entry).
         - **Case B (`addWorkout` resolved BEFORE `onSnapshot` echoed `savedEntry.id`):** replace the `tempId` item **in place** in `slice.localEntries` with `{ status: "resolved", tempId, entry: savedEntry }` (preserving exact in-place ordering for concurrent out-of-order `addWorkout` calls; later pruned automatically when `onSnapshot` echoes `savedEntry.id`).
       - Update `dataState.workouts` with `computeWorkouts(slice)`.
     - Return `savedEntry`.
   - `catch (err)`:
     - If `sessionEpochRef.current === writeEpoch && currentUidRef.current === writeUid`:
       - Remove `tempId` from `workoutSliceRef.current.localEntries`.
       - Update `dataState.workouts` with `computeWorkouts(workoutSliceRef.current)`.
     - Rethrow `err`.

**Traced timing guarantees:**
- **`onSnapshot` arrives AFTER `addWorkout` resolves:** `tempId` reconciles in place to `savedEntry`; when `onSnapshot` subsequently echoes `savedEntry.id`, the `resolved` item is pruned from `localEntries` -> zero duplicates.
- **`onSnapshot` echoes `savedEntry` BEFORE `addWorkout` resolves (standard real-Firestore latency compensation & offline mode):** `isMatchingWorkoutEcho` suppresses `tempId` immediately (zero transient duplicates while pending/offline!), and when `addWorkout` resolves, Case A removes `tempId` -> zero duplicates even if `completedAt` differed!
- **Remote workout from Device B arrives BEFORE local `addWorkout` resolves:** `isMatchingWorkoutEcho` is `false` -> `workouts` displays `[...existing, remoteWorkout, optimisticEntry]` (remote workout appears live AND optimistic entry stays visible until settled).
- **Concurrent `addWorkout` #1 & #2 resolving out of order (#2 before #1) or one failing:** in-place replacement in `localEntries` preserves exact Group 2 ordering (`[base, temp1, doc2]` → `[base, doc1, doc2]` or `[base, doc2]`).

### 5.6 Listener Error, Distinct Loading vs. Error UX State, & `retrySync()` Lifecycle

#### Distinct States (Errors NEVER Masked by Loading)
| Condition | `status` | `isSynced` | `error` | `syncError` | Write Guards |
|---|---|---|---|---|---|
| Signed out (`uid === null`) | `"ready"` | `false` | `null` | `null` | Allowed (local-only, zero Firestore writes) |
| Initial sync or `retrySync()` in flight | `"loading"` | `false` | `null` | `null` | Reject with `SYNC_PENDING_ERROR` |
| Initial sync failed OR mid-session listener error | `"error"` | `false` | `err` | `err` | Reject with operation-specific sync-failed error |
| Both initial snapshots ready & listeners healthy | `"ready"` | `true` | `null` | `null` | Allowed (optimistic + Firestore write) |

#### Error Handling (`handleSyncFailure(err)`)
Triggered by:
- `subscribeUserData` `onError` callback (initial or mid-session)
- `subscribeWorkouts` `onError` callback (initial or mid-session)
- Synchronous throw from `subscribeUserData` or `subscribeWorkouts`
- Rejection of `migrateLegacyHistory` during initial sync
- Rejection of bootstrap `saveUserData` during initial sync

Steps inside `handleSyncFailure(err)`:
1. Guard: if `!isActive()`, return (ignore stale errors from previous sessions/epochs or already-failed cycles).
2. Deletion suppression guard: if `deleteSuppressionRef.current.count > 0`, store `deleteSuppressionRef.current.bufferedError = err` and return.
3. Set `hasFailed = true`.
4. Log `console.error("Sync Error:", err)`.
5. Increment `sessionEpochRef.current += 1` (invalidates any in-flight optimistic writes and any trailing sibling listener callbacks from this broken cycle).
6. Call `teardownSubscriptions()` immediately so **both** listeners stop delivering partial/stale updates.
7. Clear pending optimistic overlays (`docSliceRef.current.pending = []`, `workoutSliceRef.current.localEntries = []`) while **preserving** the currently visible `dataState` (so UI retains rendered data alongside the error banner and Retry Sync action, matching existing Group 1/2 behavior).
8. Call `setSyncState({ uid, attempt: syncAttempt, status: "error", error: err })`.
9. Call `fireSyncCompleteOnce(false)` — fires **only** if `onSyncComplete` has not yet fired for this sync cycle (so initial failure notifies `onSyncComplete(false)` once, whereas a mid-session error after initial `ready` does **not** re-invoke `onSyncComplete`).

#### `retrySync()` Behavior
```js
const retrySync = useCallback(() => {
  if (!uid) {
    return;
  }
  sessionEpochRef.current += 1;
  teardownSubscriptions();
  docSliceRef.current = {
    ...docSliceRef.current,
    pending: [],
  };
  workoutSliceRef.current = {
    ...workoutSliceRef.current,
    localEntries: [],
  };
  setSyncAttempt((prev) => prev + 1);
}, [uid, teardownSubscriptions]);
```
- When `uid === null`: strict no-op.
- When `uid !== null`:
  - Immediately tears down any active listeners and invalidates in-flight optimistic writes via `sessionEpochRef`.
  - Incrementing `syncAttempt` immediately flips `isCurrentSync` to `false` on render, transitioning `status` to `"loading"`, `error` to `null`, `syncError` to `null`, `isSynced` to `false`.
  - Triggers `useEffect([uid, syncAttempt])` to start a fresh subscription cycle with fresh one-time guards (`hasCalledSyncComplete = false`, etc.).

### 5.7 `resetProgram`, `deleteAll`, and `clearLocalData` Interactions

1. **`resetProgram()`:**
   - Guarded by `assertReadyForWrite(SYNC_FAILED_RESET_ERROR)`.
   - Uses `runOptimisticDocWrite` with `{ hasPlan: true, plan: null, hasProfile: true, profile: null }` and `firestoreService.resetUserProgram(writeUid)`.
   - Preserves `workouts` completely; live `users/{uid}` snapshot `{ plan: null, profile: null }` reconciles cleanly with `docSliceRef`; remote `resetProgram` from another device updates `plan`/`profile` to `null` while keeping `workouts` intact.

2. **`deleteAll()`:**
   - Bypasses `assertReadyForWrite` (must work in `"loading"`, `"error"`, and `"ready"` states; throws `"User ID is required to delete user data."` when `!uid`).
   - Remains **non-optimistic** (does not clear `profile`/`plan`/`workouts` while `firestoreService.deleteUserData` is pending).
   - Increments `deleteSuppressionRef.current.count += 1` before `await firestoreService.deleteUserData(writeUid)` so partial batch-delete snapshots do not mutate state while deletion is in flight.
   - **On resolve:**
     - Decrements `deleteSuppressionRef.current.count` to 0 and clears any buffered suppressed events.
     - If `sessionEpochRef.current === writeEpoch && currentUidRef.current === writeUid`:
       - Increments `sessionEpochRef.current += 1`.
       - Calls `teardownSubscriptions()` so active `onSnapshot` listeners are **unsubscribed before `authService.deleteAccount()` runs** (preventing `permission-denied` listener errors and preventing any subsequent snapshot from resurrecting deleted state!).
       - Resets `docSliceRef.current` and `workoutSliceRef.current`.
       - Sets `dataState` to `{ ownerUid: writeUid, profile: null, plan: null, workouts: EMPTY_WORKOUTS }`.
     - Returns `result`.
   - **On reject:**
     - Decrements `deleteSuppressionRef.current.count`.
     - Leaves state untouched and listeners **alive**; if any snapshot/error was buffered while the failed `deleteAll` was pending and `count === 0` in the same epoch, replays it so initial sync cannot hang.
     - Rethrows the error.

3. **`clearLocalData()`:**
   - Increments `sessionEpochRef.current += 1`.
   - Calls `teardownSubscriptions()` (prevents any active listener from resurrecting cleared data).
   - Resets `docSliceRef.current` and `workoutSliceRef.current`.
   - Sets `dataState` to `EMPTY_DATA_STATE`.
   - Makes zero Firestore write calls.

### 5.8 Session Transitions & Cleanup Guarantees
- **Unmount:** `useEffect` cleanup calls `teardownSubscriptions()`; every attached unsubscribe callback is called once, and late callbacks are ignored.
- **Logout (`user -> null`):** Render-time `if (uid !== prevUid)` immediately clears `dataState` to `EMPTY_DATA_STATE` and resets `syncState`; effect cleanup tears down all listeners; late callbacks and in-flight write settlements are ignored.
- **UID switch (`userA -> userB`):** Immediately clears `userA` data, tears down `userA` listeners, bumps `sessionEpochRef`, and subscribes to `userB` without bootstrapping `userA` data into `userB`.
- **Same-UID re-login (`userA -> null -> userA`):** Starts in `status: "loading"`, subscribes freshly under a new `sessionEpochRef`, and ignores late callbacks/writes from Session 1.
- **Callback / object-reference stability:** Changing `options.onSyncComplete` or passing a new `user` object with the same `uid` never unsubscribes or re-subscribes listeners.

---

## 6. Test Plan & Strict Acceptance Criteria (Vitest)

### 6.1 `src/services/firebase/firestoreServices.test.js`
- **Mock updates:** Add `onSnapshot: vi.fn()` to `firestoreMocks` and `firebase/firestore` mock; reset in `beforeEach`.
- **Update existing API surface test:** Assert sorted keys equal the 9 methods (7 existing + `subscribeUserData` + `subscribeWorkouts`).
- **New `firestoreService.subscribeUserData` suite:**
  - **AC-1:** Throws `"User ID is required to subscribe to user data."` synchronously when `userId` is falsy (`""`, `null`, `undefined`) without calling `onSnapshot`.
  - **AC-2:** Throws `"onData callback is required to subscribe to user data."` synchronously when `onData` is not a function without calling `onSnapshot`.
  - **AC-3:** Subscribes to `doc(db, "users", uid)` via `onSnapshot`, forwards `docSnap.data()` when `docSnap.exists()` is `true` and `null` when `docSnap.exists()` is `false`, and returns the exact `unsubscribe` function from `onSnapshot`.
  - **AC-4:** Logs via `console.error("Error subscribing to user data:", err)` and forwards `err` to `onError` when provided; handles omitted `onError` without throwing.
- **New `firestoreService.subscribeWorkouts` suite:**
  - **AC-5:** Throws `"User ID is required to subscribe to workouts."` synchronously when `userId` is falsy without calling `onSnapshot`.
  - **AC-6:** Throws `"onData callback is required to subscribe to workouts."` synchronously when `onData` is not a function without calling `onSnapshot`.
  - **AC-7:** Subscribes to `query(collection(db, "users", uid, "workouts"), orderBy("completedAt", "asc"))` via `onSnapshot`, normalizes every doc to `{ id: d.id, ...d.data() }` (and `[]` when empty), and returns the exact `unsubscribe` function from `onSnapshot`.
  - **AC-8:** Logs via `console.error("Error subscribing to workouts:", err)` and forwards `err` to `onError` when provided; handles omitted `onError` without throwing.

### 6.2 `src/hooks/useUserData.test.jsx`
- **Mock updates:** Add `subscribeUserData: vi.fn()` and `subscribeWorkouts: vi.fn()` to `firestoreServiceMock`; provide clean test helper(s) to capture `{ emitUser, emitUserError, unsubUser, emitWorkouts, emitWorkoutsError, unsubWorkouts }` per subscription.
- **Preserve & adapt all existing Group 1 + Group 2 test cases** (logged-out 14-key return shape, initial loading → ready readiness, legacy migration ordering before `subscribeWorkouts`, pre-login bootstrap without history, reset-program reload hydration, error/retrySync transitions, logout/re-login/UID-switch/mid-write session isolation, sync guards, optimistic savePlan/updatePlan/addWorkout/resetProgram + rollback, non-optimistic `deleteAll`, `clearLocalData`, and all concurrent/out-of-order optimistic write matrices).
- **New real-time sync & lifecycle test cases:**
  - **AC-9 (Live multi-device `users/{uid}` updates):** After initial `ready`, emitting a new `users/{uid}` snapshot updates `plan` and `profile` immediately (including remote reset `{ plan: null, profile: null }` and doc deletion `null`) while preserving `workouts` and **never** calling `onSyncComplete` again.
  - **AC-10 (Live multi-device `workouts` updates):** After initial `ready`, emitting a new `workouts` snapshot updates `workouts` immediately (additions, edits, deletions from another device) while preserving `plan`/`profile` and **never** calling `onSyncComplete` again.
  - **AC-11 (One-time legacy migration guard):** When initial `users/{uid}` has `history: [...]`, `migrateLegacyHistory` runs once before `subscribeWorkouts`; a subsequent live `users/{uid}` snapshot (during or after migration, even if it still carries `history`) **never** re-runs `migrateLegacyHistory` or registers a second `subscribeWorkouts` listener.
  - **AC-12 (One-time pre-login bootstrap guard):** When initial cloud is empty and local pre-login `plan`/`profile` exist, `saveUserData` flushes once; echoed `users/{uid}` / `workouts` snapshots during or after bootstrap **never** trigger a second bootstrap write or second `onSyncComplete`.
  - **AC-13 (`docSliceRef` live reconciliation during in-flight write):** While local `updatePlan(P1)` is pending, a live snapshot `{ plan: P_remote, profile: PR_remote }` updates `profile` immediately to `PR_remote` while keeping optimistic `plan === P1`; if `updatePlan(P1)` then rejects, `plan` rolls back to **`P_remote`** (latest committed baseline, NOT stale `P0`); if it resolves, `plan` stays `P1`.
  - **AC-14 (`workoutSliceRef` live reconciliation — remote workout during pending `addWorkout`):** While local `addWorkout(payloadA)` is pending (`__optimistic_workout_*`), a live `workouts` snapshot containing a different remote workout `w_remote` preserves both (`[...existing, w_remote, optimisticA]`), and resolving `payloadA` reconciles to `[...existing, w_remote, docA]` with zero duplicates.
  - **AC-15 (`workoutSliceRef` live reconciliation — Firestore echo BEFORE `addWorkout` resolves):** While local `addWorkout(payloadA)` is pending, if `subscribeWorkouts` echoes `{ id: "doc-A", ...payloadA }` **before** `addWorkout` resolves, `workouts` contains strictly ONE `"doc-A"` (no duplicate while pending AND no duplicate after `addWorkout` resolves with `"doc-A"`).
  - **AC-16 (`workoutSliceRef` live reconciliation — Firestore echo AFTER `addWorkout` resolves):** After `addWorkout(payloadA)` resolves with `docA`, a subsequent `subscribeWorkouts` snapshot containing `docA` produces strictly ONE `"doc-A"` (zero duplicates).
  - **AC-17 (Listener errors on either subscription — initial & mid-session):**
    - Initial error on `subscribeUserData` or `subscribeWorkouts` transitions `loading -> error` (`error === syncError === err`, `isSynced === false`), tears down all active listeners, fires `onSyncComplete(false)` once, and does not mask error as `loading`.
    - Mid-session error on either `subscribeUserData` or `subscribeWorkouts` after `ready` transitions `ready -> error`, tears down the sibling listener immediately (further sibling snapshots ignored), preserves rendered data, blocks writes with sync-failed errors, and does **not** re-invoke `onSyncComplete`.
    - Calling `retrySync()` transitions immediately `error -> loading` (`error: null`, `syncError: null`), creates fresh subscriptions, recovers to `ready` on fresh snapshots, and invokes `onSyncComplete(hasPlan)` once for the retried cycle.
  - **AC-18 (Listener cleanup & teardown):** Both `unsubUser` and `unsubWorkouts` are called exactly once on:
    - hook unmount,
    - logout (`user -> null`),
    - account switch (`userA -> userB`),
    - `retrySync()`,
    - `deleteAll()` resolution (and late snapshots after `deleteAll` resolve cannot resurrect deleted state; failed `deleteAll` keeps listeners alive and state untouched),
    - `clearLocalData()` (and late snapshots after `clearLocalData` cannot resurrect cleared state).
  - **AC-19 (Synchronous listener error & same-UID rerender stability):**
    - If `subscribeUserData` or `subscribeWorkouts` invokes `onError` synchronously during registration, the returned `unsubscribe` is immediately invoked (zero leaked listeners) and state enters `"error"`.
    - Rerendering with a new `user` object reference having the same `uid` or a new `onSyncComplete` function reference does **not** unsubscribe or re-subscribe listeners.

### 6.3 `src/App.test.jsx`
- **Mock updates:** Add `subscribeUserData` and `subscribeWorkouts` to `firestoreServiceMock` and adapt all existing tests to emit initial snapshots cleanly while preserving all existing assertions (including the 25-key `AppContext` contract, pending vs. error sync guards, optimistic save/reset view pinning, logout hygiene, and anonymous sign-out skipping subscriptions).
- **New integration test:**
  - **AC-20 (End-to-end live multi-device sync through `AppContext`):** After initial hydration (`view === "plan"`), emitting live `users/{uid}` and `workouts` snapshots updates `contextStore.value.plan`, `profile`, `workouts`, and `userData` (`{ profile, plan, history }`) immediately without resetting `view`; emitting a mid-session listener error surfaces `status: "error"` / `syncError` (never masked as loading) and `retrySync()` re-subscribes and recovers cleanly.

### 6.4 Verification Gates
All three gates must exit `0` after implementation and test updates:
1. `npm test` — all existing and new Vitest suites pass with 0 failures.
2. `npx eslint src api` — 0 errors, 0 warnings.
3. `npm run build` — production Vite bundle builds cleanly.
