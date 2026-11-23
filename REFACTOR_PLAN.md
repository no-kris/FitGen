# FitGen Refactor Plan

This plan is split into seven phases. Each phase can ship on its own and leaves the app working. Phases 1–3 fix live bugs and should come first. Phases 4–7 improve the structure.

| Phase | Goal | Status | Risk if skipped |
|---|---|---|---|
| 0 | Reproduce and get set up | Partial (`refactor/phase-1` branch created; `firestore.rules` not yet in repo) | Fixing the wrong cause |
| 1 | Make workout saves reliable | **Done** (`de9720a`) | Users keep losing workouts |
| 2 | Remove guest mode | **Code done** (manual Firebase Console & cleanup runbook pending) | Guest data keeps piling up in the cloud; the AI endpoint can be abused |
| 3 | Fix smaller bugs | Partial (2 of 12 items landed in Phase 1) | Wrong plans, broken timers, unsafe account deletion |
| 4 | One data layer | Pending (`activeWorkoutStore` landed in Phase 1) | New features bring back the save bugs |
| 5 | Move AI work to the server | Pending | Prompt abuse, malformed plans |
| 6 | Clean up the app shell | Pending (`Button` `...rest` landed in Phase 1) | Slow re-renders, scattered logic |
| 7 | Tests and tooling | In progress (Vitest + RTL + 17 suites / 108 tests across Phases 1–2) | Things break again without anyone noticing |

---

## Phase 0: Reproduce and get set up

**Goal:** Confirm why a workout day fails to save before changing how data is stored.

- [ ] Reproduce the failed save with DevTools open and record the exact Firestore error. Likely candidates are `Unsupported field value: undefined`, `permission-denied`, a network error, or an oversized document.
- [ ] In the Firestore console, check the size of a heavy user's `users/{uid}` document.
- [ ] Copy the deployed Firestore security rules into the repo as `firestore.rules`, add `firebase.json`, and commit both. *(Deployed rules were updated in Firebase Console to allow `users/{userId}/workouts/{workoutId}`, but are not yet committed in the repo.)*
- [x] Create a `refactor` branch (`refactor/phase-1`). Merge each phase back separately.

**Done when:** You know the root cause and the rules are in version control.

---

## Phase 1: Make workout saves reliable — **Done** (`de9720a`)

**Goal:** A finished workout always reaches Firestore, or the user is told it didn't, and nothing is overwritten.

### Root causes this phase fixes
1. **Saves are started but never awaited or checked.** `handleFinishWorkout`, `handleSavePlan`, `handleReplaceExercise` and `handleGenerateNextWeek` all call `saveUserData()` without waiting for it. The app clears `fitgen-active` and changes screens whether or not the save worked. On the next launch, `useCloudSync` replaces local state with the older cloud copy.
2. **The whole history array is rewritten on every save.** `[...history, newLog]` is built from that render's copy of the data. If the startup sync hasn't finished yet, or a second device saved in the meantime, older entries get wiped.
3. **The paused workout isn't tied to its day.** There is only one `fitgen-active` slot. Resuming fills one day's exercises with another day's sets, matched by position.
4. **`undefined` fields.** When the AI reply takes the fallback branch in `generateNextWeekPlan`, `programName` and `description` come back `undefined`, and `setDoc` rejects the write.
5. **No offline cache.** Writes made offline only live in memory and are lost if the app is closed.

### Tasks
- [x] **New data model.** Each finished workout becomes its own document:
  ```
  users/{uid}                     -> { profile, plan, createdAt, updatedAt }
  users/{uid}/workouts/{autoId}   -> { weekNumber, dayNumber, dayName, focus,
                                       logs, duration, completedAt }
  ```
  - Write with `addDoc` (`firestoreService.addWorkout`). Read with `getDocs(query(orderBy("completedAt", "asc")))` (`firestoreService.getWorkouts`).
  - Save only the fields the workout needs via `normalizeWorkoutEntry()`. Don't copy the whole plan day, its exercise alternatives, or a second `logs` array into history. `saveUserData` strips `history`/`workouts` before merging.
- [x] **Migration:** On first load after the update, if `users/{uid}.history` exists, `migrateLegacyHistory()` writes each entry into `workouts/` in chunked batches (max 450 writes/batch) using deterministic IDs (`migrated-w{week}-{day}-{date}`), then deletes the `history` field in the final batch. Idempotent on retry.
- [x] **Awaited writes:** Every write function awaits its call and returns success or rethrows on error (`handleSavePlan`, `handleFinishWorkout`, `handleReplaceExercise`, `handleGenerateNextWeek`, and `ProfileSetupForm` awaits `onSavePlan`). In `ActiveWorkout`:
  - While saving, disable Finish/Exit and show a spinner (`Loader2` + `aria-busy`). Synchronous ref guards in both `ActiveWorkout` and `useWorkout` block double-taps that create duplicate entries.
  - Clear paused storage and leave the screen only after the save succeeds (and suppress trailing auto-save ticks after finish).
  - If the save fails, show an inline `role="alert"` error message with **Retry** and keep the workout on screen.
- [x] **Key paused workouts by week and day.** Implemented `src/services/storage/activeWorkoutStore.js` using versioned key `fitgen:active:v1` (with legacy `fitgen-active` read fallback and cleanup) storing `{ weekNumber, dayNumber, dayName, focus, workout, logs, elapsed }`. `handleStartWorkout` resumes only when `matchesDay` succeeds, otherwise `PlanDashboard` shows a confirmation `Modal` (Resume Paused / Discard & Start / Cancel). Tolerates corrupt JSON and missing `parsed.logs`.
- [x] **Strip `undefined` before writing.** Added pure `stripUndefined()` helper to `firestoreServices.js`, and fall back to the previous `plan.programName` and `plan.description` in `handleGenerateNextWeek`.
- [x] **Offline cache.** In `firebaseHelper.js`, swapped `getFirestore(app)` for:
  ```js
  initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
  ```
- [x] **Sync guard.** Added `isSynced` and `syncError` tracking in `useCloudSync` (exposed via `AppContext`) and guarded cloud writes in `App.jsx` and `useWorkout.js` until initial cloud sync completes.

**Files touched:** `services/storage/activeWorkoutStore.js`, `services/firebase/firebaseHelper.js`, `services/firebase/firestoreServices.js`, `hooks/useCloudSync.js`, `hooks/useWorkout.js`, `App.jsx`, `features/workout/ActiveWorkout.jsx`, `features/dashboard/PlanDashboard.jsx`, `components/screens/LogsScreen.jsx`, `utils/generateNextWeekPlan.js`, `features/onboarding/ProfileSetupForm.jsx`, `components/ui/Button.jsx`, `components/ui/Modal.jsx`, `css/index.css`, plus 10 test suites (`72` passing tests). Run artifacts in `docs/orchestrator-runs/phase-1-reliable-workout-saves-2026-11-23/`.

**Verification & follow-ups:**
- Automated: `npm test` (10 files / 72 tests passing), `npx eslint src api` (0 errors, 0 warnings), `npm run build` (pass).
- Manual: Verified live sync against updated Firestore security rules (`users/{userId}/workouts/{workoutId}`). Still recommended to spot-check airplane-mode offline finish + reconnect on device.
- Follow-up noted: When `useCloudSync` fails (`syncError !== null`), the sync guard currently surfaces `"Still syncing your data from the cloud"` instead of displaying `syncError` with a Retry Sync button; address alongside Phase 3/4 or as a quick follow-up.

**Done when:**
- Finishing a workout in airplane mode, then reconnecting, saves it once.
- Finishing a workout immediately after a cold start doesn't erase earlier history.
- Pausing Monday and starting Wednesday doesn't mix their sets.
- Tapping Finish twice creates one entry.

---

## Phase 2: Remove guest mode — **Code done** (manual Console/ops steps pending)

**Goal:** Only email accounts. No anonymous users in Auth or Firestore.

### Why
- Guests can't log out (`ProfileScreen` hides the button), so the cleanup in `handleLogout` never runs.
- Signing up from the guest banner creates a new account instead of linking the guest one, so the guest's Auth record and data stay behind.
- Anyone can sign in anonymously and use `/api/callModel` as a free AI proxy.

### Code tasks
- [x] Delete `components/ui/GuestBanner.jsx` and the `.guest-banner` rule (`css/index.css`, line ~95).
- [x] `WelcomeScreen.jsx`: remove the "Run as Guest?" button and `useAuth({})`.
- [x] `hooks/useAuth.js`: remove `handleGuestLogin` and the `isAnonymous` branch in `handleLogout`.
- [x] `services/firebase/authServices.js`: remove `signInGuest` and the `signInAnonymously` import.
- [x] `hooks/useAuthObserver.js`: remove the `isGuest` state. If `currentUser.isAnonymous`, call `authService.logout()` safely (handling sync/async errors) and treat the user as logged out (`user: null`). This handles phones still signed in as guests.
- [x] `App.jsx`: remove `isGuest`/`setIsGuest` from the context and the outdated comment in `handleLogoutEvent`.
- [x] `components/layout/Layout.jsx`: remove the banner (and unused `isGuest`/`setShowAuth`).
- [x] `components/screens/ProfileScreen.jsx`: remove the `!isGuest` checks so Logout and Delete Account always show.
- [x] `readme.md`: remove the guest-login feature.

### Console and ops tasks
- [ ] In Firebase Console → Authentication → Sign-in method, turn off **Anonymous**.
- [x] Add a one-time cleanup script, `scripts/cleanupAnonymousUsers.js`, using the Firebase Admin SDK with a service account (loaded dynamically so `firebase-admin` stays out of client dependencies; don't commit the key). Supports pagination, Firestore `recursiveDelete` before chunked `auth.deleteUsers` (<=1000), `--dry-run`, `--credentials`, and import-safe CLI guard; covered by `scripts/cleanupAnonymousUsers.test.js`. *(Script written & tested; still needs to be run out-of-band against production Firebase.)*
- [ ] Update `firestore.rules` (and Firebase Console Rules) so only non-anonymous users can read or write: `request.auth.token.firebase.sign_in_provider != 'anonymous'`.

### Decision (resolved)
- **Chosen:** **Option A — Hard cutoff (recommended)**. Shipped Phase 2 removing all guest UI/auth entry points and auto-signing-out any cached anonymous session on startup.

**Verification:** `npm test` (17/17 files, 108/108 tests), `npx eslint src api` (exit 0), `npx eslint scripts` (exit 0), `npm run build` (exit 0), `grep -ri guest src` (0 matches), `grep -ri signInAnonymously src` (0 matches). Run artifacts in `docs/orchestrator-runs/phase-2-remove-guest-mode-2026-11-23/`.

**Done when:** Anonymous sign-in is off, the dry run reports 0 anonymous users after cleanup, and `grep -ri guest src` finds nothing.

---

## Phase 3: Fix smaller bugs

**Goal:** Fix known bugs that don't depend on the new data structure.

- [ ] **Session duration ignored:** `generateNextWeekPlan` reads `profile.sessionDuration`, but the field is `profile.duration`, so later weeks always use 60 minutes.
- [ ] **Rest timer parsing:** `parseInt(exercise.rest)` turns "2-3m" into 2 seconds, and "N/A" into `NaN`, which never ends the timer. Add `parseRestSeconds()`: handle `s`/`m`/ranges (use the upper end), and default to 90.
- [ ] **Sets parsing:** `parseInt(e.sets)` returns `NaN` for values like "AMRAP", which creates zero rows. Default to 3.
- [x] **Errors from next-week generation are swallowed:** `handleGenerateNextWeek` catches its own errors. Pass them on so `PlanDashboard` can show them. *(Done in Phase 1.)*
- [ ] **Week tab jumps:** `PlanDashboard`'s `useEffect([plan])` moves to the last week whenever the plan changes. Only do this when `plan.weeks.length` grows.
- [ ] **Props edited in place:** Remove `details.exercises[index].name = alt` from `DayDetailModal`.
- [ ] **Account deletion order:** Re-authenticate first (`authService.reauthenticate` exists but isn't used), then delete the Firestore data, then the Auth user. Never leave an account with its data already deleted.
- [ ] **Reset Program wipes history:** Reset should clear only `plan` and `profile`. History is separate now, after Phase 1.
- [ ] **Logout leaves data behind:** Clear `fitgen-active*` keys on logout.
- [ ] **Exclusions/priorities type:** Default them to `""` instead of `[]`, and treat empty as "None" in both the prompt and `ProfileScreen`.
- [ ] **Setup errors:** `errors ? ...` is always truthy, and errors never clear after a step passes. Reset them when moving to the next step.
- [x] **Exercise swap crashes when there are no alternatives:** Guard `exercise.alternatives` in `handleReplaceExercise`. *(Done in Phase 1.)*

**Done when:** Each item has been checked by hand (or covered by a unit test in Phase 7).

---

## Phase 4: One data layer

**Goal:** Components never call Firestore directly. All reads and writes go through one place that tracks loading and error states.

- [ ] Create `hooks/useUserData.js` (or a small `services/repository.js` plus a hook) that exposes:
  - `profile`, `plan`, `workouts`, `status: 'loading' | 'ready' | 'error'`
  - `savePlan`, `updatePlan`, `addWorkout`, `resetProgram`, `deleteAll`, each returning a promise
- [ ] Update the local state immediately and roll it back if the write fails.
- [ ] Optionally replace the one-time `getDoc` with `onSnapshot` listeners so multiple devices stay in sync live.
- [ ] Remove `saveToLocalStorage.js` (unused) and move all `localStorage` access into `services/activeWorkoutStore.js`. *(`localStorage` access already moved to `src/services/storage/activeWorkoutStore.js` in Phase 1; removing unused `saveToLocalStorage.js` remains.)*
- [ ] `useCloudSync` gets absorbed into `useUserData`.

**Done when:** `grep -r firestoreService src/features src/components` finds nothing.

---

## Phase 5: Move AI work to the server

**Goal:** The client sends structured inputs. The server writes the prompt, calls the model, and checks the result.

- [ ] Replace `api/callModel.js` with:
  - `api/generatePlan.js`, which takes the profile form data
  - `api/generateWeek.js`, which takes `{ profile, lastWeek, recentWorkouts, feedback }`
- [ ] Move the prompt text from `src/utils/generateInitialPlan.js` and `generateNextWeekPlan.js` into `api/_prompts.js`.
- [ ] Add `api/_validatePlan.js`:
  - Check the shape of the response: `weeks[].schedule[].exercises[]`, with required fields.
  - Clean up values: whole-number `sets`, `restSeconds`, and default `alternatives: []`.
  - Make sure scheduled days ⊆ `selectedDays` and `weekNumber` matches the expected value.
- [ ] Return 422 when the response fails validation, and let the client retry only on 5xx or 422, never on 401 or 400.
- [ ] Add a basic per-user rate limit, for example with Vercel KV/Upstash or a Firestore counter.
- [ ] Delete `api/debug.js`.
- [ ] Fix `verifyFirebaseToken` so it also rejects anonymous tokens (defense in depth after Phase 2).
- [ ] Move `extractJsonFromText` to the server and delete the client copy.

**Done when:** The client bundle contains no prompt text, and malformed AI output never reaches Firestore.

---

## Phase 6: Clean up the app shell

**Goal:** Clearer structure and fewer unnecessary re-renders.

- [ ] Split `AppContext` into an `AuthContext` (user, auth actions) and a `DataContext` (from Phase 4). Wrap the values in `useMemo`.
- [ ] Replace the `view` string with a tiny router, or keep the string but add a `views.js` map. Handle Android's hardware back button with the Capacitor `App` plugin.
- [ ] Move `utils/handleModeChange.jsx` into `features/auth/` (it's a component).
- [ ] Turn `renderStep.jsx` into a config array of `{ title, component, validate }` and merge in `handleNextStep.js`.
- [ ] Replace `alert()` with a `Toast` component.
- [ ] `Button`: pass the remaining props (`...rest`) through. `TextInput` already receives `inputMode`, which is currently dropped. *(`Button` `...rest` forwarding done in Phase 1; `TextInput` `inputMode` remains.)*
- [ ] Remove unused imports (`Settings` in ProfileScreen, `Weight` in ActiveWorkout, etc.). Fix the lint warnings.

**Done when:** `npm run lint` passes with no warnings.

---

## Phase 7: Tests and tooling

**Goal:** Keep the fixes from breaking again.

- [x] Add Vitest and React Testing Library. *(Added with 17 test suites / 108 passing tests across Phases 1–2, plus `scripts/**/*.test.js` in `vitest.config.js`.)*
- [ ] Write unit tests for `parseRestSeconds`, `extractJsonFromText`, `validatePlan`, `stripUndefined`, and the active-workout store's key logic. *(`stripUndefined` and `activeWorkoutStore` tests done in Phase 1; `parseRestSeconds`, `extractJsonFromText`, and `validatePlan` remain.)*
- [ ] Add Firestore rules tests with `@firebase/rules-unit-testing` and the emulator: the owner can read and write, other users and anonymous users can't.
- [ ] Add a GitHub Action that runs lint, tests and build on each PR.
- [ ] Optionally convert to TypeScript, starting with the data model types (`Plan`, `Week`, `Day`, `Exercise`, `WorkoutLog`).

**Done when:** CI passes on `main`.

---

## Suggested order and size

| Phase | Depends on | Rough size |
|---|---|---|
| 0 | — | 0.5 day |
| 1 | 0 | 2–3 days |
| 2 | — (can run alongside 1) | 1 day + cleanup script |
| 3 | 1 (for the reset/history item) | 1–2 days |
| 4 | 1 | 2 days |
| 5 | — | 2 days |
| 6 | 4 | 1–2 days |
| 7 | ongoing; rules tests after 0 | 1–2 days |

### Notes for running this plan

- Phase 0 is human work. Have the recorded Firestore error and the committed `firestore.rules` and `firebase.json` before starting Phase 1.
- Phases 1 and 2 both touch `App.jsx`, `hooks/useAuthObserver.js`, and `components/screens/ProfileScreen.jsx`. Finish Phase 1 first, or run Phase 2 in its own git worktree.
- Phase 5 is independent of Phase 4 and can run in a parallel worktree.
- Phase 7 runs alongside the others: add tests as each phase lands.
