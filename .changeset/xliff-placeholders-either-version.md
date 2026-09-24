---
"@verbatra/sdk": patch
---

Report a dropped XLIFF inline element once, whatever the document's version.

Previously a read XLIFF entry listed only the inline elements its own version defines while the
placeholder comparison used both versions, so an XLIFF 2.0 value that dropped a 1.2-only `<x/>`
was reported both as a placeholder and as markup.

Now a read entry lists the inline elements of either version, matching the comparison, so such an
element is guarded by the placeholder check alone.
