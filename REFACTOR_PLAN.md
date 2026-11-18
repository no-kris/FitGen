# FitGen Refactor Plan

This plan is split into seven phases. Each phase can ship on its own and leaves the app working. Phases 1–3 fix live bugs and should come first. Phases 4–7 improve the structure.

| Phase | Goal | Risk if skipped |
|---|---|---|
| 0 | Reproduce and get set up | Fixing the wrong cause |
| 1 | Make workout saves reliable | Users keep losing workouts |
| 2 | Remove guest mode | Guest data keeps piling up in the cloud; the AI endpoint can be abused |
| 3 | Fix smaller bugs | Wrong plans, broken timers, unsafe account deletion |
| 4 | One data layer | New features bring back the save bugs |
| 5 | Move AI work to the server | Prompt abuse, malformed plans |
| 6 | Clean up the app shell | Slow re-renders, scattered logic |
| 7 | Tests and tooling | Things break again without anyone noticing |

---

## Phase 0: Reproduce and get set up

**Goal:** Confirm why a workout day fails to save before changing how data is stored.

- [ ] Reproduce the failed save with DevTools open and record the exact Firestore error. Likely candidates are `Unsupported field value: undefined`, `permission-denied`, a network error, or an oversized document.
- [ ] In the Firestore console, check the size of a heavy user's `users/{uid}` document.
- [ ] Copy the deployed Firestore security rules into the repo as `firestore.rules`, add `firebase.json`, and commit both.
- [ ] Create a `refactor` branch. Merge each phase back separately.

**Done when:** You know the root cause and the rules are in version control.

---

## Phase 1: Make workout saves reliable

**Goal:** A finished workout always reaches Firestore, or the user is told it didn't, and nothing is overwritten.

### Root causes this phase fixes
1. **Saves are started but never awaited or checked.** `handleFinishWorkout`, `handleSavePlan`, `handleReplaceExercise` and `handleGenerateNextWeek` all call `saveUserData()` without waiting for it. The app clears `fitgen-active` and changes screens whether or not the save worked. On the next launch, `useCloudSync` replaces local state with the older cloud copy.
2. **The whole history array is rewritten on every save.** `[...history, newLog]` is built from that render's copy of the data. If the startup sync hasn't finished yet, or a second device saved in the meantime, older entries get wiped.
3. **The paused workout isn't tied to its day.** There is only one `fitgen-active` slot. Resuming fills one day's exercises with another day's sets, matched by position.
4. **`undefined` fields.** When the AI reply takes the fallback branch in `generateNextWeekPlan`, `programName` and `description` come back `undefined`, and `setDoc` rejects the write.
5. **No offline cache.** Writes made offline only live in memory and are lost if the app is closed.

### Tasks
- [ ] **New data model.** Each finished workout becomes its own document:
  ```
  users/{uid}                     -> { profile, plan, createdAt, updatedAt }
  users/{uid}/workouts/{autoId}   -> { weekNumber, dayNumber, dayName, focus,
                                       logs, duration, completedAt }
  ```
  - Write with `addDoc`. Read with `getDocs(query(orderBy("completedAt")))`.
  - Save only the fields the workout needs. Don't copy the whole plan day, its exercise alternatives, or a second `logs` array into history.
- [ ] **Migration:** On first load after the update, if `users/{uid}.history` exists, write each entry into `workouts/` with a batched write, then delete the `history` field. Make it safe to run more than once, for example by building document IDs from `weekNumber-dayNumber-date`.
- [ ] **Awaited writes:** Every write function awaits its call and returns success or an error. In `ActiveWorkout`:
  - While saving, disable Finish and show a spinner. This also blocks double-taps that create duplicate entries.
  - Clear `fitgen-active` and leave the screen only after the save succeeds.
  - If the save fails, show a message with **Retry** and keep the workout on screen.
- [ ] **Key paused workouts by week and day.** Rename the key to `fitgen-active:{weekNumber}-{dayNumber}`, or keep one key but store `{ weekNumber, dayNumber }` in it. `handleStartWorkout` should resume only when they match the day being started, and otherwise ask the user whether to discard the paused workout. Handle `parsed.logs` being missing.
- [ ] **Strip `undefined` before writing.** Add a `stripUndefined()` helper to `firestoreServices`, and fall back to the previous `plan.programName` and `plan.description` in `handleGenerateNextWeek`.
- [ ] **Offline cache.** In `firebaseHelper.js`, swap `getFirestore(app)` for:
  ```js
  initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
  ```
- [ ] **Sync guard.** Block saves (or queue them) until the first cloud sync has finished. Track this with an `isSynced` flag in `useCloudSync`.

**Files:** `hooks/useWorkout.js`, `hooks/useCloudSync.js`, `services/firebase/firestoreServices.js`, `services/firebase/firebaseHelper.js`, `features/workout/ActiveWorkout.jsx`, `features/dashboard/PlanDashboard.jsx` (completion check), `components/screens/LogsScreen.jsx` (reads from the new collection).

**Done when:**
- Finishing a workout in airplane mode, then reconnecting, saves it once.
- Finishing a workout immediately after a cold start doesn't erase earlier history.
- Pausing Monday and starting Wednesday doesn't mix their sets.
- Tapping Finish twice creates one entry.

---

## Phase 2: Remove guest mode

**Goal:** Only email accounts. No anonymous users in Auth or Firestore.

### Why
- Guests can't log out (`ProfileScreen` hides the button), so the cleanup in `handleLogout` never runs.
- Signing up from the guest banner creates a new account instead of linking the guest one, so the guest's Auth record and data stay behind.
- Anyone can sign in anonymously and use `/api/callModel` as a free AI proxy.

### Code tasks
- [ ] Delete `components/ui/GuestBanner.jsx` and the `.guest-banner` rule (`css/index.css`, line ~95).
- [ ] `WelcomeScreen.jsx`: remove the "Run as Guest?" button and `useAuth({})`.
- [ ] `hooks/useAuth.js`: remove `handleGuestLogin` and the `isAnonymous` branch in `handleLogout`.
- [ ] `services/firebase/authServices.js`: remove `signInGuest` and the `signInAnonymously` import.
- [ ] `hooks/useAuthObserver.js`: remove the `isGuest` state. If `currentUser.isAnonymous`, call `signOut()` and treat the user as logged out. This handles phones still signed in as guests.
- [ ] `App.jsx`: remove `isGuest`/`setIsGuest` from the context and the outdated comment in `handleLogoutEvent`.
- [ ] `components/layout/Layout.jsx`: remove the banner.
- [ ] `components/screens/ProfileScreen.jsx`: remove the `!isGuest` checks so Logout and Delete Account always show.
- [ ] `readme.md`: remove the guest-login feature.

### Console and ops tasks
- [ ] In Firebase Console → Authentication → Sign-in method, turn off **Anonymous**.
- [ ] Add a one-time cleanup script, `scripts/cleanupAnonymousUsers.js`, using the Firebase Admin SDK with a service account. Don't commit the key. The script should:
  1. Go through `auth.listUsers()` page by page and select users with an empty `providerData`.
  2. Delete each one's `users/{uid}` document and its `workouts` subcollection, using `recursiveDelete`.
  3. Delete the Auth users with `auth.deleteUsers(uids)` in batches of 1000.
  4. Support a `--dry-run` flag that only prints counts.
- [ ] Update `firestore.rules` so only non-anonymous users can read or write: `request.auth.token.firebase.sign_in_provider != 'anonymous'`.

### Open decision
Some people are probably partway through a program as guests. Options:
- **Hard cutoff (recommended):** Ship this phase as written. Those guests lose their data.
- **One transition release:** Signing up from a guest session calls `linkWithCredential`, so the guest's data moves to the new account. Remove guest mode in the following release.

**Done when:** Anonymous sign-in is off, the dry run reports 0 anonymous users after cleanup, and `grep -ri guest src` finds nothing.

---

## Phase 3: Fix smaller bugs

**Goal:** Fix known bugs that don't depend on the new data structure.

- [ ] **Session duration ignored:** `generateNextWeekPlan` reads `profile.sessionDuration`, but the field is `profile.duration`, so later weeks always use 60 minutes.
- [ ] **Rest timer parsing:** `parseInt(exercise.rest)` turns "2-3m" into 2 seconds, and "N/A" into `NaN`, which never ends the timer. Add `parseRestSeconds()`: handle `s`/`m`/ranges (use the upper end), and default to 90.
- [ ] **Sets parsing:** `parseInt(e.sets)` returns `NaN` for values like "AMRAP", which creates zero rows. Default to 3.
- [ ] **Errors from next-week generation are swallowed:** `handleGenerateNextWeek` catches its own errors. Pass them on so `PlanDashboard` can show them.
- [ ] **Week tab jumps:** `PlanDashboard`'s `useEffect([plan])` moves to the last week whenever the plan changes. Only do this when `plan.weeks.length` grows.
- [ ] **Props edited in place:** Remove `details.exercises[index].name = alt` from `DayDetailModal`.
- [ ] **Account deletion order:** Re-authenticate first (`authService.reauthenticate` exists but isn't used), then delete the Firestore data, then the Auth user. Never leave an account with its data already deleted.
- [ ] **Reset Program wipes history:** Reset should clear only `plan` and `profile`. History is separate now, after Phase 1.
- [ ] **Logout leaves data behind:** Clear `fitgen-active*` keys on logout.
- [ ] **Exclusions/priorities type:** Default them to `""` instead of `[]`, and treat empty as "None" in both the prompt and `ProfileScreen`.
- [ ] **Setup errors:** `errors ? ...` is always truthy, and errors never clear after a step passes. Reset them when moving to the next step.
- [ ] **Exercise swap crashes when there are no alternatives:** Guard `exercise.alternatives` in `handleReplaceExercise`.

**Done when:** Each item has been checked by hand (or covered by a unit test in Phase 7).

---

## Phase 4: One data layer

**Goal:** Components never call Firestore directly. All reads and writes go through one place that tracks loading and error states.

- [ ] Create `hooks/useUserData.js` (or a small `services/repository.js` plus a hook) that exposes:
  - `profile`, `plan`, `workouts`, `status: 'loading' | 'ready' | 'error'`
  - `savePlan`, `updatePlan`, `addWorkout`, `resetProgram`, `deleteAll`, each returning a promise
- [ ] Update the local state immediately and roll it back if the write fails.
- [ ] Optionally replace the one-time `getDoc` with `onSnapshot` listeners so multiple devices stay in sync live.
- [ ] Remove `saveToLocalStorage.js` (unused) and move all `localStorage` access into `services/activeWorkoutStore.js`.
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
- [ ] `Button`: pass the remaining props (`...rest`) through. `TextInput` already receives `inputMode`, which is currently dropped.
- [ ] Remove unused imports (`Settings` in ProfileScreen, `Weight` in ActiveWorkout, etc.). Fix the lint warnings.

**Done when:** `npm run lint` passes with no warnings.

---

## Phase 7: Tests and tooling

**Goal:** Keep the fixes from breaking again.

- [ ] Add Vitest and React Testing Library.
- [ ] Write unit tests for `parseRestSeconds`, `extractJsonFromText`, `validatePlan`, `stripUndefined`, and the active-workout store's key logic.
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
