# Red Proof — Phase 3, Group 2 (Account Lifecycle, Data Cleanup & Session Hygiene)

**Run ID:** `phase-3-group-2-account-lifecycle-and-hygiene-2026-11-24`  
**Spec:** `docs/orchestrator-runs/phase-3-group-2-account-lifecycle-and-hygiene-2026-11-24/spec.md`

## Test Execution Summary

- **Command:** `npm test` (`vitest run`)
- **Exit code:** `1`
- **Test Files:** `8 failed | 14 passed (22)`
- **Tests:** `47 failed | 276 passed (323)`
- **Untouched suites:** 14 passed, 0 failed (zero regressions)
- **Failure classification:** All 47 failures are clean spec assertions (zero syntax errors, zero import/resolve errors).

## Failing Test Files

failed: src/services/firebase/authServices.test.js (4 failed)
failed: src/services/firebase/firestoreServices.test.js (10 failed)
failed: src/services/storage/activeWorkoutStore.test.js (1 failed)
failed: src/hooks/useAuth.test.js (10 failed)
failed: src/hooks/useCloudSync.test.jsx (3 failed)
failed: src/features/auth/DeleteAccountModal.test.jsx (4 failed)
failed: src/components/screens/ProfileScreen.test.jsx (7 failed)
failed: src/App.test.jsx (8 failed)

## Acceptance Criteria Coverage

| Test File | Criteria Covered |
| :--- | :--- |
| `src/services/firebase/authServices.test.js` | `AC-1`, `AC-2`, `AC-3` |
| `src/services/firebase/firestoreServices.test.js` | `AC-4`, `AC-5`, `AC-6` |
| `src/services/storage/activeWorkoutStore.test.js` | `AC-7`, `AC-8` |
| `src/hooks/useAuth.test.js` | `AC-9`, `AC-10`, `AC-11`, `AC-12`, `AC-13`, `AC-14`, `AC-21` |
| `src/hooks/useCloudSync.test.jsx` | `AC-19` |
| `src/features/auth/DeleteAccountModal.test.jsx` | `AC-15` |
| `src/components/screens/ProfileScreen.test.jsx` | `AC-20`, `AC-23` (+ `DeleteAccountModal` integration) |
| `src/App.test.jsx` | `AC-16`, `AC-17`, `AC-18`, `AC-22` |

## frozen:

| Path | git hash-object |
| :--- | :--- |
| `src/services/firebase/authServices.test.js` | `bae8e6d0619084d16bfdefcde46b3bf4f5785d80` |
| `src/services/firebase/firestoreServices.test.js` | `15da67934235e27200d51bc8659d662c7c19e7aa` |
| `src/services/storage/activeWorkoutStore.test.js` | `cd300d9dcf9239994b466f7195fba785b5a610b5` |
| `src/hooks/useAuth.test.js` | `4040b2477107559d956670b93beb913b4c0931e0` |
| `src/hooks/useCloudSync.test.jsx` | `695252e3ff9cc820b31467dfa3f7906a61f3e85b` |
| `src/features/auth/DeleteAccountModal.test.jsx` | `e9365b28d12e30852e233ff8c883cc5fb7aa09b1` |
| `src/components/screens/ProfileScreen.test.jsx` | `6aa5da573f1358305b3ec510d0d27af09dcd6bd4` |
| `src/App.test.jsx` | `4d7cb1f963247c675c9335642e95c37a3ba47b1a` |
