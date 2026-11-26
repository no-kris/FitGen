# Red Proof — Phase 5 Group 2 (Server-Side Prompting, Dedicated AI Endpoints & Client Migration)

**Run ID:** `phase-5-group-2-server-prompting-and-ai-endpoints-2026-11-25`
**Command:** `npm test` (via `fitgen-dev-tools-tester` MCP `run_tests`)
**Exit Code:** `1`

## Summary

- **Test Files:** `6 failed | 28 passed (34)`
- **Tests:** `81 failed | 563 passed (644)`
- **Failure Nature:** All 81 failures are clean spec assertion failures across the 6 created/updated test files (0 syntax errors, 0 import crashes, 0 unrelated suite failures).

## Failing Test Files

- failed: tests/api/_prompts.test.js (10 failed)
- failed: tests/api/generatePlan.test.js (15 failed)
- failed: tests/api/generateWeek.test.js (15 failed)
- failed: src/services/api/callModel.test.js (25 failed)
- failed: src/utils/generateInitialPlan.test.js (11 failed)
- failed: src/utils/generateNextWeekPlan.test.js (5 failed)

## Frozen Test Files

frozen:
| File | SHA-1 (`git hash-object`) |
|---|---|
| `tests/api/_prompts.test.js` | `e8c339ac1407cfdf7ec8789ad460671a5356a75b` |
| `tests/api/generatePlan.test.js` | `488573ba0de584397da8ba7470ae537c279ce05c` |
| `tests/api/generateWeek.test.js` | `da0faa4a51a6d4ebc1e4dfa44632bac2fa58a6f4` |
| `src/services/api/callModel.test.js` | `3b928fd289d7ada4ab85ca721e728d94be6c6b3c` |
| `src/utils/generateInitialPlan.test.js` | `d37b5156aea0cc07378af3a896e0d73504dcc5e7` |
| `src/utils/generateNextWeekPlan.test.js` | `a50d3a725f740fe2e248fa2da525b98e58355c2c` |

```text
HANDOFF
phase: 5
from: tester
to: orchestrator
status: done
files: tests/api/_prompts.test.js, tests/api/generatePlan.test.js, tests/api/generateWeek.test.js, src/services/api/callModel.test.js, src/utils/generateInitialPlan.test.js, src/utils/generateNextWeekPlan.test.js, docs/orchestrator-runs/phase-5-group-2-server-prompting-and-ai-endpoints-2026-11-25/red-proof.md
contract: 6 frozen test files (81 failing spec assertions, 563 passing existing tests) proving AC-1 through AC-6 of spec.md; API tests live under tests/api/ and all tests run offline with mocked fetch and restored env vars; no production files touched
evidence: fitgen-dev-tools-tester:run_tests -> exitCode 1 (6 failed | 28 passed test files; 81 failed | 563 passed tests); fitgen-dev-tools-tester:git_hash_object -> 6 SHA-1 hashes recorded in red-proof.md
open: implementer to implement spec.md without modifying frozen test files
```
