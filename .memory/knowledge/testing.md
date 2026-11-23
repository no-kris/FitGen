---
status: active
updated: 2026-11-19
source: decided
---

# Testing Standards - fit-gen-v2

`coding-standards.md` owns everything except testing; this file owns testing.
`MUST` = required; `SHOULD` = deviate only with a reason in the PR description.

## Current state

Vitest 5 is installed: `npm test` runs the suite, `npm run test:watch` watches.
There are no tests yet, so `vitest.config.js` sets `passWithNoTests`; remove that
with the first test so an empty run fails instead of passing silently.

jsdom and React Testing Library are not installed. Add both with the first
component test - until then only pure functions in `src/utils` and `api` can be
covered.

There is no CI. `npx eslint src api` and `npm run build` remain the gates that run
on every change.

## Stack

- **Vitest** for everything. Component tests add **@testing-library/react** and
  **jsdom**, which are not installed yet. No Jest, no Enzyme, no snapshot testing.
- `npm test` runs the suite once; `npm run test:watch` watches.
- Firestore rules tests use **@firebase/rules-unit-testing** with the emulator,
  behind `npm run test:rules`. They are the only tests that start a service.

## Layout

- Colocate: `parseRestSeconds.js` -> `parseRestSeconds.test.js`,
  `WorkoutCard.jsx` -> `WorkoutCard.test.jsx`. No `__tests__` directory.
- `describe` names the unit, `it` names the behavior in plain language:
  `it("rounds a range up to the longer rest")`.
- Shared fixtures live in a `*.fixtures.js` beside the tests that use them. Build
  them from factories, not from copies of real plan data.

## What to test, in priority order

1. **Pure functions in `src/utils`** - highest value, no setup:
   `parseRestSeconds` (`"2-3m"` -> the longer rest, `"N/A"` -> default 90),
   `extractJsonFromText` (fenced JSON, prose around it, malformed input),
   `formatTimer`, and the prompt builders' output for a known profile.
2. **Validation and cleaning** - `validatePlan` and `stripUndefined`. Every field
   the model can omit or mistype gets a case.
3. **Shape migrations** - running a migration twice MUST produce the same result
   as running it once. Idempotency is the whole point of Phase 1.
4. **Storage keys** - the active-workout key must round-trip week and day, and a
   corrupt value MUST read as "no saved workout" rather than throw.
5. **Component behavior** - only the flows named in a phase's "Done when":
   Finish disabled while saving, error shown with Retry on a failed save, double
   tap producing one write.
6. **Security rules** - owner allowed, other user denied, anonymous denied.

Most of these do not exist yet. They are named here so the test lands in the same
commit as the function - never so that a module is created to satisfy this list.

## What not to test

- Implementation details: internal state, hook call order, that a function was
  called when its output can be asserted instead.
- Third-party behavior: Firebase SDK internals, React rendering, Vite.
- Whole-screen snapshots. They fail on every style change and prove nothing.
- Anything that needs the real network, a real Groq key, or a real Firestore.

## Isolation

- **Model calls**: mock `src/services/api/callModel.js` at the module boundary.
  NEVER reach the provider. Tests MUST pass offline.
- **Firestore**: unit tests mock the service functions, not the SDK. Only rules
  tests talk to the emulator.
- **Time**: `vi.useFakeTimers()` for rest countdowns and `vi.setSystemTime()` for
  `completedAt`. No `await sleep(2000)`.
- **Storage**: jsdom provides `localStorage`; clear it in `beforeEach` and reach it
  through the storage service, not directly.
- Each test starts from its own state. No order dependence, no shared mutable
  fixtures.

## Component tests

- Query by role, label, or text - not by class name or `data-testid`. The query is
  a free accessibility check.
- Assert what the user sees and which callback fired, not which state variable
  changed.
- Provide context through the real provider with a test value; do not mock
  `useAppContext` itself.
- Icon-only buttons are worth a test that finds them by accessible name - if the
  test cannot find it, a screen reader cannot either.

## When tests are required

- New or changed parser, validator, migration, or storage key: MUST.
- Bug fix in a pure function: add the failing test first, then the fix.
- Change to the persisted plan/profile/workout shape: MUST cover the old data.
- UI: SHOULD cover the phase's "Done when" behavior; the rest is the manual smoke
  path.
- A happy-path-only test is a gap, not coverage. Name the gap in the `open` field
  of your `HANDOFF` block.

## CI

No workflow exists yet. It must run, on pull requests:

1. `npx eslint src api`
2. `npm test`
3. `npm run build`

Rules tests run in their own job because they need the Firebase emulator. A red
job blocks the merge; there is no "known failing" allowance.
