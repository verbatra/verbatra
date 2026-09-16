---
"@verbatra/sdk": patch
"@verbatra/cli": patch
---

Read a regular expression inside a template literal substitution correctly in the source scan.

The scan looked for the `}` closing a `${...}` substitution with a separate character skipper that
did not know regular expressions, so a quote, a backtick, `//`, `/*`, or a brace inside a regular
expression there (as in `` `"${v.replace(/"/g, '""')}"` ``) was read as the start of a string,
template, comment, or block. A second identical construct later in the file balanced the quotes
again, so everything in between was dropped without the file being reported as incomplete.
`verbatra extract` could miss a call site, `verbatra diff --unused` could report a referenced key as
unused on a `complete` report, and `verbatra doctor --literals` could miss a literal. In `.tsx`,
`.jsx`, and `.js` files the same construct instead marked a valid file as unparseable.

A substitution is now read by the same token scanner as the rest of the file, so a regular
expression inside it is recognised by the same rule, including its character classes, escapes, and
flags. Templates nested inside substitutions are read without recursion, so deeply nested templates
no longer exhaust the stack, and reading them no longer costs time proportional to the square of
the nesting depth.
