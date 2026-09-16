---
"@verbatra/sdk": minor
"@verbatra/studio": patch
"@verbatra/mcp": patch
---

Refuse a translation whose inline markup does not match its source

Rich text reaches a translatable string as inline HTML or XML: a `<b>` inside an i18next `Trans`
block, an escaped `&lt;b&gt;` in an Android `<string>`, an `<a href>` in a gettext catalog. None of
that is a placeholder in those formats, so nothing compared it, and a model that dropped, renamed or
unbalanced a tag produced a string that rendered wrong with no signal at all.

The integrity gate now compares inline markup as well, under a new `markup` reason. A refused
candidate behaves exactly like a refused placeholder: it is never written, never lock-recorded, and
its key is reported as an integrity mismatch, on every path that reaches the gate (a provider
translation, a cache or duplicate-content reuse, a generated plural form, a pseudolocalized value, a
workbook import row, a Studio edit, and a single-key retranslate). The refusal names the tags behind
it in `details`, each prefixed with `-` for one the source had and the candidate dropped or `+` for
one the candidate invented, so a rejection says which tag rather than only that something was wrong.

Tags are compared as a multiset of tag names plus attribute names. A dropped, invented, renamed or
mis-nested tag is refused, and so is a tag that comes back nested inside another of the same name
when the source had them as siblings, which is how two links silently become one. A different word
order, a translated attribute value, and either spelling of a void element (`<br>` and `<br/>`) are
all accepted. Names are compared exactly, so a case change is a finding, while the HTML void
elements are recognised as needing no closing tag in any case spelling.

A source with no markup is protected too. A candidate is refused for any tag pair, void or
self-closing tag it adds, for a closing tag with no opening tag, and for an unclosed opening tag
whose name is a standard HTML element, such as `<script>`; an unclosed bracketed word that is not an
HTML element name, such as `<Enter>`, is still read as prose. An unterminated `<!--`, which hides
the rest of the rendered value, is refused, and `<?...?>` and `<!...>` constructs are compared as a
multiset, so one the candidate invents or drops is refused. A complete comment and a CDATA section
stay translatable text.

The comparison stays out of the way of ordinary prose: an angle-bracket run counts as a tag only
when it parses cleanly as one, and the tag comparison stands down for a value whose source tags are
malformed, or whose source carries more than 256 tags. A candidate that alone carries more than 256
tags is refused, with the detail `+more than 256 inline tags`. The check also stands down per tag,
not per value: a tag the format already reports as a placeholder is left to the placeholder check
together with as many closing tags as it has openings, so an XLIFF inline element and a next-intl or
ARB ICU rich-text tag are never reported twice, while every other tag in the same value is still
compared, including a surplus closing tag and a second spelling of the same name.

The read-only side reports it too. `keyIntegrity`, and through it the MCP server's `key.integrity`
tool and Studio's per-key indicator, now carry `markupMatches` and `markupDetails` beside the
placeholder and ICU verdicts, which is what makes drift that predates the gate visible at all: a
translation written before the check existed, edited outside verbatra, or produced by a path that
never crossed the gate is judged by the same rule. `verbatra check` does not report markup.

The gate's reason set is now published as the `INTEGRITY_GATE_REASONS` tuple, with
`IntegrityGateReason` derived from it, so a runtime schema or an exhaustive lookup can be built from
one value instead of a hand-copied list. Studio labels the new reason and shows the tags behind it,
and the MCP server's result schemas derive from the tuple.

This refuses values the gate previously accepted, which is why it is a minor rather than a patch. No
existing default changes: the check has no configuration and adds no option.
