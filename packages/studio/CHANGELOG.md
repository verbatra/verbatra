# @verbatra/studio

## 0.5.2

### Patch Changes

- [#244](https://github.com/verbatra/verbatra/pull/244) [`1ff8ff2`](https://github.com/verbatra/verbatra/commit/1ff8ff2becfc253cbbbbb7387e2086cf3ba527c3) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Bring the published type documentation in line with the code. Every declaration and every
  interface member in the built `.d.ts` files now carries a doc comment, and the ones that had
  fallen behind were corrected: which flows throw which `SdkError` codes, what a dry run skips,
  how the lock timeout and the fuzzy cache similarity behave, what `LocaleSummary.status`,
  `translated` and `unfilled` really count, which notice codes DeepL and Google Cloud Translation
  emit, what the format adapter factories refuse, and what the MCP server's `onLog`, `fs` and
  handle options do. The `glossary.write` MCP tool description no longer claims it can write an
  inline glossary; it needs a file-backed one and fails with `GLOSSARY_NOT_FILE_BACKED` otherwise.
- Updated dependencies [[`1ff8ff2`](https://github.com/verbatra/verbatra/commit/1ff8ff2becfc253cbbbbb7387e2086cf3ba527c3)]:
  - @verbatra/sdk@0.11.1

## 0.5.1

### Patch Changes

- [#221](https://github.com/verbatra/verbatra/pull/221) [`d4568f7`](https://github.com/verbatra/verbatra/commit/d4568f7a68b7c08efd2223ee122b706a978dd2dc) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Add opt-in fuzzy reuse of the translation memory. With `fuzzyCache: { enabled: true }` in the config, a source string that changed only slightly reuses the translation of its earlier form instead of being sent to the provider, as long as the two are at least `fuzzyCache.threshold` alike (a similarity ratio from `0.5` to `1`, default `0.9`). The feature is off by default, so no existing run changes behavior.
  
  A fuzzy reuse is never presented as an exact one, and never lands silently. It carries the new `FUZZY_CACHE_REUSE` review reason on every run whatever it scored, so it appears on `needsReview` and in Studio's Review queue as "Reused after source edit"; it also lands in a new `LocaleSummary.fuzzyHits` bucket carrying the key, the score, and the earlier source text the translation was actually produced for, which `runStatus` now persists so a tool opened after the run can still show what was reused and from what. The CLI prints it as its own `fuzzy-reused` count with those details underneath. It passes the same integrity gate every other candidate value passes, so a reuse whose placeholders no longer fit the edited source is refused and the key goes to the provider. It is also never written back into the cache, so a reused value can never be laundered into an exact hit on a later run. `--no-cache` bypasses it along with the rest of the cache.
  
  A reuse is written to the locale file but deliberately not locked: the key keeps the lock-file baseline it already had, so it stays changed and is offered, flagged and listed again on every later run, at no provider cost, until a real translation lands and locks normally. That is what makes the "on every run" promise true rather than a single chance to notice, and it means `check` keeps reporting the key as out of date, which it is. Editing only an entry's description, meaning or plural flag leaves the source text identical, and such a key is never handled by the fuzzy layer at all: it goes to the provider exactly as it would with the feature off, so the new guidance is actually applied.
  
  The threshold is a spend dial, not a safety dial, and the default of `0.9` is set on that understanding. Similarity is measured in characters and meaning is not a function of character distance: a dropped negation, an inverted modal or a swapped proper noun all score above `0.9`, and a single changed letter late in an eighty-character string scores `0.987`, past anything the schema accepts. Safety therefore comes from the parts that do not depend on the number: the feature is off by default, every reuse is flagged for review, and an entry whose numerals differ from the current source in count, value or order is refused outright whatever it scores, because a changed number is always a changed fact and is the one meaning-changing edit recognizable without knowing the language. The numeral rule covers every Unicode numeric character, so a superscript, a vulgar fraction or a Roman numeral character counts as much as an ASCII digit; a number written as a word does not, and is left to the review flag.
  
  `ReviewReasonCode` is now derived from an exported `REVIEW_REASON_CODES` tuple, so a runtime validator or an exhaustive lookup can be built from the set rather than retyping its members.
  
  Scoring needs the source text, which the cache did not store, so `verbatra.cache.json` moves to schema version 2 and gains a `sources` block mapping each content hash to the text it stands for. The file grows by roughly the size of the source corpus. A version 1 cache is carried forward rather than rejected: its translations keep working as exact hits and their source text refills as later runs touch them. Going the other way, a version 1 build reading a version 2 file takes the existing unrecognized-version path, reporting `CACHE_VERSION_UNRECOGNIZED` and leaving the file untouched, so a downgrade costs a cold cache and never a wrong translation.

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

- [#221](https://github.com/verbatra/verbatra/pull/221) [`2ae0960`](https://github.com/verbatra/verbatra/commit/2ae09606a20961e475018447d18db9a9c12da74e) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Label the new `MAX_LENGTH_EXCEEDED` review reason in the Review queue.
  
  A key flagged for overrunning its configured length budget now renders as "Over length budget"
  alongside the other advisory review reasons, rather than leaving the badge map incomplete.

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

- [#221](https://github.com/verbatra/verbatra/pull/221) [`9659fff`](https://github.com/verbatra/verbatra/commit/9659fff529d8d6a509947fa3dad68dca11558dba) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Carry a third-party format identifier through the project snapshot, so a project configured with a
  `custom:` format renders in the dashboard instead of failing to typecheck against the built-in
  format set.
- Updated dependencies [[`3239884`](https://github.com/verbatra/verbatra/commit/3239884a88eeee61a86efe1a45350d6e6f81f043), [`15264b6`](https://github.com/verbatra/verbatra/commit/15264b678afea41cc92fe51408af5318f89b2a93), [`784889f`](https://github.com/verbatra/verbatra/commit/784889f6dc08c1e56a4a7751bb135d7422f9b021), [`769c651`](https://github.com/verbatra/verbatra/commit/769c6510c4c4d10913175a172302c8ac92314c78), [`d4568f7`](https://github.com/verbatra/verbatra/commit/d4568f7a68b7c08efd2223ee122b706a978dd2dc), [`2f496aa`](https://github.com/verbatra/verbatra/commit/2f496aa8b4eda81a01482b75f26bb645448da82f), [`2ae0960`](https://github.com/verbatra/verbatra/commit/2ae09606a20961e475018447d18db9a9c12da74e), [`f491ca2`](https://github.com/verbatra/verbatra/commit/f491ca2f121a2c0521bc19c037fd8df41a6ec533), [`eca295f`](https://github.com/verbatra/verbatra/commit/eca295fc24937a91b4064ac909e733ac2e1f15df), [`54ff539`](https://github.com/verbatra/verbatra/commit/54ff5396426c91d05f82042976ca3e037bca35c5), [`47b22da`](https://github.com/verbatra/verbatra/commit/47b22da37106cbfddf077266a66f6880576ed03c), [`1be14b0`](https://github.com/verbatra/verbatra/commit/1be14b029feada82394833490a70a3aa087f32db), [`3ca4396`](https://github.com/verbatra/verbatra/commit/3ca4396d64ddc7d6d416cacbe1c6b12847d783d7), [`3709eff`](https://github.com/verbatra/verbatra/commit/3709eff773e3e7c23ba6f4bf1a2b9f3fe999b1a2), [`d9d77b4`](https://github.com/verbatra/verbatra/commit/d9d77b408138f024b304631b264d762eabd00f68), [`9659fff`](https://github.com/verbatra/verbatra/commit/9659fff529d8d6a509947fa3dad68dca11558dba), [`b5c3afd`](https://github.com/verbatra/verbatra/commit/b5c3afd15b65697c7dad9fed2e4e63179f925e48), [`6dec4dd`](https://github.com/verbatra/verbatra/commit/6dec4dda4a03706b769bc4abef8161963eb88ab8), [`21cd75f`](https://github.com/verbatra/verbatra/commit/21cd75f32a5bc9c686d8fcf5ba07ff23a348c429)]:
  - @verbatra/sdk@0.11.0

## 0.5.0

### Minor Changes

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Studio's Translations and Review search boxes now also match translation
  content, not just key names, case-insensitively against the current source and
  target text. Both inputs now read "Filter by key or translation text" to
  reflect the wider behavior. The existing 500-key render cap and ordering are
  unchanged.

### Patch Changes

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Fix the Translations panel's status grid rendering every drift key uncapped,
  unlike the list view. The grid now caps at 500 keys, matching the list view, and
  shows a truncation notice when there are more.

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Internal refactor: Studio's secret-redaction pass now imports `redact` from
  `@verbatra/sdk` instead of maintaining its own copy, so the guarantee that a
  provider API key value never reaches a browser tab is enforced by one shared
  implementation. Behavior is unchanged.

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Guard `translation.retranslateEntry` and `translation.editEntry` against an accidental concurrent duplicate call for the same locale and key, extending the existing in-flight guard (previously only wired to `translation.translatePending`) with per-`(locale, key)` granularity. A second overlapping call for the same key is rejected with `ALREADY_IN_PROGRESS` before it reaches the provider, so a UI double-click or a scripted retry can no longer bill the configured provider twice for one logical request. A concurrent call for a different key is unaffected.
- Updated dependencies [[`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8)]:
  - @verbatra/sdk@0.10.0

## 0.4.3

### Patch Changes

- Updated dependencies [[`ab85607`](https://github.com/verbatra/verbatra/commit/ab85607f24c4edcedea8e4d2267e25ee79f0070a)]:
  - @verbatra/sdk@0.9.3

## 0.4.2

### Patch Changes

- Updated dependencies [[`6f56c63`](https://github.com/verbatra/verbatra/commit/6f56c63f13705dc47031be3c1044c96f8fc9736d), [`6f56c63`](https://github.com/verbatra/verbatra/commit/6f56c63f13705dc47031be3c1044c96f8fc9736d)]:
  - @verbatra/sdk@0.9.2

## 0.4.1

### Patch Changes

- [#191](https://github.com/verbatra/verbatra/pull/191) [`251430e`](https://github.com/verbatra/verbatra/commit/251430e359b4795bd0e96627408518c573348519) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Fix the README quick-start example. Run the dashboard with `npx verbatra studio` instead of the bare `verbatra studio`, which fails when the binary is not on your PATH.
- Updated dependencies [[`8dcf89d`](https://github.com/verbatra/verbatra/commit/8dcf89dc82e7716ec3d1b2bc5d8c8cff43974c19), [`2914739`](https://github.com/verbatra/verbatra/commit/2914739774c745859de1176167fac53e383a8b35)]:
  - @verbatra/sdk@0.9.1

## 0.4.0

### Minor Changes

- [#172](https://github.com/verbatra/verbatra/pull/172) [`af21823`](https://github.com/verbatra/verbatra/commit/af21823c72dfb90967693205eacaafc971a484bd) Thanks [@mariokreitz](https://github.com/mariokreitz)! - The Settings panel's glossary is editable when the project keeps its glossary in a JSON file. Terms
  can be added, edited in place, and removed, and the panel shows the new state as soon as a
  write lands, with no reload. A new `glossary.write` RPC method backs it, registered unconditionally
  alongside the other local-editing methods, since changing a glossary calls no provider and spends
  nothing; it is rate limited like every other write method and is exposed as an agent tool when
  Studio was started with the agent-tools opt-in.

  The server never accepts a file path: the target is derived from the loaded config alone. A glossary
  written inline in the config, or no glossary at all, keeps the panel read-only and explains how to
  move the terms into a JSON file, rather than rewriting the config module. `glossary.get` now reads a
  file-backed glossary fresh on every call and names the terms whose values were redacted as
  secret-shaped; the panel refuses to edit those, so a redaction placeholder can never be written back
  over the real value.

### Patch Changes

- [#157](https://github.com/verbatra/verbatra/pull/157) [`d54213a`](https://github.com/verbatra/verbatra/commit/d54213a1dbb24e6f44cffd00abb4565a285192c2) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Point the sidebar "Help and issues" link at the repository's new location,
  github.com/verbatra/verbatra.

- [#180](https://github.com/verbatra/verbatra/pull/180) [`131764a`](https://github.com/verbatra/verbatra/commit/131764a494528d3a84d0b358d78aa7b95df495a8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - `CreateStudioWatcher` now documents its real calling convention. It is called once per watched
  entry, each call receiving a one-element array: one for the source locale file, one for each
  configured target locale file, and one for the lock file. The earlier wording said it was called
  once with every path, so an injected factory written to it built a single watcher and silently
  observed the source file alone.
- Updated dependencies [[`aa337dc`](https://github.com/verbatra/verbatra/commit/aa337dc0e5c0f05acee1364fa0dde01f03a03bc9), [`5d7ec20`](https://github.com/verbatra/verbatra/commit/5d7ec20a4b46361db3c359e7ce792049598ae51a), [`9d3a8f8`](https://github.com/verbatra/verbatra/commit/9d3a8f850991c9bf862eb443ebc9e41e575c1639), [`af21823`](https://github.com/verbatra/verbatra/commit/af21823c72dfb90967693205eacaafc971a484bd), [`08fec43`](https://github.com/verbatra/verbatra/commit/08fec434584a61f1bf1673a7b674c055ae15833c), [`ccd5c58`](https://github.com/verbatra/verbatra/commit/ccd5c587de4e176ba00f5b966dda48eeff4a0f82), [`7a361f9`](https://github.com/verbatra/verbatra/commit/7a361f963124c8e4e507b07e06c6dd9b22481e03), [`131764a`](https://github.com/verbatra/verbatra/commit/131764a494528d3a84d0b358d78aa7b95df495a8), [`3b5942d`](https://github.com/verbatra/verbatra/commit/3b5942d4db01800667b3d3c33ba5778b750f9b8f), [`4f66427`](https://github.com/verbatra/verbatra/commit/4f66427fd4e200c8b08ad9c27fa48cc9e359a70c)]:
  - @verbatra/sdk@0.9.0

## 0.3.2

### Patch Changes

- a1f9b40: Document the published Studio API and strip internal prose comments from both packages. Every
  declaration that ships in Studio's type declarations now carries JSDoc: `startStudioServer`
  describes its startup ordering, the error codes it throws, and a runnable example, and the server
  option, dependency, watcher, and error shapes document each property. Editors show these on hover.
  The CLI's published declarations are a re-export of the SDK's config helpers and are documented
  there. No runtime behavior, output, or type signature changes.
- Updated dependencies [8a274b0]
- Updated dependencies [d060201]
- Updated dependencies [b0dd696]
- Updated dependencies [3e725cc]
- Updated dependencies [74ac95f]
- Updated dependencies [23a6b1b]
- Updated dependencies [3178757]
- Updated dependencies [ec4c000]
- Updated dependencies [6b37fe9]
- Updated dependencies [d7c7a44]
  - @verbatra/sdk@0.8.0

## 0.3.1

### Patch Changes

- @verbatra/sdk@0.7.1

## 0.3.0

### Minor Changes

- 21459a6: Resolve locale file paths through the SDK's `createLocalePathResolver` instead of Studio's own copy
  of the substitution. The live-refresh watcher and the history view now honor the project's
  `files.localeStyle`, so a project on the `"posix"` or `"android"` layout is watched and reported at
  the paths it actually writes.
- 095db28: Show a recoverable notice instead of a blank page when the dashboard fails to render.

  Studio mounted its React tree with nothing above it to catch a render throw. React's response to an
  uncaught throw during render is to unmount the whole tree, so a fault in any single panel took the
  entire dashboard down to an empty page: no message, no indication that anything had happened, and
  no hint that a reload was the way out.

  The tree is now mounted behind an error boundary. A render throw is caught at the top and replaced
  by a full-screen notice in the style of the existing session-expired screen: it is announced with
  `role="alert"`, it names the error so the fault can be identified without opening devtools, and it
  carries a button that reloads the dashboard. The full error and its component stack are also logged
  to the browser console, which is where the faulting component is actually named. Nothing is
  reported anywhere off the machine.

  This covers throws raised while React renders the tree, which is the case that blanked the page.
  Errors thrown from event handlers, from async callbacks, and from work scheduled outside a render
  pass happen where React is not rendering, so they do not reach the boundary and are unaffected.

- c3ebf27: Support WebMCP agent-tool unregistration through an abort signal. `registerAgentTools` now accepts
  an optional `signal` and passes it to every `registerTool` call, which is the only unregistration
  mechanism the WebMCP specification offers. A signal that has already aborted registers nothing and
  skips the snapshot call entirely, and an abort that lands mid-pass stops it where it stands. With no
  signal supplied, the registered tool set is unchanged.

### Patch Changes

- 70d86b4: Rewrite the WebMCP agent tool descriptions so an agent can choose between them. Every tool now states what it does, when to use it, when not to use it, what each parameter means, and the caveats that change a decision. The two spend-gated tools say plainly that they spend provider budget, that they are not idempotent, and that they cannot be undone, and the retranslate tool says that the provider is billed before the integrity check runs, so a rejected result still costs money. Tool names, schemas, annotations, gating, and behavior are unchanged.
- 6dafda6: Read the agent-tools registration status through `useSyncExternalStore` so a publish landing between the render and the effect commit is no longer missed. The hook previously seeded its state in a `useState` initializer during render and subscribed in a `useEffect` after commit; a publish in that gap was lost permanently and the degraded-mode notice would silently never appear.
- 81c22ab: Key dropdown list items on a stable per-item id instead of the display label. Labels are display strings with no uniqueness guarantee, so two entries reading the same collided on their React key. `DropdownItem` now carries a required `id`.
- bc5f980: Make the Studio theme initializer idempotent. It now detaches the OS scheme listener a
  previous call registered before attaching a new one, so repeated calls leave at most one
  active listener instead of accumulating one per call.
- 2d119f8: Refresh the npm package metadata. The cli and sdk descriptions now name the providers, including running against an openai-compatible local or self-hosted model, and their keywords cover the supported formats (XLIFF, YAML, ARB, Flutter, Java properties) alongside the i18n libraries. The studio keywords gained the terms its dashboard is searched by, and its homepage now points at the Verbatra Studio documentation page. `verbatra --help` prints the same positioning as the package listing, so the banner no longer contradicts it.
- 5384af2: Publish exactly one lock refresh for one atomic lock-file write. An atomic write (temp sibling, then rename over the target) reaches chokidar as an "add" followed by a "change" on the same path, released on chokidar's own 50ms per-path change throttle. Both map onto the studio watcher's single listener, so once that gap exceeded the debounce window the trailing timer fired twice and one logical write published two refresh events, costing consumers a redundant refetch. The lock entry now compares the watched file's identity (inode, size, and modification time) at settle time and drops a refresh that reports the same file state as the one it last published. The check fails open: an identity that cannot be read is never treated as a duplicate.
- 45c3991: Report failed agent tool registrations instead of silently dropping them. The WebMCP surface
  answers `registerTool` with a promise, whose result the dashboard discarded, so a rejected
  registration escaped as an unhandled rejection and a failing tool simply appeared to do nothing.
  Each registration is now awaited and caught individually: one refused tool no longer stops the
  tools after it, the outcome is written to the browser console naming every failing tool with its
  error name, and the dashboard shows a `role="alert"` degraded-mode notice. A run in which every
  registration succeeds stays entirely silent.
- 2867106: Mark the status grid's coverage as last known when a re-read fails. The locale
  headers previously rendered stale percentages exactly like freshly fetched ones,
  so a failed background refresh left outdated coverage looking current. The
  percentages now stay on screen under the same stale notice the activity, review,
  and translations panels already render.
- 877f399: Bring the dashboard's React layer under the package's test and coverage gates.

  `src/app`, the entire user-facing half of Studio, sat outside both the test-discovery and the
  coverage globs. The package reported a healthy figure against the shared 90 percent gate while
  every panel, overlay, primitive and hook contributed nothing to either side of the ratio, so the
  number described the server and client halves only.

  The React layer is now discovered and measured like the rest of the package: its components and
  hooks are covered by co-located Vitest tests running against a real DOM, and the same unchanged 90
  percent thresholds on lines, functions, statements and branches now apply to them. The few files
  that stay unmeasured are named individually in the config with the reason each is excluded, so
  nothing is invisible by omission rather than by decision.

  No dashboard behavior changes. This is test and configuration work: the only new dependency is a
  development-time DOM environment, and nothing new reaches the published bundle.

- 7085769: Show specific copy when a provider-spending action fails because the provider itself is down.

  The provider boundary now reports a server-side outage as `PROVIDER_UNAVAILABLE` rather than the
  generic unclassified code. Studio's error table gains a matching entry, so retranslate and
  translate-pending failures during an outage explain that the fault is on the provider's side and
  the action is worth retrying later, instead of falling back to the generic server message.

- Updated dependencies [7085769]
- Updated dependencies [6fb1941]
- Updated dependencies [6871028]
- Updated dependencies [21459a6]
- Updated dependencies [2d119f8]
- Updated dependencies [6b911af]
- Updated dependencies [1d3d92d]
- Updated dependencies [4720494]
  - @verbatra/sdk@0.7.0

## 0.2.4

### Patch Changes

- Updated dependencies [07df69b]
- Updated dependencies [e6de185]
- Updated dependencies [1ae3be9]
- Updated dependencies [9aafc43]
  - @verbatra/sdk@0.6.4

## 0.2.3

### Patch Changes

- 2c37673: Handle the new `empty` integrity rejection in the editor.

  The SDK now refuses an empty or whitespace-only translation of a non-empty
  source. Studio's edit dialog is a plain text area and a Save button, so
  select-all-delete previously wrote the empty value straight through; it is now
  rejected with "Rejected: empty translation" and nothing is written.

  The status label is deliberately context-free, because the same map renders
  retranslate outcomes, where an empty value came from the provider and the user
  typed nothing. The edit dialog additionally shows a local hint pointing at the
  export, `[[CLEAR]]`, import round trip, which remains the supported way to
  unset a translation.

- Updated dependencies [dda9ede]
- Updated dependencies [4bb2bf2]
- Updated dependencies [b75967c]
- Updated dependencies [a4f6831]
- Updated dependencies [d39ae24]
- Updated dependencies [2c37673]
- Updated dependencies [34f9aeb]
- Updated dependencies [188f2f0]
- Updated dependencies [7c2e877]
  - @verbatra/sdk@0.6.3

## 0.2.2

### Patch Changes

- Updated dependencies [a6767a6]
- Updated dependencies [62dbc7e]
- Updated dependencies [72bacc3]
- Updated dependencies [b98d7f2]
- Updated dependencies [ca2d99a]
  - @verbatra/sdk@0.6.2

## 0.2.1

### Patch Changes

- 67f1768: Withhold degenerate machine translations at the write-path integrity gate. Output that is structurally corrupt (a repetition loop or runaway-length text) but carries no placeholders previously passed the placeholder and ICU checks and was written to disk. Such values are now detected and withheld as an integrity mismatch, so they are retried on the next run and never overwrite an existing good value. Studio surfaces the new rejection reason in its review actions.
- 002248b: Show withheld keys after a translate-pending run instead of a blanket success. When a run keeps some translations but withholds others, Studio now reports how many keys were withheld and for which locales, rather than displaying "Translated".
- Updated dependencies [67f1768]
- Updated dependencies [a90bc7e]
- Updated dependencies [720716c]
- Updated dependencies [adc9536]
  - @verbatra/sdk@0.6.1

## 0.2.0

### Minor Changes

- 28667da: Add an opt-in WebMCP agent-tools surface to Studio, off by default.

  When enabled, the prebuilt dashboard registers its existing RPC methods as WebMCP tools on a
  supporting browser's `document.modelContext`, so an agent on the open, authenticated tab can drive
  the same read, edit, and (with `--allow-spend`) provider actions the dashboard already exposes.
  Each tool is a 1:1 wrapper over the same authenticated server call, validation, and capability gate;
  registration grants no authority the tab did not already hold. Enable it with the new
  `verbatra studio --expose-agent-tools` flag or the `VERBATRA_STUDIO_AGENT_TOOLS` environment
  variable; both default to off. The two spend tools require both flags: `--expose-agent-tools` to
  expose the surface and `--allow-spend` to enable them.

### Patch Changes

- @verbatra/sdk@0.6.0

## 0.1.0

### Minor Changes

- 9e43dc1: Verbatra Studio is a redesigned application, from the information architecture down. It is
  organized as four pages in two sidebar zones: Translations (the daily workspace: a status banner
  with the last run's token figures, the key-by-locale explorer, and per-locale coverage with the
  lock file's state), Review (the flagged-entry queue with locale and key filters), Activity (the
  commit feed beside the last run's token and budget breakdown), and Settings (the session's
  capabilities plus the resolved configuration and glossary). The current page lives in the URL
  hash, so a reload lands back on the same page and browser back/forward work.

  The dashboard is now fully live: every page re-fetches on the file-watcher's refresh signal
  (coverage, the key diff, the lock state, the review queue, usage, and history), and the top bar
  carries a live indicator that turns amber while the stream reconnects. The key detail drawer is
  richer, showing the key's current source value and each locale's current translation alongside
  status and integrity, all updating live.

  Local editing needs no flag: the needs-review queue's edit, approve, and reject actions are
  available from the start, behind the loopback session and the same placeholder and ICU
  integrity gate as every write. Provider-calling actions (retranslate, translate pending) are
  opt-in via --allow-spend.

  The interface is rebuilt on Tailwind CSS with a reusable design system and a restrained, minimal
  look: overhauled dot-style badges, neutral elevation, and no page transitions. It ships a full
  light theme beside the dark one (System/Light/Dark switcher, persisted, following live OS
  changes on System), both contrast-checked against WCAG AA during development. Navigation is the
  flat four-page sidebar; every page is reachable in one click.

- 55c6af2: The Translations page's missing, changed, and orphaned key lists get their own distinct color
  vocabulary, separate from the status badges, since "what changed" and "is this correct" are
  different signals. When a project has nothing missing, changed, or orphaned in any locale, the
  page shows a single designed all-clear state instead of a wall of empty per-locale sections.

  Key and glossary translations render with right-to-left text direction for right-to-left locales
  such as Arabic, Hebrew, Persian, and Urdu.

  New: clicking a key opens a detail drawer showing that key's status per locale and the project's
  commit history for its locale files. The drawer supports a focus trap, closing with Escape, and
  returns focus to whatever was focused before it opened.

- 3f5fa4b: Two small, additive dashboard usability improvements.

  The Translations page gets a "Copy as review report" button that renders the full, currently
  loaded diff data (never the on-screen filtered or capped view) as a Markdown summary, per locale,
  the missing, changed, and orphaned key counts and key names, and copies it to the clipboard, with
  a brief "Copied" confirmation.

  RPC errors now render specific, actionable copy for known error codes (transport-level errors, sdk
  errors reachable through the read-only check, diff, and lock endpoints, and adapter parse errors on
  a target locale file), falling back to the existing generic message for any other code. Nothing
  about how errors are produced, redacted, or transported changes; this is a client-rendering
  improvement only.

- 674beb0: Add a provider-calling Studio action: an inline "Retranslate" button in the key detail drawer,
  for a locale row whose key currently fails placeholder or ICU integrity. Off by default;
  reachable only when the `verbatra studio` command is started with `--allow-spend` (or its
  environment variable equivalent). With the flag off, the action is absent from the dashboard,
  not merely disabled, and the underlying RPC method is absent from the server's own dispatch
  registry.

  Provider spend is the one gated capability: the server reaches a translation provider only when
  an operator opts in at process start, never through any request the dashboard itself can send.
  Local editing of the project's own locale files needs no flag and is always available.

  `project.snapshot`'s result gains a read-only `capabilities` field (`{ spend, writeToDisk }`);
  `spend` reflects the resolved flag and `writeToDisk` is always true, since local editing is
  always on. The dashboard uses it only to hide the retranslate affordance the server would refuse
  anyway, never as an authorization check.

  Internally, the RPC handler registry is now built per server instance from its resolved
  capabilities (`createRpcHandlers`) rather than a fixed module-level constant, and the
  retranslate method is gated by a dedicated, process-scoped rate limit at the dispatch layer.

  `key.integrity`'s per-locale result gains a new `icuValid: boolean` field (a boolean only, never a
  message string), and the key detail drawer's integrity pill gains a new danger state, "Invalid
  message syntax", for a target value that is placeholder-valid but fails ICU message-syntax
  validation, checked before the existing neutral "no placeholders" state. This is exactly the kind
  of failure the new Retranslate action exists to fix, so it was already covered by
  `canRetranslate`'s existing `tone === "danger"` gate once the pill itself learned to render it.

- 4515726: Add a new sdk function, `keyIntegrity`, that reports per changed key
  and target locale whether the format's placeholders or ICU structure
  still match between source and target: a boolean match result plus,
  on a mismatch, the specific placeholder tokens that are missing or
  extra. It reuses core's `checkPlaceholders` and an adapter's own
  `comparePlaceholders` exactly as they exist today; only "changed" keys
  are checked, since a missing or orphaned key has no value on one side
  to compare.

  Studio exposes this through a new read-only RPC method, `key.integrity`,
  scoped to exactly the one key currently open in the detail drawer,
  mirroring the existing `history.list` pattern of supplementary data
  fetched lazily on open rather than growing the already-uncapped
  `status.diff` payload. `KeyDetailDrawer` now renders an Integrity
  column with a pill: green for a match, red with the mismatched tokens
  for a mismatch, and neutral (never a false red) for a format with no
  placeholders at all. The pill reuses the existing `Badge` component
  and its success, neutral, and danger tones; no new styling is added.

  No RPC response carries a full source or target string value at any
  point, only the boolean result and, on a mismatch, the specific
  placeholder tokens involved.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the
  same bump; its own behavior is unchanged.

- 45a7774: Commit history rows (in the Activity feed and in the commit history section of a key's detail
  drawer) now show which locale files each commit touched, as a row of file chips under the
  summary line. This data was already present in every response from the underlying commit-history
  API; it just was not rendered before.
- ea054a2: Studio's live-refresh SSE channel now reports a real, still-content-free key delta instead of a
  blank "something changed" signal. `RefreshEvent` gains two optional fields, `locale` and `delta`
  (`added`/`changed`/`removed` counts), populated for `"source"` and `"targets"` refresh events; a
  `"lock"` event is unchanged. The `targets` watch category is now split into one chokidar watcher and
  one debounce per configured target locale, so a change to one target locale's file is distinguishable
  from a change to another, and each locale reports its own delta.

  The delta is a plain content diff of one locale file against its own last observed snapshot (taken at
  Studio startup and after every settled change), independent of source drift or the lock baseline.
  This is a deliberate semantics choice: it is the only reading under which a translator hand-editing an
  existing translation's wording, with the key itself untouched, is ever detected as a change. Two rapid
  changes to the same locale file, close enough together that the second's debounce window opens while
  the first's snapshot read is still in flight, are serialized so the second's reported delta is always
  correct against the first's settled state, never a stale or out-of-order baseline.

  `@verbatra/sdk` gains a new small read-only module, `readLocaleFileSnapshot` and
  `diffLocaleSnapshots`, exported for this purpose: reading one locale file through the configured
  adapter into a per-key content hash, and comparing two such snapshots into added/changed/removed
  counts. No translation string, key name, or file content ever crosses the SSE wire, only locale codes
  and counts.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump with no behavior
  change of its own.

- 68b3ee8: The Translations page's key explorer gets a grid view: rows are keys, columns are target
  locales, and each cell
  shows that key's status (missing, changed, orphaned, or in sync) with the same color and badge
  vocabulary as the rest of the dashboard. Each locale column header shows its completeness
  percentage. Grid is the default view; the previous flat per-locale key lists stay reachable as a
  "List" view through a toggle above the table.

  The grid supports keyboard-first navigation: arrow keys move between cells and wrap at the grid's
  edges, Enter or Space opens the key detail drawer for the focused row's key, and Escape closes it.
  Only the currently focused cell is in the Tab order, so tabbing into the grid and back out stays a
  single stop either way.

- d99347a: Add a live needs-review queue to Verbatra Studio: a new Review page listing every `(locale, key)`
  pair the most recent CLI run flagged for human review, backed by a new unconditional read RPC
  method, `review.queue`, that passes through the sdk's existing `runStatus()` result with no new
  computation. Each row shows a distinct, human-readable label for its `ReviewReasonCode`s; an
  unavailable snapshot (no run has been recorded yet) renders an informational empty state, never an
  error.

  Each row also gets three actions: Approve and Reject are purely client-side dismissals, held in
  an in-memory "actioned this session" overlay that survives the existing SSE `refresh`-triggered
  re-fetch and resets only on a page reload, never persisted to disk or the lock file. Edit opens a
  dialog that fetches the key's current source and target through a new RPC method, `key.value`,
  then submits a correction through a new RPC method, `translation.editEntry`. Both methods
  register unconditionally, need no capability flag, never call a provider, and are independent of
  `--allow-spend`. `translation.editEntry` gets its own dispatch-layer rate limit, reusing the
  existing rate-limiter mechanism already built for `translation.retranslateEntry`.

  All new UI reuses the existing badge, data-table, drawer, and retranslate-action design tokens and
  component patterns; no new CSS custom property is introduced. No change to Excel export or import,
  or to any code under `packages/exchange`.

- ccd41e6: Studio's live-refresh toast now renders. Previously the SSE channel already carried a `locale`
  and a per-key `delta` (added/changed/removed counts) on every `"source"`/`"targets"` refresh
  event, but the client discarded both fields and nothing rendered them. A toast now appears for
  any event carrying a nonzero delta, showing which category changed and a summary built from the
  nonzero counts, with a manual dismiss.

  A `"source"`-reason toast (the source locale file drifted) also gets a "translate pending changes
  across all locales" action, gated on `--allow-spend`: a new RPC method,
  `translation.translatePending`, wraps the sdk's unfiltered `translate()`, the exact whole-project
  call `verbatra translate` already performs. A `"targets"`-reason toast (a target locale file's own
  content changed) never gets this action: `translate()`'s diff cannot see most target-content
  changes, so the action would either do nothing or spend on unrelated drift; the existing
  key-scoped retranslate action is the right tool for a bad target value.

  The new action is gated the same way as the existing retranslate action (`spend`), has its own
  dispatch-layer rate limit sized for its whole-project blast
  radius, and a process-wide in-flight guard answers a second overlapping call with a structured
  `ALREADY_IN_PROGRESS` (409) immediately instead of leaving it to block on the real per-locale
  lock. `StudioServerOptions` gains `translatePendingRateLimitWindowMs`/`translatePendingRateLimitMax`
  overrides, following the existing `retranslateRateLimitWindowMs`/`Max` pattern.

  `client/reconnect.ts`'s `parseRefreshEvent` now parses and passes through `locale` and `delta`,
  additive to its existing `{ reason, at }` parsing; a malformed field degrades to absent rather
  than dropping the frame. No change to the SSE wire format itself, which already carried both
  fields.

- 9ec55b6: Quiet the chrome and surface the review queue in the navigation. The header's permanent Live badge and the Settings session card are gone: a page being served at all implies a live local process, so connection state only appears while the stream is actually degraded, and the one startup fact worth keeping (whether provider actions were enabled) moves into the Configuration card. The Review nav entry now carries a live count of entries waiting for review, updated instantly by approve, reject, and accepted-edit actions.
- bc7678c: Redesign the Studio web UI around the Technical Precision visual language: an indigo primary, Inter and JetBrains Mono local font stacks, a compact 4px corner rhythm, and a constant dark-indigo navigation rail with grouped zones and documentation links. The Translations workspace now opens with a four-tile stat strip (keys needing attention, average coverage, locales in sync, last-run cost), the locale table carries count-style progress cells, the activity feed renders as a timeline, the glossary renders as a definition card, and drawers gain labeled panel headers. Translations can now be edited directly from the key detail drawer per locale when local editing is available, in addition to the existing review queue flow. All pages, RPC methods, capability gates, and accessibility behaviors are unchanged.
- 9fe4da7: Add a Usage tab showing the most recently persisted run's token totals and, when a token budget
  is configured, its ceiling, behavior, and whether it was reached. Backed by a new `usage.summary`
  RPC method, an unconditional read like the needs-review queue's own view, projecting the
  persisted run-status snapshot's run-wide `generatedAt`, `usage`, and `budget` fields unmodified.
  Never shows a fabricated `0`: a token-less provider's absent usage and an unsupported budget each
  render an explicit message instead. Displays the snapshot's own timestamp so it reads as "as of
  the last recorded run", never a live counter, and re-fetches through the same live-refresh
  plumbing every other panel already uses.

### Patch Changes

- bcd68e8: Rewrite all JSDoc from the implementation and remove non-documentation comments. Corrects stale documentation, including the read-only framing (Studio has gated write seams), the provider error-code coverage of the RPC gate, and references to removed panels.
- 7e486ed: Add `OPENAI_COMPATIBLE_API_KEY` to the exact-value redaction scrub list, alongside the four hosted providers' key environment variables, so a real key set for the `openai-compatible` provider is redacted from projected config strings and mapped error messages the same way the hosted providers' keys already are.
- dc8bf0e: Give the server's per-method throttle its own METHOD_RATE_LIMITED error code so the client no longer blames the translation provider for a purely local rate limit. The 429 answered by the RPC gate previously reused the provider code RATE_LIMITED, and the client copy table rendered it as "The translation provider is rate-limiting requests", sending users to investigate API keys and provider status for a transient local throttle. The transport 429 now carries METHOD_RATE_LIMITED and renders as "Studio is limiting how often this action can run. Wait a moment and try again." A genuine provider RATE_LIMITED, forwarded from a spend-path handler, keeps its provider-worded copy. Older clients that do not know the new code fall back to the server's own accurate message.
- 10bcf25: Let the final SSE shutdown frame flush before destroying connections on a graceful close. Destroying every socket in the same tick the frames were written discarded them before the loopback flushed, so a browser saw only a dropped connection and reconnected forever instead of showing the session-expired notice. A short grace period between the SSE hub's close and the connection teardown fixes the race; stopping the CLI now reliably lands the open dashboard on the session-expired screen. The redundant in-sync badge columns also leave the locale tables (the counts beside them already carry the same fact), and the reconnecting indicator waits out the normal connect handshake before appearing, so a fresh page load never flashes it.
- Updated dependencies [81dd225]
- Updated dependencies [a53e0c4]
- Updated dependencies [35fe0f6]
- Updated dependencies [bcd68e8]
- Updated dependencies [565eb89]
- Updated dependencies [874cf70]
- Updated dependencies [14e9719]
- Updated dependencies [0ae2f52]
- Updated dependencies [e617c6b]
- Updated dependencies [4c6fd52]
- Updated dependencies [440212e]
- Updated dependencies [54a641a]
- Updated dependencies [2127234]
- Updated dependencies [7d50d22]
- Updated dependencies [2ede9ae]
- Updated dependencies [400e044]
- Updated dependencies [e116642]
- Updated dependencies [f3fd15f]
- Updated dependencies [314aefa]
- Updated dependencies [4515726]
- Updated dependencies [ea054a2]
- Updated dependencies [d99347a]
- Updated dependencies [dfd2b77]
- Updated dependencies [435e048]
- Updated dependencies [10a264e]
- Updated dependencies [ad431ca]
- Updated dependencies [2fe16b2]
- Updated dependencies [b945e53]
  - @verbatra/sdk@0.5.0

## 0.1.0-next.6

### Patch Changes

- Updated dependencies [81dd225]
- Updated dependencies [435e048]
- Updated dependencies [ad431ca]
  - @verbatra/sdk@0.5.0-next.4

## 0.1.0-next.5

### Patch Changes

- Updated dependencies [35fe0f6]
- Updated dependencies [874cf70]
- Updated dependencies [e617c6b]
- Updated dependencies [dfd2b77]
  - @verbatra/sdk@0.5.0-next.3

## 0.1.0-next.4

### Patch Changes

- Updated dependencies [565eb89]
- Updated dependencies [4c6fd52]
- Updated dependencies [2127234]
- Updated dependencies [f3fd15f]
  - @verbatra/sdk@0.5.0-next.2

## 0.1.0-next.3

### Patch Changes

- 7e486ed: Add `OPENAI_COMPATIBLE_API_KEY` to the exact-value redaction scrub list, alongside the four hosted providers' key environment variables, so a real key set for the `openai-compatible` provider is redacted from projected config strings and mapped error messages the same way the hosted providers' keys already are.
- Updated dependencies [14e9719]
- Updated dependencies [440212e]
- Updated dependencies [54a641a]
- Updated dependencies [400e044]
- Updated dependencies [2fe16b2]
- Updated dependencies [b945e53]
  - @verbatra/sdk@0.5.0-next.1

## 0.1.0-next.2

### Patch Changes

- 4accc85: Republish through the automated release pipeline so the package carries an npm provenance attestation, matching `@verbatra/sdk` and `@verbatra/cli`. The initial release was published manually to bootstrap npm's Trusted Publishing for a brand-new package, which cannot generate provenance outside a CI environment; no functional change.

## 0.1.0-next.1

### Minor Changes

- bc0be98: Publish `@verbatra/studio` to npm as an optional companion package to `@verbatra/cli`. It can now be installed directly (`npm install @verbatra/studio`) or added alongside the CLI so the `verbatra studio` command has the dashboard available. This is a packaging change only; the dashboard itself works the same as before.

## 0.0.1-next.0

### Patch Changes

- Updated dependencies [5597f98]
- Updated dependencies [4a789ff]
  - @verbatra/sdk@0.5.0-next.0
