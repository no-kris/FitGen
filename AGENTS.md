# fit-gen-v2

React 19 + Vite 7 single-page app in plain JavaScript (no TypeScript), with Vercel
edge functions in `api/`. Firebase for auth and Firestore, Capacitor for mobile.

## Commands

- Dev server: `npm run dev -- --host 0.0.0.0` (port 5173; `--host` is required to reach it from the host)
- Build: `npm run build`
- Lint: `npx eslint src api` - this is the meaningful check, and it must exit 0
- Tests: `npm test` (Vitest)

## Rules

- `.memory/SCOPE.md` and `.memory/knowledge/*.md` are loaded as instructions: follow
  them, and follow `coding-standards.md` when writing or designing code.
- Never edit `dist/`, `ios/`, or `node_modules/` - generated or platform
  projects.
- Never print, copy, or commit `.env`. Refer to environment variables by name and do not echo the variable in the chat interface.
- All model traffic goes through `src/services/api/callModel.js`; do not call a
  provider directly from a component or hook.
- Never run `git commit`, `git checkout`, `git switch`, `git reset`, or `git push`
  without explicit approval in the current session. Report changed files instead.
- Every subagent report ends with the `HANDOFF` block defined under Handoffs.
  Forward it verbatim to the next agent; do not paraphrase or summarize it.
- Stop and ask before changing the plan/profile data shape - it is persisted in
  Firestore and cached in localStorage.

## Handoffs

```text
HANDOFF
phase: <n>
from: <your agent id>
to: <recipient agent id, or human>
status: <a value your role allows>
files: <paths you wrote | none>
contract: <shapes, signatures, or verdict the next agent must not re-invent | none>
evidence: <command -> result, or the files you read>
open: <who must act next, or "none">
```

- `status` is role-specific: `done | blocked | needs-decision` for the designers,
  `implementer`, and `tester`; `done | blocked` for `verifier`; `pass | reject |
  blocked` for `reviewer`.
- `blocked` or `needs-decision` stops the run until the human decides.
- The orchestrator writes no HANDOFF of its own; it ends with the run verdict.

## Primary agent only

These apply to the agent the user talks to directly, not to subagents.

- Do not implement multi-file or multi-step work inline. Launch the `orchestrator`
  subagent and let it run the designers, `implementer`, `tester`, `verifier`, and
  `reviewer`, and request approval before committing. Handle only small,
  single-file changes yourself.
- When the orchestrator returns `needs-approval`, show `spec.md` to the user and end
  your turn. Do not resume it and do not make the change yourself until the user
  replies with `APPROVED: <spec path>`.
- If you are already the orchestrator, delegate directly; never launch another
  orchestrator.

## Subagents

- The prompt you were given defines your role and what you may edit. 
- Only `implementer` edits product code and only `tester` edits test code. `data`,
  `domain`, `ui`, and `api` design changes as specs; `verifier` and `reviewer` report.
- If you need a change you are not allowed to make, describe it in your `HANDOFF`
  block instead. Do not work around a denied edit with shell commands.
- Do not write to `.memory/`, whatever `SCOPE.md` says, unless your agent file
  allows it.
