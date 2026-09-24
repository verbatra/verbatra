# Repository automation

A guide to the `.github/` directory of [verbatra/verbatra](https://github.com/verbatra/verbatra).
Nothing here is shipped to npm; this directory is read by GitHub itself.

This file is deliberately not named `README.md`. GitHub picks a repository's displayed README from
`.github/`, then the root, then `docs/`, in that order, so a `.github/README.md` would replace the
project README on the repository home page.

Note also that this is *not* the organization profile. That lives in the separate
[`verbatra/.github`](https://github.com/verbatra/.github) repository, under `profile/README.md`,
and is what renders on the org page.

## What lives here

| Path | What it is |
| --- | --- |
| `workflows/` | The nine GitHub Actions workflows: CI, Release, Dependency audit, CodeQL, Scorecard, Unused code, Deploy Docs, Docs i18n check, and E2E (live) |
| `actions/` | Three local composite actions the workflows reuse: `setup-workspace`, `ssh-connect`, `ssh-copy` |
| `ISSUE_TEMPLATE/` | Bug report, feature request, and adapter-or-provider request forms, plus `config.yml`, which routes questions to Discussions |
| `PULL_REQUEST_TEMPLATE.md` | The three sections every pull request fills in: what changed, how it was tested, and the checklist |
| `dependabot.yml` | Weekly update schedule for npm (root workspace and `e2e/`), GitHub Actions (workflows and the local composite actions), and the docs Docker image, with a seven-day cooldown and the major-version pins it deliberately holds back |
| `assets/` | `banner.webp` and `verbatra-mark.png`, hotlinked by the root and package READMEs through `raw.githubusercontent.com` |

`CI` is the merge gate and the release gate: `release.yml` publishes only when the CI workflow's
conclusion is success. `E2E (live)` drives a real provider and is advisory, never a gate.

## Workflows

Every workflow sets a top-level `permissions: contents: read`; the column below lists what a job
raises on top of that.

| Workflow | File | Triggers | Elevated job permissions |
| --- | --- | --- | --- |
| CI | `ci.yml` | pull request and push to `main` | `codecov-upload`: `id-token: write` (Codecov OIDC upload) |
| Release | `release.yml` | `workflow_run` of CI on `main`, gated to a successful push from this repository | `publish`: `contents: write`, `pull-requests: write`, `id-token: write` (Version Packages pull request, npm Trusted Publishing with provenance for `@verbatra/sdk`, `@verbatra/cli`, `@verbatra/studio`, `@verbatra/mcp`); `publish-mcp-registry`: `id-token: write`; `dispatch-skills-parity`: `permissions: {}`, uses a GitHub App token scoped to `verbatra/skills` |
| Dependency audit | `audit.yml` | pull request and push to `main`, weekly schedule | none |
| CodeQL | `codeql.yml` | pull request and push to `main`, weekly schedule | `security-events: write`, `actions: read` |
| Scorecard | `scorecard.yml` | push to `main`, weekly schedule | `scorecard`: `actions: read`, `id-token: write`; `upload`: `security-events: write` |
| Unused code | `knip.yml` | pull request and push to `main` | none (report only, never fails) |
| Deploy Docs | `docs-deploy.yml` | push to `main` | `packages: write` (push the docs image to GHCR) |
| Docs i18n check | `docs-i18n-check.yml` | pull request touching `apps/docs` messages, content, config, or lock file | none |
| E2E (live) | `e2e-live.yml` | push to `main`, nightly schedule, manual dispatch | none (runs in the `live-e2e` environment for the provider key) |

## The SHA-pin convention

Every third-party action is pinned to a full-length commit SHA, with the human-readable version as
a trailing comment:

```yaml
uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
```

A tag is mutable and a pinned SHA is not, so this is what keeps a compromised or retagged upstream
action out of a run. Dependabot updates both the SHA and the comment together, in the workflows and
in the local composite actions. The rule applies to third-party actions only: the local composite
actions in `actions/` are referenced by path (`uses: ./.github/actions/setup-workspace`), and
`verbatra/action` is referenced by major tag from consumer workflows outside this repository.

That trailing version comment is one of the functional comments that survive any cleanup pass.
Workflow files take no prose or rationale comments otherwise; reasoning belongs in the commit
message body.

## Related

- [`CONTRIBUTING.md`](../CONTRIBUTING.md) for the development workflow
- [`SECURITY.md`](../SECURITY.md) for reporting a vulnerability
- [`.claude/rules/git-conventions.md`](../.claude/rules/git-conventions.md) for commit, branch, and
  changeset conventions
