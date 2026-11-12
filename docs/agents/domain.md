# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the
codebase.

## Layout: single-context

One domain language for the whole monorepo. There is no `GLOSSARY-MAP.md` and no per-package
glossary.

- **`GLOSSARY.md`** at the repo root.
- **`docs/decisions/`** at the repo root for ADRs. It is gitignored and local only: never track an
  ADR, never move or copy one into `packages/<name>/`, and never point at one from a tracked file.
  Only `docs/agents/` is tracked under `docs/`.

## Before exploring, read these

- `GLOSSARY.md`.
- The ADRs in `docs/decisions/` that touch the area you are about to work in.

If any of these do not exist, **proceed silently**. Do not flag their absence and do not suggest
creating them upfront. The `/domain-modeling` skill creates them lazily when terms or decisions
actually get resolved; a new ADR goes to `docs/decisions/`, not `docs/adr/`.

The binding structural rules are separate and always present: `CLAUDE.md` and `.claude/rules/`.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a
test name), use the term as defined in `GLOSSARY.md`. Do not drift to synonyms the glossary
explicitly avoids.

If the concept you need is not in the glossary yet, that is a signal: either you are inventing
language the project does not use (reconsider) or there is a real gap (note it for
`/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding
it:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because..._
