---
"@verbatra/sdk": patch
"@verbatra/cli": patch
---

Write imported keys in source order.

Previously `import` added new keys to a locale file in the order of the handoff's rows, which are
sorted alphabetically, so `nested.link` could land before `nested.title`. New keys from a handoff
are now written in the order the source locale lists them, the same way `translate` writes them.
