# fit-gen-v2

React 19 + Vite 7 single-page app in plain JavaScript (no TypeScript), with Vercel
edge functions in `api/`. Firebase for auth and Firestore, Capacitor for mobile.

## Commands

- Dev server: `npm run dev -- --host 0.0.0.0` (port 5173; `--host` is required to reach it from the host)
- Build: `npm run build`
- Lint: `npx eslint src api` - this is the meaningful check, and it must exit 0
- No test runner is configured yet

## Rules

- `.memory/SCOPE.md` and `.memory/knowledge/*.md` are loaded as instructions: follow
  them, and follow `coding-standards.md` before editing code.
- Never edit `dist/`, `ios/`, or `node_modules/` - generated or platform
  projects.
- Never print, copy, or commit `.env`. Refer to environment variables by name and do not echo the variable in the chat interface.
- All model traffic goes through `src/services/api/callModel.js`; do not call a
  provider directly from a component or hook.
- Never run `git commit`, `git checkout`, `git switch`, `git reset`, or `git push`
  without explicit approval in the current session. Report changed files instead.
- Do not implement multi-file or multi-phase work inline. Launch the `orchestrator`
  subagent and let it fan out to the specialists, run `verifier` and `reviewer`, and
  request approval before committing. Handle only small, single-file changes yourself.
- If you are already the orchestrator, delegate to the specialists directly; never
  launch another orchestrator.
- Stop and ask before changing the plan/profile data shape - it is persisted in
  Firestore and cached in localStorage.
