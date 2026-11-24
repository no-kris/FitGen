# Phase 3 — Group 2 Specification: Account Lifecycle, Data Cleanup & Session Hygiene

**Run ID:** `phase-3-group-2-account-lifecycle-and-hygiene-2026-11-24`  
**Phase Objective (`REFACTOR_PLAN.md`, Phase 3 — Group 2):**
1. **Account deletion order:** Re-authenticate first (`authService.reauthenticate`), then delete all user Firestore data (`users/{uid}/workouts/*` subcollection + `users/{uid}` parent doc in chunked batches `<= 450`), then delete the Firebase Auth user (`authService.deleteAccount`), and only on full success clear local active workout storage and app state. Never leave an Auth account with its Firestore data already deleted due to missing re-authentication.
2. **Reset Program preserves history:** Reset Program clears ONLY `plan` and `profile` (in Firestore `users/{uid}` and local React state) and clears any paused active workout in storage/state, while preserving workout history in both Firestore (`users/{uid}/workouts/*`) and React state (`userData.history`).
3. **Logout session hygiene:** Clear `fitgen:active:v1`, legacy `fitgen-active`, and any `fitgen-active*` / `fitgen:active*` localStorage keys via `activeWorkoutStore.clear()` and reset in-memory session state (`userData`, `activeWorkout`, `view`) cleanly across all logout and session-termination paths.

**Persisted Data Shape Impact:** **NONE.**
- `users/{uid}` remains `{ profile: Profile | null, plan: Plan | null, createdAt?: string, updatedAt: string }`.
- `users/{uid}/workouts/{autoId}` remains `{ weekNumber, dayNumber, dayName, focus, logs, duration, completedAt }`.
- `localStorage` (`fitgen:active:v1`) remains `{ weekNumber, dayNumber, dayName, focus, workout, logs, elapsed }`, and `STORAGE_KEYS` retains its exact 2 keys.
- Only in-memory `AppContext` adds one callback (`retrySync`, bringing `AppContext` from 15 to 16 keys) and `firestoreService` replaces ambiguous `clearUserData` with explicit `resetUserProgram` and `deleteUserData`.

**Styler / CSS Verdict:** **NO CSS file changes required — `styler` does NOT need to be invoked in Stage 6.** All UI states reuse existing verified classes in `src/css/index.css` and `src/css/utils.css` (`.alert-error`, `.animate-spin`, `.button`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-muted`, `.btn-show-password`, `.input`, `.input-bordered`, `.card`, `.opacity-50`, `.relative`, flex/spacing/typography utilities). Zero inline styles and zero hardcoded colors are permitted.

---

## 1. Exact File Plan

### 1.1 Files to Create (`implementer` scope)
| Path | Purpose |
| :--- | :--- |
| `src/features/auth/DeleteAccountModal.jsx` | Password re-authentication confirmation modal for account deletion with show/hide password toggle, inline `role="alert"` error, loading/pending disabled state with spinner, retry on error, and synchronous double-submit guard |

### 1.2 Files to Modify (`implementer` scope)
| Path | Summary of Changes |
| :--- | :--- |
| `src/services/firebase/authServices.js` | Guard `reauthenticate(password)` and `deleteAccount()` against missing `auth.currentUser` / missing `user.email` / empty `password` while keeping exact 7 exported methods and letting Firebase Auth error codes propagate |
| `src/services/firebase/firestoreServices.js` | Replace `clearUserData` (and remove unused `deleteDoc` import) with: (1) `resetUserProgram(userId)` writing `{ plan: null, profile: null, updatedAt }` with `{ merge: true }` on `users/{uid}` without touching `workouts/*`; (2) `deleteUserData(userId)` deleting all `users/{uid}/workouts/*` docs and parent `users/{uid}` in chunked `writeBatch` commits (`<= 450` ops/batch, parent doc always last) |
| `src/services/storage/activeWorkoutStore.js` | Enhance `clear()` to remove `fitgen:active:v1`, `fitgen-active`, and any `localStorage` key starting with `"fitgen-active"` or `"fitgen:active"` while leaving unrelated keys untouched and preserving exact `STORAGE_KEYS` export |
| `src/hooks/useAuth.js` | (1) Rewrite `handleDeleteAccount(password)` to enforce strict order: validate -> `reauthenticate(password)` -> `deleteUserData(user.uid)` -> `deleteAccount()` -> `activeWorkoutStore.clear()` + `clearStorage?.()`; map stage/auth errors, remove `alert()`, and rethrow; (2) Update `handleLogout()` to await `authService.logout()`, then call `activeWorkoutStore.clear()` and `clearStorage?.()` on success, and log + rethrow on failure. Keep `useAuth` hook-free (plain function) and exact 5 returned keys |
| `src/hooks/useCloudSync.js` | Add `retrySync` callback + attempt tracking (without synchronous `setState` in `useEffect`), return `{ isSynced, syncError, retrySync }`, and ensure `cloudData ? (cloudData.profile ?? null)` / `cloudData.plan ?? null` is used so reset `null` values in Firestore are never overwritten by stale local state on reload or re-sync |
| `src/App.jsx` | (1) Destructure `retrySync` from `useCloudSync` and expose it in `AppContext` (16 keys total); (2) Update `clearStorage()` to also call `setActiveWorkout(null)`; (3) Update `handleLogoutEvent()` to call `clearStorage()` and `setView("welcome")`; (4) Update `handleResetSystem()` to guard `!isSynced` (distinguishing `syncError` vs pending), await `firestoreService.resetUserProgram(user.uid)` without swallowing errors, then clear active workout storage/state and clear ONLY `plan` and `profile` in `userData` while preserving `history`, then `setView("profile")`; (5) Update `handleSavePlan()` sync guard to also distinguish `syncError` vs pending |
| `src/components/ui/TextInput.jsx` | Forward `...rest` props onto `<input>` (matches `Button.jsx`) so `disabled`, `autoComplete`, `aria-invalid`, etc. work natively |
| `src/components/screens/ProfileScreen.jsx` | (1) Render distinct cloud-sync status banner when `user && !isSynced` (failed `syncError` with `role="alert"` + **"Retry Sync"** button vs pending `"Syncing your cloud data..."` spinner); (2) Wire `DeleteAccountModal` for `"delete-account"`; (3) Upgrade `"reset"` modal with history-preservation copy, sync-guard handling (failed with Retry Sync vs pending), loading/pending spinner + disabled controls + `useRef` double-submit guard, and inline `role="alert"` error + **Retry**; (4) Upgrade `LOGOUT` button with loading/pending spinner + disabled state + `useRef` double-submit guard, fix `icon={LogOut}` -> `Icon={LogOut}` prop casing, and show inline `role="alert"` error + **Retry** on logout failure |

### 1.3 CSS Files
- **None.** Do **not** edit `src/css/index.css`, `src/css/utils.css`, or `src/css/animations.css`. `styler` is **not** needed in Stage 6.

### 1.4 Test Files to Create / Update (`tester` scope)
| Path | Coverage |
| :--- | :--- |
| `src/services/firebase/authServices.test.js` | `reauthenticate` credential creation & guards (`currentUser` missing, `email` missing, empty password, Firebase error propagation), `deleteAccount` call & guard, exact 7-method surface |
| `src/services/firebase/firestoreServices.test.js` | `resetUserProgram` (merge write of `plan: null, profile: null, updatedAt`, preserves `workouts`, missing `userId`, error rethrow) & `deleteUserData` (0 workouts, small count, exact 450 boundary, >450 chunking with parent doc in final batch, missing `userId`, batch error rethrow, `clearUserData` removed) |
| `src/services/storage/activeWorkoutStore.test.js` | `clear()` removes `fitgen:active:v1`, `fitgen-active`, `fitgen-active*`, `fitgen:active*`, leaves unrelated keys intact, tolerates storage errors, preserves exact `STORAGE_KEYS` |
| `src/hooks/useAuth.test.js` | Strict `handleDeleteAccount(password)` execution order (`reauthenticate` -> `deleteUserData` -> `deleteAccount` -> cleanup), failure abort at each stage (re-auth failure, Firestore failure, Auth delete failure), input/user guards, no `alert()`, and `handleLogout` clearing active storage + `clearStorage` on success vs leaving storage intact and rethrowing on failure |
| `src/hooks/useCloudSync.test.jsx` | `retrySync` recovery after `syncError`, pending -> failed -> pending -> synced transitions, and reload after Reset Program (`{ plan: null, profile: null }` + existing `workouts[]` -> `plan: null`, `profile: null`, `history: workouts`, `onSyncComplete(false)`) |
| `src/features/auth/DeleteAccountModal.test.jsx` | New suite: modal render & accessibility (`role="dialog"`, password label, show/hide toggle `aria-label`), empty password disables submit, pending state (`Deleting...`, `aria-busy`, disabled inputs/buttons, close blocked, double-submit blocked), error state (`role="alert"`, button switches to `"Retry"`, retry succeeds), state reset on reopen |
| `src/components/screens/ProfileScreen.test.jsx` | Sync pending vs `syncError` with **Retry Sync** button, Reset Program modal (history-preservation copy, sync-blocked states, pending spinner, double-submit guard, error + Retry, success), Delete Account modal integration, Logout pending + storage cleanup + error banner with Retry |
| `src/App.test.jsx` | Exact 16 `AppContext` keys (adds `retrySync`), `handleResetSystem` (sync pending guard, `syncError` guard, Firestore failure preserves state/view, success calls `resetUserProgram` and preserves `history` while clearing `plan`, `profile`, `activeWorkout`, and active storage), `handleSavePlan` `syncError` guard, `clearStorage` clears `activeWorkout` + all `fitgen-active*` keys, and `handleLogoutEvent` (on `null` and anonymous auth events) clears `activeWorkout` + `fitgen:active:v1` + `fitgen-active*` keys |

### 1.5 Out of Scope (Do NOT Modify in Phase 3 — Group 2)
- `src/features/dashboard/PlanDashboard.jsx` and `src/features/workout/DayDetailModal.jsx` (Group 3).
- `src/features/onboarding/ProfileSetupForm.jsx` and `exclusions`/`priorities` defaults (Group 4).
- `src/hooks/useWorkout.js` (Phase 1 sync guards already covered; Group 2 does not alter workout execution).
- `src/utils/saveToLocalStorage.js` (Phase 4).
- Unused `Settings` import in `ProfileScreen.jsx` (Phase 6 debt — leave untouched or note; do not expand unrelated diffs).
- `alert()` inside `useAuth.handleSignUp` (existing known debt; only `handleDeleteAccount` removes `alert()` in Group 2).

---

## 2. Data Models, Collection Schemas & Persistence Contracts

### 2.1 Firestore Collections (Unchanged Schemas)

```text
users/{uid}
  profile:    Profile | null
  plan:       Plan | null
  createdAt?: string (ISO-8601, optional, preserved across merge writes)
  updatedAt:  string (ISO-8601)

users/{uid}/workouts/{autoId}
  weekNumber:  number
  dayNumber:   number | null
  dayName:     string
  focus:       string
  logs:        Array<{ name: string, sets: Array<{ weight: string, reps: string, completed: boolean }> }>
  duration:    number
  completedAt: string (ISO-8601)
```

### 2.2 Firestore Operation Semantics

| Operation | Target Path(s) | Write / Delete Mechanism | Subcollection `workouts/*` | Parent `users/{uid}` |
| :--- | :--- | :--- | :--- | :--- |
| `resetUserProgram(userId)` | `users/{userId}` | `setDoc(userRef, { plan: null, profile: null, updatedAt }, { merge: true })` | **UNTOUCHED** (zero reads/writes/deletes) | Preserved with `plan: null`, `profile: null`, fresh `updatedAt`, existing `createdAt` kept |
| `deleteUserData(userId)` | `users/{userId}/workouts/*` then `users/{userId}` | `getDocs(workoutsRef)` then sequential `writeBatch(db)` chunks (`<= 450` deletes/batch) | **ALL DELETED** first | **DELETED** in final batch |

### 2.3 Local Storage Schema (`activeWorkoutStore`)

- `STORAGE_KEYS` (exact object — do NOT add or rename keys):
  ```js
  export const STORAGE_KEYS = {
    ACTIVE_WORKOUT: "fitgen:active:v1",
    LEGACY_ACTIVE_WORKOUT: "fitgen-active",
  };
  ```
- Active-workout key cleanup prefixes (internal constant in `activeWorkoutStore.js`):
  - `"fitgen-active"` (matches `fitgen-active`, `fitgen-active-w1-d1`, `fitgen-active-backup`, etc.)
  - `"fitgen:active"` (matches `fitgen:active:v1`, `fitgen:active:v0`, `fitgen:active:v2`, etc.)
- Unrelated `localStorage` keys (e.g., `"theme"`, Firebase SDK keys, other app keys) MUST NOT be removed by `activeWorkoutStore.clear()`.

---

## 3. Module Contracts & Exact Implementation Details

### 3.1 `src/services/firebase/authServices.js`

Keep exact 7 exported methods on `authService`:
`["deleteAccount", "logout", "reauthenticate", "resetPassword", "signIn", "signUp", "subscribeToAuthChanges"]`.

1. **`reauthenticate: async (password) => void`**
   - Read `const user = auth.currentUser;`.
   - If `!user || !user.email`, throw `new Error("No authenticated email user found.")`.
   - If `typeof password !== "string" || password.length === 0`, throw `new Error("Password is required for re-authentication.")`.
   - Call `const credential = EmailAuthProvider.credential(user.email, password);`.
   - Call `await reauthenticateWithCredential(user, credential);`.
   - Do **not** swallow or rewrite Firebase errors (allow `error.code` such as `"auth/wrong-password"`, `"auth/invalid-credential"`, `"auth/too-many-requests"`, `"auth/network-request-failed"` to propagate).

2. **`deleteAccount: async () => void`**
   - If `!auth.currentUser`, throw `new Error("No authenticated user found.")`.
   - Call `await deleteUser(auth.currentUser);`.
   - Allow Firebase errors (including `"auth/requires-recent-login"`) to propagate.

### 3.2 `src/services/firebase/firestoreServices.js`

- Remove unused `deleteDoc` import from `"firebase/firestore"`.
- Remove `clearUserData` method from `firestoreService`.
- Reuse shared constant `const BATCH_LIMIT = 450;` (for both `migrateLegacyHistory` and `deleteUserData`).
- Exported `firestoreService` methods:
  `["saveUserData", "getUserData", "addWorkout", "getWorkouts", "migrateLegacyHistory", "resetUserProgram", "deleteUserData"]`.

1. **`resetUserProgram: async (userId) => void`**
   - If `!userId`, throw `new Error("User ID is required to reset program.")`.
   - Inside `try/catch`:
     ```js
     const userRef = doc(db, COLLECTIONS.USERS, userId);
     await setDoc(
       userRef,
       {
         plan: null,
         profile: null,
         updatedAt: new Date().toISOString(),
       },
       { merge: true }
     );
     ```
   - On error: `console.error("Error resetting user program:", error); throw error;`.
   - Must **never** read, write, or delete `users/{userId}/workouts`.

2. **`deleteUserData: async (userId) => { deletedWorkoutsCount: number }`**
   - If `!userId`, throw `new Error("User ID is required to delete user data.")`.
   - Inside `try/catch`:
     1. Build `workoutsRef = collection(db, COLLECTIONS.USERS, userId, COLLECTIONS.WORKOUTS)`.
     2. Read `const snapshot = await getDocs(workoutsRef);` (no `orderBy` constraint so even malformed docs missing `completedAt` are deleted).
     3. Build `workoutRefs = snapshot.docs.map((d) => doc(db, COLLECTIONS.USERS, userId, COLLECTIONS.WORKOUTS, d.id))`.
     4. Build `userRef = doc(db, COLLECTIONS.USERS, userId)`.
     5. Combine `refsToDelete = [...workoutRefs, userRef]` so all subcollection workout docs precede `userRef` and `userRef` is guaranteed to be in the final batch.
     6. Chunk `refsToDelete` into slices of size `BATCH_LIMIT` (`450`):
        - 0 workouts -> 1 batch (`[userRef]`, 1 op).
        - 449 workouts -> 1 batch (`[w1..w449, userRef]`, 450 ops).
        - 450 workouts -> 2 batches (`[w1..w450]` = 450 ops, then `[userRef]` = 1 op).
        - 455 workouts -> 2 batches (`[w1..w450]` = 450 ops, then `[w451..w455, userRef]` = 6 ops).
     7. For each chunk sequentially:
        ```js
        const batch = writeBatch(db);
        for (const ref of chunk) {
          batch.delete(ref);
        }
        await batch.commit();
        ```
     8. Return `{ deletedWorkoutsCount: workoutRefs.length }`.
   - On error: `console.error("Error deleting user data:", error); throw error;`.
   - Idempotent on retry: if an earlier batch failed partway through, re-calling `deleteUserData(userId)` fetches remaining workouts and completes deletion including `users/{userId}`.

### 3.3 `src/services/storage/activeWorkoutStore.js`

- Preserve exact `STORAGE_KEYS` export (`ACTIVE_WORKOUT: "fitgen:active:v1"`, `LEGACY_ACTIVE_WORKOUT: "fitgen-active"`).
- Define internal prefixes: `const ACTIVE_KEY_PREFIXES = ["fitgen-active", "fitgen:active"];`.
- Update `clear()`:
  ```js
  clear() {
    try {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_WORKOUT);
      localStorage.removeItem(STORAGE_KEYS.LEGACY_ACTIVE_WORKOUT);
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (
          typeof key === "string" &&
          ACTIVE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
        ) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.error("Error clearing active workout:", error);
    }
  }
  ```
  - Collects keys before removing them so iteration over `localStorage.length` never skips indices.
  - Never throws when `localStorage` access fails.

### 3.4 `src/hooks/useAuth.js`

- **Must remain a plain function (no React hooks inside `useAuth`)** so direct unit tests in `src/hooks/useAuth.test.js` continue to call `useAuth(...)` without `renderHook`.
- Import `activeWorkoutStore` from `"../services/storage/activeWorkoutStore"`.
- Keep exact 5 returned keys: `["handleSignUp", "handleLogin", "handleResetPassword", "handleLogout", "handleDeleteAccount"]`.

1. **`handleDeleteAccount = async (password) => { deleted: true }`**
   - **Pre-flight validation (zero external calls on failure):**
     - If `!user || !user.uid`: throw `new Error("No authenticated user found.")`.
     - If `typeof password !== "string" || password.length === 0`: throw `new Error("Please enter your password to confirm account deletion.")`. (Do **not** `.trim()` non-empty passwords, as valid passwords may contain spaces.)
   - **Stage 1 — Re-authenticate FIRST:**
     ```js
     try {
       await authService.reauthenticate(password);
     } catch (error) {
       console.error("Account deletion re-authentication failed:", error);
       const err = new Error(mapReauthErrorMessage(error));
       err.code = error?.code;
       err.stage = "reauthenticate";
       throw err;
     }
     ```
     Where `mapReauthErrorMessage(error)` returns:
     - `auth/wrong-password` or `auth/invalid-credential`: `"Incorrect password. Please try again."`
     - `auth/too-many-requests`: `"Too many failed attempts. Please wait a moment and try again."`
     - `auth/network-request-failed`: `"Network error. Please check your connection and try again."`
     - `auth/user-mismatch` or `auth/user-not-found`: `"Unable to verify your account. Please log out and sign back in."`
     - Default: `error?.message || "Failed to verify your password. Please try again."`
     - **Invariant:** If Stage 1 throws, `firestoreService.deleteUserData`, `authService.deleteAccount`, `activeWorkoutStore.clear`, and `clearStorage` MUST NOT be called.
   - **Stage 2 — Delete Firestore data SECOND:**
     ```js
     try {
       await firestoreService.deleteUserData(user.uid);
     } catch (error) {
       console.error("Failed to delete user data:", error);
       const err = new Error(
         "Failed to delete your cloud data. Your account was not deleted. Please try again."
       );
       err.code = error?.code;
       err.stage = "firestore";
       throw err;
     }
     ```
     - **Invariant:** If Stage 2 throws, `authService.deleteAccount`, `activeWorkoutStore.clear`, and `clearStorage` MUST NOT be called; Auth user remains intact for retry.
   - **Stage 3 — Delete Firebase Auth account THIRD:**
     ```js
     try {
       await authService.deleteAccount();
     } catch (error) {
       console.error("Failed to delete auth account:", error);
       const message =
         error?.code === "auth/requires-recent-login"
           ? "Your session expired before account deletion completed. Please re-enter your password and try again."
           : "Your cloud data was deleted, but we could not remove your login account. Please try again.";
       const err = new Error(message);
       err.code = error?.code;
       err.stage = "auth";
       throw err;
     }
     ```
     - **Invariant:** If Stage 3 throws, do NOT swallow the error and do NOT call `clearStorage()` / `activeWorkoutStore.clear()` so the user sees the error and can retry cleanly.
   - **Stage 4 — Clear local storage & state FOURTH (only on full success):**
     ```js
     activeWorkoutStore.clear();
     if (typeof clearStorage === "function") {
       clearStorage();
     }
     return { deleted: true };
     ```
   - **No `alert()` calls** anywhere in `handleDeleteAccount`.

2. **`handleLogout = async () => void`**
   ```js
   const handleLogout = async () => {
     try {
       await authService.logout();
     } catch (error) {
       console.error("Logout failed", error);
       throw new Error("Failed to log out. Please try again.");
     }
     activeWorkoutStore.clear();
     if (typeof clearStorage === "function") {
       clearStorage();
     }
   };
   ```
   - Calls `authService.logout()` first; NEVER calls `deleteUserData`, `resetUserProgram`, or `deleteAccount`.
   - Clears `activeWorkoutStore` and invokes `clearStorage()` ONLY after `authService.logout()` succeeds (if logout fails, the user is still authenticated, so local workout progress is preserved and the error is rethrown for inline UI retry).

### 3.5 `src/hooks/useCloudSync.js`

- Track sync state with `{ user, attempt, isSynced, syncError }` and `const [syncAttempt, setSyncAttempt] = useState(0);`.
- Expose `retrySync = useCallback(() => { if (!user) return; setSyncAttempt((prev) => prev + 1); }, [user]);`.
- Run effect with dependency array `[user, syncAttempt]`.
  - When `retrySync()` increments `syncAttempt`, `isCurrentSync` (`Boolean(user && syncState.user === user && syncState.attempt === syncAttempt)`) immediately becomes `false` on that render, transitioning the hook back to pending (`isSynced: false, syncError: null`) **without** calling `setState` synchronously inside `useEffect` (satisfying `react-hooks/set-state-in-effect`).
- Update cloud state hydration when `cloudData || cloudWorkouts.length > 0`:
  ```js
  setUserDataRef.current(() => ({
    profile: cloudData?.profile ?? null,
    plan: cloudData?.plan ?? null,
    history: cloudWorkouts,
  }));
  finalHasPlan = Boolean(cloudData?.plan);
  ```
  - Guarantees that after Reset Program (`users/{uid}` = `{ plan: null, profile: null, updatedAt }`, `workouts/` = `[...]`), a reload or `retrySync()` hydrates `{ profile: null, plan: null, history: cloudWorkouts }`, sets `finalHasPlan = false`, and never resurrects stale `prev.plan` / `prev.profile`.
  - Leaves the `else` branch (`!cloudData && cloudWorkouts.length === 0`) unchanged.
- On success: `setSyncState({ user, attempt: syncAttempt, isSynced: true, syncError: null })`.
- On error: `setSyncState({ user, attempt: syncAttempt, isSynced: false, syncError: err })`.
- Return shape (3 keys):
  ```js
  return {
    isSynced: isCurrentSync ? syncState.isSynced : false,
    syncError: isCurrentSync ? syncState.syncError : null,
    retrySync,
  };
  ```

### 3.6 `src/App.jsx`

1. Destructure `retrySync` from `useCloudSync`:
   ```js
   const { isSynced, syncError, retrySync } = useCloudSync(
     user,
     userData,
     setUserData,
     handleSyncComplete
   );
   ```
2. Update `clearStorage` and `handleLogoutEvent`:
   ```js
   const clearStorage = () => {
     setUserData({ profile: null, plan: null, history: [] });
     setActiveWorkout(null);
     activeWorkoutStore.clear();
   };

   const handleLogoutEvent = () => {
     clearStorage();
     setView("welcome");
   };
   ```
   - Ensures every auth-driven logout (manual logout, anonymous auto-logout in `useAuthObserver`, account deletion, or external session revocation) clears `userData`, `activeWorkout`, all `fitgen:active*` / `fitgen-active*` keys, and navigates to `"welcome"`.
3. Update `handleSavePlan` sync guard to distinguish `syncError` vs pending:
   ```js
   const handleSavePlan = async (plan, profile) => {
     if (user) {
       if (!isSynced) {
         if (syncError) {
           throw new Error(
             "Cloud sync failed. Please retry sync before saving your plan."
           );
         }
         throw new Error(
           "Still syncing your data from the cloud. Please try again in a moment."
         );
       }
       await firestoreService.saveUserData(user.uid, { plan, profile });
     }
     setUserData((prev) => ({ ...prev, plan, profile }));
     setView("plan");
   };
   ```
4. Rewrite `handleResetSystem`:
   ```js
   const handleResetSystem = async () => {
     if (user) {
       if (!isSynced) {
         if (syncError) {
           throw new Error(
             "Cloud sync failed. Please retry sync before resetting your program."
           );
         }
         throw new Error(
           "Still syncing your data from the cloud. Please try again in a moment."
         );
       }
       await firestoreService.resetUserProgram(user.uid);
     }
     activeWorkoutStore.clear();
     setActiveWorkout(null);
     setUserData((prev) => ({
       ...prev,
       profile: null,
       plan: null,
     }));
     setView("profile");
   };
   ```
   - Awaits `firestoreService.resetUserProgram(user.uid)` and propagates any error without touching local state, storage, or view.
   - On success, clears paused active workout (`activeWorkoutStore.clear()` + `setActiveWorkout(null)`), clears ONLY `profile` and `plan` while preserving `prev.history` intact, and sets `view` to `"profile"` (which renders `<ProfileSetupForm />` since `userData.plan` is now `null`).
5. **Exact `AppContext` keys (16 keys):**
   ```js
   [
     "activeWorkout",
     "clearStorage",
     "handleResetSystem",
     "handleSavePlan",
     "isSynced",
     "retrySync",
     "setActiveWorkout",
     "setShowAuth",
     "setUser",
     "setUserData",
     "setView",
     "showAuth",
     "syncError",
     "user",
     "userData",
     "view",
   ]
   ```

### 3.7 `src/components/ui/TextInput.jsx`

Forward `...rest` props onto `<input>`:
```jsx
export default function TextInput({
  label,
  value,
  onChange,
  type = "text",
  id,
  className,
  placeholder,
  ...rest
}) {
  return (
    <>
      {label && (
        <label htmlFor={id} className="text-lg font-bold text-muted uppercase">
          {label}
        </label>
      )}
      <input
        type={type}
        id={id}
        value={value}
        onChange={onChange}
        className={className}
        placeholder={placeholder}
        {...rest}
      />
    </>
  );
}
```

### 3.8 `src/features/auth/DeleteAccountModal.jsx` (New Component)

- **Signature:** `export default function DeleteAccountModal({ isOpen, onClose, onConfirmDelete })`
- **Modal wrapper:** `<Modal isOpen={isOpen} onClose={handleClose} title="Delete Account?">`
- **Internal state & guards:**
  - `password` (`""`), `showPassword` (`false`), `isDeleting` (`false`), `deleteError` (`null`).
  - `isDeletingRef = useRef(false)` synchronous double-submit guard.
- **Close behavior (`handleClose`):**
  - If `isDeletingRef.current || isDeleting`, return immediately (blocks backdrop click, X button, and Cancel while deletion is in flight).
  - Otherwise clear `password`, `showPassword`, `deleteError`, and call `onClose()`.
- **Submit behavior (`handleConfirm`):**
  - If `isDeletingRef.current || password.length === 0`, return immediately.
  - Set `isDeletingRef.current = true`, `setIsDeleting(true)`, `setDeleteError(null)`.
  - `try`: `await onConfirmDelete(password);` -> on success, clear `password`, `showPassword`, `deleteError`, and call `onClose()`.
  - `catch (error)`: `setDeleteError(error?.message || "Failed to delete account. Please try again.");`.
  - `finally`: `isDeletingRef.current = false; setIsDeleting(false);`.
- **Markup & accessibility:**
  - Warning paragraph explaining permanent erasure of account, profile, plan, and workout history, and asking for current password to confirm.
  - Password field inside `<div className="relative">`:
    - `<TextInput id="delete-account-password" label="Confirm Password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => { setPassword(e.target.value); if (deleteError) setDeleteError(null); }} placeholder="Enter your password" autoComplete="current-password" disabled={isDeleting} aria-invalid={Boolean(deleteError)} className={`input input-bordered w-full text-primary ${isDeleting ? "opacity-50" : ""}`} />`
    - `<Button type="button" onClick={() => setShowPassword((prev) => !prev)} className="btn-show-password" Icon={showPassword ? EyeOff : Eye} disabled={isDeleting} aria-label={showPassword ? "Hide password" : "Show password"} />`
  - Error banner (rendered ONLY when `deleteError` is non-null):
    - `<div role="alert" className="alert-error text-lg font-bold">{deleteError}</div>`
  - Action buttons (`<div className="flex justify-center w-full gap-2">`):
    - Cancel button: `text="Cancel"`, `onClick={handleClose}`, `disabled={isDeleting}`, `className="button btn-muted w-full font-bold text-lg uppercase p-4 letter-spacing-2"`.
    - Confirm button:
      - `disabled={isDeleting || password.length === 0}`
      - `aria-busy={isDeleting}`
      - `onClick={handleConfirm}`
      - `className="button btn-danger w-full font-bold text-lg uppercase p-4 letter-spacing-2"`
      - `text`:
        - When `isDeleting`: `<span className="flex items-center justify-center gap-2"><Loader2 className="animate-spin" size={16} aria-hidden="true" />Deleting...</span>`
        - When `!isDeleting && deleteError`: `"Retry"`
        - Otherwise: `"Confirm Delete"`

### 3.9 `src/components/screens/ProfileScreen.jsx`

- Read from `useAppContext()`:
  ```js
  const {
    userData,
    handleResetSystem: onResetSystem,
    user,
    clearStorage,
    isSynced = true,
    syncError = null,
    retrySync,
  } = useAppContext();
  ```
- Derived sync status predicates (strictly mutually exclusive — error is NEVER masked by loading):
  - `const isSyncFailed = Boolean(user && !isSynced && syncError);`
  - `const isSyncPending = Boolean(user && !isSynced && !syncError);`
- Local state & synchronous ref guards:
  - `activeModal` (`null | "reset" | "report" | "delete-account"`)
  - `reportReason` (`""`)
  - `isResetting` (`false`), `resetError` (`null`), `isResettingRef = useRef(false)`
  - `isLoggingOut` (`false`), `logoutError` (`null`), `isLoggingOutRef = useRef(false)`
- **Top-level sync status banner (above action buttons):**
  - If `isSyncFailed`:
    ```jsx
    <div
      role="alert"
      className="alert-error flex items-center justify-between gap-3 mb-4"
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
  - Else if `isSyncPending`:
    ```jsx
    <div
      role="status"
      aria-live="polite"
      className="card p-3 mb-4 flex items-center justify-center gap-2 text-muted text-lg font-bold"
    >
      <Loader2 className="animate-spin" size={16} aria-hidden="true" />
      <span>Syncing your cloud data...</span>
    </div>
    ```
- **Logout error banner & button:**
  - If `logoutError`:
    ```jsx
    <div
      role="alert"
      className="alert-error flex items-center justify-between gap-3 mb-4"
    >
      <span className="text-lg font-bold">{logoutError}</span>
      <Button
        text="Retry"
        onClick={handleLogoutClick}
        disabled={isLoggingOut}
        className="button btn-primary text-base font-bold uppercase p-2 letter-spacing-2 shrink-0"
      />
    </div>
    ```
  - `handleLogoutClick`:
    - Guards with `isLoggingOutRef.current`.
    - Sets `isLoggingOutRef.current = true`, `setIsLoggingOut(true)`, `setLogoutError(null)`.
    - `try { await handleLogout(); } catch (error) { setLogoutError(error?.message || "Failed to log out. Please try again."); } finally { isLoggingOutRef.current = false; setIsLoggingOut(false); }`.
  - `LOGOUT` button:
    - `text`: when `isLoggingOut`, spinner + `"Logging out..."`; otherwise `"LOGOUT"`.
    - `Icon={isLoggingOut ? null : LogOut}` (fixes lowercase `icon` prop bug).
    - `disabled={isLoggingOut}`, `aria-busy={isLoggingOut}`.
    - `className="flex items-center justify-center gap-2 button btn-secondary w-full mb-4 text-2xl font-bold letter-spacing-2 p-3"`.
- **Reset Program modal (`activeModal === "reset"`):**
  - Title: `"Reset Program?"`.
  - `onClose`: no-op while `isResetting`; otherwise clears `resetError` and sets `activeModal(null)`.
  - Copy: `"Are you sure you want to reset your current program? Your workout plan and profile will be cleared, but your workout history will be preserved."`
  - Inside modal, surface distinct sync/reset states:
    - If `isSyncFailed`: inline `role="alert"` `.alert-error` showing sync error + **"Retry Sync"** button calling `retrySync?.()`.
    - Else if `isSyncPending`: inline `role="status"` pending indicator (`Loader2` + `"Still syncing your cloud data..."`).
    - If `resetError`: inline `<div role="alert" className="alert-error text-lg font-bold">{resetError}</div>`.
  - `handleConfirmReset`:
    - Guards with `isResettingRef.current`.
    - Sets `isResettingRef.current = true`, `setIsResetting(true)`, `setResetError(null)`.
    - `try { await onResetSystem(); setActiveModal(null); } catch (error) { setResetError(error?.message || "Failed to reset program. Please try again."); } finally { isResettingRef.current = false; setIsResetting(false); }`.
  - Buttons:
    - Cancel: `text="Cancel"`, `disabled={isResetting}`.
    - Confirm:
      - `disabled={isResetting || isSyncPending || isSyncFailed}`
      - `aria-busy={isResetting}`
      - `text`: when `isResetting` -> spinner + `"Resetting..."`; else when `resetError` -> `"Retry"`; else -> `"Reset Program"`.
- **Delete Account modal (`activeModal === "delete-account"`):**
  - Conditionally rendered so password/error state always resets cleanly on unmount without `useEffect` `setState`:
    ```jsx
    {activeModal === "delete-account" && (
      <DeleteAccountModal
        isOpen
        onClose={() => setActiveModal(null)}
        onConfirmDelete={handleDeleteAccount}
      />
    )}
    ```

---

## 4. Distinct Async & Sync-Guarded UX / State Matrix

Every async or sync-guarded flow MUST strictly separate **loading/pending** from **failed (`error` / `syncError` with retry)** so errors are never masked by a spinner or pending copy.

| Flow | Idle / Ready | Loading / Pending | Failed (`error` / `syncError`) | Success |
| :--- | :--- | :--- | :--- | :--- |
| **Cloud Sync** (`useCloudSync` + `ProfileScreen` + `App.jsx`) | `isSynced === true, syncError === null` — normal UI, reset & save enabled | `user && !isSynced && !syncError` — `role="status"` `"Syncing your cloud data..."` + spinner; Reset confirm disabled; programmatic `handleResetSystem`/`handleSavePlan` throws pending error | `user && !isSynced && syncError` — `role="alert"` `.alert-error` showing `syncError.message` + **"Retry Sync"** button calling `retrySync()` (NEVER shows `"Syncing..."` spinner); Reset confirm disabled; programmatic calls throw `"Cloud sync failed..."` | `isSynced === true`, alerts cleared, `userData` hydrated from cloud |
| **Account Deletion** (`DeleteAccountModal` + `useAuth.handleDeleteAccount`) | Modal open with empty password, `"Confirm Delete"` disabled until password non-empty | `isDeleting === true` (`isDeletingRef` locked) — password input, eye toggle, Cancel, and close blocked; Confirm disabled + `aria-busy="true"` + spinner + `"Deleting..."` | `isDeleting === false, deleteError !== null` — modal stays open; `role="alert"` `.alert-error` shows stage-specific error (wrong password / Firestore failed / Auth failed); Confirm switches to `"Retry"` (re-enabled); inputs/Cancel re-enabled | `reauthenticate` -> `deleteUserData` -> `deleteAccount` -> `activeWorkoutStore.clear()` + `clearStorage()`; modal closes; observer routes to `"welcome"` |
| **Reset Program** (`ProfileScreen` modal + `App.handleResetSystem`) | Modal open with history-preservation copy; `"Reset Program"` enabled when synced | `isResetting === true` (`isResettingRef` locked) — Cancel and close blocked; Confirm disabled + `aria-busy="true"` + spinner + `"Resetting..."` | `isResetting === false, resetError !== null` — modal stays open; local `plan`/`profile`/`history`/`activeWorkout`/storage/view unchanged; `role="alert"` `.alert-error` shows error; Confirm switches to `"Retry"` | `resetUserProgram` succeeds -> clears `plan`, `profile`, `activeWorkout`, and active storage; **preserves `history`**; modal closes; `view` switches to `"profile"` (`ProfileSetupForm`) |
| **Logout** (`ProfileScreen` + `useAuth.handleLogout` + `App.handleLogoutEvent`) | `"LOGOUT"` button enabled | `isLoggingOut === true` (`isLoggingOutRef` locked) — button disabled + `aria-busy="true"` + spinner + `"Logging out..."` | `isLoggingOut === false, logoutError !== null` — `role="alert"` `.alert-error` banner with **"Retry"** button; active workout storage and `userData` NOT cleared; `"LOGOUT"` re-enabled | `authService.logout()` succeeds -> `activeWorkoutStore.clear()` + `clearStorage()` + `handleLogoutEvent()` clears all `fitgen-active*`/`fitgen:active*` keys, `activeWorkout`, `userData`, and sets `view = "welcome"` |

---

## 5. Strict Acceptance Criteria (`AC-*`) & Vitest Verification Contract

Every criterion below MUST be directly asserted in Vitest + React Testing Library tests.

### A. Auth & Firestore Services
- **AC-1 (`authServices.js`):** `Object.keys(authService).sort()` equals the exact 7 methods (`deleteAccount`, `logout`, `reauthenticate`, `resetPassword`, `signIn`, `signUp`, `subscribeToAuthChanges`).
- **AC-2 (`authServices.js`):** `authService.reauthenticate(password)` constructs `EmailAuthProvider.credential(auth.currentUser.email, password)` and awaits `reauthenticateWithCredential(auth.currentUser, credential)`. It rejects with a descriptive error if `auth.currentUser` is null, `auth.currentUser.email` is missing, or `password` is empty, and propagates Firebase Auth errors (including `error.code`) unchanged.
- **AC-3 (`authServices.js`):** `authService.deleteAccount()` rejects if `auth.currentUser` is null and otherwise calls `deleteUser(auth.currentUser)`, propagating Firebase errors unchanged.
- **AC-4 (`firestoreServices.js`):** `firestoreService.clearUserData` is removed; `firestoreService.resetUserProgram` and `firestoreService.deleteUserData` are exported.
- **AC-5 (`firestoreServices.js` — `resetUserProgram`):** `resetUserProgram(userId)` throws if `userId` is falsy; otherwise calls `setDoc(doc(db, "users", userId), { plan: null, profile: null, updatedAt: <ISOString> }, { merge: true })`, never reads or deletes `users/{userId}/workouts`, and logs + rethrows Firestore errors.
- **AC-6 (`firestoreServices.js` — `deleteUserData`):** `deleteUserData(userId)` throws if `userId` is falsy; otherwise reads `users/{userId}/workouts`, deletes every workout document AND `users/{userId}` using `writeBatch(db)` in chunks of at most `450` deletes per batch with `users/{userId}` ALWAYS in the final batch:
  - 0 workouts -> 1 batch with 1 delete (`users/{uid}`), returns `{ deletedWorkoutsCount: 0 }`.
  - 450 workouts -> 2 batches (450 workout deletes in batch 1, `users/{uid}` delete in batch 2), returns `{ deletedWorkoutsCount: 450 }`.
  - 455 workouts -> 2 batches (450 workout deletes in batch 1, 5 workout deletes + `users/{uid}` in batch 2), returns `{ deletedWorkoutsCount: 455 }`.
  - Rethrows batch commit or `getDocs` errors after logging.

### B. Storage Hygiene (`activeWorkoutStore.js`)
- **AC-7 (`activeWorkoutStore.js`):** `STORAGE_KEYS` remains strictly `{ ACTIVE_WORKOUT: "fitgen:active:v1", LEGACY_ACTIVE_WORKOUT: "fitgen-active" }`.
- **AC-8 (`activeWorkoutStore.js`):** `activeWorkoutStore.clear()` removes `"fitgen:active:v1"`, `"fitgen-active"`, and any `localStorage` keys prefixed with `"fitgen-active"` (e.g., `"fitgen-active-w1-d1"`, `"fitgen-active-backup"`) or `"fitgen:active"` (e.g., `"fitgen:active:v0"`, `"fitgen:active:v2"`), leaves unrelated keys (e.g., `"theme"`, `"unrelated-key"`) intact, and never throws if `localStorage` throws.

### C. Account Deletion Order (`useAuth.js` & `DeleteAccountModal.jsx`)
- **AC-9 (`useAuth.js`):** `Object.keys(useAuth(...)).sort()` remains the exact 5 handlers (`handleDeleteAccount`, `handleLogin`, `handleLogout`, `handleResetPassword`, `handleSignUp`), and `useAuth()` remains callable directly without React rendering.
- **AC-10 (`useAuth.js` — strict deletion order):** On valid `handleDeleteAccount(password)`, operations execute in exact order:
  1. `authService.reauthenticate(password)`
  2. `firestoreService.deleteUserData(user.uid)`
  3. `authService.deleteAccount()`
  4. `activeWorkoutStore.clear()` and `clearStorage()`
  With zero `alert()` calls.
- **AC-11 (`useAuth.js` — re-auth failure invariant):** When `authService.reauthenticate(password)` rejects (e.g. `auth/wrong-password` or `auth/invalid-credential`), `handleDeleteAccount` throws a user-facing error (`"Incorrect password. Please try again."`, `stage: "reauthenticate"`), and makes **zero** calls to `firestoreService.deleteUserData`, `authService.deleteAccount`, `activeWorkoutStore.clear`, or `clearStorage`.
- **AC-12 (`useAuth.js` — Firestore failure invariant):** When `firestoreService.deleteUserData` rejects after re-authentication succeeds, `handleDeleteAccount` throws a clear error (`stage: "firestore"`), leaves the Auth account intact (`authService.deleteAccount` NOT called), and does NOT clear local storage (`activeWorkoutStore.clear` / `clearStorage` NOT called).
- **AC-13 (`useAuth.js` — Auth deletion failure invariant):** When `authService.deleteAccount` rejects after `deleteUserData` succeeds, `handleDeleteAccount` does NOT swallow the error; it throws a clear error (`stage: "auth"`) distinguishing `auth/requires-recent-login` vs generic failure, and does NOT call `clearStorage` or `activeWorkoutStore.clear`.
- **AC-14 (`useAuth.js` — pre-flight guards):** Calling `handleDeleteAccount("")` or calling without an authenticated `user.uid` rejects immediately with zero calls to `authService` or `firestoreService`.
- **AC-15 (`DeleteAccountModal.jsx`):**
  - Renders `role="dialog"` named `"Delete Account?"`, a labeled `"Confirm Password"` password input, and a show/hide password toggle with accessible name (`"Show password"` / `"Hide password"`).
  - `"Confirm Delete"` is disabled while password is empty.
  - While deletion is in flight: password input, show/hide toggle, `"Cancel"`, and `"Confirm Delete"` are disabled; button shows `"Deleting..."` with `aria-busy="true"`; closing via backdrop/X/Cancel is blocked; a second click does not trigger a duplicate `onConfirmDelete` call.
  - On failure: modal stays open, renders `role="alert"` with the error message, button text switches to `"Retry"` and is re-enabled; clicking `"Retry"` re-invokes `onConfirmDelete(password)` and closes the modal on success.
  - Reopening the modal after closing starts with empty password and no stale error.

### D. Reset Program Preserves History (`useCloudSync.js`, `App.jsx`, `ProfileScreen.jsx`)
- **AC-16 (`App.jsx` — `handleResetSystem` happy path):** When `user` is signed in and `isSynced === true`, `handleResetSystem()` awaits `firestoreService.resetUserProgram(user.uid)`, clears `activeWorkout` (`null`) and all `fitgen:active*`/`fitgen-active*` storage keys, sets `userData.plan = null` and `userData.profile = null`, **preserves `userData.history` completely unchanged**, and sets `view = "profile"`. It NEVER calls `firestoreService.deleteUserData`.
- **AC-17 (`App.jsx` — `handleResetSystem` failure path):** When `firestoreService.resetUserProgram` rejects, `handleResetSystem()` rethrows (does NOT swallow), and leaves `userData.plan`, `userData.profile`, `userData.history`, `activeWorkout`, `localStorage`, and `view` completely unchanged.
- **AC-18 (`App.jsx` — sync guards distinguish pending vs failed):**
  - When `user` is signed in, `isSynced === false`, and `syncError === null`: `handleResetSystem()` and `handleSavePlan()` reject with `"Still syncing your data from the cloud. Please try again in a moment."` with zero Firestore writes.
  - When `user` is signed in, `isSynced === false`, and `syncError !== null`: `handleResetSystem()` rejects with `"Cloud sync failed. Please retry sync before resetting your program."` and `handleSavePlan()` rejects with `"Cloud sync failed. Please retry sync before saving your plan."` with zero Firestore writes — never masking `syncError` as `"Still syncing..."`.
- **AC-19 (`useCloudSync.js` — reload after Reset Program & `retrySync`):**
  - Reloading when `getUserData` returns `{ plan: null, profile: null, updatedAt: "..." }` and `getWorkouts` returns `[w1, w2]` hydrates `{ profile: null, plan: null, history: [w1, w2] }`, sets `isSynced: true`, and calls `onSyncComplete(false)` (even if local state previously held a non-null `plan`/`profile`).
  - Calling `retrySync()` after a `syncError` clears `syncError` back to `null` while re-fetching, and transitions to `isSynced: true, syncError: null` when the retry succeeds (or sets the new `syncError` if retry fails).
- **AC-20 (`ProfileScreen.jsx` — Reset Program & sync states):**
  - When `user && !isSynced && !syncError`, renders `"Syncing your cloud data..."` (`role="status"`) and disables Reset Program confirmation; does NOT show a `"Retry Sync"` error alert.
  - When `user && !isSynced && syncError`, renders `role="alert"` with `syncError.message` and a `"Retry Sync"` button calling `retrySync()`, and disables Reset Program confirmation; does NOT mask the error with a `"Syncing..."` spinner.
  - Reset modal displays copy stating workout history is preserved.
  - While reset is pending: shows `"Resetting..."` with `aria-busy="true"`, disables Cancel/Confirm, blocks modal dismissal, and blocks double-submit.
  - When reset fails: modal stays open, renders `role="alert"` with error message, switches button to `"Retry"`, and retries cleanly on click.

### E. Logout & Session Hygiene (`useAuth.js`, `App.jsx`, `ProfileScreen.jsx`)
- **AC-21 (`useAuth.js` — `handleLogout`):**
  - On `authService.logout()` success: clears `fitgen:active:v1`, `fitgen-active`, and any `fitgen-active*` / `fitgen:active*` keys via `activeWorkoutStore.clear()`, invokes `clearStorage()` if provided, and NEVER calls `deleteUserData`, `resetUserProgram`, or `deleteAccount`.
  - On `authService.logout()` rejection: logs error, rethrows `"Failed to log out. Please try again."`, and does NOT clear `activeWorkoutStore` or call `clearStorage()`.
- **AC-22 (`App.jsx` — `AppContext`, `clearStorage`, `handleLogoutEvent`):**
  - `Object.keys(contextValue).sort()` matches the exact 16 keys in Section 3.6.
  - `clearStorage()` resets `userData` to `{ profile: null, plan: null, history: [] }`, resets `activeWorkout` to `null`, and clears all `fitgen:active*` / `fitgen-active*` storage keys.
  - Auth state transitioning to `null` OR an anonymous user (`isAnonymous: true`) triggers `handleLogoutEvent()`, resetting `userData`, `activeWorkout`, all `fitgen:active*` / `fitgen-active*` localStorage keys, and `view` to `"welcome"`.
- **AC-23 (`ProfileScreen.jsx` — Logout UX):**
  - Clicking `"LOGOUT"` disables the button with `aria-busy="true"` and `"Logging out..."` while pending, guards against double-clicks, and clears active workout storage on success.
  - If logout fails, renders inline `role="alert"` error banner with a `"Retry"` button, preserves active workout storage, and retries cleanly when `"Retry"` is clicked.

### F. Repo Gates
- **AC-24:** `npx eslint src api` exits `0` with zero errors and zero warnings.
- **AC-25:** `npm test` exits `0` with all existing and new tests passing.
- **AC-26:** `npm run build` exits `0`.
