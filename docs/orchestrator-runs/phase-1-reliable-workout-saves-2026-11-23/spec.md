# Phase 1 Specification: Make Workout Saves Reliable

**Run ID:** `phase-1-reliable-workout-saves-2026-11-23`  
**Phase:** 1 (from `REFACTOR_PLAN.md`)  
**Status:** Ready for approval

---

## 1. Goal & Scope

### Goal
Ensure every completed workout reaches Firestore (including offline via persistent local cache) or surfaces a clear inline error with a **Retry** action while keeping the active workout intact — and prevent history overwrites, duplicate submissions, `undefined`-field rejections, and cross-day paused workout corruption.

### Root Causes Addressed
1. **Unawaited/unchecked writes**: `handleFinishWorkout`, `handleSavePlan`, `handleReplaceExercise`, and `handleGenerateNextWeek` fire Firestore writes without awaiting them or handling errors, clearing active state and navigating away even when writes fail.
2. **Whole-array history overwrite**: Writing `[...history, newLog]` onto `users/{uid}` wipes older entries on cold-start races or multi-device writes.
3. **Day-agnostic paused workout slot**: `fitgen-active` does not track `{ weekNumber, dayNumber }`; resuming a different day copies sets by array index and crashes on corrupt JSON or missing `logs`.
4. **`undefined` fields rejected by Firestore**: `generateNextWeekPlan`'s fallback branch returns `{ weeks: [result] }` without `programName`/`description`, causing `setDoc` to reject with `Unsupported field value: undefined`.
5. **No offline persistence**: `getFirestore(app)` uses an in-memory cache only, losing offline writes on app close.
6. **No initial sync guard**: Writes can execute before initial cloud sync completes, overwriting cloud state or operating on stale local history.

### Explicit Out of Scope (Deferred to Later Phases)
- **Phase 2**: Removing guest/anonymous mode (`GuestBanner`, `signInGuest`, `isGuest`, anonymous rules tightening). Guests remain Firebase Auth users with a `user.uid` in Phase 1.
- **Phase 3**: Unrelated bugs (`profile.sessionDuration` vs `profile.duration`, `parseRestSeconds`, `parseInt(e.sets)` AMRAP default, `PlanDashboard` week-tab jump on `plan` change, `DayDetailModal` in-place prop mutation, account deletion re-auth order, `Reset Program` preserving history, `Logout` clearing active workout, `exclusions`/`priorities` types, `Setup` errors reset).
- **Phase 4**: Full repository abstraction (`useUserData` / `services/repository.js`), `onSnapshot` live listeners, deleting unused `src/utils/saveToLocalStorage.js`.
- **Phases 5–7**: Server-side AI prompts, `AppContext` split, Toast system, CI/emulator rules setup.

---

## 2. Files to Create / Modify

### Product Code (`implementer`)
| Action | Path | Summary of Changes |
|---|---|---|
| **Create** | `src/services/storage/activeWorkoutStore.js` | Versioned `STORAGE_KEYS`, safe `load`/`save`/`clear`/`matchesDay` wrapper around `localStorage` with legacy `fitgen-active` fallback and corruption tolerance. |
| **Modify** | `src/services/firebase/firebaseHelper.js` | Replace `getFirestore(app)` with `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })`. |
| **Modify** | `src/services/firebase/firestoreServices.js` | Add `COLLECTIONS`, `stripUndefined`, `normalizeWorkoutEntry`, `buildMigrationWorkoutId`, `addWorkout`, `getWorkouts`, `migrateLegacyHistory`; harden `saveUserData` to strip `undefined`, strip `history`/`workouts`, set `updatedAt`, await, and rethrow. |
| **Modify** | `src/hooks/useCloudSync.js` | Track and return `{ isSynced, syncError }`; run idempotent `migrateLegacyHistory` when `users/{uid}.history` exists; load `workouts` subcollection via `getWorkouts`; never flip `isSynced` to `true` on sync failure. |
| **Modify** | `src/App.jsx` | Pass `isSynced` and `syncError` from `useCloudSync` into `AppContext`; make `handleSavePlan` async, sync-guarded, and awaited; use `activeWorkoutStore.clear()` in `clearStorage`. |
| **Modify** | `src/hooks/useWorkout.js` | Enforce `isSynced` guard on cloud writes; await all writes and rethrow errors; fall back to previous `plan.programName`/`plan.description` in `handleGenerateNextWeek`; replace `JSON.parse(JSON.stringify)` with immutable updates in `handleReplaceExercise`; save lean workout via `addWorkout` with double-submit guard in `handleFinishWorkout` (clear/navigate only on success); implement day-aware `handleStartWorkout`, `handleResumePausedWorkout`, `handleDiscardAndStartWorkout` using `activeWorkoutStore`. |
| **Modify** | `src/features/workout/ActiveWorkout.jsx` | Replace direct `localStorage` calls with `activeWorkoutStore`; add `isSaving`, `saveError`, and synchronous double-tap ref guard; disable Finish/Exit with spinner (`Loader2`) while saving; show inline error (`role="alert"`) + **Retry** button on failure while keeping workout on screen; prevent post-finish timer tick from re-saving paused workout; add `aria-label` / `aria-busy`. |
| **Modify** | `src/features/dashboard/PlanDashboard.jsx` | Update completion checks to read flat workout entries (`weekNumber`, `dayName`/`dayNumber`) with legacy fallback; render inline paused-workout conflict `Modal` (Resume Paused / Discard & Start / Cancel); handle rejected promise from `handleReplaceExercise`. |
| **Modify** | `src/components/screens/LogsScreen.jsx` | Read flat workout fields (`dayName`, `focus`, `completedAt`, `duration`, `logs`, `id`) with backward-compatible fallback to legacy nested `entry.workout.*`; key list and expansion state by `entry.id ?? index`. |
| **Modify** | `src/utils/generateNextWeekPlan.js` | Read `log.focus ?? log.workout?.focus ?? "Workout"` and guard `Array.isArray(log?.logs)` so generating next week does not crash on the new flat workout entry shape. |
| **Modify** | `src/features/onboarding/ProfileSetupForm.jsx` | `await onSavePlan(plan, formData)` in `handleGenerate` so save failures are caught and displayed in `errors`. |
| **Modify** | `src/components/ui/Button.jsx` | Forward `...rest` props onto `<button>` so `aria-label` and `aria-busy` work on `Button`. |
| **Modify** | `src/components/ui/Modal.jsx` | Add `role="dialog"`, `aria-modal="true"`, `aria-label={title}` on `.modal-content` and `aria-label="Close modal"` on the close button. |

### Styling (`styler`)
| Action | Path | Summary of Changes |
|---|---|---|
| **Modify** | `src/css/index.css` | Add `cursor: not-allowed;` to `button:disabled` and add `.alert-error` semantic class using `:root` tokens (no hardcoded hex, `1rem = 10px`). |

### Tests (`tester`)
| Action | Path | Summary of Coverage |
|---|---|---|
| **Create** | `src/services/firebase/firestoreServices.test.js` | Unit tests for `stripUndefined`, `normalizeWorkoutEntry`, `buildMigrationWorkoutId`, `saveUserData`, `addWorkout`, `getWorkouts`, and idempotent + chunked `migrateLegacyHistory`. |
| **Create** | `src/services/storage/activeWorkoutStore.test.js` | Unit tests (`jsdom`) for `fitgen:active:v1` round-trip, legacy `fitgen-active` fallback, corrupt JSON / missing `logs` handling, `matchesDay`, and `clear`. |
| **Create** | `src/hooks/useCloudSync.test.jsx` | Hook tests (`jsdom`) for `isSynced` lifecycle, migration on first load, subcollection read, error keeping `isSynced: false`, and user reset. |
| **Create** | `src/hooks/useWorkout.test.jsx` | Hook tests (`jsdom`) for sync guard blocking writes, awaited saves & error propagation, `programName`/`description` fallback, double-finish guard, paused workout day-match vs mismatch conflict, and missing `parsed.logs`. |
| **Create** | `src/features/workout/ActiveWorkout.test.jsx` | Component tests (`jsdom`) for Finish disabled + spinner while saving, double-tap creating one write, failed save keeping workout & showing `role="alert"` + Retry, and Retry succeeding. |
| **Create** | `src/features/dashboard/PlanDashboard.test.jsx` | Component tests (`jsdom`) for flat & legacy completion checks and paused-workout conflict modal (Resume Paused vs Discard & Start). |
| **Create** | `src/components/screens/LogsScreen.test.jsx` | Component tests (`jsdom`) for rendering new flat workout entries and migrated/legacy entries without crashing. |

### Firestore Security Rules (Deployment Prerequisite — Not in Repo)
`firestore.rules` and `firebase.json` are **not yet present** in this repository (Phase 0 human task). Before deploying Phase 1 to production, the Firebase project's deployed Firestore rules **must** permit the authenticated owner to read and write the `workouts` subcollection:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      match /workouts/{workoutId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```
*(Phase 2 will add `&& request.auth.token.firebase.sign_in_provider != 'anonymous'` when guest mode is removed.)*

---

## 3. Data Model & Schemas

### 3.1 Firestore: `users/{uid}`
```js
{
  profile: Object | null,   // Existing Profile shape (unchanged)
  plan: Object | null,      // Existing Plan shape (unchanged)
  createdAt?: string,       // Preserved if already present on document
  updatedAt: string,        // ISO-8601 UTC timestamp set by saveUserData / migration
}
```
- `saveUserData` ALWAYS writes with `{ merge: true }` and strips any `history` or `workouts` keys before writing.
- If a legacy `history` array field exists on `users/{uid}`, `migrateLegacyHistory` copies entries to `users/{uid}/workouts/{docId}` and removes `history` with `deleteField()`.

### 3.2 Firestore: `users/{uid}/workouts/{workoutId}`
Stored document shape (minimal lean fields — **never** stores full `workout` plan day, `exercises`, `alternatives`, or nested duplicate `logs`):
```js
{
  weekNumber: number,          // >= 0 integer (default 0 if missing in legacy data)
  dayNumber: number | null,    // integer from day.dayNumber, or null if absent
  dayName: string,             // e.g. "Monday" (default "")
  focus: string,               // e.g. "Push" (default "")
  logs: Array<{
    name: string,
    sets: Array<{
      weight: string,
      reps: string,
      completed: boolean,
    }>,
  }>,
  duration: number,            // elapsed seconds (finite number >= 0, default 0)
  completedAt: string,         // ISO-8601 UTC timestamp ("" only for dateless legacy rows)
}
```
In-memory representation (returned by `getWorkouts` and `addWorkout`, stored in `userData.history` to preserve the canonical `{ profile, plan, history }` context shape):
```js
{
  id: string,                  // Firestore doc ID (auto-ID or deterministic migration ID)
  weekNumber: number,
  dayNumber: number | null,
  dayName: string,
  focus: string,
  logs: Array,
  duration: number,
  completedAt: string,
}
```
- **Read order**: `getDocs(query(collection(db, "users", uid, "workouts"), orderBy("completedAt", "asc")))`. `LogsScreen` continues to display newest-first via `.slice().reverse()`.

### 3.3 Local Storage: Active Paused Workout (`activeWorkoutStore`)
- **Primary key**: `STORAGE_KEYS.ACTIVE_WORKOUT = "fitgen:active:v1"`
- **Legacy key (read fallback & cleanup only)**: `STORAGE_KEYS.LEGACY_ACTIVE_WORKOUT = "fitgen-active"`
- **Stored JSON schema** (`fitgen:active:v1`):
```js
{
  weekNumber: number,          // required finite number
  dayNumber: number | null,    // finite number or null
  dayName: string,             // e.g. "Monday"
  focus: string,               // e.g. "Push"
  workout: Object,             // full Day object with weekNumber (needed to resume from mismatch modal)
  logs: Array | null,          // current exercise set logs (tolerated if missing/non-array on read)
  elapsed: number,             // elapsed seconds (>= 0, default 0)
}
```
- **Validation on read (`load()`)**:
  - Reads `STORAGE_KEYS.ACTIVE_WORKOUT`; if null, falls back to `STORAGE_KEYS.LEGACY_ACTIVE_WORKOUT`.
  - Parses JSON inside `try/catch`; returns `null` on missing, invalid JSON, or non-object payload (never throws).
  - Extracts `weekNumber = parsed.weekNumber ?? parsed.workout?.weekNumber`, `dayNumber = parsed.dayNumber ?? parsed.workout?.dayNumber ?? null`, `dayName = parsed.dayName ?? parsed.workout?.dayName ?? ""`, `focus = parsed.focus ?? parsed.workout?.focus ?? ""`.
  - Requires `typeof weekNumber === "number" && Number.isFinite(weekNumber)` AND `(typeof dayNumber === "number" && Number.isFinite(dayNumber) || (typeof dayName === "string" && dayName.length > 0))`. Otherwise returns `null`.
  - Normalizes `logs: Array.isArray(parsed.logs) ? parsed.logs : null` and `elapsed: typeof parsed.elapsed === "number" && Number.isFinite(parsed.elapsed) && parsed.elapsed >= 0 ? parsed.elapsed : 0`.

---

## 4. Exact Signatures & Contracts

### 4.1 `src/services/firebase/firebaseHelper.js`
```js
import { initializeApp } from "firebase/app";
import {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
```
- Exports `auth` (unchanged) and:
```js
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
```

### 4.2 `src/services/storage/activeWorkoutStore.js`
```js
export const STORAGE_KEYS = {
  ACTIVE_WORKOUT: "fitgen:active:v1",
  LEGACY_ACTIVE_WORKOUT: "fitgen-active",
};

export const activeWorkoutStore = {
  save(payload) {},          // Writes normalized JSON to ACTIVE_WORKOUT; removes LEGACY_ACTIVE_WORKOUT; catches storage errors and logs without throwing.
  load() {},                 // Returns normalized paused workout object or null; never throws; pure read (no mutation).
  clear() {},                // Removes ACTIVE_WORKOUT and LEGACY_ACTIVE_WORKOUT; catches storage errors without throwing.
  matchesDay(saved, day) {}, // Returns true iff saved.weekNumber === day.weekNumber AND (dayNumber matches when both non-null, else non-empty dayName matches).
};
```

### 4.3 `src/services/firebase/firestoreServices.js`
Named exports:
- `export const COLLECTIONS = { USERS: "users", WORKOUTS: "workouts" };`
- `export function stripUndefined(value)`
  - Pure (does not mutate inputs).
  - Plain objects (`Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null`): omits any key whose value is `=== undefined`, recursively strips nested values.
  - Non-plain objects (`Date`, Firestore `FieldValue` such as `deleteField()`, `Timestamp`, etc.): returned untouched.
  - Arrays: recursively strips elements and drops any element that is `=== undefined`.
  - Preserves `null`, `false`, `0`, `""`.
- `export function normalizeWorkoutEntry(rawEntry, fallbackCompletedAt = "")`
  - Accepts either legacy `{ workout: { weekNumber, dayNumber, dayName, focus, date, ... }, logs, duration }` or flat `{ weekNumber, dayNumber, dayName, focus, logs, duration, completedAt }`.
  - Returns `stripUndefined({ weekNumber, dayNumber, dayName, focus, logs, duration, completedAt })` containing **only** those 7 canonical keys.
- `export function buildMigrationWorkoutId(normalizedEntry, index = 0)`
  - Pure & deterministic (never calls `Date.now()`).
  - `dayPart = normalizedEntry.dayNumber != null ? `d${normalizedEntry.dayNumber}` : sanitize(normalizedEntry.dayName || "day")`.
  - `datePart = normalizedEntry.completedAt ? sanitize(normalizedEntry.completedAt) : `idx${index}``.
  - `sanitize(s)` replaces any character outside `[a-zA-Z0-9-]` with `_` and lowercases day names.
  - Returns `migrated-w${normalizedEntry.weekNumber}-${dayPart}-${datePart}`.
- `export const firestoreService = { ... }`:
  - `saveUserData: async (userId, data) => void`
    - Throws if `!userId`.
    - Strips `history` and `workouts` top-level keys from `data` before writing.
    - Adds `updatedAt: new Date().toISOString()` and runs `stripUndefined`.
    - Calls `await setDoc(doc(db, COLLECTIONS.USERS, userId), cleaned, { merge: true })`.
    - Logs and rethrows on error.
  - `getUserData: async (userId) => Object | null`
    - Existing behavior; logs and rethrows on error.
  - `addWorkout: async (userId, workoutData) => WorkoutLog`
    - Throws if `!userId`.
    - Builds `payload = normalizeWorkoutEntry(workoutData, new Date().toISOString())`.
    - Calls `const docRef = await addDoc(collection(db, COLLECTIONS.USERS, userId, COLLECTIONS.WORKOUTS), payload)`.
    - Returns `{ id: docRef.id, ...payload }`.
    - Logs and rethrows on error.
  - `getWorkouts: async (userId) => WorkoutLog[]`
    - Throws if `!userId`.
    - Calls `await getDocs(query(collection(db, COLLECTIONS.USERS, userId, COLLECTIONS.WORKOUTS), orderBy("completedAt", "asc")))`.
    - Returns `snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))`.
    - Logs and rethrows on error.
  - `migrateLegacyHistory: async (userId, legacyHistory) => { migratedCount: number }`
    - Throws if `!userId`.
    - If `!Array.isArray(legacyHistory)`, returns `{ migratedCount: 0 }`.
    - Processes valid object entries in batches of at most `450` writes (below Firestore's 500-op `writeBatch` limit).
    - Each valid entry is written via `batch.set(doc(db, COLLECTIONS.USERS, userId, COLLECTIONS.WORKOUTS, docId), normalized)` using `buildMigrationWorkoutId(normalized, index)`.
    - Only the **final** batch also performs `batch.set(userRef, { history: deleteField(), updatedAt: new Date().toISOString() }, { merge: true })` (even when `legacyHistory` is `[]`, one batch deletes the empty `history` field).
    - Safe to run multiple times: deterministic doc IDs overwrite cleanly without creating duplicates, and if an earlier chunk fails, `users/{uid}.history` remains intact for retry on next load.
    - Logs and rethrows on error.
  - `clearUserData: async (userId) => void` (unchanged in Phase 1).

### 4.4 `src/hooks/useCloudSync.js`
Signature:
```js
export function useCloudSync(user, userData, setUserData, onSyncComplete)
// Returns: { isSynced: boolean, syncError: Error | null }
```
Behavior:
1. Initializes `isSynced = false`, `syncError = null`.
2. When `!user`: sets `isSynced = false`, `syncError = null`, and returns without calling Firestore.
3. When `user` changes (or mounts with `user`): resets `isSynced = false`, `syncError = null`, then runs async `syncData`:
   - `const cloudData = await firestoreService.getUserData(user.uid);`
   - If `cloudData && Array.isArray(cloudData.history)`:
     `await firestoreService.migrateLegacyHistory(user.uid, cloudData.history);`
   - `const cloudWorkouts = await firestoreService.getWorkouts(user.uid);`
   - If `!isMounted`, return early.
   - If `cloudData || cloudWorkouts.length > 0`:
     ```js
     setUserData((prev) => ({
       profile: cloudData?.profile ?? prev.profile,
       plan: cloudData?.plan ?? prev.plan,
       history: cloudWorkouts,
     }));
     finalHasPlan = Boolean(cloudData?.plan);
     ```
   - Else (no cloud doc and no cloud workouts):
     - If `localDataRef.current.plan || localDataRef.current.profile`:
       `await firestoreService.saveUserData(user.uid, { plan: currentLocalData.plan, profile: currentLocalData.profile });`
     - `finalHasPlan = Boolean(currentLocalData.plan);`
   - Sets `setIsSynced(true)` and `setSyncError(null)` **only on success**.
   - On `catch (err)`: logs error, sets `setSyncError(err)`, leaves `isSynced` as `false`.
   - In `finally`: if `isMounted && onSyncCompleteRef.current`, invokes `onSyncCompleteRef.current(finalHasPlan)`.

### 4.5 `src/App.jsx`
- Captures `const { isSynced, syncError } = useCloudSync(user, userData, setUserData, handleSyncComplete);`
- Exposes `isSynced` and `syncError` on `AppContext.Provider`.
- `clearStorage`: resets `userData` and calls `activeWorkoutStore.clear()` (removes direct `localStorage.removeItem`).
- `handleSavePlan = async (plan, profile)`:
  - If `user`:
    - If `!isSynced`, throws `new Error("Still syncing your data from the cloud. Please try again in a moment.")`.
    - `await firestoreService.saveUserData(user.uid, { plan, profile });`
  - Updates `setUserData((prev) => ({ ...prev, plan, profile }))` and `setView("plan")` only after save succeeds.

### 4.6 `src/hooks/useWorkout.js`
Reads `{ user, isSynced, userData, setUserData, setView, setActiveWorkout }` from `useAppContext()`.
Shared sync-guard message constant:
```js
const SYNC_PENDING_ERROR =
  "Still syncing your data from the cloud. Please try again in a moment.";
```
Returned handlers:
1. **`handleGenerateNextWeek(feedback)`** (`async`):
   - If `user && !isSynced`, throws `new Error(SYNC_PENDING_ERROR)`.
   - Calls `await generateNextWeekPlan(profile, plan, history, feedback)`.
   - Builds `newWeekPlan`:
     ```js
     const newWeekPlan = {
       ...plan,
       programName: result.programName || plan.programName,
       description: result.description || plan.description,
       weeks: [...plan.weeks, newWeek],
     };
     ```
   - If `user`, `await firestoreService.saveUserData(user.uid, { plan: newWeekPlan })`.
   - Updates `setUserData((prev) => ({ ...prev, plan: newWeekPlan }))`, calls `setView("plan")`, returns `newWeekPlan`.
   - **Rethrows errors** (never swallows them).
2. **`handleReplaceExercise(weekIndex, dayIndex, exerciseIndex, newExerciseName)`** (`async`):
   - If `user && !isSynced`, throws `new Error(SYNC_PENDING_ERROR)`.
   - Creates updated `newPlan` via immutable `.map()` (no `JSON.parse(JSON.stringify)`), defaulting `ex.alternatives` to `[]` if absent.
   - If `user`, `await firestoreService.saveUserData(user.uid, { plan: newPlan })`.
   - Updates `setUserData((prev) => ({ ...prev, plan: newPlan }))`, returns `newPlan`.
3. **`handleStartWorkout(day)`** (sync):
   - Loads `const saved = activeWorkoutStore.load();`.
   - If `!saved`: `setActiveWorkout(day); setView("active"); return { status: "started" };`.
   - If `activeWorkoutStore.matchesDay(saved, day)`:
     - Syncs `saved.logs` safely against `day.exercises` if `Array.isArray(saved.logs)` (preserving completed sets/weight/reps, syncing current `exercise.name`, initializing empty sets for any extra exercise whose saved log/sets is missing); if `saved.logs` is null/missing, omits `logs` so `ActiveWorkout` builds fresh sets.
     - Calls `setActiveWorkout({ ...day, ...(syncedLogs ? { logs: syncedLogs } : {}), elapsed: saved.elapsed })`, `setView("active")`, returns `{ status: "resumed" }`.
   - Else (paused workout is for a **different** day):
     - Does **not** call `setActiveWorkout` or `setView`.
     - Returns `{ status: "conflict", pausedWorkout: saved, requestedDay: day }`.
4. **`handleResumePausedWorkout(pausedWorkout)`** (sync):
   - Resolves the current plan day matching `pausedWorkout.weekNumber` + `dayNumber`/`dayName`, falling back to `pausedWorkout.workout`.
   - If no target day can be resolved, calls `activeWorkoutStore.clear()` and returns `false`.
   - Syncs `pausedWorkout.logs` safely (tolerating missing `logs`), calls `setActiveWorkout(...)`, `setView("active")`, returns `true`.
5. **`handleDiscardAndStartWorkout(day)`** (sync):
   - Calls `activeWorkoutStore.clear()`, `setActiveWorkout(day)`, `setView("active")`.
6. **`handleFinishWorkout(log)`** (`async`):
   - Uses a `useRef(false)` (`isFinishingRef`) to reject concurrent double-invocations synchronously: if `isFinishingRef.current` is `true`, returns `null` immediately without calling `addWorkout`.
   - If `user && !isSynced`, throws `new Error(SYNC_PENDING_ERROR)`.
   - Sets `isFinishingRef.current = true` inside `try { ... } finally { isFinishingRef.current = false; }`.
   - Builds lean workout payload (`weekNumber`, `dayNumber`, `dayName`, `focus`, `logs`, `duration`, `completedAt: new Date().toISOString()`).
   - If `user`: `savedEntry = await firestoreService.addWorkout(user.uid, workoutPayload)`.
   - Else: `savedEntry = { id: \`local-\${Date.now()}\`, ...workoutPayload }`.
   - **Only on success**:
     1. `setUserData((prev) => ({ ...prev, history: [...prev.history, savedEntry] }))`
     2. `activeWorkoutStore.clear()`
     3. `setActiveWorkout(null)`
     4. `setView("logs")`
     5. `return savedEntry`
   - **On failure**: leaves `activeWorkoutStore`, `activeWorkout`, `userData.history`, and `view` untouched, resets `isFinishingRef.current = false`, and rethrows.

### 4.7 `src/features/workout/ActiveWorkout.jsx`
- Uses `activeWorkoutStore.save(...)` and `activeWorkoutStore.clear()` (zero direct `localStorage` calls).
- Local state & refs:
  - `isSaving` (`boolean`, default `false`)
  - `saveError` (`string | null`, default `null`)
  - `isSubmittingRef = useRef(false)` (blocks synchronous double-tap before React re-renders)
  - `hasFinishedRef = useRef(false)` (blocks trailing auto-save effect after successful finish)
- Auto-save `useEffect`: skips writing when `isSaving || hasFinishedRef.current`.
- Timer `useEffect`: pauses ticking while `isSaving`.
- Top bar:
  - Exit button (`ArrowLeft`): `disabled={isSaving}`, `aria-label="Exit workout"`.
  - Finish trigger button: `disabled={isSaving}`, `aria-busy={isSaving}`, opens Finish confirmation modal (`setSaveError(null); setShowConfirm("finish")`).
- Inline error banner (shown when `saveError && !showConfirm`):
  - `<div role="alert" className="alert-error flex items-center justify-between gap-3 m-4">` (or inside `.p-4` container using `alert-error flex items-center justify-between gap-3`) displaying `saveError` and a `"Retry"` `<Button>` calling `handleConfirmFinish` (`disabled={isSaving}`).
- Confirm Modal (`showConfirm === "exit" | "finish"`):
  - `onClose={() => { if (!isSaving) setShowConfirm(null); }}`
  - When `showConfirm === "finish"`:
    - If `saveError`: renders `<div role="alert" className="alert-error text-lg font-bold">{saveError}</div>`.
    - `Cancel` button: `disabled={isSaving}`.
    - Primary button:
      - `disabled={isSaving}`
      - `aria-busy={isSaving}`
      - `onClick={handleConfirmFinish}`
      - When `isSaving`: renders `<Loader2 className="animate-spin" size={16} aria-hidden="true" />` + `"Saving..."` (accessible text).
      - When not saving: renders `saveError ? "Retry" : "Finish"`.
  - When `showConfirm === "exit"`:
    - `Save` calls `handleSaveProgress()` (via `activeWorkoutStore.save`) and `onClose()`.
    - `Discard` calls `activeWorkoutStore.clear()` and `onClose()`.

### 4.8 `src/features/dashboard/PlanDashboard.jsx` & `src/components/screens/LogsScreen.jsx` & `src/utils/generateNextWeekPlan.js`
- **`PlanDashboard.jsx`**:
  - Completion helper checks:
    ```js
    const isDayCompleted = (day) =>
      history.some((h) => {
        const entryWeek = h?.weekNumber ?? h?.workout?.weekNumber;
        const entryDayName = h?.dayName ?? h?.workout?.dayName;
        const entryDayNumber = h?.dayNumber ?? h?.workout?.dayNumber;
        if (entryWeek !== currentWeek.weekNumber) return false;
        if (entryDayName != null && day.dayName != null) {
          return entryDayName === day.dayName;
        }
        return entryDayNumber != null && entryDayNumber === day.dayNumber;
      });
    ```
  - `allWorkoutsCompleted` uses `currentWeek.schedule.every(isDayCompleted)`.
  - `pausedConflict` state (`null | { pausedWorkout, requestedDay }`):
    - `onStartWorkout={(day) => { const res = handleStartWorkout(day); if (res?.status === "conflict") setPausedConflict(res); }}`
    - Renders `<Modal isOpen={Boolean(pausedConflict)} onClose={() => setPausedConflict(null)} title="Workout In Progress">` with:
      - Descriptive prompt naming the paused week/day (`Week ${pausedWorkout.weekNumber} - ${pausedWorkout.dayName}`) and the requested day (`requestedDay.dayName`).
      - `"Resume Paused"` button -> clears `pausedConflict` and calls `handleResumePausedWorkout(pausedConflict.pausedWorkout)`.
      - `"Discard & Start"` button -> clears `pausedConflict` and calls `handleDiscardAndStartWorkout(pausedConflict.requestedDay)`.
      - `"Cancel"` button -> clears `pausedConflict`.
  - Wraps `onReplaceExercise` call in `async` + `try/catch` setting `error` on failure.
- **`LogsScreen.jsx`**:
  - Reads `dayName = entry?.dayName ?? entry?.workout?.dayName`, `focus = entry?.focus ?? entry?.workout?.focus`, `completedAt = entry?.completedAt ?? entry?.workout?.date`.
  - Keys each card and tracks expanded state with `const entryKey = entry?.id ?? index;`.
  - Preserves existing rendering of both array `log.sets` and legacy non-array `log.sets`.
- **`generateNextWeekPlan.js`**:
  - Safely extracts `const focus = log?.focus ?? log?.workout?.focus ?? "Workout"`, `const exerciseCount = Array.isArray(log?.logs) ? log.logs.length : 0`, `const durationMinutes = Math.floor((log?.duration || 0) / 60)`.

---

## 5. Styling & CSS Contract (`styler`)

`styler` **is needed** for two small additions in `src/css/index.css` (global CSS only; no component CSS imports, no inline styles, no hardcoded hex, `1rem = 10px` scale):

1. Update existing `button:disabled` rule in `src/css/index.css`:
   ```css
   button:disabled {
     opacity: 0.5;
     cursor: not-allowed;
   }
   ```
2. Add semantic `.alert-error` class in `src/css/index.css`:
   ```css
   .alert-error {
     background-color: var(--bg-card);
     border: 1px solid var(--danger);
     border-radius: var(--radius);
     padding: 1.2rem 1.6rem;
     color: var(--danger);
   }
   ```

All other classes used by `ActiveWorkout.jsx` and `PlanDashboard.jsx` already exist in `src/css/index.css` and `src/css/utils.css`:
- `.card`, `.button`, `.btn-primary`, `.btn-muted`, `.btn-danger`, `.text-error`, `.text-lg`, `.font-bold`, `.uppercase`, `.letter-spacing-2`, `.flex`, `.flex-col`, `.items-center`, `.justify-between`, `.justify-center`, `.gap-2`, `.gap-3`, `.w-full`, `.p-2`, `.p-4`, `.animate-spin`.

---

## 6. Acceptance Criteria & Test Plan

### Test Environment Notes (for `tester`)
- `vitest.config.js` already includes `src/**/*.test.{js,jsx}` without `passWithNoTests`.
- `@testing-library/react` and `jsdom` are already installed in `package.json`; `@testing-library/jest-dom` is **not** installed — use native Vitest assertions (`expect(btn.disabled).toBe(true)`, `expect(el.textContent).toContain(...)`, `expect(screen.getByRole("alert")).toBeTruthy()`).
- Opt DOM/component/storage tests into jsdom with `// @vitest-environment jsdom` on line 1, and call `cleanup()` from `@testing-library/react` in `afterEach`.
- Provide `AppContext.Provider` directly in component/hook tests; do not mock `useAppContext`.
- Mock `firestoreService` at the service boundary in hook/component tests; mock `firebase/firestore` only inside `firestoreServices.test.js`. Use `vi.useFakeTimers()` / `vi.setSystemTime()` for deterministic timestamps.

### Verifiable Acceptance Criteria
1. **Offline persistence configured**:
   - `firebaseHelper.js` calls `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })` instead of `getFirestore(app)`.
2. **`stripUndefined` & lean workout schema**:
   - `stripUndefined` removes `undefined` keys at root and nested objects, strips `undefined` items from arrays, preserves `null`/`0`/`false`/`""`, preserves non-plain objects (e.g., `Date` and Firestore `FieldValue`), and does not mutate its input.
   - `normalizeWorkoutEntry` outputs only `{ weekNumber, dayNumber, dayName, focus, logs, duration, completedAt }` (never `workout`, `exercises`, or `alternatives`).
   - `saveUserData` strips `undefined`, omits any accidental `history`/`workouts` field, sets `updatedAt`, uses `{ merge: true }`, and rethrows Firestore errors.
   - `addWorkout` writes to `users/{uid}/workouts` via `addDoc` and returns `{ id, ...payload }`.
   - `getWorkouts` reads `users/{uid}/workouts` ordered by `completedAt` ascending and includes `id` on each returned object.
3. **Idempotent legacy history migration**:
   - `migrateLegacyHistory` writes each legacy `users/{uid}.history` entry to `users/{uid}/workouts/{deterministicId}` and removes `users/{uid}.history` with `deleteField()`.
   - Running `migrateLegacyHistory` twice with the same `legacyHistory` (including entries with missing dates) writes the exact same deterministic document IDs and never creates duplicate workouts.
   - Histories exceeding 450 entries split across multiple batches, deleting `users/{uid}.history` only in the final batch.
   - Empty `legacyHistory: []` deletes the legacy `history` field without error.
4. **Sync guard (`useCloudSync`)**:
   - `isSynced` starts `false`, transitions to `true` only after `getUserData`, optional `migrateLegacyHistory`, and `getWorkouts` succeed, and resets to `false` on logout (`user = null`).
   - If cloud fetch or migration throws, `isSynced` remains `false` and `syncError` is populated.
   - While `user` is set and `isSynced === false`, `handleFinishWorkout`, `handleSavePlan`, `handleReplaceExercise`, and `handleGenerateNextWeek` reject with the sync-pending error and execute **zero** Firestore writes.
5. **Awaited saves, double-tap protection, and failure recovery (`ActiveWorkout` + `useWorkout`)**:
   - While `handleFinishWorkout` is pending, the Finish button is disabled (`disabled === true`, `aria-busy="true"`) and renders a spinner.
   - Clicking Finish twice rapidly (including before re-render) invokes `addWorkout` **once**.
   - On save failure, `activeWorkoutStore` is **not** cleared, the user stays on `ActiveWorkout`, an error is rendered inside `role="alert"`, and clicking **Retry** re-invokes `handleFinishWorkout` and succeeds on the second attempt (clearing storage and switching view to `"logs"`).
   - `handleGenerateNextWeek` falls back to previous `plan.programName` and `plan.description` when `generateNextWeekPlan` omits them, awaits `saveUserData`, and rethrows errors instead of swallowing them.
   - `generateNextWeekPlan` builds its recent history summary from new flat workout entries without throwing.
6. **Day-keyed paused workouts & corruption resilience (`activeWorkoutStore` + `useWorkout` + `PlanDashboard`)**:
   - `activeWorkoutStore` round-trips `{ weekNumber, dayNumber, dayName, focus, workout, logs, elapsed }` under `fitgen:active:v1`, reads legacy `fitgen-active` as fallback, and `clear()` removes both keys.
   - Corrupt JSON, non-object JSON, or missing `weekNumber`/day identity reads as `null` without throwing.
   - Missing `parsed.logs` resumes elapsed time and initializes fresh sets without throwing.
   - Starting the **same** `{ weekNumber, dayNumber }` resumes its saved logs and elapsed time.
   - Starting a **different** day (e.g., pausing Monday and starting Wednesday) does **not** mix sets; `PlanDashboard` displays an inline confirmation `Modal` (`role="dialog"`) letting the user choose **Resume Paused**, **Discard & Start**, or **Cancel**.
7. **Dashboard & Logs compatibility**:
   - `PlanDashboard` marks days complete and enables next-week check-in for both new flat workout entries and legacy nested `workout.*` entries.
   - `LogsScreen` renders day name, focus, duration, exercise count, date, and expandable set details for both new flat entries and legacy nested entries without crashing.
8. **Quality gates**:
   - `npx eslint src api` exits 0.
   - `npm test` exits 0 with all new tests passing.
   - `npm run build` exits 0.
