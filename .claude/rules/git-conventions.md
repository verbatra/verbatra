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
- A user-observable `src` change to a publishable package (`@verbatra/sdk`, `@verbatra/cli`,
  `@verbatra/studio`, `@verbatra/mcp`) needs an accompanying changeset. `.changeset/config.json`
  fixes `@verbatra/sdk` and `@verbatra/cli` to the same version; `@verbatra/studio` and
  `@verbatra/mcp` version independently. The mechanics of adding one (`pnpm changeset`, bump level)
  are covered by the `changesets` skill at `.claude/skills/changesets/`; this file states when a
  change needs one and, for the rest of the 0.12.0 cycle, where it goes:
  1. **Extend a theme, do not add a file.** `.changeset/` holds one file per release theme. When a
     change touches something a theme file covers, add or reword bullets in that file. A modified
     file counts for `check:dependency-changeset` (`--diff-filter=AM`), so the guard stays green.
  2. **At most one new file per change**, and only for a capability no theme covers. Name it after
     the capability (`<capability>.md`), never after the branch that adds it.
  3. **No changeset for a fix to something not yet released.** If the feature is new in 0.12, reword
     its theme bullet when the fix changes what the bullet says; otherwise add nothing.
  4. **No changeset for test-only, docs-only, README-only, type-doc-only or internal refactor
     changes.** No empty changeset is needed either: the only changeset gate in CI is
     `check:dependency-changeset`, and it fires only on a runtime dependency change.
  5. **Anything that changes 0.11 behavior** (config rejected, output or result shape, exit code,
     provider behavior, files rewritten) also gets a line in `upgrade-notes-0-12.md`, or in the
     upgrade bullets that open the `@verbatra/mcp` and `@verbatra/studio` files, naming the old
     behavior, the new one, and the fix.
  6. **Dependency bumps that reach consumers** go into `dependencies-0-12.md` as `name from -> to`.
  7. **Shape:** one headline line, then short bullets grouped under bold lead-ins (no `##`
     headings), at most about eight bullets per change. Each bullet says what the user gets or must
     do, not how it was implemented, and carries no internal history.
  8. After the 0.12.0 release, one changeset per change returns for patch releases, but rules 3
     and 4 stay.
- A user-observable `src` change to a private package that `@verbatra/sdk` bundles
  (`@verbatra/core`, `@verbatra/format-adapters`, `@verbatra/ai-providers`, `@verbatra/exchange`,
  `@verbatra/extract`) needs a changeset too, naming `@verbatra/sdk` itself, not the private
  package, and follows the rules above (extend a theme file, nothing for a fix to an unreleased
  feature). tsup inlines that source straight into `packages/sdk/dist` (`WORKSPACE_INTERNALS` in
  `packages/sdk/tsup.config.ts`, passed to `noExternal`, and each package's built
  `dist/index.d.ts`, mapped through `dts.compilerOptions.paths`), and the sdk
  build always runs from the current checkout (`.github/workflows/release.yml`: the
  `Version or publish` job runs its own `Build` step rather than transferring an artifact from the
  `Verify build` job), so the change ships inside sdk's published bytes either way. Changesets
  does not chain a version bump from a devDependency to its dependent (`packages/sdk/package.json`
  lists these as `devDependencies`; confirmed with a probe changeset naming only `@verbatra/core`
  and running `pnpm changeset status --verbose`, which bumped `core` and its other dependents but
  never listed `sdk`), so an unaccompanied bundled-source change ships with no version bump and no
  changelog entry. `check:dependency-changeset` (`scripts/check-dependency-changeset.mjs`, run in `ci.yml`)
  does not catch this case either: it only diffs the `dependencies` field of already-published
  manifests, not devDependency source edits, so this rule is the only guard.

## Pull requests

`.github/PULL_REQUEST_TEMPLATE.md` expects three sections: "What changed" (the change and why),
"How it was tested" (commands run, cases covered), and a checklist confirming Conventional Commits,
`pnpm verify` passing locally, and a changeset added or extended if a publishable package changed
in a user-observable way. Fill in the template rather than replacing it with free-form text.
