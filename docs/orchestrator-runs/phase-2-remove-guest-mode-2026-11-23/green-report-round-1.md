# Green Report — Round 1 — Phase 2 (`phase-2-remove-guest-mode-2026-11-23`)

- Command: `npm test`
- Exit code: `0`
- Test Files: `17 passed (17)` (0 failed)
- Tests: `108 passed (108)` (0 failed)

## Frozen Test File Integrity

- HOLD: `src/services/firebase/authServices.test.js` (`fad8d1cd197902e2ad44f980c4db24bebafdb805` === `fad8d1cd197902e2ad44f980c4db24bebafdb805`)
- HOLD: `src/hooks/useAuth.test.js` (`deba82d9f1c6972cad947a4d1cbb36a62edcefc7` === `deba82d9f1c6972cad947a4d1cbb36a62edcefc7`)
- HOLD: `src/hooks/useAuthObserver.test.jsx` (`bce1f117fac01d831d1cbbcd30def85490fe7403` === `bce1f117fac01d831d1cbbcd30def85490fe7403`)
- HOLD: `src/features/onboarding/WelcomeScreen.test.jsx` (`e7272c1cb6884186aa6545b10661fc7c71f14ad2` === `e7272c1cb6884186aa6545b10661fc7c71f14ad2`)
- HOLD: `src/components/layout/Layout.test.jsx` (`9a0a9d0ab4f597618bb05b10d4d68e1e27b4bc20` === `9a0a9d0ab4f597618bb05b10d4d68e1e27b4bc20`)
- HOLD: `src/components/screens/ProfileScreen.test.jsx` (`1e940b4a55102535524359f8909ad1ba0aad4c0f` === `1e940b4a55102535524359f8909ad1ba0aad4c0f`)
- HOLD: `src/App.test.jsx` (`bd7fb6012d0f4310cfc6274c6f0531ce3cb035fb` === `bd7fb6012d0f4310cfc6274c6f0531ce3cb035fb`)
- HOLD: `scripts/cleanupAnonymousUsers.test.js` (`f8c3eb8009e819cf2fa6f8fa331f640360c730ae` === `f8c3eb8009e819cf2fa6f8fa331f640360c730ae`)

## Test Suite Membership Diff (`src/`, `api/`, `scripts/`)

- added: none
- removed: none

Total discovered test suites remains `17` (`108` tests total), matching `red-proof.md`.

```text
HANDOFF
phase: 2
from: tester
to: orchestrator
status: done
files: docs/orchestrator-runs/phase-2-remove-guest-mode-2026-11-23/green-report-round-1.md
contract: All 8 frozen test files HOLD identical git hash-object values from red-proof.md; added: none, removed: none; full suite passes 17/17 files and 108/108 tests with exit 0.
evidence: npm test -> exit 0 (17 passed test files, 108 passed tests, 0 failed); git hash-object matched red-proof.md for all 8 frozen test files; report written to docs/orchestrator-runs/phase-2-remove-guest-mode-2026-11-23/green-report-round-1.md.
open: verifier and reviewer to run Stage 8/9 verification and review.
```
