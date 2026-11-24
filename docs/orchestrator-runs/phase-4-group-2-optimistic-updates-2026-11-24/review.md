# Code Review — Phase 4, Group 2: Optimistic Local Updates & Rollback on Failure

- **Run ID:** `phase-4-group-2-optimistic-updates-2026-11-24`
- **Stage:** Stage 10 — Reviewer (Round 1)
- **Spec:** `docs/orchestrator-runs/phase-4-group-2-optimistic-updates-2026-11-24/spec.md`
- **Verdict:** **PASS**

---

## 1. Summary

All changes across the 3 product files (`src/hooks/useUserData.js`, `src/App.jsx`, `src/components/screens/ProfileScreen.jsx`) and 3 frozen test files (`src/hooks/useUserData.test.jsx`, `src/App.test.jsx`, `src/components/screens/ProfileScreen.test.jsx`) conform accurately to the approved specification, `.memory/knowledge/coding-standards.md`, React 19 hook rules, and all public data/API contracts. All verification gates (`npx eslint src api`, `npm test`, `npm run build`) passed with exit code `0`, and all 3 frozen test files held their Stage 3 SHA-1 hashes intact.

---

## 2. Compliance Checklist

| Area | Status | Notes |
|---|---|---|
| **Approved Spec Adherence (`spec.md`)** | PASS | `useUserData.js` implements `createEmptyDocSlice`, `computeDocState`, `buildOptimisticWorkoutEntry`, `runOptimisticDocWrite`, optimistic `savePlan`/`updatePlan`/`addWorkout`/`resetProgram`, non-optimistic `deleteAll` with epoch invalidation, and `retrySync`/`clearLocalData`/hydration epoch resets exactly per §§4–5. `App.jsx` pins `ProfileSetupForm`/`ProfileScreen` via private `isSavingPlan`/`isResettingProgram` flags per §7. `ProfileScreen.jsx` reads `profile` null-safely per §7. |
| **Coding Standards (`.memory/knowledge/coding-standards.md`)** | PASS | Plain JavaScript, named hook export, 2-space indent, double quotes, semicolons, trailing commas, immutable state updates, no inline styles, no CSS imports/edits, no direct `localStorage` access in product code, no un-awaited Firestore writes, no swallowed errors, no unrelated reformatting. |
| **React 19 Hook Rules (`react-hooks/refs`)** | PASS | All refs (`currentUidRef`, `localDataRef`, `onSyncCompleteRef`, `sessionEpochRef`, `docSliceRef`, `optimisticWorkoutSeqRef`) are read and mutated exclusively inside `useEffect` and `useCallback`/async callbacks — never during render. `npx eslint src api` exits `0` with zero warnings. |
| **Concurrency & Rollback Edge Cases** | PASS | Verified per-field monotonic patch replay (`committedPlanId` / `committedProfileId`) across all overlapping `updatePlan`, `savePlan`, and `resetProgram` failure/out-of-order settlement combinations; in-place temp-ID reconciliation and targeted rollback for concurrent `addWorkout` calls; strict doc/workout slice isolation; session/UID/epoch isolation across logout, `userA -> userB`, `userA -> null -> userA`, `retrySync()`, `clearLocalData()`, and `deleteAll()`; sync-guard rejection (`loading` vs `error`) prior to any optimistic mutation. |
| **Public Contracts & Persisted Schemas** | PASS | `useUserData` returns the exact 14 keys unchanged. `AppContext` exposes the exact 25 keys unchanged (`isSavingPlan` and `isResettingProgram` remain private local state in `App.jsx`). Firestore schemas (`users/{uid}`, `users/{uid}/workouts/{autoId}`), `firestoreServices.js`, and `localStorage` key (`fitgen:active:v1`) are untouched. `firestoreService.addWorkout` receives the caller's original payload verbatim without mutation. |
| **Red / Green Proof & Verification Integrity** | PASS | Stage 3 red proof recorded 20 clean `AssertionError` failures across the 3 target test files; Stage 7 green report and Stage 8 verification confirm all 3 frozen test file SHA-1 hashes `HOLD` (`useUserData.test.jsx` `9f2f00e558a721b1c4f56f24058292f15dbd5b1c`, `App.test.jsx` `f3cba94a91c51df5e259ac47b8b6e5d724882daf`, `ProfileScreen.test.jsx` `14b4ca89f5f24064eede34e94937bb3a9ddc1098`), `27/27` test files (`452/452` tests) pass, lint exits `0`, and build exits `0`. |
| **Diff Scope & Boundary Audit** | PASS | `fitgen-dev-tools-reviewer:git_status_diff` confirms only the 6 authorized spec files were modified, plus run artifacts under `docs/orchestrator-runs/phase-4-group-2-optimistic-updates-2026-11-24/` and the 2 pre-existing out-of-band working tree entries (`M REFACTOR_PLAN.md`, `?? MODULARIZATION_TS_PLAN.md`). Zero unauthorized edits. |

---

## 3. Blocking Findings

None.

---

## 4. Non-Blocking Observations

1. **Duplicate workout normalizer maintenance (`src/hooks/useUserData.js`):** `buildOptimisticWorkoutEntry` intentionally mirrors `firestoreServices.normalizeWorkoutEntry` field-for-field to avoid breaking existing Vitest mocks that mock only `{ firestoreService }` (explicitly specified in `spec.md` §4.1). If the canonical 7-field workout shape changes in a future phase, update both helpers together (or consolidate once test mocks export `normalizeWorkoutEntry`).
2. **Boolean pinning flags in `src/App.jsx`:** `isSavingPlan` and `isResettingProgram` are booleans matching `spec.md` §7. This is safe because both callers (`ProfileSetupForm` and `ProfileScreen`) already enforce single-flight guards against concurrent re-entry.

---

## HANDOFF

```text
HANDOFF
phase: 4
from: reviewer
to: orchestrator
status: pass
files: docs/orchestrator-runs/phase-4-group-2-optimistic-updates-2026-11-24/review.md
contract: PASS — all 6 in-scope files match spec.md, coding-standards.md, React 19 hook rules, concurrency/rollback invariants, and exact public contracts (useUserData 14 keys, AppContext 25 keys, Firestore/localStorage schemas unchanged)
evidence: fitgen-dev-tools-reviewer:git_status_diff(status, diff_stat, diff) -> exitCode 0; read spec.md, red-proof.md, green-report-round-1.md, verification.md, .memory/knowledge/coding-standards.md, .memory/SCOPE.md, src/hooks/useUserData.js, src/App.jsx, src/components/screens/ProfileScreen.jsx, src/services/firebase/firestoreServices.js
open: orchestrator (present final verdict and changed files to human for commit approval)
```
