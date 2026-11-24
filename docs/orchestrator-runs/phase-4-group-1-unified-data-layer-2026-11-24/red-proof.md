# Red Proof — Phase 4 Group 1 (Unified Data Layer & Legacy Sync Absorption)

- **Command:** `npm test` (via `fitgen-dev-tools-tester` -> `run_tests`)
- **Exit code:** `1`
- **Summary:**
  - Test Files: `7 failed | 20 passed (27)`
  - Tests: `29 failed | 388 passed (417)` (`src/hooks/useUserData.test.jsx` contains 16 spec tests that cannot execute until `src/hooks/useUserData.js` is created in Stage 4)
  - Errors: `2` unhandled Firestore permission rejections from unrefactored `src/hooks/useWorkout.js` still calling live `firestoreService` directly (will resolve once `useWorkout.js` removes direct `firestoreService` calls)

## Failing Test Files

- `failed: src/hooks/useUserData.test.jsx (suite failed: missing ./useUserData module — 16 tests pending creation of src/hooks/useUserData.js)`
- `failed: src/App.test.jsx (9 failed)`
- `failed: src/hooks/useAuth.test.js (4 failed)`
- `failed: src/hooks/useWorkout.test.jsx (9 failed)`
- `failed: src/components/screens/ProfileScreen.test.jsx (1 failed)`
- `failed: src/features/dashboard/PlanDashboard.test.jsx (2 failed)`
- `failed: src/features/workout/ActiveWorkout.test.jsx (4 failed)`

## Deleted Test Files

- `deleted: src/hooks/useCloudSync.test.jsx`

## Frozen Test Files (`git hash-object`)

`frozen:`

| Test File | SHA-1 (`git hash-object`) |
|---|---|
| `src/hooks/useUserData.test.jsx` | `bf6bef2953812e05c2bb945d2f094851e183171c` |
| `src/hooks/useAuth.test.js` | `0b88fccbe344fe6b1a666c5fe2c36c4b5ec4f517` |
| `src/hooks/useWorkout.test.jsx` | `f47fc987e6d7055d453da68b109a3b036965eb0b` |
| `src/components/screens/ProfileScreen.test.jsx` | `831f4aafa29efc4fd1c4f6ddd0293164384fe6d4` |
| `src/features/dashboard/PlanDashboard.test.jsx` | `a104844a8340ebb38269a21d294466536002b13c` |
| `src/features/workout/ActiveWorkout.test.jsx` | `0111fa5eab4430ffc5634b125eb5174df541eddf` |
| `src/App.test.jsx` | `02a770b8df084df68afae507e0eecced2d896b49` |

## Discovered Test Suite Inventory (27 files)

1. `mcp/devToolsMcpServer.test.js`
2. `src/App.test.jsx`
3. `src/components/layout/Layout.test.jsx`
4. `src/components/screens/LogsScreen.test.jsx`
5. `src/components/screens/ProfileScreen.test.jsx`
6. `src/features/auth/DeleteAccountModal.test.jsx`
7. `src/features/dashboard/PlanDashboard.test.jsx`
8. `src/features/onboarding/ProfileSetupForm.test.jsx`
9. `src/features/onboarding/WelcomeScreen.test.jsx`
10. `src/features/onboarding/helpers/handleNextStep.test.js`
11. `src/features/workout/ActiveWorkout.test.jsx`
12. `src/features/workout/DayDetailModal.test.jsx`
13. `src/features/workout/RestTimer.test.jsx`
14. `src/features/workout/WorkoutCard.test.jsx`
15. `src/hooks/useAuth.test.js`
16. `src/hooks/useAuthObserver.test.jsx`
17. `src/hooks/useUserData.test.jsx`
18. `src/hooks/useWorkout.test.jsx`
19. `src/services/firebase/authServices.test.js`
20. `src/services/firebase/firebaseHelper.test.js`
21. `src/services/firebase/firestoreServices.test.js`
22. `src/services/storage/activeWorkoutStore.test.js`
23. `src/utils/generateInitialPlan.test.js`
24. `src/utils/generateNextWeekPlan.test.js`
25. `src/utils/normalizeProfileText.test.js`
26. `src/utils/parseRestSeconds.test.js`
27. `src/utils/parseSetsCount.test.js`

```text
HANDOFF
phase: 4
from: tester
to: orchestrator
status: done
files: src/hooks/useUserData.test.jsx, src/hooks/useAuth.test.js, src/hooks/useWorkout.test.jsx, src/components/screens/ProfileScreen.test.jsx, src/features/dashboard/PlanDashboard.test.jsx, src/features/workout/ActiveWorkout.test.jsx, src/App.test.jsx, docs/orchestrator-runs/phase-4-group-1-unified-data-layer-2026-11-24/red-proof.md
contract: 7 test files frozen (git hash-object SHAs recorded in red-proof.md) and src/hooks/useCloudSync.test.jsx deleted; implementer must satisfy all 7 suites without modifying any test files
evidence: fitgen-dev-tools-tester run_tests -> exit 1 (7 failed | 20 passed of 27 files; 29 failed | 388 passed of 417 executed tests + useUserData.test.jsx awaiting ./useUserData); fitgen-dev-tools-tester git_hash_object -> 7 frozen SHAs; fitgen-dev-tools-tester git_status_diff (status) -> clean test-only changes plus external deletion of src/hooks/useCloudSync.test.jsx
open: implementer (Stage 4) to implement spec.md and delete src/hooks/useCloudSync.js and src/utils/saveToLocalStorage.js
```
