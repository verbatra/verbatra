---
"@verbatra/sdk": patch
"@verbatra/cli": patch
---

Recognise `t` destructured from an i18next instance as a translate source in the source scan.

A local, non-exported `const { t } = i18next` or `const { t: tr } = i18n` now binds a translate
function the same way `const tr = i18n.t` already did, so its calls are followed as key references.
Until now the destructuring made `verbatra diff --unused` report `unreliable` with
`unrecognised-translate-source`. Destructuring `t` from anything else, from a member of the
instance, with a default value, or in an exported declaration is still reported as before.
