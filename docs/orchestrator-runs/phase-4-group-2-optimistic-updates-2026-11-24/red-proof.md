# Red Proof — Phase 4, Group 2: Optimistic Local Updates & Rollback on Failure

**Run ID:** `phase-4-group-2-optimistic-updates-2026-11-24`
**Stage:** Stage 3 (Tester, Red)
**Command:** `npm test` (via `fitgen-dev-tools-tester:run_tests`)
**Exit Code:** `1`

## Summary

- **Test Files:** `3 failed | 24 passed (27)`
- **Tests:** `20 failed | 432 passed (452)`
- **Failure Quality:** All 20 failures are clean `AssertionError` failures directly exercising the unimplemented requirements in `spec.md` (zero syntax errors, zero import errors, zero unrelated failures).

## Failing Test Files

- `failed: src/hooks/useUserData.test.jsx (17 failed)`
- `failed: src/App.test.jsx (2 failed)`
- `failed: src/components/screens/ProfileScreen.test.jsx (1 failed)`

## Frozen Test Files

frozen:
| File | SHA-1 (`git hash-object`) |
|---|---|
| `src/hooks/useUserData.test.jsx` | `9f2f00e558a721b1c4f56f24058292f15dbd5b1c` |
| `src/App.test.jsx` | `f3cba94a91c51df5e259ac47b8b6e5d724882daf` |
| `src/components/screens/ProfileScreen.test.jsx` | `14b4ca89f5f24064eede34e94937bb3a9ddc1098` |

## Acceptance Criteria Coverage

- **AC-1 (`savePlan`):** Immediate optimistic update (preserving `workouts`), `{ plan, profile }` resolution, rollback + rethrow on rejection (`src/hooks/useUserData.test.jsx`).
- **AC-2 (`updatePlan`):** Immediate optimistic update (preserving `profile` & `workouts`), `nextPlan` resolution, rollback + rethrow on rejection (`src/hooks/useUserData.test.jsx`).
- **AC-3 (`addWorkout`):** Immediate normalized 7-field optimistic entry (including legacy nested payload input) with unique `__optimistic_workout_*` ID, verbatim payload forwarding without `id`, in-place reconciliation preserving order/zero duplicates on resolve, targeted removal + rethrow on reject (`src/hooks/useUserData.test.jsx`).
- **AC-4 (`resetProgram`):** Immediate optimistic clear of `plan`/`profile` preserving `workouts`, restoration + rethrow on reject, persistent clear on resolve (`src/hooks/useUserData.test.jsx`).
- **AC-5 (`deleteAll`):** Non-optimistic pending/reject preservation, sync-guard bypass, full clear + epoch invalidation on resolve preventing resurrection by earlier in-flight optimistic writes (`src/hooks/useUserData.test.jsx`).
- **AC-6 (Concurrent doc-slice writes):** All overlapping `updatePlan` (#1 fail/#2 succeed, #1 succeed/#2 fail rolling back to P1, #2 fail then #1 fail, #2 succeed first before #1 resolves/rejects without regressing `committedPlanId`), `updatePlan` + `resetProgram`, and `savePlan` + `updatePlan` combinations (`src/hooks/useUserData.test.jsx`).
- **AC-7 (Concurrent `addWorkout` & slice isolation):** Concurrent `addWorkout` #1 fail / #2 succeed in both settlement orders, out-of-order resolution preserving insertion order with zero duplicates, and concurrent `addWorkout` + `updatePlan`/`resetProgram` slice isolation (`src/hooks/useUserData.test.jsx`).
- **AC-8 (Session / UID isolation):** Logout (`userA -> null`), direct account switch (`userA -> userB`), and logout + same-UID re-login (`userA -> null -> userA`) isolating both late resolve and late reject (`src/hooks/useUserData.test.jsx`).
- **AC-9 (Sync guards before optimistic mutation):** `status === "loading"` and `status === "error"` reject with exact messages before any optimistic state mutation and with zero Firestore writes (`src/hooks/useUserData.test.jsx`).
- **AC-10 (`retrySync` & `clearLocalData` isolation):** Both invalidate prior in-flight optimistic writes so late resolve/reject cannot overwrite freshly hydrated or cleared state (`src/hooks/useUserData.test.jsx`).
- **AC-11 (Caller resilience in `App.jsx` & `ProfileScreen.jsx`):** `handleSavePlan` pins `Profile Setup View` and `handleResetSystem` pins `Profile View` while optimistic state is visible in context and rolls back cleanly on failure (`src/App.test.jsx`); `ProfileScreen` renders safely when `userData.profile` is transiently `null` during an in-flight optimistic reset and supports error + Retry on rollback (`src/components/screens/ProfileScreen.test.jsx`); exact 25 `AppContext` keys & 14 `useUserData` keys preserved.
