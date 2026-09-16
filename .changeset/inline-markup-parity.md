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

Tags are read the way an HTML parser reads them and compared as a multiset of tag names plus
attribute names. A tag starts at `<` or `</` followed by a letter (or digits, for a numeric
rich-text tag such as `<0>`), its name runs to whitespace, `/` or `>`, and a quoted attribute value
may contain `>`, so `<img title=">" src=x onerror=...>` and `<img/src/onerror=...>` are tags and
`5 < 10` is text. A dropped, invented, renamed or mis-nested tag is refused, and so is a tag that
comes back nested inside another of the same name when the source had them as siblings, which is how
two links silently become one. A different word order, a translated attribute value, and either
spelling of a void element (`<br>` and `<br/>`) are all accepted. Names are compared exactly, so a
case change is a finding, while the HTML void elements are recognised as needing no closing tag in
any case spelling.

An unclosed bracketed word with nothing but its name, made of letters, digits, hyphens and
underscores, such as `<Enter>`, is set aside on both sides before the source is judged, so a source
that carries one is still compared, and once the source carries tags such words are counted like
tags. A source with no tags is protected too. A candidate is refused for any tag pair, void or
self-closing tag it adds, for a closing tag with no opening tag, for an unclosed opening tag that
carries anything beyond its name (`<Enter onfocus=...>`, `<x-key onmouseover=...>`), and for a
bracketed word the source does not carry whose name, in any letter case, is a standard HTML element,
such as `<script>`, `<Del>` or `<Option>`; any other added bracketed word, such as `<Enter>`, is
read as prose. Keeping such a word in the source makes a translation that keeps it acceptable.

Comments, CDATA sections, declarations and processing instructions end where an HTML parser ends
them: `<!-->` and `<!--->` are complete empty comments, a comment ends at the first `-->` or `--!>`
or else runs to the end of the value, and `<![CDATA[`, `<!...`, `<?...` and a `</` not followed by a
letter or digit end at the first `>`. Each is compared as a multiset of its text with whitespace
runs collapsed, so a construct the candidate adds, drops or rewrites is refused, including a comment
or CDATA section whose text was translated, and tags after a construct's end are compared as usual.

The comparison stays out of the way of ordinary prose: the tag comparison stands down for a value
whose source tags are malformed once placeholder tags and bracketed words are set aside, while its
constructs are still compared, and the whole check stands down when the source carries more than 256
tags and constructs. A candidate that alone carries more than that is refused, with the detail
`+more than 256 inline tags`. The check also stands down per tag, not per value: a tag the format
already reports as a placeholder is left to the placeholder check together with as many closing tags
as it has openings, so an XLIFF inline element and a next-intl or ARB ICU rich-text tag are never
reported twice, while one the candidate leaves unclosed is refused with its missing closing tag
(`-</g>`), and every other tag in the same value is still compared, including a surplus closing tag
and a second spelling of the same name. The scan is a single linear pass, so a long adversarial
value cannot stall it.

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
