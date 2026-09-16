---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Report source-catalog keys that nothing in your application source references any more:
`verbatra diff --unused`, backed by `diff({ config, unused: true })`, scans the source roots named
by the `extract` block and adds an `unused` report to the diff summary.

The report is a separate axis from each locale's `orphaned` list: a key is orphaned when a target
locale still carries it after it left the source catalog, and unused when the source catalog still
carries it after the code stopped naming it. The two lists are never merged, and an unused key
never flips `hasPendingChanges`.

It is read-only like the rest of `diff`: it never removes, rewrites, or reorders a catalog, it
constructs no provider, and it reads no API key environment variable.

It never quietly calls a key unused that the code can still reach:

- A plural or context variant of a referenced key (`items_one`, `place_ordinal_one`,
  `friend_male`) counts as referenced, matching how `translate` already keeps generated plural
  forms off the orphan list, and so does every key under a referenced parent key.
- A scan that met a dynamic key (including a namespace-qualified one), a `keyPrefix` option, a
  `Trans` component, an `i18nKey` attribute, or a file it could not read to its end is reported as
  `unreliable`, with every reason and location, rather than as `complete`.
- A run with nothing to scan (no `extract` block, a `deps.fs` without `readDirectory`, or no source
  file under the roots) is reported as `not-run` with a reason code and carries no key list at all.

A new optional `extract.ignoreUnused` list excludes keys referenced only from outside the scanned
source, such as a server template, a CMS, or a test fixture. Each entry is an exact key or a
pattern in which `*` matches any run of characters. An excluded key is listed under `ignored`,
never dropped silently. The field is part of the shipped config JSON Schema.

The i18next extractor now also reports `keyPrefix`, `Trans`, and `i18nKey` as indirect key sites
in its scan result; `extract` itself is unchanged.

`diff --unused` exits `1` when anything is pending or a `complete` scan finds at least one unused
key. An `unreliable` or `not-run` report, and ignored keys, never produce exit `1` on their own, so
a CI gate cannot fail on a guess. `--json` carries the report inside the usual `diff` envelope.
Without `--unused`, `diff` scans nothing and behaves exactly as before.
