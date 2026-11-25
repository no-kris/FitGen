# Red Proof — Phase 4 Group 3: Real-Time Multi-Device Sync (`onSnapshot`)

**Run ID:** `phase-4-group-3-realtime-sync-2026-11-24`  
**Stage:** Stage 3 (Tester — Red)  
**Spec:** `docs/orchestrator-runs/phase-4-group-3-realtime-sync-2026-11-24/spec.md`

## Test Run Summary

- **Command:** `npm test` (via `fitgen-dev-tools-tester` `run_tests`)
- **Exit code:** `1`
- **Test Files:** `3 failed | 24 passed (27)`
- **Tests:** `63 failed | 410 passed (473)`

All 63 failures are clean `AssertionError` failures asserting the new Group 3 real-time subscription contract (AC-1 through AC-20) against unchanged production code; zero syntax, import, or unrelated suite failures occurred.

## Failing Test Files

failed: src/services/firebase/firestoreServices.test.js (9 failed)
failed: src/hooks/useUserData.test.jsx (43 failed)
failed: src/App.test.jsx (11 failed)

## Acceptance Criteria Coverage

- **AC-1 – AC-8 (`src/services/firebase/firestoreServices.test.js`):** 9-method `firestoreService` API surface, synchronous validation (`userId`, `onData`), `onSnapshot` wiring for `doc(db, "users", uid)` and `query(collection(db, "users", uid, "workouts"), orderBy("completedAt", "asc"))`, payload normalization (`docSnap.exists() ? data() : null` and `{ id, ...data() }` / `[]`), exact unsubscribe passthrough, and `console.error` + optional `onError` handling.
- **AC-9 – AC-19 (`src/hooks/useUserData.test.jsx`):** All preserved Group 1 & Group 2 suites adapted to `subscribeUserData` / `subscribeWorkouts`, plus live multi-device `users/{uid}` & `workouts` updates without re-invoking `onSyncComplete`, one-time legacy migration guard, one-time pre-login bootstrap guard & bootstrap failure/retry recovery, `docSliceRef` live reconciliation during in-flight writes, `workoutSliceRef` live reconciliation (remote workout during pending `addWorkout`, pre-resolve Firestore echo, post-resolve Firestore echo), initial & mid-session listener errors on either subscription with sibling teardown and `retrySync()` recovery, listener teardown across all 6 lifecycle triggers (`unmount`, logout, account switch, `retrySync`, `deleteAll` resolve vs. failure, `clearLocalData`), synchronous listener error cleanup, and same-UID / `onSyncComplete` rerender stability.
- **AC-20 (`src/App.test.jsx`):** All preserved AppContext/guard/optimistic-pinning/logout/anonymous tests adapted to subscriptions, plus end-to-end live multi-device `users/{uid}` and `workouts` snapshot propagation through `AppContext` without resetting `view`, mid-session listener error surfacing, and `retrySync()` recovery.

## Frozen Test File Hashes

frozen:
| File | SHA-1 (`git hash-object`) |
| --- | --- |
| `src/services/firebase/firestoreServices.test.js` | `3ab9255498b5638c8b2c7241780ba73d6c2863a6` |
| `src/hooks/useUserData.test.jsx` | `125a856654651d36d4c50e70c569c818dad862dc` |
| `src/App.test.jsx` | `b68def9cdf784a2914107680fbe57829a76e0212` |

```text
HANDOFF
phase: 3
from: tester
to: orchestrator
status: done
files: src/services/firebase/firestoreServices.test.js, src/hooks/useUserData.test.jsx, src/App.test.jsx, docs/orchestrator-runs/phase-4-group-3-realtime-sync-2026-11-24/red-proof.md
contract: Red proof established for AC-1..AC-20 with 63 clean AssertionError failures across the 3 frozen test files (24 untouched test files pass); frozen SHA-1 hashes recorded in red-proof.md (firestoreServices.test.js=3ab9255498b5638c8b2c7241780ba73d6c2863a6, useUserData.test.jsx=125a856654651d36d4c50e70c569c818dad862dc, App.test.jsx=b68def9cdf784a2914107680fbe57829a76e0212)
evidence: run_tests -> exitCode 1 (Test Files: 3 failed | 24 passed (27); Tests: 63 failed | 410 passed (473)); git_hash_object -> exitCode 0 (3 frozen hashes); git_status_diff (status) -> exitCode 0 (only 3 test files + run dir + pre-existing out-of-band docs)
open: implementer must implement Section 4 (src/services/firebase/firestoreServices.js) and Section 5 (src/hooks/useUserData.js) without modifying any frozen test files
```
