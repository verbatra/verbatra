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
and `AdapterErrorCode`, the `FormatAdapter` and `ReadResult` contract, the `FormatId`,
`CustomFormatId` and `isCustomFormatId` identity helpers, and the callback and tree types the two
options interfaces are written in terms of, so an adapter's own signatures can be given type
annotations without redeclaring them. A consumer that depends only on the
published package can compile and register an adapter for a format verbatra does not ship, and hand
it to any flow through the `adapterRegistry` dependency those flows already accept.

Registry behaviour changed in three ways. Registering a second adapter for a format the registry
already holds now raises `DUPLICATE_FORMAT` instead of being accepted and shadowed by whichever
adapter registered first. An adapter whose `custom:` identifier is malformed is refused with
`INVALID_FORMAT_ID` rather than registered without the containment wrapper. And an adapter with a
well-formed `custom:` identifier is wrapped so an unexpected throw from any of its contract methods
surfaces as `ADAPTER_FAILED` naming the format, rather than as an unattributed stack trace; an
`AdapterError` the adapter raised itself and an error carrying an errno code still travel unchanged.

The flat-file factory gained the two things the tree factory already had, so an adapter built on it
is no longer second-class: an optional `comparePlaceholders`, and the ability to report skipped
content by returning `{ entries, excludedLeafPaths }` from `parseEntries` instead of a bare map.
Both are additive and every existing implementation keeps compiling. The Android adapter now uses
the second one, so a `translatable="false"` resource is reported as excluded rather than dropped
silently.

A plugin is fully trusted code, at the trust level of any other dependency the project installs.
verbatra does not sandbox it, and because the adapter decides what counts as a placeholder, a buggy
or hostile one can make the placeholder-integrity check pass vacuously for its format. Loading is
never implicit: verbatra discovers nothing on its own, and a plugin is reached only by the
project's own code importing it and supplying the registry.
