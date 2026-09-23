---
"@verbatra/sdk": patch
---

Keep a catalog key named `__proto__` in the `values` that `localeValues` returns.

Previously `values` was a plain object, so a key literally named `__proto__` replaced the
object's prototype instead of becoming an entry, and it was missing from the result (and from
the Studio translations and review views built on it). `values` now has no prototype, so every
key, including `__proto__`, is an own property, and looking up a key absent from the catalog,
such as `constructor`, reads as `undefined` rather than an inherited `Object` member.

Because `values` has no prototype, check for a key with `Object.hasOwn(values, key)` or
`key in values` instead of methods such as `values.hasOwnProperty`.
