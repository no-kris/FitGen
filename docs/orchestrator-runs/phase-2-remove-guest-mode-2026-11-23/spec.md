# Phase 2 Specification: Remove Guest Mode

**Run ID:** `phase-2-remove-guest-mode-2026-11-23`  
**Phase Objective (`REFACTOR_PLAN.md`):** Only email/password accounts. No anonymous users in Firebase Auth or Firestore.  
**Data Shape Impact:** None to persisted Firestore documents (`users/{uid}`, `users/{uid}/workouts/{autoId}`) or `localStorage` (`fitgen:active:v1`). Only in-memory React context/hook state removes `isGuest` / `setIsGuest`.

---

## 1. Open Decision (Human Approval Gate)

Before implementation begins, confirm the rollout strategy for existing anonymous ("guest") mobile/web sessions (`REFACTOR_PLAN.md`, Phase 2):

- **Option A — Hard cutoff (RECOMMENDED, basis of this spec):**
  Ship Phase 2 as specified below. Remove all guest-mode entry points, UI, and auth helpers immediately. If a device still holds a cached anonymous Firebase session, `useAuthObserver` signs it out on startup and returns the user to `WelcomeScreen`. Disable Anonymous Auth in Firebase Console, purge existing anonymous Auth users and their Firestore `users/{uid}` trees via `scripts/cleanupAnonymousUsers.js`, and block anonymous tokens in Firestore security rules. Any user mid-program in an anonymous session loses that guest data.
- **Option B — One transition release (NOT detailed as primary):**
  Remove "Run as Guest?" from `WelcomeScreen` (so no *new* anonymous sessions start), keep `GuestBanner` + `isGuest` for one release, and update `authService.signUp` / `useAuth.handleSignUp` to call `linkWithCredential(auth.currentUser, EmailAuthProvider.credential(email, password))` when `auth.currentUser?.isAnonymous` is true so existing guests keep their `uid` and Firestore `users/{uid}` + `workouts/` data. Then ship Option A in the following release to delete `GuestBanner`, `isGuest`, Anonymous Auth, and leftover anonymous accounts.

> **Delta if Option B is chosen instead:** Do **not** delete `GuestBanner.jsx`, `.guest-banner`, `isGuest` in `useAuthObserver`/`App`/`Layout`/`ProfileScreen`, or auto-sign-out anonymous users in `useAuthObserver`. Instead, keep them for one release, add `linkGuestToEmail(email, password)` using `linkWithCredential` + `EmailAuthProvider.credential` in `src/services/firebase/authServices.js`, invoke it from `useAuth.handleSignUp` when `user?.isAnonymous`, remove only the "Run as Guest?" button from `WelcomeScreen.jsx` and `signInGuest` from `authServices.js`, and defer Console Anonymous disabling, Firestore rule tightening, and `scripts/cleanupAnonymousUsers.js` execution to the follow-up release.

All sections below specify **Option A — Hard cutoff (recommended)**.

---

## 2. Repository Audit & Exact File Plan

Every file in `src/`, `api/`, `readme.md`, `package.json`, `vitest.config.js`, and repo root was inspected. Notable findings:
- `WelcomeScreen.jsx` lives at **`src/features/onboarding/WelcomeScreen.jsx`** (not `src/components/screens/`).
- `firestore.rules`, `firebase.json`, and `scripts/` do **not** currently exist in the repository (`firestore.rules` / `firebase.json` remain an open Phase 0 manual task).
- `api/_utils.js` (`verifyFirebaseToken`) does not check for anonymous tokens yet; rejecting anonymous tokens server-side is explicitly scoped to **Phase 5** ("Fix `verifyFirebaseToken` so it also rejects anonymous tokens (defense in depth after Phase 2)"). No `api/` files change in Phase 2.
- `package.json` uses `"type": "module"`, and `firebase-admin` is **not** installed as a dependency (and must not be added to frontend `dependencies`).
- `vitest.config.js` currently includes `["src/**/*.test.{js,jsx}", "api/**/*.test.js"]` and must add `"scripts/**/*.test.js"` so `npm test` executes the cleanup script test suite.

### 2.1 Files to Delete
| Path | Owner | Reason |
| :--- | :--- | :--- |
| `src/components/ui/GuestBanner.jsx` | `implementer` | Guest-mode banner component removed |

### 2.2 Files to Modify
| Path | Owner | Summary of Changes |
| :--- | :--- | :--- |
| `src/css/index.css` | `styler` | Remove `.guest-banner` rule block (lines 96–104); verify no other guest selectors exist in `src/css/*.css` |
| `src/features/onboarding/WelcomeScreen.jsx` | `implementer` | Remove "Run as Guest?" `<Button>`, `useAuth({})` call, and unused `useAuth` import |
| `src/hooks/useAuth.js` | `implementer` | Remove `handleGuestLogin` and remove `if (user && user.isAnonymous)` branch in `handleLogout` |
| `src/services/firebase/authServices.js` | `implementer` | Remove `signInAnonymously` import and `signInGuest` method |
| `src/hooks/useAuthObserver.js` | `implementer` | Remove `isGuest` state/return; detect `currentUser.isAnonymous`, sign out safely via `authService.logout()`, treat as logged out (`user: null`) |
| `src/App.jsx` | `implementer` | Remove `isGuest`/`setIsGuest` from `useAuthObserver` destructuring and `contextValue`; remove outdated guest comment in `handleLogoutEvent` |
| `src/components/layout/Layout.jsx` | `implementer` | Remove `GuestBanner` import/render and remove unused `isGuest` and `setShowAuth` from `useAppContext()` destructuring |
| `src/components/screens/ProfileScreen.jsx` | `implementer` | Remove `isGuest` from `useAppContext()` destructuring; remove `{!isGuest && ...}` guards around `LOGOUT` and `DELETE ACCOUNT` buttons |
| `readme.md` | `implementer` | Remove anonymous "Guest" login description under Cloud Synchronization & Accounts |

### 2.3 Files to Create
| Path | Owner | Purpose |
| :--- | :--- | :--- |
| `scripts/cleanupAnonymousUsers.js` | `implementer` | One-time Firebase Admin SDK ESM CLI + exportable cleanup logic for purging anonymous Auth users and their Firestore data |

### 2.4 Test Files & Config to Create / Update (`tester` scope)
| Path | Owner | Purpose |
| :--- | :--- | :--- |
| `vitest.config.js` | `tester` | Update `test.include` in Stage 3 (Red) to add `"scripts/**/*.test.js"` so `npm test` discovers and runs `scripts/cleanupAnonymousUsers.test.js` in `red-proof.md` (`implementer` does not touch test config) |
| `src/services/firebase/authServices.test.js` | `tester` | Assert `authService` surface contains no anonymous sign-in method and `logout` calls `signOut` |
| `src/hooks/useAuth.test.js` | `tester` | Assert `useAuth` returns only the 5 email-account handlers and `handleLogout` always calls `authService.logout()` (never `clearUserData`/`deleteAccount`) |
| `src/hooks/useAuthObserver.test.jsx` | `tester` | Assert return shape `{ user, setUser }`, anonymous `currentUser` triggers `authService.logout()`, leaves `user: null`, invokes `onLogout`, and handles sync/async `logout()` failure safely |
| `src/features/onboarding/WelcomeScreen.test.jsx` | `tester` | Assert only `"Initialize Account"` button renders and opens auth modal |
| `src/components/layout/Layout.test.jsx` | `tester` | Assert `Layout` renders content and bottom nav without any sync/banner prompt |
| `src/components/screens/ProfileScreen.test.jsx` | `tester` | Assert `LOGOUT` and `DELETE ACCOUNT` always render and wire to `handleLogout` / delete modal |
| `src/App.test.jsx` | `tester` | Update `authService` mock with `logout`, assert `AppContext` exposes exact 15 keys (no `isGuest`/`setIsGuest`), and assert anonymous auth event signs out and stays on `"welcome"` without Firestore sync |
| `scripts/cleanupAnonymousUsers.test.js` | `tester` | Unit tests for `parseCliArgs`, `isAnonymousUser`, `chunkArray`, and `cleanupAnonymousUsers` (pagination, filtering, dry-run, live recursiveDelete + chunked `deleteUsers`, error handling) |

> **Out of scope (do NOT modify in Phase 2):**
> - `.memory/knowledge/coding-standards.md` and `.memory/knowledge/design-system.md` (subagents do not edit `.memory/`).
> - `api/_utils.js`, `api/callModel.js`, `api/debug.js` (anonymous token rejection in `verifyFirebaseToken` belongs to Phase 5).
> - Unused `Settings` import and `icon={LogOut}` prop in `ProfileScreen.jsx` (unrelated pre-existing debt tracked in Phase 6).

---

## 3. Module Contracts & Exact Implementation Details

### 3.1 `src/services/firebase/authServices.js`
- **Remove import:** `signInAnonymously` from `"firebase/auth"`.
- **Remove method:** `signInGuest`.
- **Exact exported contract:**
  ```js
  export const authService = {
    signUp,                  // async (email, password) => User
    signIn,                  // async (email, password) => User
    logout,                  // async () => void  (calls signOut(auth))
    resetPassword,           // async (email) => void
    reauthenticate,          // async (password) => void
    deleteAccount,           // async () => void
    subscribeToAuthChanges,  // (callback) => Unsubscribe
  };
  ```
- Exact key set of `authService`: `["signUp", "signIn", "logout", "resetPassword", "reauthenticate", "deleteAccount", "subscribeToAuthChanges"]`.

### 3.2 `src/hooks/useAuth.js`
- **Signature:** `export function useAuth({ user, clearStorage, setShowAuth } = {})`
- **Remove:** `handleGuestLogin`.
- **Update `handleLogout`:**
  ```js
  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.error("Logout failed", error);
    }
  };
  ```
  - Must **never** branch on `user.isAnonymous` and must **never** call `handleDeleteAccount()` or `firestoreService.clearUserData()`.
- **Exact return shape:**
  ```js
  return {
    handleSignUp,
    handleLogin,
    handleResetPassword,
    handleLogout,
    handleDeleteAccount,
  };
  ```

### 3.3 `src/hooks/useAuthObserver.js`
- **Signature:** `export function useAuthObserver(onLogout)`
- **State:** `const [user, setUser] = useState(null);` (remove `isGuest` state entirely).
- **Observer behavior inside `authService.subscribeToAuthChanges((currentUser) => { ... })`:**
  1. **Authenticated non-anonymous user (`currentUser && !currentUser.isAnonymous`):**
     - Call `setUser(currentUser)`.
     - Do **not** call `authService.logout()` or `onLogoutRef.current`.
  2. **Legacy anonymous session (`currentUser && currentUser.isAnonymous`):**
     - Immediately treat as logged out: call `setUser(null)` (so `useCloudSync` never fetches Firestore for an anonymous UID and no anonymous user object ever enters React state).
     - Call `if (onLogoutRef.current) { onLogoutRef.current(); }` (idempotently resets `userData` and keeps `view === "welcome"` even if `logout()` fails or does not emit a follow-up `null` event).
     - Sign the anonymous session out safely:
       ```js
       try {
         Promise.resolve(authService.logout()).catch((error) => {
           console.error("Failed to sign out anonymous user:", error);
         });
       } catch (error) {
         console.error("Failed to sign out anonymous user:", error);
       }
       ```
     - Neither a synchronous throw nor an async rejection from `authService.logout()` may crash the observer or produce an unhandled promise rejection.
  3. **Signed out (`!currentUser`):**
     - Call `setUser(null)`.
     - Call `if (onLogoutRef.current) { onLogoutRef.current(); }`.
- **Cleanup:** Return `() => unsubscribe()` from `useEffect`.
- **Exact return shape:** `{ user, setUser }` (exact keys: `["user", "setUser"]`).

### 3.4 `src/App.jsx`
- Update `handleLogoutEvent`:
  ```js
  const handleLogoutEvent = () => {
    setUserData({ profile: null, plan: null, history: [] });
    setView("welcome");
  };
  ```
  (Removes the outdated `// Only clear data and redirect if they weren't a guest` comment.)
- Update observer destructuring:
  ```js
  const { user, setUser } = useAuthObserver(handleLogoutEvent);
  ```
- Remove `isGuest` and `setIsGuest` from `contextValue`.
- **Exact `AppContext` value keys (15 keys):**
  ```js
  [
    "user",
    "setUser",
    "isSynced",
    "syncError",
    "view",
    "setView",
    "userData",
    "setUserData",
    "showAuth",
    "setShowAuth",
    "activeWorkout",
    "setActiveWorkout",
    "clearStorage",
    "handleSavePlan",
    "handleResetSystem",
  ]
  ```

### 3.5 `src/features/onboarding/WelcomeScreen.jsx`
- Remove `import { useAuth } from "../../hooks/useAuth";`.
- Remove `const { handleGuestLogin } = useAuth({});`.
- Remove the `"Run as Guest?"` `<Button>`.
- Keep the `"Initialize Account"` `<Button>` calling `() => setShowAuth(true)` inside `<div className="flex flex-col gap-4 max-w-xs">`.

### 3.6 `src/components/layout/Layout.jsx`
- Remove `import GuestBanner from "../ui/GuestBanner";`.
- Change context destructuring to `const { view, setView } = useAppContext();` (removing both `isGuest` and now-unused `setShowAuth` so ESLint `no-unused-vars` passes cleanly).
- Remove `{isGuest && <GuestBanner onClick={() => setShowAuth(true)} />}`.
- Keep `.app-container`, `.content-area` (with conditional `has-nav`), and `.bottom-nav` unchanged.

### 3.7 `src/components/screens/ProfileScreen.jsx`
- Remove `isGuest` from `useAppContext()` destructuring.
- Render the `LOGOUT` `<Button>` unconditionally (remove `{!isGuest && (...)}` wrapper).
- Render the `DELETE ACCOUNT` `<Button>` unconditionally (remove `{!isGuest && (...)}` wrapper).
- Leave all modal flows, `RESET SYSTEM`, `PRIVACY POLICY`, `File REPORT`, and existing classes unchanged.

### 3.8 `readme.md`
- Replace line 24 (`Flexible Authentication` mentioning anonymous "Guest" logins) with:
  ```markdown
  - **Email/Password Authentication**: Secures user profiles, workout plans, and history with standard email and password accounts.
  ```

### 3.9 `vitest.config.js` (`tester` scope — Stage 3 / Red)
- Owned and updated by `tester` in Stage 3 (Red) so `npm test` discovers and executes `scripts/cleanupAnonymousUsers.test.js` during `red-proof.md` (`implementer` does not modify test config).
- Update `test.include`:
  ```js
  include: ["src/**/*.test.{js,jsx}", "api/**/*.test.js", "scripts/**/*.test.js"],
  ```

---

## 4. Styler Contract (`styler` scope)

- **File to modify:** `src/css/index.css`
- **Change:** Delete the `.guest-banner` rule block (lines 96–104):
  ```css
  .guest-banner {
    padding: 2rem;
    padding-top: calc(var(--safe-top) + 2rem);
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: var(--bg-card);
    border-bottom: 1px solid var(--border-color);
  }
  ```
- **Verification checks:**
  - Confirm zero references to `guest` remain in `src/css/index.css`, `src/css/utils.css`, and `src/css/animations.css`.
  - Confirm `.content-area` retains `padding-top: calc(var(--safe-top) + 2rem);` so top safe-area clearance on Capacitor/iOS is unaffected when `GuestBanner` is absent.
  - Confirm `.app-container` flex column layout and `.bottom-nav` positioning require no changes.
  - Do **not** add new utility classes, inline styles, or unrelated formatting edits.

---

## 5. One-Time Cleanup Script Specification (`scripts/cleanupAnonymousUsers.js`)

### 5.1 Module & Dependency Policy
- Plain ESM JavaScript (matches `"type": "module"` in `package.json`), executable with Node 20+:
  ```bash
  GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json \
    node scripts/cleanupAnonymousUsers.js --dry-run
  ```
  or:
  ```bash
  node scripts/cleanupAnonymousUsers.js --credentials /path/to/serviceAccount.json --dry-run
  node scripts/cleanupAnonymousUsers.js --credentials /path/to/serviceAccount.json
  ```
- **No static top-level `firebase-admin` import:** `firebase-admin` is **not** a client dependency in `package.json`. Load `firebase-admin/app`, `firebase-admin/auth`, and `firebase-admin/firestore` dynamically **only** inside `initializeAdminServices()` when invoked as a CLI.
  - If `firebase-admin` is missing at runtime, throw a descriptive error instructing the operator to install it out-of-band (e.g., `npm install --no-save firebase-admin` or run in an ops environment with `firebase-admin` installed).
  - Never commit or hardcode service account JSON credentials.
- **Import-safe CLI guard:** Guard CLI auto-execution using `process.argv[1]` matched against `fileURLToPath(import.meta.url)` so importing `scripts/cleanupAnonymousUsers.js` in Vitest never runs the CLI, never reads credentials, and never calls `process.exit()`.

### 5.2 Exported Functions & Contracts

```js
export const LIST_PAGE_SIZE = 1000;
export const DELETE_BATCH_LIMIT = 1000;
export const USERS_COLLECTION = "users";
```

1. **`parseCliArgs(argv = [])`**
   - Supported flags:
     - `--dry-run` -> `dryRun: true`
     - `--credentials <path>` or `--credentials=<path>` -> `credentialsPath: <path>` (throws if `--credentials` is missing a value)
     - `--help` or `-h` -> `help: true`
   - Unknown flags throw `new Error(\`Unknown argument: ${arg}\`)`.
   - Returns `{ dryRun: boolean, credentialsPath: string | null, help: boolean }`.

2. **`isAnonymousUser(userRecord)`**
   - Returns `true` iff `userRecord` is an object with a non-empty string `uid` AND `(!Array.isArray(userRecord.providerData) || userRecord.providerData.length === 0)`.
   - Returns `false` for any user with one or more `providerData` entries (e.g., `password`, `google.com`) or malformed/null records.

3. **`chunkArray(items, chunkSize = DELETE_BATCH_LIMIT)`**
   - Throws `RangeError` if `chunkSize` is not a positive integer (`!Number.isInteger(chunkSize) || chunkSize < 1`).
   - Returns `Array<Array<T>>` where each sub-array has length `<= chunkSize`. Empty input returns `[]`.

4. **`cleanupAnonymousUsers({ auth, db, dryRun = false, logger = console, batchSize = DELETE_BATCH_LIMIT })`**
   - **Validation:**
     - Throws `Error` if `!auth || typeof auth.listUsers !== "function" || typeof auth.deleteUsers !== "function"`.
     - Throws `Error` if `!dryRun && (!db || typeof db.doc !== "function" || typeof db.recursiveDelete !== "function")`.
     - Validates `batchSize` is an integer in `[1, DELETE_BATCH_LIMIT]` (throws `RangeError` otherwise).
   - **Algorithm:**
     1. **Paginate Auth users:** Repeatedly call `await auth.listUsers(LIST_PAGE_SIZE, pageToken)` starting with `pageToken = undefined` until `result.pageToken` is falsy. Count every scanned user in `scannedCount` and collect `u.uid` for every user matching `isAnonymousUser(u)` into `anonymousUids`.
     2. **Dry-run mode (`dryRun === true`):**
        - Do **not** call `db.doc()`, `db.recursiveDelete()`, or `auth.deleteUsers()`.
        - Log summary showing `[DRY RUN]`, `scannedCount`, `anonymousCount`, and counts that would be deleted.
        - Return:
          ```js
          {
            dryRun: true,
            scannedCount,
            anonymousCount: anonymousUids.length,
            firestoreDeletedCount: 0,
            authDeletedCount: 0,
            firestoreErrors: [],
            authErrors: [],
          }
          ```
     3. **Live mode (`dryRun === false`):**
        - **Step A — Delete Firestore user trees first (durability order):**
          For each `uid` in `anonymousUids`:
          - Call `await db.recursiveDelete(db.doc(\`${USERS_COLLECTION}/${uid}\`))`.
          - On success: increment `firestoreDeletedCount` and append `uid` to `uidsReadyForAuthDelete`.
          - On error: record `{ uid, message: error?.message || String(error) }` in `firestoreErrors`, log via `logger.error(...)`, and **do not** add `uid` to `uidsReadyForAuthDelete` (preserving the Auth record so re-running the script retries Firestore cleanup instead of orphaning `users/{uid}` permanently).
        - **Step B — Delete Auth users in chunks of `batchSize` (max 1000):**
          For each `batch` in `chunkArray(uidsReadyForAuthDelete, batchSize)`:
          - Call `const res = await auth.deleteUsers(batch)`.
          - Add `res?.successCount ?? 0` to `authDeletedCount`.
          - If `Array.isArray(res?.errors)` and non-empty, for each item push `{ uid: batch[item.index] ?? null, index: item.index, message: item.error?.message || String(item.error) }` to `authErrors` and log via `logger.error(...)`.
          - If `auth.deleteUsers(batch)` itself rejects, record an entry `{ uid, index: null, message: error?.message || String(error) }` for every `uid` in `batch` and log via `logger.error(...)` before continuing to subsequent batches.
        - Log final `[LIVE]` summary via `logger.log(...)` with `scannedCount`, `anonymousCount`, `firestoreDeletedCount`, `authDeletedCount`, `firestoreErrors.length`, and `authErrors.length`.
        - Return:
          ```js
          {
            dryRun: false,
            scannedCount,
            anonymousCount: anonymousUids.length,
            firestoreDeletedCount,
            authDeletedCount,
            firestoreErrors,
            authErrors,
          }
          ```

5. **`initializeAdminServices(credentialsPath)`**
   - Resolves `const resolvedPath = credentialsPath || process.env.GOOGLE_APPLICATION_CREDENTIALS`.
   - Throws `Error` if `resolvedPath` is falsy.
   - Reads and parses JSON from `resolvedPath` using `fs/promises.readFile`.
   - Dynamically imports `firebase-admin/app`, `firebase-admin/auth`, `firebase-admin/firestore`.
   - Initializes app with `cert(serviceAccount)` and returns `{ auth, db, app }`.

6. **`runCli(argv = process.argv.slice(2), deps = {})`**
   - Injectable `deps`: `{ initializeAdminServices, cleanupAnonymousUsers, logger = console }`.
   - Parses args; if `help`, prints usage and returns `{ exitCode: 0 }`.
   - Calls `initializeAdminServices(args.credentialsPath)` and `cleanupAnonymousUsers({ auth, db, dryRun: args.dryRun, logger })`.
   - Returns `{ exitCode: (summary.firestoreErrors.length > 0 || summary.authErrors.length > 0) ? 1 : 0, summary }`.
   - Direct CLI bootstrap sets `process.exitCode = result.exitCode` (or `1` on thrown error after logging).

---

## 6. Manual Console & Ops Runbook (Out-of-Band)

These steps are performed by the human operator in Firebase Console / local terminal and are **not** automated by the app build:

1. **Disable Anonymous Sign-In:**
   - Firebase Console → **Authentication** → **Sign-in method** → **Anonymous** → toggle **Disable** and save.
2. **Update Firestore Security Rules:**
   - Firebase Console → **Firestore Database** → **Rules** → enforce non-anonymous authentication on both `users/{userId}` and `users/{userId}/workouts/{workoutId}`:
     ```firestore
     rules_version = '2';
     service cloud.firestore {
       match /databases/{database}/documents {
         function isSignedInEmailUser(userId) {
           return request.auth != null
             && request.auth.uid == userId
             && request.auth.token.firebase.sign_in_provider != 'anonymous';
         }

         match /users/{userId} {
           allow read, write: if isSignedInEmailUser(userId);

           match /workouts/{workoutId} {
             allow read, write: if isSignedInEmailUser(userId);
           }
         }
       }
     }
     ```
   - *(Note: Once Phase 0 commits `firestore.rules` and `firebase.json` into the repo, keep this exact predicate in version control and cover it in Phase 7 `@firebase/rules-unit-testing` tests.)*
3. **Run the Anonymous User Cleanup Script:**
   - Ensure `firebase-admin` is available in your ops shell (e.g., `npm install --no-save firebase-admin`, never committed).
   - Export your downloaded service account key path (never place inside the repo or commit it):
     ```bash
     export GOOGLE_APPLICATION_CREDENTIALS="/secure/path/service-account.json"
     ```
   - Preview first:
     ```bash
     node scripts/cleanupAnonymousUsers.js --dry-run
     ```
   - Execute live cleanup:
     ```bash
     node scripts/cleanupAnonymousUsers.js
     ```
   - Verify completion (must report `anonymousCount: 0`):
     ```bash
     node scripts/cleanupAnonymousUsers.js --dry-run
     ```

---

## 7. Strict Acceptance Criteria & Vitest Test Matrix

### 7.1 Static / Repo Gates
1. `src/components/ui/GuestBanner.jsx` does not exist.
2. `src/css/index.css` contains no `.guest-banner` rule (and `src/css/*.css` contain zero `guest` matches).
3. `grep -ri guest src` returns **0 matches** across production files AND across all of `src/` (tests MUST assert exact exported key sets / exact rendered buttons / Firebase's `isAnonymous` flag rather than containing the literal substring `guest`, so literal `grep -ri guest src` exits non-zero with 0 lines).
4. `grep -ri signInAnonymously src` returns **0 matches**.
5. `npx eslint src api` exits `0` (and `npx eslint scripts` exits `0` with 0 warnings/errors).
6. `npm test` exits `0` (including `scripts/cleanupAnonymousUsers.test.js` via updated `vitest.config.js`).
7. `npm run build` exits `0`.

### 7.2 Vitest Test Matrix (`tester` must cover all cases)

| Suite | Required Assertions |
| :--- | :--- |
| `src/services/firebase/authServices.test.js` | 1. `Object.keys(authService)` equals exact 7 methods (`signUp`, `signIn`, `logout`, `resetPassword`, `reauthenticate`, `deleteAccount`, `subscribeToAuthChanges`).<br>2. `authService.logout()` calls `signOut(auth)`. |
| `src/hooks/useAuth.test.js` | 1. `Object.keys(useAuth(...))` equals exact 5 handlers (`handleSignUp`, `handleLogin`, `handleResetPassword`, `handleLogout`, `handleDeleteAccount`).<br>2. `handleLogout()` calls `authService.logout()` and does **not** call `firestoreService.clearUserData`, `authService.deleteAccount`, or `clearStorage`, even if passed a user object with `isAnonymous: true`.<br>3. `handleLogout()` catches and logs errors from `authService.logout()` without throwing. |
| `src/hooks/useAuthObserver.test.jsx` | 1. Return value keys are strictly `["user", "setUser"]`.<br>2. When `subscribeToAuthChanges` emits a non-anonymous user (`{ uid: "u1", isAnonymous: false }`), `user` updates to that object, `authService.logout` is not called, and `onLogout` is not called.<br>3. When `subscribeToAuthChanges` emits an anonymous user (`{ uid: "a1", isAnonymous: true }`), `user` remains `null`, `authService.logout()` is called once, and `onLogout` is called.<br>4. When `authService.logout()` rejects asynchronously (or throws synchronously) during anonymous sign-out, no unhandled error escapes, `console.error` logs it, and `user` remains `null`.<br>5. When `subscribeToAuthChanges` emits `null`, `user` resets to `null` and `onLogout` is called.<br>6. Unmounting invokes the unsubscribe function returned by `subscribeToAuthChanges`. |
| `src/features/onboarding/WelcomeScreen.test.jsx` | 1. Renders exactly one button: `"Initialize Account"`.<br>2. Clicking `"Initialize Account"` calls `setShowAuth(true)`. |
| `src/components/layout/Layout.test.jsx` | 1. Renders child content and bottom navigation (`PLAN`, `LOGS`, `PROFILE`) when `view === "plan"`.<br>2. Does **not** render any `"SYNC"` button or banner element.<br>3. Hides bottom navigation when `view === "active"`. |
| `src/components/screens/ProfileScreen.test.jsx` | 1. Always renders `RESET SYSTEM`, `LOGOUT`, `PRIVACY POLICY`, `DELETE ACCOUNT`, and `File REPORT` buttons without requiring any flag in `AppContext`.<br>2. Clicking `LOGOUT` invokes `authService.logout()`.<br>3. Clicking `DELETE ACCOUNT` opens the `"Delete Account?"` confirmation modal. |
| `src/App.test.jsx` | 1. Existing Phase 1 tests continue to pass.<br>2. `Object.keys(contextValue).sort()` matches the exact 15 keys defined in Section 3.4.<br>3. Emitting an anonymous user `{ uid: "anon-1", isAnonymous: true }` from `subscribeToAuthChanges` invokes `authService.logout()`, keeps `contextValue.user === null`, keeps `view === "welcome"`, and makes zero calls to `firestoreService.getUserData` / `firestoreService.getWorkouts`. |
| `scripts/cleanupAnonymousUsers.test.js` | 1. `parseCliArgs`: parses `--dry-run`, `--credentials /a/b.json`, `--credentials=/a/b.json`, `--help`/`-h`, rejects unknown flag, rejects `--credentials` without value.<br>2. `isAnonymousUser`: returns `true` for `providerData: []` or missing `providerData`; returns `false` for `providerData: [{ providerId: "password" }]` and invalid/missing `uid`.<br>3. `chunkArray`: splits 2,500 items into `[1000, 1000, 500]`, returns `[]` for empty input, throws `RangeError` for invalid chunk size.<br>4. `cleanupAnonymousUsers` pagination & filtering: traverses multiple `listUsers` pages using `pageToken`, selects only anonymous users, ignores email/password users.<br>5. `cleanupAnonymousUsers` `--dry-run`: returns accurate `scannedCount` and `anonymousCount`, `firestoreDeletedCount: 0`, `authDeletedCount: 0`, and makes **zero** calls to `db.doc`, `db.recursiveDelete`, or `auth.deleteUsers`.<br>6. `cleanupAnonymousUsers` live mode: deletes `db.doc("users/<uid>")` via `db.recursiveDelete` for every anonymous user, then calls `auth.deleteUsers(batch)` in chunks of `<= 1000` (verified with > 1000 anonymous users or custom `batchSize` + default 1000 cap).<br>7. `cleanupAnonymousUsers` durability on Firestore failure: if `db.recursiveDelete` fails for one UID, records it in `firestoreErrors`, does **not** pass that UID to `auth.deleteUsers`, and still deletes other healthy anonymous UIDs.<br>8. `cleanupAnonymousUsers` partial Auth delete errors: captures `deleteUsers` returned `errors[]` and batch rejection errors in `authErrors` with accurate `authDeletedCount`.<br>9. Importing `scripts/cleanupAnonymousUsers.js` does not execute CLI or touch `process.exit`. |
