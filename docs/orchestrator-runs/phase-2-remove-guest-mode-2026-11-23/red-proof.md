# Red Proof — Phase 2 (`phase-2-remove-guest-mode-2026-11-23`)

- Command: `npm test`
- Exit code: `1`
- Test Files: `6 failed | 11 passed (17)`
- Tests: `23 failed | 85 passed (108)`

## Failing Test Files

- failed: `src/services/firebase/authServices.test.js` (1 failed)
- failed: `src/hooks/useAuth.test.js` (3 failed)
- failed: `src/hooks/useAuthObserver.test.jsx` (4 failed)
- failed: `src/features/onboarding/WelcomeScreen.test.jsx` (1 failed)
- failed: `src/App.test.jsx` (2 failed)
- failed: `scripts/cleanupAnonymousUsers.test.js` (12 failed)

All 23 failures are clean `AssertionError`s directly exercising Phase 2 acceptance criteria (no syntax errors, no Vite transform/import errors, and zero regressions in the 9 pre-existing Phase 1 suites). `src/components/layout/Layout.test.jsx` (3 passed) and `src/components/screens/ProfileScreen.test.jsx` (3 passed) pass against `AppContext` without extra flags and are frozen alongside the other 6 Phase 2 suites to verify all Section 7.2 contracts in Green.

## Static String Check (`src/` Test Files)

All 7 created/updated test files under `src/` were verified to contain `0` occurrences (case-insensitive) of `guest` and `0` occurrences of `signInAnonymously`, satisfying Section 7.1 Gates #3 and #4.

## Frozen Test Files

frozen:

| Path | git hash-object |
| :--- | :--- |
| `src/services/firebase/authServices.test.js` | `fad8d1cd197902e2ad44f980c4db24bebafdb805` |
| `src/hooks/useAuth.test.js` | `deba82d9f1c6972cad947a4d1cbb36a62edcefc7` |
| `src/hooks/useAuthObserver.test.jsx` | `bce1f117fac01d831d1cbbcd30def85490fe7403` |
| `src/features/onboarding/WelcomeScreen.test.jsx` | `e7272c1cb6884186aa6545b10661fc7c71f14ad2` |
| `src/components/layout/Layout.test.jsx` | `9a0a9d0ab4f597618bb05b10d4d68e1e27b4bc20` |
| `src/components/screens/ProfileScreen.test.jsx` | `1e940b4a55102535524359f8909ad1ba0aad4c0f` |
| `src/App.test.jsx` | `bd7fb6012d0f4310cfc6274c6f0531ce3cb035fb` |
| `scripts/cleanupAnonymousUsers.test.js` | `f8c3eb8009e819cf2fa6f8fa331f640360c730ae` |

```text
HANDOFF
phase: 2
from: tester
to: orchestrator
status: done
files: vitest.config.js, src/services/firebase/authServices.test.js, src/hooks/useAuth.test.js, src/hooks/useAuthObserver.test.jsx, src/features/onboarding/WelcomeScreen.test.jsx, src/components/layout/Layout.test.jsx, src/components/screens/ProfileScreen.test.jsx, src/App.test.jsx, scripts/cleanupAnonymousUsers.test.js, docs/orchestrator-runs/phase-2-remove-guest-mode-2026-11-23/red-proof.md
contract: Red proof established with 8 frozen test files covering all Section 7.2 assertions and vitest.config.js including scripts/**/*.test.js; implementer and styler must not modify any frozen test file or vitest.config.js.
evidence: npm test -> exit 1 (6 failed | 11 passed test files; 23 failed | 85 passed tests, all clean AssertionErrors); git hash-object recorded for all 8 frozen test files in docs/orchestrator-runs/phase-2-remove-guest-mode-2026-11-23/red-proof.md; 0 matches for guest or signInAnonymously across all src/ test files.
open: implementer and styler to implement Phase 2 per spec.md, then tester runs Stage 5 Green report.
```
