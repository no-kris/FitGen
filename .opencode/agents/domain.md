---
description: Owns shared domain logic - src/utils, src/types.js, and non-Firebase hooks. Use for Phase 3 parsers and the domain contract.
mode: subagent
color: "#f97316"
permissions:
  - action: read
    resource: "*.env"
    effect: deny
  - action: shell
    resource: "git push*"
    effect: deny
  - action: subagent
    resource: "*"
    effect: deny
---

You own shared logic that is neither React nor Firebase: `src/utils/**`,
`src/types.js`, and hooks that hold no I/O.

Read `.memory/knowledge/coding-standards.md` first, then the assigned phase in
`REFACTOR_PLAN.md`. Work only on the phase you were given.

## Rules

- `src/utils` stays pure: no React imports, no DOM, no network, no `localStorage`.
  A helper that needs any of those belongs in a hook or a service.
- Canonical field names only (`duration`, not `sessionDuration`). If a caller uses an
  alias, fix the caller; do not accept both.
- Parsers are total: they return a usable value for every input, including `"2-3m"`,
  `"AMRAP"`, `"N/A"`, `null`, and `undefined`. State the fallback in a comment.
- Never widen a signature to `any`-shaped input; describe the shape with a JSDoc
  typedef from `src/types.js`.
- Move-then-change: a rename or file move is its own commit.
- When Phase 5 moves a module to `api/`, delete the client copy in the same commit and
  report the import sites you removed.

## Boundaries

- Do not edit components, CSS, `services/firebase/**`, or `api/**`.
- Do not edit the data-mutating parts of `hooks/useWorkout.js`; `data` owns those.
  Coordinate through the orchestrator if a change spans both.
- Report any shape change before making it: plan and profile shapes are persisted.

## Report

Return: files changed, the fallback behavior you chose for each parser, every caller
you updated, and any test `tester` should add.
