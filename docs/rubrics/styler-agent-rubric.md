# Quality Rubric: styler

Scores one run of the `styler` agent. In an orchestrator run it runs at Stage 6 after `implementer` finishes production logic (when `spec.md` includes UI visual changes or new styling), and again on Stage 11 loop rounds if `reviewer` rejects a build for styling findings. It owns global CSS in `src/css/` (`index.css`, `utils.css`, `animations.css`) and `className` assignments on in-scope JSX elements in `src/`. It is a styler, not a logic builder, tester, or verifier: business logic, state handlers, `api/`, tests, and run artifacts are out of scope.

It writes no run artifact of its own; its output is the CSS/`className` diff plus its `HANDOFF` block (and on standalone benchmarks, an evaluation entry in `docs/iteration-logs/`). Where a standalone run is scored differently, the dimension says so.

Evidence comes from the repo and run directory: `spec.md`, `git status` / `git diff`, `src/css/*`, `green-report-round-<N>.md`, `verification.md`, `review.md`, independent `npx eslint src api` and `npm run build`, and the agent's `HANDOFF` block. The agent's own claims about lint or build results don't count as evidence.

## 1.1 Design System & Visual Fidelity

Measures whether the styling satisfies `spec.md`, strictly obeys `.memory/knowledge/design-system.md` and `.memory/knowledge/coding-standards.md`, builds cleanly, and preserves Stage 7 tests.

### Scoring Guide

1. Does not meet – Missing required styles from `spec.md`, introduces inline `style={{ ... }}`, hardcoded hex/`rgb()` colors, component CSS imports, or unmapped Tailwind classes (e.g., `text-red-500`, `md:flex`), breaks `npx eslint src api` or `npm run build`, or breaks Stage 7 tests.

   - Level 1 example: Adds `style={{ color: "#ef4444" }}` and `className="mt-4 text-red-500"` to the save-error banner in `ActiveWorkout.jsx`, or creates `ActiveWorkout.css` and imports it in the component.

2. Partially meets – Visual intent is mostly met and lint/build pass, but design-system conventions slip: wrong file placement (component rule placed in `utils.css` or animation in `index.css`), wrong `rem` scale (assuming `1rem = 16px` instead of `10px`), `100vh` on a scroll container, or touch targets smaller than `4.4rem` (44px).

   - Level 2 example: Defines `.save-error-banner` inside `src/css/utils.css` with `padding: 0.75rem` (7.5px instead of 12px) and sets the Retry button height to `3.2rem`, triggering a `review.md` finding on scale and mobile touch-target height.

3. Meets – Every visual requirement in `spec.md` is implemented using `:root` tokens (`var(--...)`), zero inline styles, zero hardcoded colors, and zero component CSS imports. Utilities live in `src/css/utils.css`, component classes in `src/css/index.css`, and keyframes in `src/css/animations.css`. Every applied `className` exists in `src/css/`, respects `1rem = 10px` and Capacitor mobile rules (`var(--safe-top)` / `var(--safe-bottom)`, no `100vh` scroll containers, `>= 4.4rem` touch targets), `npx eslint src api` and `npm run build` exit `0`, and `review.md` finds no styling violations.

   - Level 3 example: Adds `.save-error-banner` and `.btn-retry` in `src/css/index.css` using `var(--danger)`, `var(--bg-card)`, `var(--radius)`, and `min-height: 4.4rem`; attaches existing `.card`, `.flex`, `.gap-2` utilities on `ActiveWorkout.jsx` and `PlanDashboard.jsx`; `npx eslint src api` and `npm run build` exit `0`; `green-report-round-1.md` and `review.md` pass.

4. Exceeds – Level 3 on the first build, reusing existing semantic classes cleanly with minimal new CSS and zero styling regressions across desktop and mobile safe-area viewports.

   - Level 4 example: Level 3, reached in round 1 with only one new component class (`.conflict-modal-actions`) reusing `.card`, `.btn-primary`, and `.btn-secondary`, zero duplicated rules, and `review.md` passes with no styling notes.

Standalone run (no Stage 7/10 run): score by inspecting `git diff` against `.memory/knowledge/design-system.md` plus running `npx eslint src api` and `npm run build`; mark `green-report-round-<N>.md` and `review.md` checks pending.

## 1.2 Scope & Role Discipline

Measures whether the agent stayed strictly within `src/css/` and JSX `className` attributes, respected command boundaries, and avoided unrelated churn.

### Scoring Guide

1. Does not meet – Modified any business logic, React state, hooks, event handlers, accessible labels/text, `api/*`, test files (`*.test.js`, `*.test.jsx`, `*.fixtures.js`, `src/test/*`), `vitest.config.js`, `package.json`, `.env*`, `dist/*`, `ios/*`, `node_modules/*`, `.memory/*`, `.agents/*`, or `docs/orchestrator-runs/*`; ran forbidden git commands (`commit`, `checkout`, `switch`, `reset`, `push`) or invoked a subagent.

   - Level 1 example: Added a `useState` toggle inside `ActiveWorkout.jsx` to hide the error banner, edited `ActiveWorkout.test.jsx` to match a renamed element, or ran `npm install tailwindcss`.

2. Partially meets – Crossed a boundary and reverted it, reformatted untouched CSS/JSX lines outside the task, or ran an out-of-scope command (e.g., `npm test` or `npx eslint --fix`) while leaving the final diff valid.

   - Level 2 example: Reformatted 80 unrelated lines of `src/css/index.css` while adding `.save-error-banner`, polluting `git diff --stat` and triggering a coding-standards finding.

3. Meets – Diff is strictly confined to `src/css/*.css` and `className` edits on in-scope `src/` JSX files; zero logic, handler, prop, test, or run-artifact changes; zero unrelated reformatting; only `npx eslint src api` and `npm run build` were executed; zero forbidden git commands or subagents.

   - Level 3 example: `git diff` shows additions only in `src/css/index.css` and `className` attribute updates in `src/features/workout/ActiveWorkout.jsx` and `src/features/dashboard/PlanDashboard.jsx`; `git diff --stat` shows zero changes to tests, hooks, services, or `docs/orchestrator-runs/`.

4. Exceeds – Level 3, plus noticed a missing JSX wrapper or accessibility attribute needed for styling (e.g., missing `aria-label` or container element) and escalated it cleanly in `HANDOFF` instead of altering component logic.

   - Level 4 example: Level 3, plus logged in `HANDOFF` `open:` that the paused-workout conflict modal needs a dedicated footer wrapper from `implementer` if sticky bottom actions are desired, without altering JSX structure itself.

## 1.3 Handoff Quality

Measures whether the agent's `HANDOFF` block lets `orchestrator`, `tester`, `verifier`, and `reviewer` audit what changed without re-deriving the styling contract from raw diffs.

### Scoring Guide

1. Does not meet – Missing `AGENTS.md` `HANDOFF` block, invalid `status`, omits changed files, or claims lint/build passed without running them.

   - Level 1 example: Ends with "Styled the save error banner and modal. Everything looks good." with no `HANDOFF` block, no file list, and no `npx eslint` or `npm run build` output.

2. Partially meets – Valid `HANDOFF` structure, but omits the CSS class/token contract added, gives vague evidence ("lint ok"), omits one of `npx eslint src api` or `npm run build`, or fails to answer `reviewer` findings one by one on a loop round.

   - Level 2 example: `HANDOFF` lists `files: src/css/index.css, src/features/workout/ActiveWorkout.jsx` and `evidence: build passed`, but omits `npx eslint src api` output and on round 2 says "addressed review feedback" without naming the specific findings fixed.

3. Meets – Complete `AGENTS.md` `HANDOFF` block:
   - `phase`, `from: styler`, `to: orchestrator` (or `tester`), and valid `status` (`done | blocked | needs-decision`)
   - `files:` listing every modified CSS and JSX path (or `none`)
   - `contract:` naming new/updated CSS classes, tokens used, and JSX elements styled, traced to `spec.md` (and on loop rounds, each `reviewer` finding addressed)
   - `evidence:` holding exact `npx eslint src api` and `npm run build` results
   - `open:` listing any needed `implementer` follow-ups, ambiguities, or `none`

   - Level 3 example: "`files: src/css/index.css, src/features/workout/ActiveWorkout.jsx`. `contract: added .save-error-banner (var(--danger), var(--bg-card), var(--radius)) and applied .btn-secondary with min-height 4.4rem to Retry button per spec section 6`. `evidence: npx eslint src api -> exit 0; npm run build -> exit 0 (dist built in 1.4s)`. `open: none`."

4. Exceeds – Level 3, plus calls out any design-system ambiguity, mobile safe-area tradeoff, or pre-existing inline-style debt observed outside scope so `reviewer` can verify boundaries at a glance.

   - Level 4 example: Level 3, plus notes in `open:` that `PlanDashboard.jsx:88` still has a pre-existing inline style outside the Phase 1 spec and was intentionally left untouched per `coding-standards.md`.

**Pass threshold:** A run passes if it scores 3 or higher on all three dimensions, and the gates are met: `npx eslint src api` and `npm run build` exit `0`, `green-report-round-<N>.md` stays green with unchanged test hashes, `review.md` passes with zero styling or scope violations, and the diff is strictly limited to `src/css/*.css` and `className` attributes in in-scope `src/` JSX.

**Notes on threshold design:** Design System & Visual Fidelity has a floor because hardcoded colors, inline styles, or wrong `rem` scaling silently erode the token system and break Capacitor mobile layouts even when `npm run build` succeeds. Scope & Role Discipline treats editing logic, handlers, tests, or configs as a Level 1 breach: keeping `styler` strictly on CSS and `className` prevents styling passes from introducing logic regressions or invalidating frozen tests at Stage 7. Handoff Quality has a floor because `orchestrator` and `reviewer` rely on explicit class/token contracts and real lint/build evidence to verify each round without burning extra iterations of the shared 3-round budget. Exceeds rewards first-round passes, minimal reusable CSS, and disciplined escalation of out-of-scope structural needs.
