# Red Proof — Phase 3 Group 1 (Workout Parsing & Plan Generation Domain Logic)

- **Run ID:** `phase-3-group-1-workout-parsing-and-duration-2026-11-23`
- **Command:** `npm test`
- **Exit code:** `1`
- **Summary:** `Test Files 7 failed | 14 passed (21)` · `Tests 154 failed | 126 passed (280)`

## Failing test files

- `failed: src/utils/parseRestSeconds.test.js (80 failed)`
- `failed: src/utils/parseSetsCount.test.js (49 failed)`
- `failed: src/utils/generateNextWeekPlan.test.js (9 failed)`
- `failed: src/features/workout/RestTimer.test.jsx (6 failed)`
- `failed: src/features/workout/ActiveWorkout.test.jsx (5 failed)`
- `failed: src/features/workout/WorkoutCard.test.jsx (4 failed)`
- `failed: src/hooks/useWorkout.test.jsx (1 failed)`

All 154 failures are clean assertions written against `spec.md` (zero syntax errors, zero import errors, zero unrelated regressions across the 14 untouched test files and existing tests in modified files).

## Frozen test hashes

frozen:
| File | git hash-object |
| --- | --- |
| `src/utils/parseRestSeconds.test.js` | `c2f1f049b0ba017da5837df175f49c53f57901d3` |
| `src/utils/parseSetsCount.test.js` | `c29f997bfd4698be6eaf8d1f02b0da5c9e7278b4` |
| `src/utils/generateNextWeekPlan.test.js` | `f383e3ca32a73b122b79762a1926639c076fa37d` |
| `src/features/workout/WorkoutCard.test.jsx` | `41da5890597ecc4305c9112302cb16dfaa01c40e` |
| `src/features/workout/RestTimer.test.jsx` | `e916df6331f3457696486a6f3100fd29fce7d511` |
| `src/features/workout/ActiveWorkout.test.jsx` | `d31929f7d6e8f79ba7eef83ba53f7407fcf855f2` |
| `src/hooks/useWorkout.test.jsx` | `3f8f16057cf359ae79dcb7e85fef753dbce087e7` |

## Handoff

```text
HANDOFF
phase: 3
from: tester
to: orchestrator
status: done
files: src/utils/parseRestSeconds.test.js, src/utils/parseSetsCount.test.js, src/utils/generateNextWeekPlan.test.js, src/features/workout/WorkoutCard.test.jsx, src/features/workout/RestTimer.test.jsx, src/features/workout/ActiveWorkout.test.jsx, src/hooks/useWorkout.test.jsx, docs/orchestrator-runs/phase-3-group-1-workout-parsing-and-duration-2026-11-23/red-proof.md
contract: 7 test files frozen (hashes recorded in red-proof.md); covers AC-1 (profile.duration parsing, fallback to 60, legacy alias ignored without literal sessionDuration in src/), AC-2 (all parseRestSeconds edge cases + positive-integer & idempotency invariants), AC-3 (WorkoutCard & RestTimer fake-timer countdowns and invalid restTime normalization), AC-4 (all parseSetsCount edge cases + positive-integer & idempotency invariants), AC-5 (ActiveWorkout initial set rows and useWorkout syncSavedLogsWithDay synthesis); production code untouched
evidence: npm test -> exit code 1 (7 failed test files, 14 passed; 154 failed tests, 126 passed of 280); git hash-object computed for all 7 created/modified test files
open: implementer to implement spec.md production files without modifying any frozen test file
```
