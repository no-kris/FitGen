# Review Report (Round 1) — Phase 4 Group 3: Real-Time Multi-Device Sync via `onSnapshot`

**Run ID:** `phase-4-group-3-realtime-sync-2026-11-24`  
**Stage:** Stage 10 — Reviewer (Round 1)  
**Verdict:** `PASS`  
**Branch / Base Commit:** `iphone` (`74b612a5aab2628d2ed3001f5fe7056e052c2505`)

---

## 1. Diff & Scope Audit

Inspected via `fitgen-dev-tools-reviewer` (`git_status_diff` modes `status`, `diff_stat`, `diff`, `rev_parse`) and direct full-file reads of all 5 changed in-scope files:

- **In-scope product files modified (2):**
  - `src/services/firebase/firestoreServices.js` (`+52` lines)
  - `src/hooks/useUserData.js` (`+477 / -134` lines)
- **In-scope test files modified (3):**
  - `src/services/firebase/firestoreServices.test.js`
  - `src/hooks/useUserData.test.jsx`
  - `src/App.test.jsx`
- **Explicitly untouched files verified clean:** `src/App.jsx`, `src/hooks/useWorkout.js`, `src/hooks/useAuth.js`, `src/hooks/useAuthObserver.js`, `src/services/firebase/firebaseHelper.js`, `src/components/**`, `src/features/**`, `src/css/**`, `firestore.rules`, `dist/`, `ios/`, `node_modules/`.
- **Pre-existing out-of-band workspace files (baseline prior to run, untouched):** `M REFACTOR_PLAN.md`, `?? MODULARIZATION_TS_PLAN.md`.

---

## 2. Spec Conformance Audit (`spec.md` Sections 2–6)

### 2.1 Firestore Real-Time Subscription Layer (`src/services/firebase/firestoreServices.js`) — PASS
- Imports `onSnapshot` from `"firebase/firestore"` and leaves all 7 pre-existing `firestoreService` methods and all 4 named exports (`COLLECTIONS`, `stripUndefined`, `normalizeWorkoutEntry`, `buildMigrationWorkoutId`) untouched.
- `subscribeUserData(userId, onData, onError)`:
  - Synchronously validates `userId` and `typeof onData === "function"` with exact spec error messages before calling `doc` or `onSnapshot`.
  - Subscribes to `doc(db, COLLECTIONS.USERS, userId)`, forwards `docSnap.exists() ? docSnap.data() : null`, logs errors via `console.error("Error subscribing to user data:", error)`, safely forwards to optional `onError`, and returns the exact `unsubscribe` callback.
- `subscribeWorkouts(userId, onData, onError)`:
  - Synchronously validates `userId` and `typeof onData === "function"` with exact spec error messages before calling `collection`, `query`, or `onSnapshot`.
  - Queries `collection(db, COLLECTIONS.USERS, userId, COLLECTIONS.WORKOUTS)` with canonical `orderBy("completedAt", "asc")` (preserving `LogsScreen` reverse rendering, `generateNextWeekPlan` `.slice(-10)`, and optimistic append ordering).
  - Normalizes docs to `{ id: d.id, ...d.data() }` (`[]` when empty), logs errors via `console.error("Error subscribing to workouts:", error)`, safely forwards to optional `onError`, and returns the exact `unsubscribe` callback.

### 2.2 Real-Time Hook Integration (`src/hooks/useUserData.js`) — PASS
- **Public contract:** Exact 14-key return shape and `{ onSyncComplete }` option preserved; `isSynced`, `syncError`, `status`, and write-guard error messages match Section 5.1 & 5.6.
- **Causal startup & one-time guards:**
  - `subscribeUserData` attaches first; first snapshot runs `migrateLegacyHistory` at most once (if `Array.isArray(cloudData?.history)`) before `attachWorkoutsListener()` calls `subscribeWorkouts`.
  - Subsequent `users/{uid}` snapshots during or after migration never re-run migration or attach a second workouts listener.
  - First `workouts` snapshot hydrates from cloud or runs one-time pre-login bootstrap (`saveUserData` with `plan`/`profile` only, excluding workouts); echoed snapshots during or after bootstrap never re-trigger bootstrap or finalize early; bootstrap failure preserves `localDataRef.current` with `ownerUid: null` for `retrySync()` recovery.
  - `fireSyncCompleteOnce` guarantees `onSyncComplete` fires at most once per sync cycle (never on subsequent live snapshots or mid-session errors after initial `ready`).
- **Listener cleanup & synchronous error safety:**
  - `teardownSubscriptions()` clears `activeUnsubscribersRef.current = []` before invoking each unsubscribe through `safeUnsubscribe`, ensuring idempotent once-only teardown across unmount, logout, UID switch, `retrySync()`, `deleteAll()` resolve, `clearLocalData()`, and listener errors.
  - Post-registration `if (!isActive()) safeUnsubscribe(unsub)` on both `subscribeUserData` and `subscribeWorkouts` prevents leaked listeners even if `onError` or a re-entrant teardown triggers synchronously during registration.
  - `onSyncComplete` is held in `onSyncCompleteRef` and effect dependencies are `[uid, syncAttempt, teardownSubscriptions]` (`teardownSubscriptions` memoized with `[]`), preventing resubscription on same-UID `user` or callback identity changes.
- **Live reconciliation with optimistic writes:**
  - `docSliceRef`: live `users/{uid}` updates replace `slice.committed` while preserving `committedPlanId`, `committedProfileId`, and `pending` patches. Untouched fields update live, pending fields keep optimistic values, rejected writes roll back to the latest live snapshot baseline, and out-of-order late settlements cannot regress `committedPlanId`/`committedProfileId`.
  - `workoutSliceRef`: `isMatchingWorkoutEcho` + `computeWorkouts` cleanly reconcile remote workouts during pending `addWorkout`, pre-resolve Firestore echoes (zero transient or post-resolve duplicates even when fallback `completedAt` differs), post-resolve echoes, and concurrent out-of-order `addWorkout` resolutions/rejections.
- **`deleteAll()` & `deleteSuppressionRef`:**
  - Remains non-optimistic and bypasses `assertReadyForWrite` (works in `"loading"`, `"error"`, and `"ready"`).
  - Captures the per-cycle `suppression` object so cycle resets cannot corrupt ref counts; suppresses intermediate batch-delete snapshots while pending; on resolve bumps `sessionEpochRef`, tears down listeners, resets slices, and clears state; on reject leaves listeners alive and replays any buffered snapshot/error so initial sync cannot hang.

---

## 3. Coding Standards & Pipeline Integrity Audit

- **Coding standards (`.memory/knowledge/coding-standards.md`):**
  - Plain JS, 2-space indentation, double quotes, semicolons, trailing commas; no unrelated reformatting or renames.
  - Zero inline styles, zero CSS edits, zero direct `localStorage` access in product code.
  - Every Firestore write is awaited or handled with `.catch(...)` (`migrateLegacyHistory`, bootstrap `saveUserData`, `runOptimisticDocWrite`, `addWorkout`, `deleteAll`), and no empty `catch` blocks exist.
  - Canonical `COLLECTIONS` constants used throughout; no magic strings; no data-shape regressions.
- **Red Proof / Green Report / Verification Integrity:**
  - Stage 3 red proof recorded 63 clean `AssertionError` failures covering AC-1 through AC-20 across the 3 test files.
  - Frozen SHA-1 hashes match identically across `red-proof.md`, `green-report-round-1.md`, and `verification.md`:
    - `src/services/firebase/firestoreServices.test.js`: `3ab9255498b5638c8b2c7241780ba73d6c2863a6` (HOLD)
    - `src/hooks/useUserData.test.jsx`: `125a856654651d36d4c50e70c569c818dad862dc` (HOLD)
    - `src/App.test.jsx`: `b68def9cdf784a2914107680fbe57829a76e0212` (HOLD)
  - All verification gates exited `0` (`npx eslint src api`: 0 errors/warnings; `npm test`: 27/27 files, 473/473 tests; `npm run build`: 1790 modules transformed).

---

## 4. Findings

None. Zero blocking defects or spec deviations found.

---

## 5. Handoff

```text
HANDOFF
phase: 10
from: reviewer
to: orchestrator
status: pass
files: docs/orchestrator-runs/phase-4-group-3-realtime-sync-2026-11-24/review.md
contract: PASS — Implementation in src/services/firebase/firestoreServices.js and src/hooks/useUserData.js conforms fully to spec.md (Sections 2–6), coding-standards.md, and all frozen Stage 3 tests (AC-1..AC-20) with zero defects or scope regressions
evidence: git_status_diff (status, diff_stat, diff, rev_parse) -> exitCode 0 (5 in-scope files + 2 pre-existing out-of-band files); read spec.md, red-proof.md, green-report-round-1.md, verification.md, coding-standards.md, testing.md, firestoreServices.js, useUserData.js, firestoreServices.test.js, useUserData.test.jsx, App.test.jsx; frozen hashes verified HOLD across red-proof/green-report/verification
open: none
```
