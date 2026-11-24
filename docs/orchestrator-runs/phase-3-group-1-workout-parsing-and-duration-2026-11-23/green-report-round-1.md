# Green Report — Round 1 (Phase 3 Group 1: Workout Parsing & Plan Generation Domain Logic)

- **Run ID:** `phase-3-group-1-workout-parsing-and-duration-2026-11-23`
- **Command:** `npm test`
- **Exit code:** `0`
- **Summary:** `Test Files 21 passed (21)` · `Tests 280 passed (280)` (0 failed)

## Frozen test integrity

- `HOLD: src/utils/parseRestSeconds.test.js` (`c2f1f049b0ba017da5837df175f49c53f57901d3`)
- `HOLD: src/utils/parseSetsCount.test.js` (`c29f997bfd4698be6eaf8d1f02b0da5c9e7278b4`)
- `HOLD: src/utils/generateNextWeekPlan.test.js` (`f383e3ca32a73b122b79762a1926639c076fa37d`)
- `HOLD: src/features/workout/WorkoutCard.test.jsx` (`41da5890597ecc4305c9112302cb16dfaa01c40e`)
- `HOLD: src/features/workout/RestTimer.test.jsx` (`e916df6331f3457696486a6f3100fd29fce7d511`)
- `HOLD: src/features/workout/ActiveWorkout.test.jsx` (`d31929f7d6e8f79ba7eef83ba53f7407fcf855f2`)
- `HOLD: src/hooks/useWorkout.test.jsx` (`3f8f16057cf359ae79dcb7e85fef753dbce087e7`)

## Test file inventory delta since Stage 3

- `added: none`
- `removed: none`

## Per-file results for spec test suites

- `PASS: src/utils/parseRestSeconds.test.js` (80/80 passed)
- `PASS: src/utils/parseSetsCount.test.js` (49/49 passed)
- `PASS: src/utils/generateNextWeekPlan.test.js` (28/28 passed)
- `PASS: src/features/workout/WorkoutCard.test.jsx` (4/4 passed)
- `PASS: src/features/workout/RestTimer.test.jsx` (7/7 passed)
- `PASS: src/features/workout/ActiveWorkout.test.jsx` (10/10 passed)
- `PASS: src/hooks/useWorkout.test.jsx` (15/15 passed)
- All 14 untouched test files: passed (87/87 passed)

## Handoff

```text
HANDOFF
phase: 3
from: tester
to: orchestrator
status: done
files: docs/orchestrator-runs/phase-3-group-1-workout-parsing-and-duration-2026-11-23/green-report-round-1.md
contract: all 7 frozen test files verified HOLD against Stage 4 hashes (0 CHANGED, 0 added, 0 removed); all 21 test files / 280 tests pass with exit code 0
evidence: git hash-object -> 7/7 exact hash matches (HOLD); npm test -> exit code 0 (Test Files 21 passed (21), Tests 280 passed (280))
open: verifier and reviewer gates (eslint, build, sessionDuration sweep, review)
```
