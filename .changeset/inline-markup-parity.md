---
"@verbatra/sdk": minor
"@verbatra/studio": patch
"@verbatra/mcp": patch
---

Refuse a translation whose inline markup does not match its source

Rich text reaches a translatable string as inline HTML or XML: a `<b>` inside an i18next `Trans`
block, an escaped `&lt;b&gt;` in an Android `<string>`, an `<a href>` in a gettext catalog. None of
that is a placeholder in those formats, so nothing compared it, and a model that dropped, renamed
or unbalanced a tag produced a string that rendered wrong with no signal at all.

The integrity gate now compares inline markup as well, under a new `markup` reason. A refused
candidate behaves exactly like a refused placeholder: it is never written, never lock-recorded, and
its key is reported as an integrity mismatch, on every path that reaches the gate (a provider
translation, a cache or duplicate-content reuse, a workbook import row, a Studio edit, and a
single-key retranslate).

Tags are compared as a multiset of tag names plus attribute names, so a different word order and a
translated attribute value are both accepted while a dropped, invented, renamed or mis-nested tag
is refused. The comparison stays out of the way of ordinary prose: an angle-bracket run counts as a
tag only when it parses cleanly as one, and the check stands down entirely unless the source's own
markup is well formed. It also stands down for a value whose own adapter already reports its markup
as placeholders, so an XLIFF inline element and a next-intl or ARB rich-text tag stay with the
placeholder check and are never reported twice.

The gate's reason set is now published as the `INTEGRITY_GATE_REASONS` tuple, with
`IntegrityGateReason` derived from it, so a runtime schema or an exhaustive lookup can be built
from one value instead of a hand-copied list. Studio labels the new reason, and the MCP server's
result schemas derive from the tuple.

This refuses values the gate previously accepted, which is why it is a minor rather than a patch.
No existing default changes: the check has no configuration and adds no option.
