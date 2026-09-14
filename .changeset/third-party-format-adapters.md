---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Let a format adapter ship outside verbatra.

A format is now named either by one of the built-in names or by a `custom:` identifier: a reserved
prefix followed by a lowercase, hyphen-separated name, such as `custom:toml`. The built-in set is
unchanged and still closed, and no built-in name contains a colon, so a third-party identifier can
never shadow one. A config naming a `custom:` format loads; a config naming an unknown bare name is
still rejected, and the shape reaches the shipped JSON Schema document as a pattern, so an editor
validates it too.

Everything needed to build an adapter is now reachable from `@verbatra/sdk` itself:
`createFlatFileAdapter` and `createTreeFileAdapter` with their option types, the `AdapterFs`
file-system port and `nodeAdapterFs`, `createDefaultRegistry` and `AdapterRegistry`, `AdapterError`
and `AdapterErrorCode`, the `FormatAdapter` and `ReadResult` contract, and the `FormatId`,
`CustomFormatId` and `isCustomFormatId` identity helpers. A consumer that depends only on the
published package can compile and register an adapter for a format verbatra does not ship, and hand
it to any flow through the `adapterRegistry` dependency those flows already accept.

Two registry behaviours changed. Registering a second adapter for a format the registry already
holds now raises `DUPLICATE_FORMAT` instead of being accepted and shadowed by whichever adapter
registered first. An adapter with a `custom:` identifier is wrapped so an unexpected throw from any
of its contract methods surfaces as `ADAPTER_FAILED` naming the format, rather than as an
unattributed stack trace; an `AdapterError` and a filesystem error still travel unchanged.

A plugin is fully trusted code, at the trust level of any other dependency the project installs.
verbatra does not sandbox it, and because the adapter decides what counts as a placeholder, a buggy
or hostile one can make the placeholder-integrity check pass vacuously for its format. Loading is
never implicit: verbatra discovers nothing on its own, and a plugin is reached only by the
project's own code importing it and supplying the registry.
