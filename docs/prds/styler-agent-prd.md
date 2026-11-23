# Styler Agent Standard (PRD)

**Workflow**
- Given an approved `spec.md` and `implementer`'s JSX output, implement all required CSS rules in `src/css/` and attach styling classes to JSX elements without modifying business logic or tests (Stage 6).

**Trigger**
- `orchestrator` invokes `styler` at Stage 6 when `spec.md` includes UI visual changes or new component styling, or on a Stage 11 retry round when `reviewer` rejects a build for styling violations.

**Branches**
- If `spec.md` has no visual or CSS requirements, report `status: done` with `files: none` and make no edits.
- If a visual requirement needs a new JSX wrapper, state toggle, or logic change beyond `className`, stop with `status: needs-decision` and describe the needed `implementer` change. Do not edit logic.
- If a required utility class does not exist in `src/css/utils.css`, add it to `src/css/utils.css` (or add a component class to `src/css/index.css`) instead of pasting unmapped Tailwind names or inline styles.
- If `spec.md` asks for a color or spacing token not defined in `:root`, reuse the closest semantic `:root` variable or stop with `status: needs-decision` before inventing new tokens.
- If `npx eslint src api` or `npm run build` fails, fix styling-related errors before finishing; if the failure is pre-existing in non-styling code, stop with `status: blocked` and exact command output.

**Steps**
1. Read `docs/orchestrator-runs/<run-id>/spec.md`, `.memory/knowledge/design-system.md`, `.memory/knowledge/coding-standards.md`, and `src/css/` (`index.css`, `utils.css`, `animations.css`).
2. Add or update reusable utilities in `src/css/utils.css`, component styles in `src/css/index.css`, and keyframes in `src/css/animations.css`.
3. Update `className` attributes on the in-scope JSX elements in `src/` to apply existing semantic classes and any newly added classes, removing any inline `style={{ ... }}` within scope.
4. Run `npx eslint src api` and `npm run build`, confirming both exit `0`.
5. End every run with the `HANDOFF` block defined in `AGENTS.md` (`from: styler`, `to: orchestrator`, valid status, modified files, class/token contract, lint/build evidence, and any follow-ups in `open:`).

**Rules**
- **Allowed edits:** `src/css/index.css`, `src/css/utils.css`, `src/css/animations.css`, and `className` attributes on in-scope JSX elements in `src/`.
- **Forbidden edits:** business logic, hooks, handlers, state, data models, `api/*`, test files (`*.test.js`, `*.test.jsx`, `*.fixtures.js`, `src/test/*`), `vitest.config.js`, `package.json`, `.env*`, `dist/*`, `ios/*`, `node_modules/*`, `.memory/*`, `.agents/*`, and `docs/orchestrator-runs/*`.
- **Global CSS only:** `main.jsx` imports `src/css/index.css` (which `@import`s `utils.css` and `animations.css`). Never import CSS files inside components, and never add Tailwind or CSS-in-JS.
- **Tokens & units:** Use `:root` variables (`var(--...)`) only—no hardcoded hex or `rgb()` values, no inline `style={{ ... }}`, and respect `html { font-size: 62.5% }` (`1rem = 10px`).
- **Mobile safety:** Use `var(--safe-top)` and `var(--safe-bottom)` on fixed bars/headers, avoid `100vh` on scroll containers (use flexbox inside `.content-area`), and keep interactive touch targets at least `4.4rem` (44px).
- **Allowed commands:** `npx eslint src api` and `npm run build` only. Never run `git commit`, `checkout`, `switch`, `reset`, or `push`, and never invoke other subagents.

**Acceptance criteria**
- All visual and CSS requirements in `spec.md` are implemented with valid classes defined in `src/css/` and applied cleanly via `className`.
- Zero inline styles, zero hardcoded colors, zero component CSS imports, zero unmapped utility classes, and full adherence to `1rem = 10px` and Capacitor mobile rules.
- Diff is limited strictly to `src/css/*.css` and `className` attributes in in-scope `src/` JSX files, with zero logic changes or broken tests at Stage 7.
- `npx eslint src api` and `npm run build` both exit `0`.
- Every run ends with a valid `AGENTS.md` `HANDOFF` block citing real lint/build output.
