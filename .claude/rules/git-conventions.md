# Git Conventions

## Conventional Commits

Every human-authored commit message follows Conventional Commits
(https://www.conventionalcommits.org/en/v1.0.0/): `type(scope): description`, scope optional. This
is enforced, not a suggestion: the `commit-msg` lefthook hook runs `pnpm commitlint --edit {1}`
against `commitlint.config.js`, which extends `@commitlint/config-conventional` with no
repo-specific overrides. A commit that fails this check is rejected before it is created. Merge
commits and the bot-generated `changeset-release` commits are exempt by commitlint's default merge
detection, which is why `git log` also shows lines like `Merge pull request #198 from
verbatra/...` and `Version Packages` alongside the Conventional Commits ones.

The enforced type is one of exactly these eleven (`type-enum` in `@commitlint/config-conventional`):
`build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`. There
is no `scope-enum` restriction, so scope is free-form, but real history uses it to name the package
or area touched: `feat(contact)`, `fix(sdk)`, `docs(github-action)`, `ci(docs-i18n-check)`. Other
rules from the same preset: header, body, and footer lines <= 100 characters, subject not empty,
subject not sentence-case/start-case/pascal-case/upper-case (start lowercase), no trailing period
on the subject, type itself lowercase.

Real examples from this repo's history (`git log --oneline`):

```
feat(contact): add contact form and honeypot validation
fix(sdk): resolve config.ts package imports to the running SDK
fix(sdk): guard the home-directory search fallback against non-ancestor cwd
docs(sdk): clarify config.ts alias fallback in the docstring and changeset
ci: change actions to pinned full-length commit SHA
```

Never bypass the `commit-msg` or `pre-commit` hook with `--no-verify` or any other skip flag to get
a bad message or a failing check through. If a hook fails, fix the cause and re-stage: `pnpm check`
or `pnpm format` for Biome findings, `pnpm install` to resync `pnpm-lock.yaml`, or a corrected
commit message for commitlint.

## Hooks (`lefthook.yml`)

- `pre-commit` (parallel): `check` runs Biome on staged JS/TS/JSON files; `lockfile` runs
  `pnpm install --frozen-lockfile --lockfile-only` when a `package.json`, `pnpm-lock.yaml`, or
  `pnpm-workspace.yaml` changed; `no-em-dash` runs `pnpm check:no-em-dash` (defined in the root
  `package.json`), which fails the commit if a U+2014 em dash was staged anywhere except
  `pnpm-lock.yaml`.
- `commit-msg`: `lint` runs `pnpm commitlint --edit {1}`.

## Commit hygiene

- Keep commits atomic: one logical change per commit. Do not mix an unrelated formatting pass, a
  dependency bump, and a feature change in the same commit.
- Create new commits by default. Never amend or force-push a commit that has already been pushed or
  reviewed unless the user explicitly asks for it.
- Branch naming mirrors the commit type: `<type>/<kebab-case-description>`, matching the
  `type-enum` vocabulary above. Real examples from this repo: `fix/config-ts-loader-package-alias`,
  `feat/studio-glossary-editing`, `docs/contributor-extension-guides`,
  `chore/seo-geo-metadata-improvements`. `changeset-release/main` and `dependabot/**` branches are
  automated and outside this convention.
- Never commit generated output or local state: `dist/`, `coverage/`, `.turbo/`, `.next/`,
  `.source/`, `node_modules/`, or `.verbatra/` (all already in `.gitignore`).
- Never commit secrets or `.env*` files. API keys are read from environment variables only (see the
  Security section of the root `CLAUDE.md`); one never belongs in a diff.
- A `src` change to a publishable package (`@verbatra/sdk`, `@verbatra/cli`, `@verbatra/studio`)
  needs an accompanying changeset. `.changeset/config.json` fixes `@verbatra/sdk` and
  `@verbatra/cli` to the same version; `@verbatra/studio` versions independently. The mechanics of
  adding one (`pnpm changeset`, bump level, wording) are covered by the `changesets` skill at
  `.claude/skills/changesets/`; this file only states that the commit needs one, not how to write
  it.
- A `src` change to a private package that `@verbatra/sdk` bundles (`@verbatra/core`,
  `@verbatra/format-adapters`, `@verbatra/ai-providers`, `@verbatra/exchange`) needs a changeset
  too, naming `@verbatra/sdk` itself, not the private package. tsup inlines that source straight
  into `packages/sdk/dist`, and the sdk build always runs from the current checkout
  (`.github/workflows/release.yml`, the "Rebuild here rather than transfer an artifact" step), so
  the change ships inside sdk's published bytes either way. Changesets does not chain a version
  bump from a devDependency to its dependent (`packages/sdk/package.json` lists these as
  `devDependencies`; confirmed with a probe changeset naming only `@verbatra/core` and running
  `pnpm changeset status --verbose`, which bumped `core` and its other dependents but never listed
  `sdk`), so an unaccompanied bundled-source change ships with no version bump and no changelog
  entry. `check:dependency-changeset` (`scripts/check-dependency-changeset.mjs`, run in `ci.yml`)
  does not catch this case either: it only diffs the `dependencies` field of already-published
  manifests, not devDependency source edits, so this rule is the only guard.

## Pull requests

`.github/PULL_REQUEST_TEMPLATE.md` expects three sections: "What changed" (the change and why),
"How it was tested" (commands run, cases covered), and a checklist confirming Conventional Commits,
`pnpm test` passing locally, and a changeset added if a publishable package changed. Fill in the
template rather than replacing it with free-form text.
