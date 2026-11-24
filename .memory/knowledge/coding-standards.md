---
status: active
updated: 2026-11-24
source: observed
---

# Coding Standards - fit-gen-v2

Rules for writing code in this repo, written to be followed during the refactor.
`MUST` = required; `SHOULD` = deviate only with a reason in the PR description.

## Definition of Done

A change is done when all of these hold:

- `npx eslint src api` exits 0
- `npm run build` succeeds
- `npm test` exits 0 (see `testing.md`)
- No new instances of the debt listed at the bottom
- The manual smoke path still works: onboarding -> generate -> start workout -> finish -> next week
- The diff contains no unrelated reformatting or renames

## Stack

React 19 + Vite 7 in plain JavaScript (`.js` / `.jsx`, no TypeScript). Firebase 12
(auth + Firestore), Capacitor 8 (mobile), `lucide-react` (icons), EmailJS. Vercel
edge functions in `api/`. Vitest + React Testing Library for tests. No router, no Tailwind, no path aliases.

## Layout

| Path | Holds |
| --- | --- |
| `src/components/ui` | domain-agnostic primitives (`Button`, `Modal`, `TextInput`) |
| `src/components/layout` | app chrome (`Layout`) |
| `src/components/screens` | full-screen views wired to context |
| `src/features/<domain>` | feature UI + `helpers/` (`workout`, `dashboard`, `onboarding`, `auth`) |
| `src/hooks` | stateful logic, one hook per file |
| `src/services` | external boundaries (`firebase/`, `api/`, `storage/`) |
| `src/utils` | pure functions, no React |
| `src/context` | context creation + guard hook |
| `api/` | deployable endpoints only; shared helpers prefixed `_` |

New behavior goes under `features/`. `components/ui` MUST stay domain-agnostic.

## Domain contract

`src/types.js` holds the canonical shapes as JSDoc typedefs: `Profile`, `Plan`,
`Week`, `Day`, `Exercise`, `WorkoutLog`, `UserData`. It is the contract for every
function that consumes plan data.

- Field names are canonical: `duration`, `selectedDays`, `weeks`, `exclusions`,
  `priorities`, `weeks[].schedule[].exercises`. No aliases or synonyms - a
  `sessionDuration` alias was how the week-2 generator previously lost its input.
- The model's JSON schema lives once in `src/utils/planSchema.js` and is used by both
  prompt builders. Prompts MUST NOT redeclare the shape inline.
- Model output is untrusted input: run `validatePlan()` before it reaches state.
  `extractJsonFromText` guarantees parseable JSON, not correct JSON.
- Every exercise SHOULD carry a stable `id`; do not use array index as identity.

## Naming

- Components `PascalCase.jsx`; everything else `camelCase.js`.
- `.jsx` only when the module returns JSX (see `onboarding/helpers/renderStep.jsx`).
- One component per file, `export default function Name(...)`.
- Hooks: named export, `export function useThing()`.
- Services: named export of an object, `export const xService = { ... }`.
- Utils: `const thing = ...; export default thing;`.
- Props destructured in the signature.
- Handlers are `handleX` inside a component; the prop receiving them is `onX`.
- Booleans read as predicates: `isSynced`, `hasPlan`, `isGenerating`.
- No magic strings: use the `VIEWS`, `STORAGE_KEYS`, and `COLLECTIONS` constants.

## Formatting

- 2-space indent, double quotes, semicolons, trailing commas in multi-line literals.
- No formatter is configured yet: match the file you are editing and never reformat
  unrelated lines. Adopting Prettier is a planned formatting-only commit; once it
  lands, `npm run format:check` joins the Definition of Done.

## React

- Function components only. No classes, no PropTypes, no `React.` namespace.
- Import hooks by name: `import { useState, useEffect } from "react"`.
- Treat state and props as immutable: copy before editing (`const next = [...logs]`).
- Hold callbacks consumed by subscriptions in a `useRef` so effects do not
  re-subscribe (`useAuthObserver` is the reference implementation).
- Every subscribing `useEffect` returns its unsubscribe.
- Prefer `children` over a `text` prop that accepts arbitrary nodes.
- Prefer existing semantic classes (`btn-primary`, `btn-secondary`, `card`, `input`)
  over class strings assembled ad hoc at the call site.
- Keep components under ~150 lines; past that, split by responsibility.

## State and data flow

- One provider in `App.jsx`; `useAppContext()` MUST keep throwing outside it.
- Canonical user shape: `{ profile, plan, history }`.
- Screens read context and call handlers. Shape surgery on `userData` belongs in a
  hook or in `App.jsx`, never in a leaf component.
- Register screens in one place; do not add another `view ===` branch.
- Guard Firestore writes on `user` (authenticated non-anonymous user required), and `await` or
  `.catch()` every new write so failures surface.
- `localStorage` mirrors the cloud; it is not a second source of truth, and it is
  reachable only through the storage service.

## Storage

- All persistence goes through `src/services/storage`, with versioned keys
  (`fitgen:active:v1`) declared in `STORAGE_KEYS`.
- Reads MUST tolerate absent or corrupt data: parse inside try/catch, return null.
- Never call `localStorage` directly from a component or hook.

## Styling

- Global CSS only: `main.jsx` imports `css/index.css`, which `@import`s `utils.css`
  and `animations.css`. Components MUST NOT import CSS.
- Utilities live in `utils.css`; component classes (`.card`, `.button`, `.input`,
  `.view-container`) live in `index.css`. Add a class rather than an inline style.
- Colors, radii and spacing come from the `:root` variables. No hardcoded hex values.
- `html { font-size: 62.5% }`, so **1rem = 10px**; `.text-base` is 10px.
- Utility names look like Tailwind but the values are not Tailwind's. Read
  `utils.css`; do not paste classes that do not exist (`text-red-500`, `md:flex`).
- Do not add Tailwind: its class names would collide with this layer.

## API boundary

- Client code reads only `import.meta.env.VITE_*`.
- `api/*` reads `process.env.*` (`PROVIDER_API_KEY`, `API_URL`, `MODEL`,
  `MODEL_FALLBACK_1`, `MODEL_FALLBACK_2`). Server-only keys MUST NOT reach `src/`.
- Every variable in use MUST be declared in `.env`, which is untracked and holds the
  only local record of values. Adding or removing a variable is part of the same
  change; document names in prose, never by pasting values.
- All model traffic goes through `src/services/api/callModel.js`; keep the 3-attempt
  retry and JSON extraction there.
- Endpoints stay wrapped in `withAuth()` and return `createJsonResponse()`.
- Prompts live in `src/utils/*Plan.js`, never in components.

## Accessibility

- Icon-only buttons need an accessible name (`aria-label`).
- `Modal` needs `role="dialog"`, `aria-modal`, Escape to close, and focus handling.
- Inputs need a label or `aria-label`; a placeholder is not a label.
- Interactive elements must be real buttons or links, not clickable divs.

## Async UX and errors

- Every async action exposes a pending state and disables its trigger. Follow the
  existing patterns: `isGenerating` in `ProfileSetupForm`, `isLoading` in
  `FeedbackModal`.
- No `alert()` or `confirm()` in new code; render errors and confirmations inline.
- Services catch, log, and rethrow so callers can decide. Never swallow an error in
  an empty `catch`; if it is genuinely ignorable, comment why (see the `Haptics`
  call in `WorkoutCard`).
- Wrap optional Capacitor plugin calls in `try/catch`; they throw on web.
- The app shell SHOULD have an error boundary so a render error is not a blank screen.

## Tests

`testing.md` owns the runner, layout, required cases, and CI.

## Known debt (do not expand)

Permitted today, never copied into new code: `alert()` in auth flows;
`JSON.parse(JSON.stringify())` for deep copies; direct `localStorage` access; magic
`view` strings; unvalidated model output; icon-only buttons without `aria-label`.

If you touch a file containing one of these, fixing it is welcome **in its own
commit**, never mixed with a behavior change.

## Refactor protocol

- One concern per commit. Renames, moves, and behavior changes never share a commit.
- Keep the tree green after every commit, not just at the end.
- Move-then-change: land a pure move or rename first so `git diff --find-renames`
  shows a single intent.
- Update the domain contract first when a refactor changes a shape.
- Do not reformat or rename code outside the task.
- Do not introduce TypeScript, a router, path aliases, a state library, or Tailwind
  without an explicit decision.
- Do not delete code you cannot explain; ask instead.
- Never commit `.env`, keys, or build output.
