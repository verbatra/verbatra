# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities through GitHub's private vulnerability
reporting: open the repository's Security tab and choose "Report a vulnerability"
(https://github.com/verbatra/verbatra/security/advisories/new). This keeps the
report private until a fix is available.

Do not open a public issue or pull request for a security vulnerability.

We aim to acknowledge a report within five business days, and we will keep you
informed as we investigate and work on a fix.

## Supported versions

verbatra is published to npm. Security fixes target the latest released minor;
upgrade to the latest release to receive them.

| Version               | Supported |
| --------------------- | --------- |
| Latest released minor | yes       |
| Anything older        | no        |

This is stated without version numbers on purpose. A numbered table goes stale
the moment a release ships, and a security policy that names an outdated line is
worse than one that names none: it tells you a supported version is unsupported.
`@verbatra/sdk` and `@verbatra/cli` are released together and share a version;
`@verbatra/studio` and `@verbatra/mcp` are each versioned independently. For the current numbers, see the
packages on npm or the repository's releases.

## Supply-chain controls

The published packages are protected by the controls below. Most are enforced by
CI or by GitHub rather than by convention, so a regression shows up as a failure;
where that is not the case it is said so explicitly.

- **Publishing uses npm Trusted Publishing over OIDC.** There is no long-lived
  npm token in the repository or in CI to steal or leak.
- **Releases carry build provenance**, so a consumer can verify that a published
  tarball was built by this repository's release workflow.
- **Every GitHub Action is pinned to a full commit SHA**, and the repository
  requires it: pinning is enforced by GitHub, not only by code review, so a
  workflow that reintroduces a mutable tag fails. One limit is worth stating
  plainly: this pins the action reference, not a Docker-based action's own
  runtime image, which its author controls.
- **The lockfile is committed and CI installs are frozen**, so a build resolves
  the exact dependency tree that was reviewed.
- **Workflows default to a read-only token.** Every workflow declares
  `contents: read` at the top, and an OIDC token is granted only to the job that
  needs it: the release job that publishes to npm, the job that publishes
  `@verbatra/mcp` to the MCP Registry, the CI job that uploads coverage, and the
  Scorecard job that publishes its results.
- **Dependencies are audited weekly** and the code is scanned weekly with CodeQL,
  so a newly disclosed advisory surfaces without waiting for a code change.
- **A change to what a published package makes consumers install must ship with a
  changelog entry.** CI fails a pull request that moves one of those versions
  without one, including a pull request opened by a bot, which is the case it was
  built for. It is a presence check: it requires an entry to accompany the change
  and does not judge what that entry says.

## Handling of API keys

verbatra calls third-party translation providers, so the handling of provider
API keys is part of its security posture. Keys are read only from environment
variables: never from config files, never from command-line arguments, never
written to disk, and never logged. Errors are structured so that a key cannot be
embedded in an error message. This secret-free-by-construction design keeps a
provider key in the environment and prevents it from leaking through verbatra's
output.
