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
translation, a cache or duplicate-content reuse, a generated plural form, a pseudolocalized value,
a workbook import row, a Studio edit, and a single-key retranslate). The refusal names the tags
behind it in `details`, each prefixed with `-` for one the source had and the candidate dropped or
`+` for one the candidate invented, so a rejection says which tag rather than only that something
was wrong.

Tags are compared as a multiset of tag names plus attribute names. A dropped, invented, renamed or
mis-nested tag is refused, and so is a tag that comes back nested inside another of the same name
when the source had them as siblings, which is how two links silently become one. A different word
order, a translated attribute value, and either spelling of a void element (`<br>` and `<br/>`) are
all accepted. For a value the format reports as a single plural message, tags are counted by
presence rather than by occurrence, so a language needing four plural arms where English declares
two is not refused for repeating the source's own markup.

The comparison stays out of the way of ordinary prose: an angle-bracket run counts as a tag only
when it parses cleanly as one, and the check stands down entirely unless the source's own markup is
well formed. It also stands down per tag for a tag the format already reports as a placeholder, so
an XLIFF inline element and a next-intl or ARB ICU rich-text tag stay with the placeholder check
and are never reported twice, while any other tag in the same value is still compared.

The gate's reason set is now published as the `INTEGRITY_GATE_REASONS` tuple, with
`IntegrityGateReason` derived from it, so a runtime schema or an exhaustive lookup can be built
from one value instead of a hand-copied list. Studio labels the new reason and shows the tags
behind it, and the MCP server's result schemas derive from the tuple.

This refuses values the gate previously accepted, which is why it is a minor rather than a patch.
No existing default changes: the check has no configuration and adds no option.
