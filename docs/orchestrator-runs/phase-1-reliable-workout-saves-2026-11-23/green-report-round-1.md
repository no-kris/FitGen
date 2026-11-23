# Green Report — Round 1 — Phase 1 (`phase-1-reliable-workout-saves-2026-11-23`)

## Test Run Summary

- **Command**: `npm test` (`vitest run`)
- **Exit code**: `0`
- **Test files**: `10 passed | 0 failed (10 total)`
- **Tests**: `72 passed | 0 failed (72 total)`
- **Duration**: `2.58s`

### Per-File Results

- `src/App.test.jsx`: 3 passed, 0 failed
- `src/components/screens/LogsScreen.test.jsx`: 4 passed, 0 failed
- `src/features/dashboard/PlanDashboard.test.jsx`: 4 passed, 0 failed
- `src/features/workout/ActiveWorkout.test.jsx`: 4 passed, 0 failed
- `src/hooks/useCloudSync.test.jsx`: 6 passed, 0 failed
- `src/hooks/useWorkout.test.jsx`: 14 passed, 0 failed
- `src/services/firebase/firebaseHelper.test.js`: 1 passed, 0 failed
- `src/services/firebase/firestoreServices.test.js`: 24 passed, 0 failed
- `src/services/storage/activeWorkoutStore.test.js`: 9 passed, 0 failed
- `src/utils/generateNextWeekPlan.test.js`: 3 passed, 0 failed

## Frozen Test File Integrity (`git hash-object`)

- `HOLD: src/App.test.jsx` (expected `43613f69956bbe7ebbc9bea1e2a3e16d31e920a6`, actual `43613f69956bbe7ebbc9bea1e2a3e16d31e920a6`)
- `HOLD: src/components/screens/LogsScreen.test.jsx` (expected `8a2d808fca9cf6e0f200d2463bea4e866e9c2777`, actual `8a2d808fca9cf6e0f200d2463bea4e866e9c2777`)
- `HOLD: src/features/dashboard/PlanDashboard.test.jsx` (expected `c1c6e57de110d1f1a639866e68d8cd947740df86`, actual `c1c6e57de110d1f1a639866e68d8cd947740df86`)
- `HOLD: src/features/workout/ActiveWorkout.test.jsx` (expected `704d20e31751b9201288b46ff10d0735b23d5bcb`, actual `704d20e31751b9201288b46ff10d0735b23d5bcb`)
- `HOLD: src/hooks/useCloudSync.test.jsx` (expected `b954d465d518d4919707f5553ab4cd2f3fee7c0c`, actual `b954d465d518d4919707f5553ab4cd2f3fee7c0c`)
- `HOLD: src/hooks/useWorkout.test.jsx` (expected `2cf207e6ba1571c5dacd1b46ec8cfc418da500df`, actual `2cf207e6ba1571c5dacd1b46ec8cfc418da500df`)
- `HOLD: src/services/firebase/firebaseHelper.test.js` (expected `aca7c6ddbac8f63cb2dd6934421629a0b1eb6f0e`, actual `aca7c6ddbac8f63cb2dd6934421629a0b1eb6f0e`)
- `HOLD: src/services/firebase/firestoreServices.test.js` (expected `0f72712db292b9be0670f27c29f9879a79d03358`, actual `0f72712db292b9be0670f27c29f9879a79d03358`)
- `HOLD: src/services/storage/activeWorkoutStore.test.js` (expected `1616b6f0fa3b7d6eac2b21ce68ee550215d8f6f6`, actual `1616b6f0fa3b7d6eac2b21ce68ee550215d8f6f6`)
- `HOLD: src/utils/generateNextWeekPlan.test.js` (expected `984830ebd7fabd856d26ceec3f7b92bd2e6d2ba0`, actual `984830ebd7fabd856d26ceec3f7b92bd2e6d2ba0`)

## Added / Removed Test Files

- `added: none`
- `removed: none`

```text
HANDOFF
phase: 1
from: tester
to: orchestrator
status: done
files: docs/orchestrator-runs/phase-1-reliable-workout-saves-2026-11-23/green-report-round-1.md
contract: All 10 frozen test files verified HOLD (exact git hash-object match against red-proof.md, added: none, removed: none) and all 72/72 tests pass with exit code 0 on Round 1.
evidence: npm test -> exit code 0 (10 passed | 0 failed test files; 72 passed | 0 failed tests); git hash-object recomputed for all 10 frozen test files and matched 10/10 against docs/orchestrator-runs/phase-1-reliable-workout-saves-2026-11-23/red-proof.md.
open: orchestrator proceeds to verifier and reviewer stages for Phase 1.
```
