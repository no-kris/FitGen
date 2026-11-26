# Red Proof — Phase 5 Group 3 (Per-User Server-Side Rate Limiting on AI Endpoints)

- **Run ID:** `phase-5-group-3-rate-limiting-2026-11-26`
- **Command:** `npm test` (via `fitgen-dev-tools-tester` MCP `run_tests`)
- **Exit Code:** `1`

## Summary

- **Test Files:** 5 failed | 30 passed (35 total)
- **Tests:** 55 failed | 635 passed (690 total)
- **Failure Quality:** All 55 failures are clean `AssertionError` failures directly proving unimplemented specification requirements (AC-1 through AC-17). Zero syntax errors, zero import errors, zero unrelated suite failures.

## Failing Test Files

failed: tests/api/_rateLimit.test.js (39 failed)
failed: tests/api/_utils.test.js (1 failed)
failed: tests/api/generatePlan.test.js (6 failed)
failed: tests/api/generateWeek.test.js (6 failed)
failed: src/services/api/callModel.test.js (3 failed)

## Frozen Test File Hashes

frozen:
| File | SHA-1 (`git hash-object`) | Coverage |
| --- | --- | --- |
| `tests/api/_rateLimit.test.js` | `0cc3d319515a01b6e303b99d04990033ac99b5e5` | AC-1 through AC-8 |
| `tests/api/_utils.test.js` | `06112f1ba8a059d350f3ae6c574ee5d8e52476d0` | AC-9 |
| `tests/api/generatePlan.test.js` | `c1feafe0f9c24b0339e5031974f9f068df4b9ae1` | AC-10 through AC-14 (`/api/generatePlan`) |
| `tests/api/generateWeek.test.js` | `2a0a7b33479ebffbb9b064d76483eb6921b531dd` | AC-10 through AC-14 (`/api/generateWeek`) |
| `src/services/api/callModel.test.js` | `99fdebfce7ac15116d01ac261e47fc82eaae86b1` | AC-15 through AC-17 |
