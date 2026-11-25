# Red Proof (Re-Freeze) — Phase 5 Group 1 (`phase-5-group-1-api-auth-and-plan-validation-2026-11-25`)

- **Command:** `npm test` (via `fitgen-dev-tools-tester` MCP `run_tests`)
- **Exit code:** `1`
- **Summary:**
  - Test Files: `1 failed | 29 passed (30)`
  - Tests: `2 failed | 600 passed (602)`

> **Re-freeze note (Option A approved by human):** The initial Stage 3 red run froze `api/_utils.test.js`, `api/_extractJsonFromText.test.js`, and `api/_validatePlan.test.js` (`3 failed | 27 passed (30)`, `174 failed | 488 passed (662)`). Under human-approved Option A, the 3 suites are relocated to `tests/api/_*.test.js` (with `vitest.config.js` including `tests/**/*.test.{js,jsx}`, waiving `spec.md` §1/§2/§5.2's `api/`-only restriction for this run), trimmed under the ~300 LOC lean budget (`276`, `124`, and `297` LOC), updated to fix `_extractJsonFromText.test.js:79`, close minor AC gaps and a latent ESLint unused-arg issue, and add prototype-key regression coverage for `normalizeWeekday` (`"constructor"` / `"__proto__"`).

## Failing Test Files

failed: tests/api/_validatePlan.test.js (2 failed)

- `tests/api/_utils.test.js`: 44 passed (0 failed) — 276 LOC
- `tests/api/_extractJsonFromText.test.js`: 27 passed (0 failed) — 124 LOC
- `tests/api/_validatePlan.test.js`: 56 passed | 2 failed — 297 LOC (both failures are the new prototype-key regression tests `"constructor"` and `"__proto__"`, failing on `TypeError: dayName.toLowerCase is not a function` at `api/_validatePlan.js:393:30`)
- All 27 existing test suites pass.

## Frozen Test Hashes

frozen:
| Path | LOC | SHA-1 (`git hash-object`) |
| --- | --- | --- |
| `tests/api/_utils.test.js` | 276 | `5a59c1d4924b0db40b81b968e18f1c3ee32934fd` |
| `tests/api/_extractJsonFromText.test.js` | 124 | `f29d69057185c7921e74e4fc33f2cf3d05f1ed7a` |
| `tests/api/_validatePlan.test.js` | 297 | `1598154c0d4160684ffa1956631a5029d1afb59e` |

## Handoff

```text
HANDOFF
phase: 5
from: tester
to: orchestrator
status: done
files: tests/api/_utils.test.js, tests/api/_extractJsonFromText.test.js, tests/api/_validatePlan.test.js, docs/orchestrator-runs/phase-5-group-1-api-auth-and-plan-validation-2026-11-25/red-proof.md
contract: frozen test hashes (Option A re-freeze) — tests/api/_utils.test.js=5a59c1d4924b0db40b81b968e18f1c3ee32934fd (276 LOC), tests/api/_extractJsonFromText.test.js=f29d69057185c7921e74e4fc33f2cf3d05f1ed7a (124 LOC), tests/api/_validatePlan.test.js=1598154c0d4160684ffa1956631a5029d1afb59e (297 LOC); implementer must not edit these test files
evidence: run_tests -> exitCode 1 (Test Files 1 failed | 29 passed (30); Tests 2 failed | 600 passed (602); failed: tests/api/_validatePlan.test.js (2 failed) on prototype-key regression "constructor"/"__proto__"); git_hash_object -> exitCode 0
open: implementer (fix prototype-key lookup in api/_validatePlan.js normalizeWeekday so "constructor"/"__proto__" return null instead of Object.prototype members)
```
