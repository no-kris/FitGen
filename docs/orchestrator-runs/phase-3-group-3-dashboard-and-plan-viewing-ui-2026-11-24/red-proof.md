# Stage 3 — Red Proof (`phase-3-group-3-dashboard-and-plan-viewing-ui-2026-11-24`)

## Test Run Summary

- **Command:** `npm test` (via `fitgen-dev-tools-tester` MCP `run_tests`)
- **Exit Code:** `1`
- **Test Files:** `3 failed | 20 passed (23)`
- **Tests:** `20 failed | 323 passed (343)`
- **Production files modified:** `0`

## Failing Test Files

failed: src/features/dashboard/PlanDashboard.test.jsx (9 failed)
failed: src/features/workout/DayDetailModal.test.jsx (8 failed)
failed: src/hooks/useWorkout.test.jsx (3 failed)

### Failing Assertion Summary (All Clean Spec Assertions — Zero Syntax/Import/Setup Errors)

1. `src/features/dashboard/PlanDashboard.test.jsx` (`9 failed`, `4 passed` — all 4 pre-existing tests pass):
   - `AC-1` (`selects the latest week on initial mount with aria-pressed exposed on week buttons`): `aria-pressed` on `Week 3` button is `null`, expected `"true"`.
   - `AC-2` (`keeps a manually selected earlier week active across non-growing plan reference updates`): `aria-pressed` on `Week 1` button is `null`, expected `"true"`.
   - `AC-3` (`advances to the latest week when plan.weeks.length grows (from 2 to 3 and from null to 2)`): `aria-pressed` on `Week 3` button is `null`, expected `"true"`.
   - `AC-4` (`clamps week selection when plan.weeks shrinks out of bounds and stays put when still in bounds`): `aria-pressed` on `Week 1` button is `null`, expected `"true"`.
   - `AC-5` (`handles empty weeks array while a day modal is open, null plan, and reloads into the newest week`): unable to find button `"View Monday workout details"` (icon-only Settings button in `Schedule.jsx` lacks `aria-label`).
   - `AC-7` (`immutably swaps an exercise in Week 1 without jumping week tabs or mutating the frozen plan`): unable to find button `"Start Monday workout"` (icon-only Play button in `Schedule.jsx` lacks `aria-label`).
   - `AC-7 / AC-9` (`propagates swap save failures into DayDetailModal alert with Retry instead of swallowing them`): unable to find button `"View Monday workout details"` (`Schedule.jsx` lacks `aria-label`).
   - `AC-11` (`renders a polite status banner while cloud sync is pending and no alert or Retry Sync`): unable to find element with role `"status"`.
   - `AC-11` (`renders an alert banner with Retry Sync when cloud sync fails and does not mask it with a syncing banner`): unable to find element with role `"alert"`.

2. `src/features/workout/DayDetailModal.test.jsx` (`8 failed`, `0 passed`):
   - Guard clause (`returns null when closed or when details is null`): `TypeError: Cannot read properties of null (reading 'dayName')` at `DayDetailModal.jsx:24` (missing `!details` guard).
   - `AC-10` (`hides swap buttons when alternatives are missing, null, or empty, and toggles aria-expanded on accessible Swap buttons`): unable to find button `"Swap Bench Press"`.
   - `AC-6` (`does not mutate a deeply frozen details prop and updates only when parent provides new immutable details`): unable to find button `"Swap Bench Press"`.
   - `AC-8` (`shows pending state, blocks close actions, and guards against concurrent double-clicks while swapping`): unable to find button `"Swap Bench Press"`.
   - `AC-9` (`keeps original exercise, renders inline alert with Retry on failure, and clears alert after successful retry`): unable to find button `"Swap Bench Press"`.
   - `AC-10` (`resets expanded panel and swap error when closed and reopened`): unable to find button `"Swap Bench Press"`.
   - `AC-12` (`renders status banner and disables alternative selection when isSyncPending is true`): unable to find element with role `"status"`.
   - `AC-12` (`renders alert with Retry Sync and disables alternative selection when isSyncFailed is true`): unable to find element with role `"alert"`.

3. `src/hooks/useWorkout.test.jsx` (`3 failed`, `15 passed` — all 15 existing tests pass):
   - `AC-13` (`rejects handleFinishWorkout with sync-failed error without writing to Firestore or clearing state`): threw `SYNC_PENDING_ERROR` instead of `SYNC_FAILED_ERROR`.
   - `AC-13` (`rejects handleGenerateNextWeek with sync-failed error without calling model or Firestore`): threw `SYNC_PENDING_ERROR` instead of `SYNC_FAILED_ERROR`.
   - `AC-13` (`rejects handleReplaceExercise with sync-failed error without writing to Firestore or mutating state`): threw `SYNC_PENDING_ERROR` instead of `SYNC_FAILED_ERROR`.

## Frozen Test File Hashes

frozen:
| File | SHA-1 (`git hash-object`) |
| :--- | :--- |
| `src/features/dashboard/PlanDashboard.test.jsx` | `e8509f57c75d1f94f1b257ad9181fb584d79f3e6` |
| `src/features/workout/DayDetailModal.test.jsx` | `bd7ba3ff84399f11f74e11317743356a412432b5` |
| `src/hooks/useWorkout.test.jsx` | `78a798c3ecf712313144d094b9c49bb2c7ce4c9e` |

```text
HANDOFF
phase: 3
from: tester
to: orchestrator
status: done
files: docs/orchestrator-runs/phase-3-group-3-dashboard-and-plan-viewing-ui-2026-11-24/red-proof.md, src/features/dashboard/PlanDashboard.test.jsx, src/features/workout/DayDetailModal.test.jsx, src/hooks/useWorkout.test.jsx
contract: Red proof established for AC-1..AC-13 with 20 clean spec assertion failures across the 3 frozen test files (PlanDashboard.test.jsx: e8509f57c75d1f94f1b257ad9181fb584d79f3e6, DayDetailModal.test.jsx: bd7ba3ff84399f11f74e11317743356a412432b5, useWorkout.test.jsx: 78a798c3ecf712313144d094b9c49bb2c7ce4c9e) and 323 passing baseline tests; implementer must not modify any test files
evidence: MCP fitgen-dev-tools-tester run_tests -> exitCode 1 (3 failed | 20 passed test files; 20 failed | 323 passed tests); MCP fitgen-dev-tools-tester git_hash_object -> exitCode 0 (e8509f57c75d1f94f1b257ad9181fb584d79f3e6 PlanDashboard.test.jsx, bd7ba3ff84399f11f74e11317743356a412432b5 DayDetailModal.test.jsx, 78a798c3ecf712313144d094b9c49bb2c7ce4c9e useWorkout.test.jsx); MCP fitgen-dev-tools-tester git_status_diff(status) -> exitCode 0 (0 production files modified)
open: implementer (Stage 5) to implement spec.md changes across PlanDashboard.jsx, DayDetailModal.jsx, Schedule.jsx, and useWorkout.js without touching any test files
```
