# Memory Scope

Durable, repo-local memory for AI agents (and humans) working on fit-gen-v2.
It survives context loss between sessions.

## Purpose

Record what the code cannot: decisions and their reasons, non-obvious
constraints, and verified external facts. Code is the source of truth for
*behavior*; this directory is the source of truth for *intent*.

## Not for

- Restating code, file listings, or architecture that can be read from the repo.
- Task tracking, TODOs, or session logs (those die with the branch).
- Secrets, keys, tokens, PII, or user data. Name the env var instead.
- Speculation. Unverified claims MUST be labelled `draft`.

## Map

| Path | Contents |
| --- | --- |
| `.memory/SCOPE.md` | this charter |
| `.memory/knowledge/` | how we work: standards, conventions, patterns |
| `.memory/projects/MEMORY_INDEX.md` | index of every entry in this directory tree |
| `.memory/projects/decisions/` | one file per irreversible choice (ADR) |
| `.memory/references/` | externally sourced facts: vendor docs, API limits, versions |

## Entry format

Every file starts with front matter:

```yaml
---
status: active | superseded | draft
updated: YYYY-MM-DD
source: observed | decided | external
---
```

- `observed` - verified against the code or a running system.
- `decided` - a choice we made; the alternatives go in `decisions/`.
- `external` - from vendor docs; include the URL and access date.

## Write policy

Agents SHOULD write memory when a decision is made that a future session cannot
infer from the diff, or when a constraint was discovered that cost real time.
Agents MUST NOT record anything derivable by reading the code.

## Precedence

Code > `.memory/knowledge` > `.memory/projects` > `.memory/references`.
If memory contradicts the code, the code wins - fix the memory in the same PR.

## Maintenance

- `MEMORY_INDEX.md` is the only index; every entry appears there.
- Superseded entries are marked, not deleted, until the index passes ~50 rows.
- Anything `observed` against a version that no longer exists becomes `superseded`.
