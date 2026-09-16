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
`5 < 10` is text. The content of a raw text element is text too: after an opening `script`, `style`,
`title`, `textarea`, `xmp`, `iframe`, `noscript`, `noembed` or `noframes` tag everything up to its
closing tag, in any case and followed by whitespace, `/` or `>`, is text, and everything after
`<plaintext>` is text to the end of the value, so a quoted attribute value cannot reach across
`</script>` to hide an `<img onerror>` after it. A dropped, invented, renamed or mis-nested tag is
refused, and so is a tag that comes back nested inside another of the same name when the source had
them as siblings, which is how two links silently become one. A different word order, a translated
attribute value and either spelling of a void element (`<br>` and `<br/>`) are all accepted. Names
are compared exactly, so a case change is a finding, while the HTML void elements are recognised as
needing no closing tag in any case spelling.

An unclosed bracketed word with nothing but its name, made of letters, digits, hyphens and
underscores, such as `<Enter>`, is set aside on both sides before the source is judged, so a source
that carries one is still compared, and once the source carries tags such words are counted like
tags. A source with no tags is protected too. A candidate is refused for any tag pair, void or
self-closing tag it adds, for a closing tag with no opening tag, for an unclosed opening tag that
carries anything beyond its name (`<Enter onfocus=...>`, `<x-key onmouseover=...>`), and for a
bracketed word the source does not carry whose name, in any letter case, is a standard HTML element,
such as `<script>`, `<Del>` or `<Option>`, is `image`, which a parser turns into an img element, or
contains a hyphen, which makes it a custom element; any other added bracketed word, such as
`<Enter>`, is read as prose. Keeping such a word in the source makes a translation that keeps it
acceptable.

Comments, CDATA sections, declarations and processing instructions end where an HTML parser ends
them: `<!-->` and `<!--->` are complete empty comments, a comment ends at the first `-->` or `--!>`
or else runs to the end of the value, and `<![CDATA[`, `<!...`, `<?...` and a `</` followed by
anything but a letter, such as `</1 x>`, end at the first `>`, while an empty `</>` is dropped as a
parser drops it and a numeric closing tag such as `</0>` is compared as a tag. Each construct is
compared as a multiset of its text with whitespace runs collapsed, so a construct the candidate
adds, drops or rewrites is refused, including a comment or CDATA section whose text was translated,
and tags after a construct's end are compared as usual.

Attribute values are free with exceptions, because a translated value ends up in a page. A
`javascript:`, `vbscript:` or `data:` scheme in the value of a URL attribute (`href`, `src`,
`action`, `formaction`, `xlink:href`, `poster`, `data`, `background`, `ping`, `cite`, `longdesc`,
`srcset`, `manifest`, `codebase`, `archive`, and the SVG animation attributes `to`, `from`, `values`
and `by`), read after decoding numeric character references and `&colon;`, `&Tab;`, `&NewLine;`,
`&sol;` and `&bsol;` and ignoring tabs, line breaks and surrounding control characters, is refused
unless the source carries that exact value on the same tag and attribute, with a detail such as
`+<a href="javascript:...">`. Every URL in such a value, including each URL of a `srcset`, `ping`,
`archive` or `values` list, must also keep a scheme and authority (host and port, or the host of a
scheme-relative `//host` URL) that a source value of the same tag and attribute has, and a relative
URL must stay relative: `/docs` may become `/de/docs` and `https://verbatra.dev/en` may become
`https://verbatra.dev/de`, but a link, base, script or stylesheet URL may not move to another host,
so a localized absolute link has to keep the same host. The detail names the new origin, such as
`+<a href="https://evil.example...">`.

The value of `meta` `http-equiv` and `content`; `script` `type`, `nomodule`, `integrity` and
`crossorigin`; `link` `rel`, `as`, `integrity`, `crossorigin` and `type`; `base` `target`;
`attributeName` and `attributeType` on `set`, `animate`, `animateTransform` and `animateMotion`;
`iframe` `sandbox`, `allow` and `allowfullscreen`; `form` `method`, `enctype` and `target`; and any
`style`, `srcdoc` or event handler such as `onclick` must equal, after decoding character
references, a value the source carries on the same tag and attribute, with a detail such as
`+<meta content="...">`.

The content of a `script`, `style`, `iframe`, `noembed`, `noframes`, `noscript`, `xmp` or
`plaintext` element runs or styles the page rather than being shown, so each such element in the
candidate must carry exactly the content of the element in the same position among those of its name
in the source, or the candidate is refused with a detail such as `+<script> content`; `title` and
`textarea` content may be translated. Prose that literally contains one of those tags, such as
`Add a <script> tag`, therefore cannot be translated; escape the tag in the source as
`&lt;script&gt;` instead.

Wherever the markup could be read two ways, the candidate is refused unless it is the source
unchanged: a `script` whose content opens `<!--`, a `noscript` whose content holds a `<` (the
scripting flag decides how it is read), a raw text element whose content holds a `<` after an `svg`,
`math` or `select` tag, and a CDATA section or `image` tag in a value where the source or the
candidate opens `svg`, `math` or `select`. A tag the candidate never finishes, which renders nothing
and swallows the rest of the value, is refused when the source finishes all of its own tags.

The comparison never stands down for a source. A source whose own tags are malformed, including
prose such as `a<b and c>d` that a parser reads as an unclosed tag with attributes, is compared as a
multiset with only the nesting check skipped, so a tag invented beside it is refused. A source of
any size is compared, and a candidate is refused only once it carries more than twice its source's
tags and constructs, or more than 256 for a smaller source, with the detail
`+more than N inline tags` naming that limit. The check stands down per tag, not per value: a tag
the format already reports as a placeholder is left to the placeholder check together with as many
closing tags as it has openings, so an XLIFF inline element and a next-intl or ARB ICU rich-text tag
are never reported twice, while one the candidate leaves unclosed is refused with its missing
closing tag (`-</g>`), one whose nesting with the other tags no longer matches the source is
refused, and one the source carries only as text, inside a comment or a raw text element, is refused
rather than allowed to surface as an element. Every other tag in the same value is still compared,
including a surplus closing tag and a second spelling of the same name. The scan and the comparison
do work in proportion to the value's length, so a long adversarial value cannot stall them.

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
