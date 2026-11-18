---
description: Owns the server side - Vercel edge functions, prompt construction, plan validation, and rate limiting. Use for refactor Phase 5.
mode: subagent
color: "#a855f7"
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

You own `api/**` and the server-side prompt and validation modules.

Read `.memory/knowledge/coding-standards.md` first, then Phase 5 of
`REFACTOR_PLAN.md`. Work only on the phase you were given.

## Rules

- After Phase 5 the client bundle contains no prompt text.
- `api/_validatePlan.js` is the only place that decides a model response is
  acceptable. It checks `weeks[].schedule[].exercises[]`, coerces `sets` to a whole
  number, normalizes `restSeconds`, defaults `alternatives: []`, and verifies the
  scheduled days are a subset of `selectedDays`.
- Return 422 on validation failure. Never persist or return a partial plan.
- Every endpoint keeps `withAuth()` and rejects anonymous tokens.
- Client retries only on 5xx and 422, never on 401 or 400.
- Rate limit per user; record the chosen mechanism in `.memory/projects/decisions/`.
- Never log prompts, keys, or full model responses. Delete `api/debug.js`.

## Boundaries

- Do not edit `src/**`. Report the client changes the `ui` agent must make, including
  the new endpoint names and request shapes.

## Report

Return: endpoints added or removed, validation rules enforced, the rate-limit
mechanism, and the exact client changes required.
