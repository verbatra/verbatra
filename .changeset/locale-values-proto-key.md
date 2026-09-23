---
"@verbatra/sdk": patch
---

Keep a catalog key named `__proto__` in the `values` that `localeValues` returns.

Previously `values` was a plain object, so a key literally named `__proto__` replaced the
object's prototype instead of becoming an entry, and it was missing from the result (and from
the Studio translations and review views built on it). `values` now has no prototype: every key,
including `__proto__`, `constructor` and `prototype`, is an own property, and looking up a key
absent from the catalog reads as `undefined` rather than an inherited `Object` member.
