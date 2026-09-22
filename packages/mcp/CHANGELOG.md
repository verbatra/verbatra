# @verbatra/mcp

## 0.2.1

### Patch Changes

- [#221](https://github.com/verbatra/verbatra/pull/221) [`2f496aa`](https://github.com/verbatra/verbatra/commit/2f496aa8b4eda81a01482b75f26bb645448da82f) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Refuse a translation whose inline markup does not match its source
  
  Rich text reaches a translatable string as inline HTML or XML: a `<b>` inside an i18next `Trans`
  block, an escaped `&lt;b&gt;` in an Android `<string>`, an `<a href>` in a gettext catalog. None of
  that is a placeholder in those formats, so nothing compared it, and a model that dropped, renamed or
  unbalanced a tag produced a string that rendered wrong with no signal at all.
  
  The integrity gate now compares inline markup as well, under a new `markup` reason. A refused
  candidate behaves exactly like a refused placeholder: it is never written, never lock-recorded, and
  its key is reported as an integrity mismatch, on every path that reaches the gate (a provider
  translation, a cache or duplicate-content reuse, a generated plural form, a pseudolocalized value, a
  workbook import row, a TMX import unit, a Studio edit, and a single-key retranslate). The refusal
  names the tags behind it in `details`, each prefixed with `-` for one the source had and the
  candidate dropped or `+` for one the candidate invented, so a rejection says which tag rather than
  only that something was wrong.
  
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
  `+<a href="https://evil.example...">`. A changed URL without an explicit `http`, `https`, `ws`,
  `wss`, `ftp` or `file` scheme is also refused when a backslash (`\` or `%5C`) sits in its leading
  slashes or its host, because a page on another scheme reads `//verbatra.dev\@evil.example/` as a
  link to evil.example.
  
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

- [#221](https://github.com/verbatra/verbatra/pull/221) [`f491ca2`](https://github.com/verbatra/verbatra/commit/f491ca2f121a2c0521bc19c037fd8df41a6ec533) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Turn `budgetBehavior: "stop"` into an enforceable ceiling, and stop the budget being inert for
  providers that report no usage.
  
  `maxTokens` was counted after a sub-batch had already been paid for, so a `stop` run overshot its
  ceiling by one sub-batch, and it counted nothing at all for DeepL or Google Cloud Translation,
  which report no token usage. A run now projects each provider request before it is sent, using the
  same projection the pre-run estimate reports, and under `stop` refuses to send a request that would
  take the run past `maxTokens`. After every request the count is reconciled to the usage the
  provider actually reported, because the provider is the authority on what was billed; a request
  that reported nothing keeps its projection instead of counting zero.
  
  The reservation is taken per request actually sent, not per planned batch, so a request that
  verbatra re-splits after a truncated response has each half checked in turn and a cascade of retries
  cannot outrun one reservation. A request that fails or comes back truncated keeps its whole
  projection charged rather than being refunded, because such a call has usually already billed for
  its prompt, and a report of zero or less is treated as no report at all rather than as a refund.
  Every projection carries a fixed allowance for the prompt, DeepL and Google Cloud Translation
  included, so a ceiling below one batch's projection refuses that batch on every run; the refusal
  notice now says so whenever the refused projection alone is above `maxTokens`, and names lowering
  `maxBatchSize` or raising `maxTokens` as the way out.
  
  A reported figure is normalized before it is counted or added to another request's figure, the
  halves of a re-split request included: each field is floored at zero and rounded to a whole number,
  so a negative field can no longer cancel a positive one down below the invoice and a fractional
  report can no longer produce a run-status file the reader then refuses, which used to lose the whole
  run record rather than just the budget.
  
  What a reservation cannot bound is what happens inside a request it already admitted, and that is
  documented rather than hidden. The provider layer sends one repair call of its own when keys come
  back missing, so one admitted batch can cost up to about twice its projection; a request can report
  more than it was projected to cost; and the count is only as good as what the provider reports. All
  of it lands at reconciliation, and nothing further is sent once it does. Withheld keys keep their
  prior lock hash and retry on the next run, exactly as before, so a stopped run leaves no
  half-written locale file and no lock entry claiming work that was withheld.
  
  The ceiling bounds one run, not a session: `watch` starts a fresh budget for each run it triggers,
  so a watch session can spend up to `maxTokens` again on every source edit. It covers `translate`
  and nothing else; `retranslateEntry`, reached from the Studio dashboard and the agent tools,
  constructs its own provider and is not capped by it. Both limits are now stated in the docs and in
  the published `RunBudget` type rather than left to be inferred.
  
  Behavior breaks, both on paths a user opted into:
  
  - With `budgetBehavior: "stop"`, a run now gets strictly less work done for the same ceiling, since
    the sub-batch that used to be paid for and accepted is now withheld. Nothing is lost (withheld
    keys retry next run), but a single run's output changes. Set `budgetBehavior: "warn"` to keep the
    previous permissive behavior.
  - A `maxTokens` set against DeepL or Google Cloud Translation used to do nothing and report itself
    as unsupported. It is now enforced from an estimated count, so such a run can stop early. Under
    the default `warn` it still withholds nothing; it only reports a figure where it used to report
    none.
  
  `budgetBehavior` keeps `warn` as its default, so a run that never set it withholds nothing.
  `RunBudget.supported` keeps its type and changes meaning: it now says whether `tokensUsed` is
  entirely the provider's own reported usage, rather than whether the budget can be enforced, because
  the budget is enforced either way. It is `false` as soon as one counted request came back without a
  usable figure, a failed or truncated request included. The CLI budget line no longer claims a budget
  is "not supported by this provider"; it prints the counted total, marked estimated when the count is
  not entirely the provider's, and says a `stop` run that withheld a request while its count was still
  under the ceiling stopped before the ceiling rather than calling it exceeded. Studio's budget tile
  and its translations stat strip now show the consumption and the ceiling-reached state for an
  estimated budget instead of collapsing to an untracked placeholder, and tell a run stopped before
  its ceiling apart from one that reached it. The `usage.summary` agent tool's description now says
  where the counted figure came from rather than implying the provider reported it. `@verbatra/sdk`
  now exports `budgetStanding` and its `BudgetStanding` type, which classify a `RunBudget` as
  `within`, `stopped-before-ceiling`, or `reached`, so a caller no longer has to derive the difference
  between the last two from `exceeded`, `behavior`, and the count itself. The CLI budget line derives
  its wording from it, Studio takes its states from that type, and the `usage.summary` agent tool
  reports it as a new `budget.standing` field and describes each of the three states. A run with no
  `maxTokens` configured is unchanged: no projection is computed and no summary field moves.
  
  Because `supported: false` used to mean that nothing was counted at all, the run-status snapshot in
  `.verbatra-local/run-status.json` now carries a marker field saying its budget was counted under the
  enforced rules, and keeps its version. A snapshot without that marker is still read, but a budget it
  recorded with `supported: false` is dropped rather than presented as a count of zero, so Studio and
  the `usage.summary` agent tool no longer show an older DeepL or Google Cloud Translation run as
  within budget. An older Studio or MCP server ignores the marker and keeps reading the snapshot,
  review queue and usage included; until it is upgraded, it may show an estimated budget as not
  tracked. The `usage.summary` description also says that a run which sent no request at all reports
  `supported: false` with nothing counted, which is no estimate.
  
  The refusal to combine `maxTokens` with `--concurrency` above 1 on a live run is deliberately kept.
  The reservation is taken synchronously, so the ceiling would hold across concurrent locales, but
  which locale loses its remaining work would depend on the order the locales interleave. That reason
  now replaces the old claim of a nondeterministic overshoot everywhere it was written: the thrown
  error, the published `SdkErrorCode` documentation, the SDK README, and the `translate` and `watch`
  command pages in all four locales.

- [#221](https://github.com/verbatra/verbatra/pull/221) [`9659fff`](https://github.com/verbatra/verbatra/commit/9659fff529d8d6a509947fa3dad68dca11558dba) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Report a third-party format identifier in the project snapshot tool, so a project configured with a
  `custom:` format is described accurately instead of being typed against the built-in format set.

- [#221](https://github.com/verbatra/verbatra/pull/221) [`2ae0960`](https://github.com/verbatra/verbatra/commit/2ae09606a20961e475018447d18db9a9c12da74e) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Accept the new `MAX_LENGTH_EXCEEDED` and `FUZZY_CACHE_REUSE` review reasons in the retranslate
  tool's result schema, so a key flagged for overrunning its configured length budget or reused from
  an earlier source text is reported rather than rejected as an unrecognized code.

- [#228](https://github.com/verbatra/verbatra/pull/228) [`1be14b0`](https://github.com/verbatra/verbatra/commit/1be14b029feada82394833490a70a3aa087f32db) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Rewrite the README each package publishes to npm.
  
  Every package now carries the same header (mark, name, its own one-sentence description, its own
  version badge and no other package's), absolute image URLs so the artwork renders on npmjs.com, and
  no relative links, which never resolve there.
  
  The bodies drop the reference material the documentation site owns and would drift from: the
  configuration schema, the exit-code contract, and the per-provider key table are links now. What is
  left is what a reader on the package page needs. `@verbatra/cli` carries the command table derived
  from its own command registrations, one line each and no flags. `@verbatra/sdk` caps its API
  reference at what the built `dist/index.d.ts` actually declares. `@verbatra/studio` gains a
  screenshot of the dashboard and states the loopback bind and the `--allow-spend` gate up front.
  `@verbatra/mcp` gains the full thirteen-tool table and names the two tools the spend gate hides.
  
  No runtime behavior changes.

- [#226](https://github.com/verbatra/verbatra/pull/226) [`3ca4396`](https://github.com/verbatra/verbatra/commit/3ca4396d64ddc7d6d416cacbe1c6b12847d783d7) Thanks [@dependabot](https://github.com/apps/dependabot)! - Refresh runtime dependencies that reach consumers of the published packages.
  
  - `@verbatra/sdk`: bundled provider SDKs `@anthropic-ai/sdk` 0.125.0 -> 0.127.0, `@google/genai`
    2.22.0 -> 2.23.0 and `openai` 7.15.0 -> 7.19.0, plus
    `@formatjs/icu-messageformat-parser` 3.5.17 -> 3.5.19 for ICU parsing and `yaml` 2.9.0 -> 2.9.1
    for the YAML format adapter.
  - `@verbatra/sdk`, `@verbatra/cli`, `@verbatra/mcp` and `@verbatra/studio`: `zod` 4.6.2 -> 4.6.5.
  
  No behavior change is intended. Every bump is a minor or patch release of the dependency, and the
  JSON Schemas derived from zod (the shipped `config-schema.json`, the MCP tool input and output
  schemas, the Studio agent tool schemas and the provider response schema) are unchanged.

- [#221](https://github.com/verbatra/verbatra/pull/221) [`3709eff`](https://github.com/verbatra/verbatra/commit/3709eff773e3e7c23ba6f4bf1a2b9f3fe999b1a2) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Refresh runtime dependencies that reach consumers of the published packages.
  
  - `@verbatra/sdk`: bundled provider SDKs `@anthropic-ai/sdk` 0.122.0 -> 0.125.0, `@google/genai`
    2.19.0 -> 2.22.0 and `openai` 7.8.0 -> 7.15.0, plus `jszip` 3.10.1 -> 3.10.2 for workbook
    interchange.
  - `@verbatra/sdk`, `@verbatra/cli`, `@verbatra/mcp` and `@verbatra/studio`: `zod` 4.5.1 -> 4.6.2.
  
  No behavior change is intended. The JSON Schemas derived from zod (the shipped
  `config-schema.json`, the MCP tool input and output schemas, the Studio agent tool schemas and the
  provider response schema) are byte-identical under both zod versions.
- Updated dependencies [[`3239884`](https://github.com/verbatra/verbatra/commit/3239884a88eeee61a86efe1a45350d6e6f81f043), [`15264b6`](https://github.com/verbatra/verbatra/commit/15264b678afea41cc92fe51408af5318f89b2a93), [`784889f`](https://github.com/verbatra/verbatra/commit/784889f6dc08c1e56a4a7751bb135d7422f9b021), [`769c651`](https://github.com/verbatra/verbatra/commit/769c6510c4c4d10913175a172302c8ac92314c78), [`d4568f7`](https://github.com/verbatra/verbatra/commit/d4568f7a68b7c08efd2223ee122b706a978dd2dc), [`2f496aa`](https://github.com/verbatra/verbatra/commit/2f496aa8b4eda81a01482b75f26bb645448da82f), [`2ae0960`](https://github.com/verbatra/verbatra/commit/2ae09606a20961e475018447d18db9a9c12da74e), [`f491ca2`](https://github.com/verbatra/verbatra/commit/f491ca2f121a2c0521bc19c037fd8df41a6ec533), [`eca295f`](https://github.com/verbatra/verbatra/commit/eca295fc24937a91b4064ac909e733ac2e1f15df), [`54ff539`](https://github.com/verbatra/verbatra/commit/54ff5396426c91d05f82042976ca3e037bca35c5), [`47b22da`](https://github.com/verbatra/verbatra/commit/47b22da37106cbfddf077266a66f6880576ed03c), [`1be14b0`](https://github.com/verbatra/verbatra/commit/1be14b029feada82394833490a70a3aa087f32db), [`3ca4396`](https://github.com/verbatra/verbatra/commit/3ca4396d64ddc7d6d416cacbe1c6b12847d783d7), [`3709eff`](https://github.com/verbatra/verbatra/commit/3709eff773e3e7c23ba6f4bf1a2b9f3fe999b1a2), [`d9d77b4`](https://github.com/verbatra/verbatra/commit/d9d77b408138f024b304631b264d762eabd00f68), [`9659fff`](https://github.com/verbatra/verbatra/commit/9659fff529d8d6a509947fa3dad68dca11558dba), [`b5c3afd`](https://github.com/verbatra/verbatra/commit/b5c3afd15b65697c7dad9fed2e4e63179f925e48), [`6dec4dd`](https://github.com/verbatra/verbatra/commit/6dec4dda4a03706b769bc4abef8161963eb88ab8), [`21cd75f`](https://github.com/verbatra/verbatra/commit/21cd75f32a5bc9c686d8fcf5ba07ff23a348c429)]:
  - @verbatra/sdk@0.11.0

## 0.2.0

### Minor Changes

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Add `@verbatra/mcp`, a new stdio MCP server exposing verbatra's translation
  status, glossary, and editing capabilities as tools for MCP clients such as
  Claude Desktop, Claude Code, and Cursor. Ships 13 tools covering status checks,
  glossary editing, key integrity, and translation editing; the two tools that
  call a provider and spend API usage are only advertised when the server is
  started with spending allowed. Ships both a library export (`startMcpServer`)
  and a `verbatra-mcp` binary, versioned and published independently of
  `@verbatra/sdk`/`@verbatra/cli`. `@verbatra/cli` gains a new `mcp` command that
  loads it via dynamic import, so a missing `@verbatra/mcp` install never breaks
  the rest of the CLI. `@verbatra/sdk` also gains a shared `redact` utility, used
  to strip provider API key values out of tool output before it reaches a caller.

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Fix several MCP tools (`lock.state`, `key.integrity`, `review.queue`,
  `usage.summary`) silently ignoring an injected `fs` or `adapterRegistry` from
  the tool context instead of forwarding it to the sdk call. Fix CLI argument
  parsing swallowing the next flag as a value for `--cwd` or `--config` when none
  was given. Mark `glossary.write` as destructive, since passing a null
  translation deletes a term. Strip working-directory-rooted absolute paths from
  error messages returned to the client, and fix `key.integrity` to keep a
  checked-but-unchanged locale's row instead of dropping it.

### Patch Changes

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Add a package-local in-flight guard for the `translation.retranslateEntry` and `translation.editEntry` tools, keyed per `(tool, locale, key)`. A second overlapping call for the same locale and key returns an error result before reaching the provider, so an accidental duplicate call (for example an LLM client retrying a slow request) can no longer bill the configured provider twice for one logical request. A concurrent call for a different key is unaffected.
- Updated dependencies [[`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8)]:
  - @verbatra/sdk@0.10.0
