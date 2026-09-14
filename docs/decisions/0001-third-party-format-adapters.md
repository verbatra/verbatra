# 1. Third-party format adapters

- Status: accepted
- Date: 2026-09-14

This is the first decision record in this repository. Records live in `docs/decisions/`,
numbered and kebab-cased, and are append-only: a record that stops being true is superseded
by a later record rather than rewritten.

## Context

verbatra reads and writes fourteen locale formats. Every one of them costs a maintainer
review cycle, which makes format coverage the project's most visible scaling limit. The
internals are already shaped for outside contribution: two adapter factories
(`createTreeFileAdapter`, `createFlatFileAdapter`), a neutral intermediate representation in
`@verbatra/core`, an injectable file-system port (`packages/format-adapters/src/fs-port.ts`),
and a registry whose resolution result is structured data rather than an exception
(`packages/format-adapters/src/registry.ts`).

What actually stops a package outside this repository from shipping an adapter, verified
against the current tree:

1. **Format identity is a closed set.** `SUPPORTED_FORMATS` is an `as const` tuple of
   fourteen members (`packages/core/src/model/supported-format.ts`).
   `FormatAdapter.format` is typed by it, `AdapterRegistry` matches on it, the config schema
   binds it (`packages/sdk/src/config/schema.ts`), and `apps/docs/lib/structured-data.ts`
   holds a total `Record<SupportedFormat, string>` of display labels. An outside adapter
   cannot name itself without a core release, and adding a member breaks the documentation
   site's typecheck until a label is added alongside it.
2. **The adapter error code union is closed.** `AdapterErrorCode`
   (`packages/format-adapters/src/errors.ts`) has seven members, so an outside adapter has no
   code to raise for a failure its own format defines.
3. **One built-in claims a generic extension with no content check.** The Android adapter
   claims `.xml` and passes no `sniff`
   (`packages/format-adapters/src/android-xml/android-xml-adapter.ts`), so any outside format
   that also claims `.xml` makes detection ambiguous by construction rather than by accident.
4. **The flat-file factory reports less than the tree factory.** `FlatFileAdapterOptions`
   has no `comparePlaceholders` hook, and `read` returns a hardcoded empty
   `excludedLeafPaths`, so an adapter built on it cannot report skipped content as data.
5. **The construction surface is unreachable from a published artifact.**
   `@verbatra/format-adapters` is `private: true` and never published. Part of the contract
   already leaks into `packages/sdk/dist/index.d.ts` because `TranslateDeps.adapterRegistry`
   and its siblings are typed `AdapterRegistry`, which by this repository's own test makes
   `FormatAdapter`, `ReadResult`, `AdapterRegistry`, `AdapterResolution` and `ResolveOptions`
   published API already. The factories, the `AdapterFs` port and `nodeAdapterFs` are absent
   from that output entirely. The gap is the ability to *construct and register*, not the
   ability to see the contract.

Two questions have to be answered before any of this is exposed, because both are permanent
once a version ships.

## Decision 1: format identity

A third-party format names itself with a reserved-prefix identifier: `custom:` followed by a
lowercase kebab-case segment, for example `custom:my-format`. Core gains

```
type CustomFormatId = `custom:${string}`
type FormatId = SupportedFormat | CustomFormatId
```

with `customFormatIdSchema` validating the segment shape and `formatIdSchema` accepting either
kind. `FormatAdapter.format`, `LocaleResource.format`, the registry's resolution types and the
config schema's `format` field all widen from `SupportedFormat` to `FormatId`.

`SupportedFormat` itself does not change. It keeps its fourteen members, its `z.enum`, and its
exhaustiveness.

Rejected alternatives:

- **Open `SupportedFormat` to `string`.** This is what destroys the guarantee outright: a
  config naming a format with no adapter would stop being a compile error everywhere,
  including for the built-ins, and every exhaustive switch and every
  `Record<SupportedFormat, ...>` in the repository and on the documentation site would become
  a partial record overnight.
- **Add a member per third-party format.** That is the release cycle this decision exists to
  remove.
- **An opaque brand with a registration call.** A branded string cannot be written in a config
  file, which is where a format is named.

### What this buys

- Collision with a built-in is impossible rather than policed: no built-in identifier contains
  a colon, so no third-party identifier can shadow one.
- `SupportedFormat` stays closed, so the exhaustive records keep compiling, the documentation
  site's label table is untouched, and adding a built-in format still fails the build until a
  label exists.
- A config file can name the format in plain text, so the identifier survives the round trip
  through JSON, YAML and the lock file without special handling.

### What is lost

The compile-time guarantee that a format named in a config has an adapter behind it now covers
built-in formats only. For a `custom:` identifier that guarantee moves to run time: the config
loads, and `selectAdapter` raises a structured `UNKNOWN_FORMAT` when no registry supplies an
adapter for it. That is a real reduction in safety and it is the price of the decision. It is
bounded: a typo in a built-in format name is still a compile error and still a config
validation error, and a typo in a `custom:` identifier fails on the first run with a named
error rather than silently doing nothing.

Registry-level duplicates become possible in a way they were not before, since two independent
plugins can pick the same identifier. `AdapterRegistry.register` therefore rejects a second
adapter for an identifier it already holds, instead of accepting it and letting an
explicit-format lookup silently take whichever registered first.

## Decision 2: the trust boundary

**A third-party adapter is fully trusted code, at exactly the trust level of any other npm
dependency the user has already installed. verbatra does not sandbox it and does not attempt
to.** This is stated here in plain words so a user can decide knowingly, and it is repeated on
the user-facing documentation page rather than being left in this file.

Concretely, a plugin a user installs and registers can do everything any dependency can do:

- Read `process.env`, which is where every provider API key lives; verbatra reads keys from
  the environment and nowhere else, so the environment of a verbatra run holds them.
- Read and write any file the process can, at any path, not only the paths the config points
  at. The `AdapterFs` port is the supported path and the one verbatra passes in, and this
  repository's own sources are held to it by a test that scans them
  (`fs-port.no-direct-node-fs.test.ts`). That test cannot reach code in another package.
  Nothing prevents a third-party adapter from importing `node:fs` directly.
- Open a network connection.
- **Defeat placeholder integrity.** This one is specific to adapters and deserves naming on
  its own. The adapter is what decides what counts as a placeholder, through
  `extractPlaceholders` and the optional `comparePlaceholders`. An adapter that reports no
  placeholders makes the post-translation integrity check pass vacuously for its format, so a
  translation that dropped or mangled an interpolation ships silently. A buggy adapter does
  this as readily as a malicious one.

There is no honest mitigation available in this architecture. A `node:vm` context does not
contain file-system or network access once the adapter holds the `AdapterFs` port, and
withholding the port breaks the contract the adapter exists to satisfy. Claiming a boundary
that is not enforced would be worse than having none, because a user would rely on it.

What the user is trusting when they install a plugin: the plugin's author, and the plugin's
supply chain, with their locale files, their provider API keys, and the correctness of the
placeholder guarantee for that format. That is the whole of it.

What verbatra does provide, and what it does not:

- **Opt-in is explicit and never inferred.** Nothing in this feature makes verbatra discover,
  download, or load code on its own. There is no plugin directory scan, no naming convention,
  no auto-installation. In this increment a plugin is reached only by the user's own code
  importing it and handing verbatra a registry, through the `adapterRegistry` dependency the
  SDK flows already accept.
- **Failures are contained and attributed.** An adapter with a `custom:` identifier is wrapped
  so that a throw from `read`, `write`, `extractPlaceholders`, `validateMessage`, `canHandle` or
  `comparePlaceholders` surfaces as a structured `AdapterError` naming the offending format, not as
  an unhandled rejection and not as a raw stack trace that reads as a verbatra defect. Only two
  kinds of throw travel unchanged, because they already carry a precise meaning: an `AdapterError`
  the adapter raised itself, and an error carrying an errno code. A Node misuse error
  (`ERR_INVALID_ARG_TYPE` and its siblings) is attributed like any other defect, since it is the
  most likely thing a buggy adapter throws and it must not be mistaken for a filesystem failure. This is
  attribution, not containment of capability: it tells the user which plugin failed. It does
  not stop a plugin from doing anything.
- **Verbatra does not gain a new trust class from this.** `verbatra.config.ts` is already
  executed user code, loaded through `cosmiconfig-typescript-loader`. A project that runs
  verbatra already runs whatever its own config file imports. A plugin widens an existing
  trust surface; it does not open a new one.

Rejected alternatives:

- **A sandbox.** Not real here, per the paragraph above. If a future architecture makes one
  real, that is its own decision record.
- **A config allowlist of permitted plugin identifiers.** This buys nothing while loading is
  programmatic: the user's code already had to import the plugin to register it, which is a
  stronger and more visible act than naming it in a config file. An allowlist becomes worth
  revisiting the day the CLI loads plugins by name, which this increment deliberately does not
  do.

## Decision 3: distribution route

The construction surface is re-exported from `@verbatra/sdk`'s existing entry point rather
than by publishing `@verbatra/format-adapters` as a second public package.

Publishing the adapter package would create a second public release cadence, a second version
line to choose a first number for, and a cross-package version-compatibility question between
an adapter built against one version and an SDK at another. The SDK already bundles the
adapter package into its published bytes and already inlines part of its contract into
`packages/sdk/dist/index.d.ts`, so re-export costs no new build surface and keeps one entry
point and one version to reason about. A consumer depends on `@verbatra/sdk` alone, with no
`@verbatra/*` private-package dependency and no relative path into `node_modules`.

A subpath export (`@verbatra/sdk/adapters`) was considered and rejected for this increment: it
needs a second tsup entry and a second declaration file for no benefit a consumer can observe,
since the main entry is already what they import.

## Decision 4: scope, and what is deliberately deferred

The full surface described by this problem is larger than one increment, and the expensive part
is not lines of code but irreversibility: every type promised here is frozen under semver from
the version that ships it. This increment therefore promises the smallest surface that lets an
outside package build a working adapter and have verbatra use it, and defers the rest.

Promised now, and semver-stable from the version that ships it:

- `FormatId`, `CustomFormatId`, `isCustomFormatId`
- `LocaleResource`, `TranslationEntry`, `PlaceholderIntegrityResult`, core's neutral
  representation, which an adapter's own signatures are written against. These were already
  structurally reachable through the published declarations; they are now name-importable, which is
  a promise the structural reachability was not.
- `FormatAdapter`, `ReadResult` (already published API through `TranslateDeps`)
- `AdapterRegistry`, `AdapterResolution`, `ResolveOptions` (already published API, likewise)
- `AdapterError`, `AdapterErrorCode`
- `createTreeFileAdapter`, `TreeFileAdapterOptions`
- `createFlatFileAdapter`, `FlatFileAdapterOptions`
- `createDefaultRegistry`
- `AdapterFs`, `BoundedReadOutcome`, `nodeAdapterFs`

Deferred, with the reason:

- **A CLI story for loading plugins by name.** It would mean the CLI resolving and importing
  user-named code, which is a different trust conversation from the one decided above and
  wants the allowlist question reopened. Programmatic registration through the SDK covers the
  capability today.
- **`comparePlaceholders` and reportable exclusions on the flat-file factory.** A real gap
  against the tree factory, but it changes the shape of a promised options type, which is
  cheaper to do before that type is frozen than after. It is a minor addition either way and
  is not needed to build a working adapter.
- **A content check on the Android adapter's `.xml` claim.** Cheap, but it changes detection
  behavior for a built-in format, and detection is not on the path a registered third-party
  adapter takes: the SDK resolves by explicit format from the config. It belongs with work
  that makes detection reachable for third-party formats.
- **Exporting the internal XML document helpers and the gettext key-encoding helpers.** These
  are implementation details of specific built-in formats, not part of the adapter contract.
  Promising them would freeze internals that currently change freely.
- **Opening `AdapterErrorCode` to third-party codes.** One code, `ADAPTER_FAILED`, is added for
  failure attribution. Letting a plugin mint arbitrary codes would turn every exhaustive
  handler of that union into a partial one, which is the same mistake as opening
  `SupportedFormat`. If it is needed, it wants the same reserved-prefix treatment and its own
  decision.
