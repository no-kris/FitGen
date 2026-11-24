# Iteration Log — Phase 3 (Group 4): Onboarding & Profile Form Bugs

- **Date:** 2026-11-24 | **Run:** `phase-3-group-4-onboarding-and-profile-form-bugs-2026-11-24` | **Branch / Baseline:** `iphone` (`511b5b9`)
- **Result:** `PASS` in **1 / 3** rounds — 5/5 frozen suites `HOLD`, 27/27 files (423/423 tests), ESLint 0 (`src`/`api`), Vite build 0 (1790 modules), 0 CSS edits, 0 blocking review findings, and **zero shell `BypassSandbox: true` calls by subagents**.

## Rubric Scores (Scale 1–4, Pass >= 3 on all dimensions)

| Agent | 1.1 | 1.2 | 1.3 | Pass | Evidence / Notes |
| --- | :-: | :-: | :-: | :-: | --- |
| `orchestrator` | **4** | **4** | **4** | PASS | Clean Stage 2 pause calling out the persisted profile data-shape alignment note (`[]` -> `""`); halted fail-closed at Stage 3 when `tester` lacked `call_mcp_tool` without bypassing sandbox or fabricating hashes; resumed existing `tester` via `send_message` (and reused it for Stage 7 Green); coordinated Turn-2 MCP warm-up across `implementer`, `verifier`, and `reviewer`; independently verified all 5 SHA-1 hashes at Stages 4 & 9 and baseline HEAD via `fitgen-dev-tools-orchestrator`; skipped Stage 6 `styler` per spec; wrote only `log.md`; separated real vs. pending checks and flagged `MODULARIZATION_TS_PLAN.md` as out-of-band. |
| `tester` | **3** | **4** | **4** | PASS | Halted fail-closed (`status: blocked`) on Turn 1 without writing `red-proof.md` or fabricating hashes when MCP/shell could not run; self-caught ESLint `no-unused-vars` `it.each` param nits before finalizing; on Turn 2 delivered 64 clean spec-assertion Red failures -> 423/423 Green across 5 colocated suites (with real `AppContext.Provider`, semantic queries, module-boundary mocks, and 22 untouched suites passing), 5/5 `HOLD:`, `added: none`, `removed: none` via `fitgen-dev-tools-tester`, plus an explicit AC-1..AC-7 coverage map in `red-proof.md`. (No shared `*.fixtures.js` factory file for 4 on 1.1.) |
| `implementer` | **4** | **3** | **3** | PASS | Round-1 green across all 5 production files (`normalizeProfileText.js`, `ProfileSetupForm.jsx`, `handleNextStep.js`, `generateInitialPlan.js`, `ProfileScreen.jsx`) turning all 64 Red assertions green (423/423), ESLint 0, Vite build 0 via `fitgen-dev-tools-implementer`, zero test/CSS/artifact edits, and 0 blocking review findings. |
| `styler` | — | — | — | N/A | Skipped per `spec.md` (zero CSS changes; reused existing verified classes in `src/css/index.css` and `src/css/utils.css`). |
| `reviewer` | **3** | **4** | **4** | PASS | Read-only audit via `fitgen-dev-tools-reviewer` (`status`, `diff_stat`, `diff`, `rev_parse`) across all 10 created/modified `src/` files, `spec.md`, `coding-standards.md`, and `testing.md`; accurate `PASS` with 0 blocking findings, zero false positives on pre-existing `ProfileScreen.jsx` unused `Settings` import, clean separation of non-blocking observations (`MODULARIZATION_TS_PLAN.md`, `ProfileSetupForm.jsx` 160 lines), and explicit scope/hash cross-check. |

*(No PRD/rubric yet for `ui` or `verifier`; both executed cleanly — `ui` explicitly addressed the `AGENTS.md` persisted profile data-shape rule with full legacy `[]`/`string[]`/null/undefined backward compatibility and zero CSS impact, and `verifier` independently verified all 5 automated/static checks via `fitgen-dev-tools-verifier`, with one minor cosmetic stage-number label drift writing `reviewer (Stage 9)` instead of Stage 10 in `open:`.)*

## Friction & Process Gaps
- **`inheritMcp: false` Turn-1 MCP startup race:** Freshly spawned subagents with `inheritMcp: false` and role-unique stdio `mcpServers:` did not have `call_mcp_tool` injected on Turn 1 before `node /workspace/mcp/devToolsMcpServer.js` finished its stdio handshake. This hit `orchestrator` on Step 1, caused a fail-closed pause on `tester` at Stage 3 Turn 1, and required a Turn-2 refresh on `implementer`, `verifier`, and `reviewer`.
- **Repeated MCP approval prompts across 6 server names:** Antigravity defaults unconfigured MCP tool calls to `Ask`. Having 6 separate server names (`dev-tools_fitgen-dev-tools` + 5 `fitgen-dev-tools-<role>` servers) plus out-of-workspace lazy schema reads (`/root/.gemini/antigravity-cli/mcp/...`) caused repeated approval prompts throughout the run.
- **Container sandbox wrapper error (`fork/exec /usr/local/bin/agy.*.old: operation not permitted`):** Persisted for sandboxed `run_command` calls; routing all subagent checks through `fitgen-dev-tools-*` MCP servers avoided any `BypassSandbox: true` calls by subagents.
- **Minor stage-number label drift:** `verifier` (Stage 8) again wrote `reviewer (Stage 9)` instead of Stage 10 in `open:` (cosmetic only; `orchestrator` enforced Stage 9 Green Gate before Stage 10 Reviewer).

## Next-Iteration Adjustments
- Resolve both the `inheritMcp: false` Turn-1 MCP race and repeated MCP approval prompts before Phase 4 (choose between automated Turn-1 MCP refresh + `/permissions` allow rules per server vs. shared `inheritMcp: true` plugin server + single `/permissions` allow rule, and inspect MCP tool read-only annotations).
- Complete manual UI smoke checks for Phase 3 Groups 1–4 and begin Phase 4 (One data layer).
