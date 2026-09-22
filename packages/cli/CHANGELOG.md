# @verbatra/cli

## 0.11.0

### Minor Changes

- [#221](https://github.com/verbatra/verbatra/pull/221) [`3239884`](https://github.com/verbatra/verbatra/commit/3239884a88eeee61a86efe1a45350d6e6f81f043) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Add a keyless pre-run cost estimate: `verbatra translate --estimate`.
  
  The estimate reuses the dry-run plan, so it constructs no provider, reads no API key, makes no
  network call, and writes no file. It reports how many keys would be sent, how many provider
  requests they would be split into, and the billing quantity the configured provider actually
  charges for: estimated prompt and completion tokens for the LLM providers, estimated source
  characters for DeepL and Google Cloud Translation.
  
  verbatra still ships no prices of its own. A currency figure appears only when the config carries
  a new optional `rates` block naming the date the rates were read, the currency code, and a table
  of rates keyed by `provider/model`. Every figure is printed beside that date, so a stale number is
  visibly stale. A provider or model with no rate on file is reported as such, with the exact config
  key to add, rather than as a cost of zero; a rate written in the wrong unit is refused rather than
  applied; and a self-hosted `openai-compatible` endpoint is reported as carrying no API cost at
  all. `RunEstimate` is a union discriminated on `pricing`, so a priced estimate always carries its
  figure, its currency and its date, and an unpriced one carries none of them.
  
  The figure bounds the plan, not the invoice. Every provider call a live run schedules is counted,
  including the plural-generation batches, which are a separate call path from the translation
  batches; the prompt is measured by serializing the payload that would be sent rather than by
  modelling its shape, so a configured glossary and tone are counted in every request they travel in;
  and the response is sized from the source value plus a 50 percent expansion allowance, because the
  translation does not exist yet and completion tokens are the expensive half of every rate card.
  Against that plan a live run usually spends less, because it consults the translation memory and
  collapses identical source strings.
  
  It can also spend more, and `estimate excludes` names every way: the provider SDKs retry a failed
  call underneath each counted request (two extra attempts on Anthropic, OpenAI and
  openai-compatible, two on Gemini's own loop, five on DeepL), an incomplete response triggers a
  repair round that re-sends the system rules, glossary and tone in full, a target language can
  expand past the allowance, and the token figure is a character heuristic rather than the provider's
  own tokenizer. The estimate covers `translate`; `retranslateEntry` calls a provider on its own path
  and is not counted here.
  
  A dry run now also reports the plural forms it would generate, whether or not an estimate was asked
  for.
  
  `RunSummary.estimate` carries the whole breakdown as structured fields, per locale and in total,
  so `--json` consumers get the numbers rather than a rendered string.

- [#221](https://github.com/verbatra/verbatra/pull/221) [`784889f`](https://github.com/verbatra/verbatra/commit/784889f6dc08c1e56a4a7751bb135d7422f9b021) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Add a read-only consistency report: `verbatra check --consistency`, and `consistency: true` on the SDK's `check`, list every source string that a target locale translates more than one way under different keys. Each finding names the source string, every distinct translation, and the keys holding each one, so the wording can be aligned by hand.
  
  The report is opt-in and changes nothing else. It never changes `inSync`, a count, or the exit code, never withholds or rewrites a value, never enters `integrityMismatches`, and never adds a review reason to `needsReview`. Like the rest of `check`, it constructs no provider and needs no API key. Without the flag the output is exactly what it was.
  
  Each `LocaleCheckSummary` carries the findings as `inconsistencies`, an array of the newly exported `InconsistencyGroup` type: `{ source, context?, description?, meaning?, isPlural, pluralForm?, translations }`, where each `InconsistentTranslation` is `{ value, keys }`.
  
  The comparison follows one rule on both sides: values are compared after Unicode NFC normalization, folding `\r\n` to `\n`, and trimming leading and trailing whitespace, so a translation that differs only in surrounding whitespace is not a finding, while internal whitespace and letter case still count. Only up-to-date keys are compared, since a stale key's translation belongs to an older source text. Keys whose description, meaning, plural flag, or gettext `msgctxt` differ are never grouped, because that metadata exists to allow a different translation. Plural forms are compared per form: in a format that stores each form under its own key (i18next, Apple `.stringsdict` and `.xcstrings`, Android `<plurals>`, gettext `msgstr[n]`), the forms of one key are never grouped with each other, while the same form under different keys still is, and the group names that form as `pluralForm`. A translation identical to its own source is not a finding here; that remains the `EQUALS_SOURCE` review reason.
  
  Groups are sorted by source string, translations by value, and keys by name, all by UTF-16 code unit, so the same catalog always produces the same report. The report groups keys in a single hash-map pass over the catalog.

- [#221](https://github.com/verbatra/verbatra/pull/221) [`d4568f7`](https://github.com/verbatra/verbatra/commit/d4568f7a68b7c08efd2223ee122b706a978dd2dc) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Add opt-in fuzzy reuse of the translation memory. With `fuzzyCache: { enabled: true }` in the config, a source string that changed only slightly reuses the translation of its earlier form instead of being sent to the provider, as long as the two are at least `fuzzyCache.threshold` alike (a similarity ratio from `0.5` to `1`, default `0.9`). The feature is off by default, so no existing run changes behavior.
  
  A fuzzy reuse is never presented as an exact one, and never lands silently. It carries the new `FUZZY_CACHE_REUSE` review reason on every run whatever it scored, so it appears on `needsReview` and in Studio's Review queue as "Reused after source edit"; it also lands in a new `LocaleSummary.fuzzyHits` bucket carrying the key, the score, and the earlier source text the translation was actually produced for, which `runStatus` now persists so a tool opened after the run can still show what was reused and from what. The CLI prints it as its own `fuzzy-reused` count with those details underneath. It passes the same integrity gate every other candidate value passes, so a reuse whose placeholders no longer fit the edited source is refused and the key goes to the provider. It is also never written back into the cache, so a reused value can never be laundered into an exact hit on a later run. `--no-cache` bypasses it along with the rest of the cache.
  
  A reuse is written to the locale file but deliberately not locked: the key keeps the lock-file baseline it already had, so it stays changed and is offered, flagged and listed again on every later run, at no provider cost, until a real translation lands and locks normally. That is what makes the "on every run" promise true rather than a single chance to notice, and it means `check` keeps reporting the key as out of date, which it is. Editing only an entry's description, meaning or plural flag leaves the source text identical, and such a key is never handled by the fuzzy layer at all: it goes to the provider exactly as it would with the feature off, so the new guidance is actually applied.
  
  The threshold is a spend dial, not a safety dial, and the default of `0.9` is set on that understanding. Similarity is measured in characters and meaning is not a function of character distance: a dropped negation, an inverted modal or a swapped proper noun all score above `0.9`, and a single changed letter late in an eighty-character string scores `0.987`, past anything the schema accepts. Safety therefore comes from the parts that do not depend on the number: the feature is off by default, every reuse is flagged for review, and an entry whose numerals differ from the current source in count, value or order is refused outright whatever it scores, because a changed number is always a changed fact and is the one meaning-changing edit recognizable without knowing the language. The numeral rule covers every Unicode numeric character, so a superscript, a vulgar fraction or a Roman numeral character counts as much as an ASCII digit; a number written as a word does not, and is left to the review flag.
  
  `ReviewReasonCode` is now derived from an exported `REVIEW_REASON_CODES` tuple, so a runtime validator or an exhaustive lookup can be built from the set rather than retyping its members.
  
  Scoring needs the source text, which the cache did not store, so `verbatra.cache.json` moves to schema version 2 and gains a `sources` block mapping each content hash to the text it stands for. The file grows by roughly the size of the source corpus. A version 1 cache is carried forward rather than rejected: its translations keep working as exact hits and their source text refills as later runs touch them. Going the other way, a version 1 build reading a version 2 file takes the existing unrecognized-version path, reporting `CACHE_VERSION_UNRECOGNIZED` and leaving the file untouched, so a downgrade costs a cold cache and never a wrong translation.

- [#221](https://github.com/verbatra/verbatra/pull/221) [`2ae0960`](https://github.com/verbatra/verbatra/commit/2ae09606a20961e475018447d18db9a9c12da74e) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Add per-key maximum length budgets for translated values.
  
  A new optional `maxLength` config key maps a translation key to the longest translated value that
  key may hold, for a string under a layout constraint: a nav label, a button, a table header. A key
  absent from the map has no budget and is never measured, so the check costs nothing for a project
  that configures none.
  
  A budget is checked whenever `translate` produces a value for that key: a fresh translation, a
  value reused from the cache, and a value fanned out to a key that shares its source text. A key
  already translated and still in step with its source is not retranslated and so is not measured,
  which means adding budgets to a finished project flags nothing until those keys next change.
  `export --include-unchanged` recomputes its review columns for every row it writes, so it is how
  you sweep a catalog that is already translated.
  
  `REVIEW_REASON_CODES`, the tuple every reason code is drawn from, is now exported too, so a
  consumer can build its own validator or exhaustive lookup from it instead of retyping the members.
  
  Length is counted in grapheme clusters: the characters a reader perceives, rather than UTF-16 code
  units or Unicode code points. An emoji assembled from several code points counts as one, and so
  does a letter followed by a combining accent. The value is measured exactly as written, leading and
  trailing whitespace included, and the comparison is inclusive, so a value of exactly the budget is
  not flagged.
  
  Going over budget is advisory, not blocking. It surfaces as a new `MAX_LENGTH_EXCEEDED` review
  reason on the run summary's `needsReview` list, in the workbook's review columns, and through the
  retranslate flow; the value itself is still written to the locale file and still recorded in the
  lock file, because a correct translation that overruns a layout budget is more useful than no
  translation. The reason never enters `integrityMismatches`, which stays reserved for output the
  integrity gate refuses to write.
  
  The budget is read from the config map and nowhere else: it is never derived from an entry's
  description or from a format's own length metadata, and a misspelled top-level key is rejected at
  config load rather than silently ignored. A value served from the translation-memory cache, and a
  value fanned out to a key that shares its source text, are held to their own key's budget rather
  than the budget of the key that was translated.

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

- [#221](https://github.com/verbatra/verbatra/pull/221) [`eca295f`](https://github.com/verbatra/verbatra/commit/eca295fc24937a91b4064ac909e733ac2e1f15df) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Generate TypeScript declarations for your catalog keys and their message arguments
  
  `generateTypes` reads the source catalog through the configured format adapter and writes a declaration file: a union of every key the catalog holds and, per key, the arguments its message interpolates. Type a translation function against it and a misspelled key or a missing interpolation argument becomes a compile error instead of a runtime lookup failure.
  
  The new `verbatra types` command runs it, and `verbatra types --check` exits 1 when the committed declaration no longer matches the catalog, which is the shape a CI gate wants. Neither constructs a provider, reads an API key, nor makes a network request.
  
  Keys are exactly what the adapter produced, in document order, so two runs over an unchanged catalog write byte-identical bytes. Every key is emitted as a quoted string literal, so one carrying a dot, a reserved word, a leading digit, a quote or nothing at all is declared verbatim. For `next-intl-json` and `arb`, each message is read with the same ICU parser the adapter uses, so an argument only some `select` or `plural` branches use is declared as optional instead of being left out, and one every branch uses stays required. A numbered argument only some branches use becomes an optional trailing tuple position when every position after it is optional too. Arguments are typed by how the message formats them: `plural`, `selectordinal` and `number` declare `number`, ICU `date` and `time` and an i18next `datetime` formatter declare `Date | number`, `select` declares `string`, and a plain argument keeps `string | number`. A name used more than once with different types is declared as the union of what each use accepts, so `{d, date, short}` next to a plain `{d}` declares `Date | number | string`. An i18next unescaped interpolation such as `{{- name}}` is declared as `name`. A message whose syntax the adapter reported as invalid, one that appears to both name and number its arguments, and one whose placeholder index is out of range are all declared with their arguments reported as undetermined rather than silently declared as taking none, and they are not counted among the keys taking arguments.
  
  The output path is refused before anything is read or written when it names no file, is absolute, climbs out of the working directory, is not a TypeScript file, or names a locale file, the lock file, the translation-memory cache, a file verbatra searches for its configuration, or the config file the run actually loaded, including one named with `--config`. A generating run also refuses to replace an existing file that does not begin with the header verbatra writes (ignoring a leading byte order mark and blank lines) or is too large to verify, and leaves it untouched; `--check` only compares.

- [#221](https://github.com/verbatra/verbatra/pull/221) [`54ff539`](https://github.com/verbatra/verbatra/commit/54ff5396426c91d05f82042976ca3e037bca35c5) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Add two format adapters: `ini` for classic INI files, and `resx` for .NET XML resource files.
  
  `ini` reads one level of `[section]` headers over `key=value` lines, addressed as `section.key`, and guards single-brace placeholders. `resx` reads `<data name>`/`<value>` pairs, carries a `<comment>` across as the entry description, and guards .NET composite format items including alignment and format specifiers.
  
  Both write by patching the destination document in place, so comments, spacing, the `.resx` schema preamble, and `.resx` entries holding serialized objects or designer metadata survive untouched.

- [#221](https://github.com/verbatra/verbatra/pull/221) [`47b22da`](https://github.com/verbatra/verbatra/commit/47b22da37106cbfddf077266a66f6880576ed03c) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Add pseudolocale generation: a new `pseudolocalize` SDK entry point and a `verbatra pseudo` command that build a fake locale from the source strings alone, so layout truncation and untranslated hardcoded strings show up before any API key exists.
  
  Every value is accented, expanded by roughly a third of its translatable length and wrapped in `[` and `]` boundary markers, while placeholders stay untouched in every syntax the shipped adapters recognise, including ICU plural and select arms, markup tags and escape sequences. Each generated value is held to the same integrity gate a provider translation must pass; one that would not pass it is copied from the source verbatim and reported rather than written broken.
  
  The run constructs no provider, reads no API key and makes no network request. Output goes to `.verbatra-local/pseudo` by default, which the scaffolded ignore list already covers, and a pseudolocale that names a configured locale or would land on a configured locale file is refused, so `translate` never spends on it and `check` and `diff` never report it as drifted.

- [#221](https://github.com/verbatra/verbatra/pull/221) [`d9d77b4`](https://github.com/verbatra/verbatra/commit/d9d77b408138f024b304631b264d762eabd00f68) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Add source string extraction: a new `extract` entry point and `verbatra extract` command that scan
  your application source for i18next translation call sites and add the keys they find to the source
  locale catalog, so verbatra now works on a project that has no catalog yet.
  
  The run spends nothing: it constructs no provider, reads no API key environment variable, and makes
  no network request. Only the source locale file is written, and only genuinely new keys are added,
  so a value already in the catalog is never overwritten. A run that finds nothing new writes nothing
  at all.
  
  Configure it with a new optional `extract` block naming the framework and the source roots. A call
  site whose key is not a static string, a key found with two conflicting defaults, and a file that
  could not be read are all reported in the result rather than guessed at or thrown. `--dry-run`
  previews the additions and `--json` prints the usual envelope.
  
  A namespace-qualified key such as `t("common:nav.home")` is reported as dynamic and never written:
  one config addresses one catalog file, so a project that spells a namespace at every call site gets
  a run that adds nothing. That limit is the first thing to lift once multi-namespace projects are
  supported.
  
  `SdkFs` gains an optional `readDirectory` member, which is what the scan discovers source files
  through. It is optional, so an existing `deps.fs` implementation keeps working; `extract` reports a
  file system without it as `EXTRACT_FS_UNSUPPORTED`.

- [#221](https://github.com/verbatra/verbatra/pull/221) [`9659fff`](https://github.com/verbatra/verbatra/commit/9659fff529d8d6a509947fa3dad68dca11558dba) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Let a format adapter ship outside verbatra.
  
  A format is now named either by one of the built-in names or by a `custom:` identifier: a reserved
  prefix followed by a lowercase, hyphen-separated name, such as `custom:toml`. The built-in set is
  unchanged and still closed, and no built-in name contains a colon, so a third-party identifier can
  never shadow one. A config naming a `custom:` format loads; a config naming an unknown bare name is
  still rejected, and the shape reaches the shipped JSON Schema document as a pattern, so an editor
  validates it too.
  
  Everything needed to build an adapter is now reachable from `@verbatra/sdk` itself:
  `createFlatFileAdapter` and `createTreeFileAdapter` with their option types, the `AdapterFs`
  file-system port and `nodeAdapterFs`, `createDefaultRegistry` and `AdapterRegistry`, `AdapterError`
  and `AdapterErrorCode`, the `FormatAdapter` and `ReadResult` contract, the `FormatId`,
  `CustomFormatId` and `isCustomFormatId` identity helpers, and the callback and tree types the two
  options interfaces are written in terms of, so an adapter's own signatures can be given type
  annotations without redeclaring them. A consumer that depends only on the
  published package can compile and register an adapter for a format verbatra does not ship, and hand
  it to any flow through the `adapterRegistry` dependency those flows already accept.
  
  Registry behaviour changed in three ways. Registering a second adapter for a format the registry
  already holds now raises `DUPLICATE_FORMAT` instead of being accepted and shadowed by whichever
  adapter registered first. An adapter whose `custom:` identifier is malformed is refused with
  `INVALID_FORMAT_ID` rather than registered without the containment wrapper. And an adapter with a
  well-formed `custom:` identifier is wrapped so an unexpected throw from any of its contract methods
  surfaces as `ADAPTER_FAILED` naming the format, rather than as an unattributed stack trace; an
  `AdapterError` the adapter raised itself and an error carrying an errno code still travel unchanged.
  
  The flat-file factory gained the two things the tree factory already had, so an adapter built on it
  is no longer second-class: an optional `comparePlaceholders`, and the ability to report skipped
  content by returning `{ entries, excludedLeafPaths }` from `parseEntries` instead of a bare map.
  Both are additive and every existing implementation keeps compiling. The Android adapter now uses
  the second one, so a `translatable="false"` resource is reported as excluded rather than dropped
  silently.
  
  A plugin is fully trusted code, at the trust level of any other dependency the project installs.
  verbatra does not sandbox it, and because the adapter decides what counts as a placeholder, a buggy
  or hostile one can make the placeholder-integrity check pass vacuously for its format. Loading is
  never implicit: verbatra discovers nothing on its own, and a plugin is reached only by the
  project's own code importing it and supplying the registry.

- [#221](https://github.com/verbatra/verbatra/pull/221) [`b5c3afd`](https://github.com/verbatra/verbatra/commit/b5c3afd15b65697c7dad9fed2e4e63179f925e48) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Read and write the translation memory as TMX, the interchange format every mainstream translation
  platform can produce and consume: `verbatra tmx import <file>` and `verbatra tmx export [file]`,
  `importTmx` and `exportTmx` from the SDK. A team arriving with years of accumulated memory no longer
  starts cold, and a team leaving can take theirs.
  
  Both directions are keyless and cost nothing. Neither constructs a provider, reads an API key, nor
  makes a network call: every value comes from the file or from the memory already on disk.
  
  An imported file is untrusted third-party XML and is treated as such. Its size is bounded before the
  parser sees it. The prolog is scanned as a prolog rather than by searching the raw bytes, so the
  decision about doctypes and entity declarations is made only on the region before the root element
  and can neither cut payload out of a data section nor refuse a translation that happens to discuss
  an entity declaration. Every doctype in the prolog is inspected, not just the first; an internal DTD
  subset or an entity declaration is refused outright, so neither an external entity reference nor an
  unbounded expansion can be reached; a greater-than inside a system identifier does not end the
  declaration early; and the bare external doctype that real writers emit is discarded rather than
  fetched. Unit, language and segment-length bounds are enforced during the walk, the root element
  must be `tmx` in no namespace or the TMX one, and a well-formedness error the parser reports as
  non-fatal is treated as fatal, so an undeclared entity reference cannot survive as literal text.
  
  A refused file never produces a raw parser error or a hang. `importTmx` throws an `SdkError` with
  code `SOURCE_INVALID` whose message names the file and what failed, and, when the problem has a
  place in the file, its line, column and, inside a translation unit, the unit's 1-based ordinal.
  `tmxErrorLocation(error)` returns the same place as a structured `TmxErrorLocation`, or `undefined`
  for any other error, so a caller never casts the error or its `cause`. A parser's own description is
  kept readable, without the nested `Error: ` prefix or a space before the closing period, and
  `verbatra tmx import` prints that message on its error line and in the `--json` error envelope, so a
  mismatched closing tag in the second unit and a truncated file are reported as two distinct, located
  refusals.
  
  Nothing lands in the memory unchecked. Every candidate translation passes the same placeholder,
  inline markup, ICU, degeneracy and emptiness gate that provider output and a filled translator
  handoff already face,
  enforced where the record enters the store rather than left to the run that later reads it, so a
  record that was never validated can never be served as a reuse. A unit whose source segment is blank
  identifies no string and is refused. Inline markup is flattened to its text, which the placeholder
  check then catches if the markup carried anything that mattered; the text of a `sub` element, a
  sub-flow such as a tooltip embedded in that markup, is not part of the segment's string and is left
  out. Every refusal, skip, flattening and left-out sub-flow is counted and reported. A unit refused
  for inline markup is counted under `rejected.markup` and `verbatra tmx import` prints a line for
  those refusals, so a translation memory from another tool cannot slip a tag its source never had
  (such as an injected `<img onerror>`) into the memory.
  
  A language tag resolves against the source locale and every configured target locale at once, by an
  explicit rule. After lowercasing and folding underscores to hyphens, an exact match wins, so
  `pt_BR`, `pt-br` and `pt-BR` are one locale. Failing that, a tag resolves onto a configured locale
  that is a strict subtag prefix of it, and when several are, onto the longest, as RFC 4647 lookup
  does: a file written in `en-US` lands in a project configured for `en`, and `de-AT-1996` lands on
  `de-AT` in a project configured for `de` and `de-AT`. A shorter tag widens onto a configured locale
  that begins with it only when every subtag the locale adds is a region or a variant, never a script,
  so a file written in `de` lands in a project configured only for `de-DE` while `sr` never lands on
  `sr-Latn` and `zh` never on `zh-Hant-TW`; a prefix of the tag always takes precedence, and among
  several longer locales the nearest wins. Two tags whose script or region subtags differ never match,
  so `zh-CN` is never stored as `zh-TW`, `sr-Latn` never as `sr-Cyrl`, and `de-AT` never as `de-CH`;
  such a tag is reported as unmatched rather than guessed at, and a tag is reported as ambiguous only
  when the configured locales it could reach do not lie on one prefix chain. Resolving against the
  whole configured set in one pass is what keeps a regional target such as `pt-BR` from being taken
  for the bare `pt` source it extends. Source segments are ranked like target segments: an exact tag
  outranks a prefix match and identical values agree, so `en` and `en-US` both reading "Save" import
  normally, while a unit whose equal-ranked source segments carry different values is refused rather
  than attributed to whichever came last, and a config whose source and one target are the same tag
  once normalized is refused outright.
  
  Two target segments of one unit that resolve to the same configured locale never let the last one
  silently win. An exact tag always outranks a segment that only reaches the locale by subtag prefix,
  so `de` beats `de-CH` in a project configured for `de`. Two segments of equal standing that carry
  different values store nothing for that locale in that unit and are counted per locale as
  `conflicting`, shown in the human summary and carried in the `--json` result; the unit's other
  locales still land, and two segments carrying the same value are not a conflict.
  
  Tags matching nothing configured are counted per tag, as are units skipped, units with no source
  segment, units whose markup was flattened, and `tu` elements sitting outside the file's first
  `body`. A header `srclang` that is not the configured source locale is reported rather than ignored.
  
  Imported units are stored under the project's current configuration fingerprint, the same key a real
  run writes, so an imported memory is reused exactly when the configuration that would consume it
  matches and stops matching when the provider, model, tone or glossary changes. Where an imported
  unit disagrees with a translation the project already holds, the project's own translation wins and
  the imported one is counted as kept; `--overwrite` reverses that. Importing the same file twice
  therefore changes nothing the second time and writes no file at all.
  
  One consequence is stated plainly in the published docs rather than left implicit, because no
  import-time check can police it: an accepted unit's source text lands in the memory's source index,
  which is what fuzzy reuse scores a changed string against. An imported source that differs from a
  project string can therefore be served for it by fuzzy reuse, which is what resemblance means. An
  imported source that is identical to a project string but hashes differently is not reachable at
  all: fuzzy reuse discards any candidate whose normalized source equals the query, so a project entry
  carrying a description, a meaning, or a plural flag that a TMX unit cannot carry falls through to
  the provider instead. A fuzzy reuse still faces the integrity gate against the real entry and is
  reported as a `FUZZY_CACHE_REUSE` review flag, so it is visible; a project that does not want an
  imported memory reachable that way should leave `fuzzyCache` out of its config.
  
  Export refuses the same configuration import refuses: a source locale and a target locale that are
  one tag after normalizing case and separators would produce two language attributes the import could
  not tell apart, so the file a project exported would be one it could not read back.
  
  A narrowed run reports the configured locales it left out, so `--locales de` on a file that also
  carries French does not read like a file holding less than it does.
  
  Export writes one `tu` per distinct source string with the source segment and one target segment per
  exported locale, escaping segment text so markup inside a value stays data and a carriage return
  survives a reader's line-ending normalization, and removing the characters XML 1.0 cannot represent
  at all, lone surrogates and noncharacters included, so the artifact is one a conformant parser
  accepts. How many characters were removed is returned as `illegalCharactersRemoved` and reported by
  `verbatra tmx export`. Language tags are written in BCP 47 form whatever spelling the config uses:
  underscores become hyphens, the language is lowercase, a script is title case and a region
  uppercase, so a project configured for `en_US` and `pt_BR` writes `srclang="en-US"` and
  `xml:lang="pt-BR"`, and that file re-imports into the same config unchanged. How verbatra keys its
  memory is not affected. An empty memory produces a valid, empty TMX file rather than an error. The
  cache schema is unchanged: export reads the source text the memory already stores beside each entry,
  and an entry carried forward from a cache written before that block existed is left out and counted
  rather than written without a source.

- [#221](https://github.com/verbatra/verbatra/pull/221) [`6dec4dd`](https://github.com/verbatra/verbatra/commit/6dec4dda4a03706b769bc4abef8161963eb88ab8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Add `verbatra doctor --literals`, a keyless lint that flags hardcoded user-facing strings that never
  made it into a translation catalog.
  
  It scans the source roots of the `extract` block and reports every JSX text node, user-facing JSX
  attribute (`alt`, `title`, `placeholder`, `label`, `aria-label` and similar), and prose-like string
  literal that does not go through a recognised translation call. Each finding carries its file, line,
  and column, and its text has whitespace collapsed, JSX character references such as `&amp;` decoded,
  and is cut to at most 80 characters. The scan prefers staying quiet to being noisy: a literal passed
  to `t()` (also when renamed, as in `const { t: translate } = useTranslation()`, from that
  declaration to the end of its block) or rendered inside `<Trans>` or `<Translation>`, an object key,
  an import specifier, a class name or CSS value, a test id or `data-*` attribute, an attribute that
  holds ids or a keyword (`aria-describedby`, `aria-labelledby`, `rel`, `sandbox`, `autoComplete`,
  `referrerPolicy` and similar), a URL, a literal in a type position (including one after `as` or
  `satisfies`), a logging message, the message of a constructed error (`new ValidationError(...)`) or
  of a built-in error called without `new` (`throw Error(...)`), a comparison operand, a literal with
  no letters, and test, story, declaration and config files are never reported, and a single word
  outside JSX is not reported either. The direct string arguments (a string that is a whole argument
  on its own) of `describe`, `query`, `execute`, `prepare`, `format`, and `parse`, the string elements
  of the array passed directly to `z.enum`, every string argument of `setItem`, `getItem`, and
  `removeItem`, and the first argument of `on`, `off`, `once`, `emit`, `addEventListener`, and a
  member `get` or `set` call, are skipped too. A string nested deeper inside one of those calls, such
  as in a callback, an object, or JSX, is still checked. A function that only ends in `Error`, such as
  `setError`, is still checked.
  
  A `// verbatra-ignore-next-line` or `// verbatra-ignore-line` comment (also as `{/* ... */}` in JSX)
  holds a literal back at the call site. A next-line directive targets the next line that holds code
  (blank and comment-only lines are skipped) and covers what starts on that line, plus every attribute
  of a JSX opening tag that starts there, even across lines; text and nested elements on later lines
  need their own directive. The new optional `extract.literals.ignore` list holds exact texts back
  project-wide, matched against the text as reported (whitespace collapsed, character references
  decoded). Held-back literals are still listed, under `suppressed`, with the reason.
  
  The lint reads source and never writes it, constructs no provider, reads no API key environment
  variable, and loads no `.env` file, so it passes with no key set. In this mode `doctor` runs the
  config check and the literal check only. It exits `0` when nothing was found, `1` when a literal was
  found or a file could not be scanned (a file the scanner cannot read to the end, such as one with an
  unterminated comment or template literal, or with a JSX element that never closes or is closed by an
  enclosing element's tag, is a diagnostic, never a silent pass; a generic function type such as
  `<T>(x: T) => T` or a type parameter list such as `<const T = "a">(x: T) => x` in a `.tsx` file is
  read as code and never fails the file, and type arguments of any length on an element are skipped),
  and `2` when it cannot run. `--json` prints the usual envelope with the scan under
  `result.literals`. `doctor({ literals: true })` is the SDK entry point, and `DoctorResult.literals`
  carries the same data.

- [#221](https://github.com/verbatra/verbatra/pull/221) [`21cd75f`](https://github.com/verbatra/verbatra/commit/21cd75f32a5bc9c686d8fcf5ba07ff23a348c429) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Report source-catalog keys that your application source no longer references:
  `verbatra diff --unused`, backed by `diff({ config, unused: true })`, scans the source roots named
  by the `extract` block and adds an `unused` report to the diff summary.
  
  The report is a separate axis from each locale's `orphaned` list: a key is orphaned when a target
  locale still carries it after it left the source catalog, and unused when the source catalog still
  carries it after the code stopped naming it. The two lists are never merged, and an unused key
  never flips `hasPendingChanges`.
  
  It is read-only like the rest of `diff`: it never removes, rewrites, or reorders a catalog, it
  constructs no provider, and it reads no API key environment variable.
  
  The scan models the i18next runtime. A key counts as referenced when a `t` call names it, including
  a call through a `t` alias (`const { t: translate } = useTranslation()`, `const tr = i18n.t`), a
  `Trans` element's static `i18nKey`, a namespace-qualified key (`common:nav.home`) or a
  natural-language key (`Loading...`), a key under a static `keyPrefix` option or `getFixedT` prefix,
  every key of a static key array (`t(["a", "b"])`), and a plural or context variant of any of those.
  Keys are compared in the catalog format's own encoding, so a flat dotted JSON key, a gettext plural
  or `msgctxt` entry, and an Android plural all match the key your code names.
  
  The report is `complete` only when the scan can bound every key the source reaches:
  
  - A template-literal key with a static head (`` t(`nav.${page}`) ``) lists the keys under that head
    as `possiblyDynamic`, apart from `unused`.
  - A fully dynamic key, a non-literal key prefix, a `Trans` element without a static `i18nKey`, `t`
    assigned to something other than a plain variable, template files the scan does not read
    (`.vue`, `.svelte`, `.html`, and similar), or a file it could not read make the report
    `unreliable`, with each reason and its sites.
  - The scan only trusts translate functions it sees being created in a recognised shape: a local
    `const { t } = useTranslation(...)` with static arguments, a local `getFixedT(...)` with static
    arguments (a named language such as `i18n.language` may come first), a direct `i18n.t(...)` call
    or local `i18n.t` alias, a `t` destructured from the instance in a local, non-exported
    declaration (`const { t } = i18next`, `const { t: tr } = i18n`), a `Translation` render prop,
    `withTranslation("ns")(Component)`, or `import { t } from "i18next"`. Any other use of those
    sources (a wrapper hook, options passed by name, an exported `getFixedT` result, `t` destructured
    from a member of the instance, with a default value, or in an exported declaration) is reported
    as `unrecognised-translate-source`, and a
    translate function used anywhere but a direct call, its own binding, a local alias, the `t={t}`
    attribute of `Trans` or `Translation`, or a React hook dependency array (for example passed as an
    argument, exported, or used in a ternary) is reported as `translate-function-escapes`. Every
    binding named `t` or `$t` is checked this way, whatever it is bound from: a function parameter
    named `t` is fine while it is only called, and a `t` declared or destructured from anything
    unrecognised is `unrecognised-translate-source`. Both reasons make the report `unreliable`.
  - The report is `not-run`, with a reason code and no key list, when there is no `extract` block, the
    format is `next-intl-json`, `vue-i18n-json`, or `ngx-translate-json` (runtimes the scan does not
    model), there is no source file under the roots, or the scanned files reference no key at all.
  
  Each listed key carries its decoded `key` (`Welcome. Enjoy`) and its `catalogKey` as the adapter
  spells it. A new optional `extract.unused.ignore` list excludes keys referenced only from outside
  the scanned source, such as a server template, a CMS, or a test fixture. Each entry is an exact
  decoded key or a pattern in which `*` matches any run of characters. An excluded key is listed under
  `ignored`, never dropped silently. The field is part of the shipped config JSON Schema.
  
  `diff --unused` exits `1` when anything is pending or a `complete` scan lists at least one unused
  key. Possibly dynamic keys, ignored keys, and an `unreliable` or `not-run` report never produce exit
  `1` on their own. `--json` carries the whole report inside the usual `diff` envelope. Without
  `--unused`, `diff` scans nothing and behaves exactly as before.
  
  The source scan behind `verbatra extract` and the unused-key report reads a regular expression
  after a `<` operator correctly while keeping a JSX closing tag as markup.
  
  A `${...}` substitution inside a template literal is read by the same token scanner as the rest of
  the file, so a regular expression inside it (as in `` `"${v.replace(/"/g, '""')}"` ``) is
  recognised by the same rule, including its character classes, escapes, and flags, and a quote, a
  backtick, `//`, `/*`, or a brace inside that regular expression never starts a string, template,
  comment, or block. Templates nested inside substitutions are read without recursion and in time
  proportional to the nesting depth, so deeply nested templates cannot exhaust the stack, and a line
  continuation (a backslash at the end of a line) in a template nested inside another template's
  substitution does not shift the line reported for any call site after it.
  
  In a `.tsx`, `.jsx`, or `.js` file, the same scan now reads JSX text and quoted attribute values as
  markup rather than as code, so an apostrophe in them (`<p>Don't worry</p>`) never hides a call,
  never pairs with another apostrophe to swallow the code between, and a word such as `t` in them
  never counts as a use of the translate function. Such a file whose JSX element never closes, or
  whose quoted string in code runs into the end of its line, is reported as an `unparseable`
  diagnostic by `verbatra extract` and makes the unused-key report `unreliable` with
  `incomplete-scan`, rather than being judged from a partial reading. `.ts`, `.mts`, `.cts`,
  `.mjs`, and `.cjs` files are read as code only, as before.

### Patch Changes

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

## 0.10.0

### Minor Changes

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Add `android-xml`, a new supported format, for Android's `res/values/strings.xml`
  and `res/values-<qualifier>/strings.xml` resource files. Plurals are read and
  written as separate entries per quantity (`zero`, `one`, `two`, `few`, `many`,
  `other`), and printf-style placeholders (`%s`, `%1$s`) are guarded across
  translation. Entries marked `translatable="false"`, `<string-array>` elements, and
  strings containing inline markup are left untouched. Writes preserve existing file
  structure and create missing destination directories.

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Add `apple-strings`, a new supported format, for Apple's `.strings` localization
  files (flat `"key" = "value";` pairs) and their sibling `.stringsdict` plural
  files, both addressed through the same format id. Printf-style placeholders
  (`%@`, `%d`, `%1$@`) are guarded across translation, and CLDR plural categories
  round-trip as separate entries with no fabricated or dropped categories. A
  UTF-16 `.strings` file is rejected with a clear error instead of being parsed
  into corrupt data. Writes preserve existing key order, comments, and
  non-translatable `.stringsdict` structure, creating missing `.lproj` directories
  as needed.

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Add `apple-xcstrings`, a new supported format, for Apple's Xcode String Catalog
  (`.xcstrings`) files, which hold every locale in one JSON document rather than
  one file per locale. Plural categories and printf placeholders are handled the
  same way as the `apple-strings` format. Because all locales share one physical
  file, writes to an `apple-xcstrings` catalogue are serialized, so concurrency
  above 1 no longer parallelizes operations for this format specifically. Writes
  patch only the touched localizations, leaving everything else in the document
  untouched.

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Add `gettext-po`, a new supported format, for GNU gettext `.po` and `.pot`
  catalogs. `msgid`/`msgstr` pairs become entries, `msgctxt` disambiguates entries
  sharing a `msgid`, and plural forms round-trip as separate entries keyed by
  their `msgstr[n]` index. Comments, references, flags, and the header block are
  preserved on write. Printf-style (`%s`, `%d`, `%1$s`) and Python-style
  (`%(name)s`) placeholders are guarded across translation. Known limitation: a
  plural form present only in a target locale cannot always be distinguished from
  a removed key, which only matters when `--prune` is enabled.

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Add `google-translate`, a new translation provider, for Google Cloud Translation
  Basic (v2). Like DeepL, it is a machine-translation API rather than a language
  model, with no tone control and no glossary support in v1; it reads
  `GOOGLE_TRANSLATE_API_KEY` from the environment. Entries containing
  placeholders or ICU syntax are withheld and reported rather than sent to the
  API. Registered end to end: the provider factory table, config schema,
  `verbatra init` scaffolding, and the CLI `--provider` option.

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

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - `@verbatra/sdk` adds `localeValues`, a bulk read returning every key's current
  source and target text across requested locales in one pass, without needing
  to fetch each key individually through `keyValue`. It backs client-side content
  search over translation values, not just key names. Read-only: it writes
  nothing and calls no provider.

### Patch Changes

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Deduplicate shared session/spend/missing-package helper logic between the `mcp`
  and `studio` CLI commands, and fix the CLI's local copy of MCP server types
  drifting out of sync with `@verbatra/mcp`. `verbatra init` now derives which
  providers take a model and token limit from the sdk's own metadata instead of a
  hardcoded list, so it will not go stale when a new provider is added.
  `--concurrency`, `--lock-timeout`, and `--debounce` now reject values above a
  sane upper bound instead of accepting an unbounded number.

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Fix the `studio` and `mcp` commands to catch a `.env`/`.env.local` read failure (for example, a directory in place of the file) and exit 2 with a structured error, instead of crashing with an unhandled raw error, matching the existing behavior of `translate` and `watch`.
- Updated dependencies [[`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8), [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8)]:
  - @verbatra/sdk@0.10.0

## 0.9.3

### Patch Changes

- [#195](https://github.com/verbatra/verbatra/pull/195) [`ab85607`](https://github.com/verbatra/verbatra/commit/ab85607f24c4edcedea8e4d2267e25ee79f0070a) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Fix `verbatra.config.ts` resolving the wrong `@verbatra/sdk` or `@verbatra/cli` when a config
  file does `import { defineConfig } from "@verbatra/cli"` (or from `@verbatra/sdk`) and a
  different, conflicting install of either package is also reachable from the config file's own
  location. `loadConfig` transpiles `.ts` config files through jiti (via
  `cosmiconfig-typescript-loader`), which resolves bare specifiers itself, bypassing Node's own
  module resolution.
  
  `loadConfig` now passes jiti an alias that points `@verbatra/sdk` and `@verbatra/cli` at the
  exact packages installed alongside the SDK build that is actually running, resolved from the
  running code's own location rather than from the config file's location. A config file's import
  now consistently resolves to the pinned SDK and CLI in effect, even when an unrelated, differently
  versioned copy of either package also happens to be installed near the config file. A package that
  is not installed anywhere reachable from the running SDK is left unaliased, so the import falls
  back to jiti's ordinary bare-specifier resolution from the config file's own location, exactly as
  before this fix, instead of resolving to the wrong version silently.
- Updated dependencies [[`ab85607`](https://github.com/verbatra/verbatra/commit/ab85607f24c4edcedea8e4d2267e25ee79f0070a)]:
  - @verbatra/sdk@0.9.3

## 0.9.2

### Patch Changes

- [#193](https://github.com/verbatra/verbatra/pull/193) [`6f56c63`](https://github.com/verbatra/verbatra/commit/6f56c63f13705dc47031be3c1044c96f8fc9736d) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Fix config discovery so it actually searches upward from the working directory, as the README,
  SDK README, and docs site already documented. `loadConfig` previously left cosmiconfig's
  `searchStrategy` unset, which defaults to `none` (current directory only), so running verbatra
  from a nested monorepo package directory raised `CONFIG_NOT_FOUND` instead of finding the config
  at the repository root.
  
  The search now walks upward and stops at the nearest ancestor directory containing a `.git` entry
  (or the user's home directory if none is found), so it finds a monorepo-root config without
  wandering into an unrelated project above the repository.

- [#193](https://github.com/verbatra/verbatra/pull/193) [`6f56c63`](https://github.com/verbatra/verbatra/commit/6f56c63f13705dc47031be3c1044c96f8fc9736d) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Fix a broken transitive type dependency leaking through the published `@verbatra/sdk` `.d.ts`.
  The Gemini authoring model type was re-exported from `@google/genai`'s own `Interactions.Model`,
  but every entry point of that package's type declarations carries an unconditional top-level
  import of `@modelcontextprotocol/sdk/client/index.js`, an optional peer dependency it does not
  install. A consumer running `tsc --noEmit` with `skipLibCheck: false` got `TS2307: Cannot find
  module '@modelcontextprotocol/sdk/client/index.js'` from deep inside `@google/genai`'s own types,
  with no fix available on their side short of installing an unrelated MCP SDK package.
  
  `GeminiModel` is now a hand-maintained string literal union (still open-ended via `string & {}`,
  so unknown or newly released model IDs are still accepted), breaking the transitive dependency
  entirely while preserving editor autocomplete for known Gemini model IDs in `defineConfig`.
- Updated dependencies [[`6f56c63`](https://github.com/verbatra/verbatra/commit/6f56c63f13705dc47031be3c1044c96f8fc9736d), [`6f56c63`](https://github.com/verbatra/verbatra/commit/6f56c63f13705dc47031be3c1044c96f8fc9736d)]:
  - @verbatra/sdk@0.9.2

## 0.9.1

### Patch Changes

- [#191](https://github.com/verbatra/verbatra/pull/191) [`251430e`](https://github.com/verbatra/verbatra/commit/251430e359b4795bd0e96627408518c573348519) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Fix the README install and quick-start commands. The `verbatra studio` setup snippet now installs `@verbatra/cli` alongside `@verbatra/studio`, and the "try before installing" example now uses the working `npx @verbatra/cli --help` (or `pnpm dlx @verbatra/cli --help`) instead of the broken `npx verbatra` cold-run, which fails with a registry 404 for an unrelated package.
- Updated dependencies [[`8dcf89d`](https://github.com/verbatra/verbatra/commit/8dcf89dc82e7716ec3d1b2bc5d8c8cff43974c19), [`2914739`](https://github.com/verbatra/verbatra/commit/2914739774c745859de1176167fac53e383a8b35)]:
  - @verbatra/sdk@0.9.1

## 0.9.0

### Minor Changes

- [#178](https://github.com/verbatra/verbatra/pull/178) [`aa337dc`](https://github.com/verbatra/verbatra/commit/aa337dc0e5c0f05acee1364fa0dde01f03a03bc9) Thanks [@mariokreitz](https://github.com/mariokreitz)! - A parse failure on a target locale file now names the file. `check`, `diff`, `export`, and every
  other read of a target file used to surface the adapter's bare message, so a corrupt locale in a
  twenty-locale project reported only `error [INVALID_JSON] The file is not valid JSON.` and left you
  bisecting with `--locales` to find it. The message now reads
  `The fr locale file at /app/locales/fr.json could not be read: The file is not valid JSON.` The
  error type, its code, and the exit code are unchanged, so anything branching on `INVALID_JSON` keeps
  working. This covers every adapter and every adapter error code, not just malformed JSON.

  `doctor`'s source locale file check now reads and parses the file instead of only probing for its
  existence. A directory standing in for the source file, an empty file, and malformed content used
  to pass the check while making every other command fail; each is now reported, with the same
  message `check` would give. When the configured format resolves to no adapter there is nothing to
  parse with, so the check falls back to existence alone and says so. The check keeps its
  `source-file` id and its place in the report.

- [#169](https://github.com/verbatra/verbatra/pull/169) [`5d7ec20`](https://github.com/verbatra/verbatra/commit/5d7ec20a4b46361db3c359e7ce792049598ae51a) Thanks [@mariokreitz](https://github.com/mariokreitz)! - `@verbatra/sdk` now ships the config schema as a JSON Schema document at
  `@verbatra/sdk/config-schema.json` (`dist/config-schema.json`), generated at build time from the
  same zod schema the SDK validates with. Point an editor at it, through an in-file `$schema` key or
  an explicit editor mapping, and a `.verbatrarc.json`, `.verbatrarc`, or YAML config gets key
  completion and validation while you type. See the config-file page for both wiring paths and for
  the three runtime rules the document cannot express.

  The config object now accepts an optional top-level `$schema` key, so an editor pointer no longer
  trips the strict-object check. It is ignored at runtime and is the only extra key tolerated.

  One behavioral detail for anyone branching on a validation issue's `code`: the `files.pattern` must
  contain the `{locale}` token rule moved from a whole-config refinement to a field-level regex, so
  its issue `code` changed from `custom` to `invalid_format`. The message and the `["files",
"pattern"]` path are unchanged, and an empty `files.pattern` now reports two issues (minimum length
  and the token rule) where it previously reported one. The same move applies to the
  openai-compatible provider's `baseUrl` scheme guard, whose `code` changed from `custom` to
  `invalid_format` with its message unchanged.

- [#167](https://github.com/verbatra/verbatra/pull/167) [`9d3a8f8`](https://github.com/verbatra/verbatra/commit/9d3a8f850991c9bf862eb443ebc9e41e575c1639) Thanks [@mariokreitz](https://github.com/mariokreitz)! - New `verbatra doctor` command and its `doctor()` SDK entry point: a preflight that answers "is this
  project set up correctly?" and spends nothing. It constructs no provider, makes no network request,
  writes no file, and never reads an API key value.

  Five checks run, each reporting its own verdict: the config loads and validates, the configured
  format resolves to a file adapter, the configured provider ID resolves to a provider factory, the
  environment variable that provider reads its key from is set, and the source locale file exists.
  Every check runs even when an earlier one failed, so one run reports every independent problem
  rather than stopping at the first. When the config itself cannot be loaded, the four checks that
  need it report `skipped` instead of a verdict they could not reach.

  This is the validation that was missing for a fresh project. `verbatra check` was the cheapest one
  available, but it reads the locale files and dies with `SOURCE_UNREADABLE` before it can tell you
  anything, so it could never validate a project whose source file is not in place yet.

  Details worth knowing:

  - The API key is checked by name only. `doctor` asks whether the variable is set, never what it
    holds, so no key value is read, printed, or validated against a provider. The
    `openai-compatible` provider is the one exception to a missing variable being a failure: it
    falls back to a placeholder key, so an unset variable passes unless the config names its own
    through `provider.options.apiKeyEnvVar`.
  - A missing target locale file is not a problem, since `translate` creates it. A missing source
    locale file is, because every other entry point fails on it.
  - The command takes the shared `--cwd` and `--config` flags plus `--json`, which prints the report
    in the usual envelope. It exits `0` when every check passed and `1` when any check failed, the
    same "it ran, the result is not clean" meaning `check` and `diff` already carry. Exit `2` stays
    reserved for `doctor` being unable to run at all, such as a `--config` path that does not exist.
  - Like `translate`, the command loads `.env.local` and then `.env` before it looks at the
    environment, so a key kept in a dotenv file counts as set.

- [#172](https://github.com/verbatra/verbatra/pull/172) [`af21823`](https://github.com/verbatra/verbatra/commit/af21823c72dfb90967693205eacaafc971a484bd) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Two new entry points read and change a file-backed glossary: `readGlossaryFile` returns the current
  terms straight from disk, and `updateGlossaryTerm` adds, replaces, or removes exactly one term and
  returns the glossary as it now stands. Both take the `GlossaryProvenance` a loaded config reports
  rather than a path, so the file they touch is always the one the config names.

  Only a file-backed glossary can be changed. A glossary written inline in the config module is
  refused with the new `GLOSSARY_NOT_FILE_BACKED` code rather than rewritten, and a failed write is
  reported as the new `GLOSSARY_UNWRITABLE` code. A write takes a project-wide glossary lock for the
  whole read-modify-write, replaces the file atomically, keeps the existing key order and indentation,
  and is held to the same size and shape limits `loadConfig` enforces when it reads a glossary back.

- [#166](https://github.com/verbatra/verbatra/pull/166) [`08fec43`](https://github.com/verbatra/verbatra/commit/08fec434584a61f1bf1673a7b674c055ae15833c) Thanks [@mariokreitz](https://github.com/mariokreitz)! - A lock-file that turns corrupt while an import is running now aborts the whole run, exactly as it
  already did during `verbatra translate`. `verbatra import` exits `2` instead of `1`, and
  `importWorkbook()` rejects with `LOCK_FILE_INVALID` where it previously resolved with the corruption
  recorded as one failed locale per sheet.

  The lock-file is one shared file, so continuing bought no partial progress: every remaining locale
  wrote its translations to disk and then failed to record them in the lock-file, leaving the project
  looking up to date when it was not. Locales applied before the abort stay written; fix the lock-file
  and import again.

- [#168](https://github.com/verbatra/verbatra/pull/168) [`ccd5c58`](https://github.com/verbatra/verbatra/commit/ccd5c587de4e176ba00f5b966dda48eeff4a0f82) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Supplying `deps.fs` now redirects the locale files too, so an SDK run can be fully in memory. The
  format adapters previously read and wrote translations through `node:fs` directly, which meant a
  custom `SdkFs` covered the run-status file, the lock-file, the glossary and workbook I/O, but never
  the project's actual payload. Adapters now take a file-system port at construction time, and the SDK
  builds that port from `deps.fs`.

  Nothing changes for a caller that does not pass `deps.fs`: adapters keep their node-backed
  implementation, including the fsync-and-rename atomic write. One limitation remains, and it is now
  documented on `SdkFs`: adapters supplied through `deps.adapterRegistry` were constructed by the
  caller, so `deps.fs` cannot reach them. Passing both means you own that wiring.

- [#164](https://github.com/verbatra/verbatra/pull/164) [`7a361f9`](https://github.com/verbatra/verbatra/commit/7a361f963124c8e4e507b07e06c6dd9b22481e03) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Read this before upgrading: `verbatra translate` and `verbatra import` now exit `1` when a
  locale comes out partial. A pipeline that passes today can start failing after this upgrade,
  and that is the point of the change. A partial locale is one whose file was written to disk
  with some keys still missing, so a run that reports `0 succeeded, 1 partial, 0 failed` used to
  exit `0` and let a half-translated file through a CI gate. If your pipeline starts failing here,
  it was already shipping incomplete translations. Re-run the affected locale (now possible with
  `--locales`), or if you genuinely want to accept a partial result, branch on the `partial` field
  of the `--json` summary yourself rather than on the exit code.

  The exit code is `1`, not a new code: `1` already means the command ran but the result is not
  clean, which is exactly this case. The asymmetry that hid the bug is gone too. Re-running the
  same broken state used to exit `1`, because the failing key was then the only candidate and
  nothing was accepted, so the worse a run went, the more likely it was to exit `0`.

  Three further changes come with it:

  - `translate` and `watch` accept `--locales de,fr` (SDK: `locales`), matching `check`, `diff`,
    and `export`. Translating one locale at a time is what a rate-limited free tier needs, and it
    is the quickest way to re-run a single locale that came out partial. An unconfigured locale
    fails with `UNKNOWN_LOCALE` before anything is read or spent, and `watch` validates the subset
    once at startup rather than on every run.
  - An unwritable target locale file now fails with a structured `TARGET_UNWRITABLE` naming the
    real target and the file-system code, instead of a raw `EACCES` quoting the internal temporary
    file that the atomic write had already deleted. `TARGET_UNWRITABLE` is a new `SdkErrorCode`:
    `translate` and `importWorkbook` record it on the affected locale, `editEntry` and
    `retranslateEntry` throw it.
  - A `PROVIDER_ERROR` from an unreachable endpoint now names the transport cause (connection
    refused, host name not resolved, connection closed, host unreachable, untrusted TLS
    certificate) and what to check. For `openai-compatible` it also names the host and port of the
    configured `baseUrl`. Only the URL's host component is used, so a path, query, or embedded
    credential in `baseUrl` can never reach a message. The error codes themselves are unchanged.

- [#180](https://github.com/verbatra/verbatra/pull/180) [`131764a`](https://github.com/verbatra/verbatra/commit/131764a494528d3a84d0b358d78aa7b95df495a8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - `runStatus` now absorbs a file-system read that rejects, reporting `available: false` like every
  other unusable status file. Its documented contract was already that the read is total and that the
  call throws nothing, and `readTranslationMemory` already guarded the same call, but the run-status
  read did not, so an injected `deps.fs` whose read rejected escaped to the caller.

  Corrections to the published documentation, with no behavior attached:

  - `editEntry` and `retranslateEntry` now say that the target locale file surfaces the adapter's own
    error on the write as well as on the read. The write raises one when the entries cannot be
    represented in the configured format, or when the existing destination file cannot be read back to
    be updated in place, and it is re-thrown unchanged so its code survives. The earlier wording
    implied the target read was the only unwrapped case, which sent callers into a
    `catch (e) { if (e instanceof SdkError) }` that missed the write path.
  - `exportWorkbook` now documents that a failure to write the handoff itself propagates as the raw
    file-system error rather than as `TARGET_UNWRITABLE`, which is scoped to locale files.
  - `RunSummary.locales` no longer claims configured target order for every producer. `translate` and
    `watch` keep that order; `importWorkbook` reports handoff order and appends the locales the
    handoff had nothing for.
  - `SdkErrorCode` now carves `doctor` out of the `UNKNOWN_FORMAT` and `LOCALE_LAYOUT_INVALID`
    universals, matching the carve-outs it already documented for `CONFIG_NOT_FOUND`. `doctor` reports
    both as failed checks rather than throwing.
  - `watch` now documents that a failure to construct the watcher escapes unwrapped at startup.
  - `DoctorDeps.fs` now says it is threaded into the config loader, so it backs the glossary-file read
    as well as the source locale file.

- [#163](https://github.com/verbatra/verbatra/pull/163) [`4f66427`](https://github.com/verbatra/verbatra/commit/4f66427fd4e200c8b08ad9c27fa48cc9e359a70c) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Reject a fabricated single-brace placeholder under the double-brace formats.

  For `i18next-json`, `ngx-translate-json`, and `yaml`, a `{name}`-shaped token is literal
  text rather than interpolation, so it was never extracted as a placeholder and the
  integrity gate could not see it. A translation could therefore alter `{name}` to `{nome}`,
  keep `{orderId}` while inventing `{evilInjected}`, or inject `{stolenSecret}` into a
  placeholder-free source, and every one of those was accepted and written on all three write
  paths (provider translation, workbook import, and a Studio edit). Once written, the value
  locked against the source hash, so `check` and `diff` then reported the locale up to date.

  These adapters now supply a placeholder comparator that adds a one-directional check on top
  of their existing double-brace comparison: a `{name}`-shaped token present in the candidate
  and absent from the source is reported as `extra`, which the gate refuses with the existing
  `placeholder` reason. No new gate reason and no new config key. The check is deliberately
  one-directional, because dropping such a token is undecidable without knowing the project's
  interpolation delimiters, which verbatra has no setting for.

  This is behavioural, not additive: a run that is green today can newly report integrity
  mismatches, and those candidates are withheld rather than written. That includes results
  from DeepL, whose entry partitioning is unchanged but whose output now goes through the same
  comparator. A key it withholds was already carrying a placeholder its source never had.

### Patch Changes

- [#162](https://github.com/verbatra/verbatra/pull/162) [`3b5942d`](https://github.com/verbatra/verbatra/commit/3b5942d4db01800667b3d3c33ba5778b750f9b8f) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Republish with no code changes. The published package metadata (`repository.url`
  and `bugs.url`) now points at github.com/verbatra/verbatra, the repository's
  current location after the move to the verbatra organization. The previous
  release was published shortly before that rewrite landed, so its metadata still
  referenced the old path.
- Updated dependencies [[`aa337dc`](https://github.com/verbatra/verbatra/commit/aa337dc0e5c0f05acee1364fa0dde01f03a03bc9), [`5d7ec20`](https://github.com/verbatra/verbatra/commit/5d7ec20a4b46361db3c359e7ce792049598ae51a), [`9d3a8f8`](https://github.com/verbatra/verbatra/commit/9d3a8f850991c9bf862eb443ebc9e41e575c1639), [`af21823`](https://github.com/verbatra/verbatra/commit/af21823c72dfb90967693205eacaafc971a484bd), [`08fec43`](https://github.com/verbatra/verbatra/commit/08fec434584a61f1bf1673a7b674c055ae15833c), [`ccd5c58`](https://github.com/verbatra/verbatra/commit/ccd5c587de4e176ba00f5b966dda48eeff4a0f82), [`7a361f9`](https://github.com/verbatra/verbatra/commit/7a361f963124c8e4e507b07e06c6dd9b22481e03), [`131764a`](https://github.com/verbatra/verbatra/commit/131764a494528d3a84d0b358d78aa7b95df495a8), [`3b5942d`](https://github.com/verbatra/verbatra/commit/3b5942d4db01800667b3d3c33ba5778b750f9b8f), [`4f66427`](https://github.com/verbatra/verbatra/commit/4f66427fd4e200c8b08ad9c27fa48cc9e359a70c)]:
  - @verbatra/sdk@0.9.0

## 0.8.0

### Minor Changes

- d060201: Export `EXCHANGE_FORMATS` and `DEFAULT_EXCHANGE_FORMAT` from the SDK.

  `EXCHANGE_FORMATS` lists every translator-handoff format at runtime (`xlsx`, `csv`, `tsv`) and
  `DEFAULT_EXCHANGE_FORMAT` names the one `exportWorkbook` and `importWorkbook` use when the caller
  passes none. Until now the SDK published only the `ExchangeFormat` type, so anything validating a
  `--format` argument had to restate the members, and a plain `readonly ExchangeFormat[]` accepts a
  subset without complaint: a format added to the SDK would have been rejected by such a check with no
  compile error to catch it. The new export is built from a record keyed by the format type itself, so
  a member missing from the list is a compile error.

  The CLI now takes both the accepted values and the default from these exports, which also removes
  the duplicated format list from the `export` and `import` help text. That text now reads
  `handoff format: one of xlsx, csv, tsv (default xlsx)`.

- ec4c000: Stop `verbatra init` from being able to write a config it just called valid.

  The command encoded which token-limit option each provider takes in two independent places:
  Anthropic calls it `maxTokens`, OpenAI and Gemini call it `maxOutputTokens`. One copy built the
  object checked against the config schema; the other produced the `verbatra.config.ts` text that was
  actually written to disk, and that copy was never validated. Any drift between them, an option
  renamed or a provider added, would have produced an `init` that reported success and left behind a
  config that failed to load on the very next command.

  `scaffoldingMetadata` now carries `providerTokenLimitKeys`, so the key is stated once, in the SDK,
  tied by a type constraint to the option each provider's own schema accepts. The CLI renders the
  provider block by serializing the exact options object the schema validated, rather than
  re-describing it, so the written text and the checked value cannot disagree.

  No change to the configs `init` produces for the providers shipped today.

### Patch Changes

- 8a274b0: Neutralize spreadsheet formula injection in the csv and tsv handoff. A value beginning with `=`,
  `+`, `-`, `@`, a tab, or a carriage return is executed as a formula when the file is opened in Excel
  or Google Sheets, and the exported `Current translation` and `Context` columns carry earlier
  provider output, which verbatra treats as untrusted. Tab and carriage return belong in that set
  because some spreadsheet importers strip them before parsing, so a value that leads with one still
  reaches the formula parser. The delimited writer now prefixes such a value with an apostrophe, the
  marker spreadsheets read as "this cell is text". Quoting alone is not a defense: spreadsheets
  evaluate a quoted formula too. The xlsx handoff was never affected, since it writes typed string
  cells.

  The escape is always reversed on import, so the guard itself never alters a value. The `Translation`
  column's long-standing trim on import is unrelated and unchanged: it still strips surrounding
  whitespace in that column, including a leading tab or carriage return, and that trim, not the guard,
  is what removes it. The two halves
  are exact inverses: the writer also escapes a value that already begins with apostrophes followed
  by a formula lead, so `'=1+1` is written as `''=1+1` and read back as `'=1+1`. A value whose
  apostrophe does not lead a formula, such as `'tis`, is left alone in both directions. A leading
  space is not part of the guard and is never escaped.

  Consumer impact: exported csv and tsv files gain a leading apostrophe on affected values, which is
  visible in a text editor and invisible in a spreadsheet. A translation value beginning with a tab or
  a carriage return now exports with a leading apostrophe as well. One legacy edge exists. A csv or
  tsv exported by an earlier version, holding a value that genuinely starts with an apostrophe
  followed by a formula lead (`'=...`, and now also an apostrophe followed by a tab or a carriage
  return), loses that apostrophe when imported by this version, because the older export did not
  escape it. Re-export the handoff before filling it in to avoid that. Values without a leading
  formula character are unchanged in every direction.

- b0dd696: Internal refactor pass over shared helpers and comments. No behavior, output, or public API
  changes: every type signature and the CLI surface are unchanged. Documentation comments on the
  workspace types that bundle into the published declarations were rewritten in this pass; the
  accompanying documentation entry describes the result.
- 3e725cc: Fix `translate` and `importWorkbook` deleting the lock-file baseline of a target key that has no
  source entry. Both paths write the locale's lock entries in replace mode and rebuilt them only from
  keys the source still has, so a key that lives in the target alone lost its recorded hash on every
  run. Generated CLDR plural forms are exactly that shape: `items_few` and `items_many` exist in a
  Polish target while the English source only has `items_one` and `items_other`. `translate` used to
  protect them, but only while `generatePlurals` was on; an import, or a run with the flag off, wiped
  them. Once the hash was gone the form counted as adopted rather than generated, so it was never
  reconsidered again even after its governing source string changed.

  Both paths now carry a source-less key's prior hash forward. The rule is keyed on the merged target
  content, so a key genuinely deleted from the target file still loses its entry, and a key that never
  had a hash (an existing plural form verbatra adopted rather than generated) still gets none.

  Consumer impact: lock files will keep entries that earlier versions dropped, so the next
  `translate` or `import` after upgrading can produce a larger `verbatra.lock.json` diff than usual.
  That diff is the repair. Hashes that earlier versions already deleted are not
  reconstructed: for a generated plural form whose baseline was lost, the form is now treated as
  hand-written and adopted, and re-running with `generatePlurals` on will not regenerate it. Delete
  that form from the target file to have it generated again.

- 74ac95f: Fix a top-level translation key named `__proto__` never getting a lock-file baseline. The lock
  entries for a locale were accumulated on a plain object with `entries[key] = hash`, which for that
  one key name hits the `Object.prototype` setter and is discarded rather than stored, and the
  lock-file reader then dropped the key a second time because zod's record parser skips it. The key
  was translated on the first run and, with no baseline to compare against, reported as unchanged
  from then on, so a later edit to its source text was never picked up. Both the `translate` and the
  workbook import path now build their lock entries through a `Map`, and the lock-file reader keeps
  the key as an own property. Nothing is written to `Object.prototype` on either path.

  Consumer impact: a project with a top-level `__proto__` key gets a lock entry for it on the next
  run, and from then on an edit to that key's source text is reported as changed and retranslated,
  which it should always have been. Nested keys such as `a.__proto__` were never affected.

- 23a6b1b: Fix the `ngx-translate-json` adapter corrupting a key that contains a backslash. Reading a nested
  file built the dotted path from the raw object keys, while writing decoded that path with
  backslashes treated as escape characters. The two halves disagreed, so `{"a":{"b\\c":"hello"}}` was
  written back as `{"a":{"bc":"hello"}}`: the value moved to a key the app never asks for, the real
  key looked untranslated on every later run and was paid for again, and the mangled key piled up as
  an orphan. Backslashes in a key segment are now escaped when the path is built, symmetrically with
  the decoding the write path already did, and the flat-file writer decodes the path back so a flat
  file still round-trips byte for byte. Only `ngx-translate-json` uses path-notation keys; the
  i18next, next-intl, and vue-i18n adapters were never affected.

  Consumer impact, for an ngx-translate project that has a backslash in a key: that key's spelling
  changes, from `a.b\c` to `a.b\\c`, everywhere verbatra names it (the lock-file, an exported
  workbook, CLI output). The old lock entry no longer matches and is dropped on the next write. What
  happens next depends on the file the key lives in. If the target file still holds the value under
  the right key (flat files always did, since they were written verbatim), the key is adopted as up
  to date: no provider call, no cost, and a fresh baseline is recorded. If the target was already
  corrupted by an earlier version, the correct key is genuinely missing and is translated once, and
  the mangled key is reported as orphaned; remove it, or run with `--prune`. Keys without a backslash
  are unaffected.

- 3178757: Fix run status writing to go through the injected `SdkFs` instead of calling `node:fs/promises`
  `mkdir` directly. Before this fix, a run that recorded run status created the `.verbatra-local`
  directory on the real file system even when a custom `deps.fs` was supplied; that directory
  creation now goes through the seam. The `SdkFs` interface is unchanged: the existing optional
  `mkdir` member already carried this capability, so the published declarations are identical.

  A custom `deps.fs` whose `writeFile` targets a real directory tree must now implement the optional
  `mkdir` member for the run status file to be written, since the SDK no longer creates that directory
  behind the seam. Run status writing is best-effort, so a fs without it degrades to no run status
  file rather than failing the run.

- 6b37fe9: Correct factual errors in the published API documentation. No behavior or type-signature change;
  the corrections ship in the generated declarations, so consumers reading the documented contract
  get a different answer than before.

  The substantive corrections: `translate` and `importWorkbook` no longer document a thrown
  `LOCK_CONTENDED`, and `importWorkbook` no longer documents a thrown `CONFIG_INVALID`, because both
  surface those codes on the affected locale's summary and let the other locales continue.
  `translate`'s `LOCK_FILE_INVALID` is documented as aborting a live run after locales have started
  rather than before any locale runs. The `degenerate` integrity-gate reason describes what is
  actually detected (a large length blowup or runaway repetition) rather than an untranslated echo.
  `SubBatchProgressEvent.batchIndex` is documented as 1-based, and the event as announcing an
  attempt, since a batch withheld by an exhausted budget still emits. The `SdkFs` seam no longer
  claims a custom implementation makes a run fully in-memory: locale files are read and written by
  the format adapters outside the seam. Also corrected: `LocaleSummary.error` can be absent on a
  failed locale, `DEFAULT_DELIMITED_PATH` names a directory, a delimited import accepts a single
  file, `EQUALS_SOURCE` compares trimmed values, `watch` runs once immediately at startup, and the
  read-only entry points document that a malformed target file surfaces the adapter's own parse
  error unwrapped.

- d7c7a44: Document the published SDK API. Every declaration that ships in the package's type declarations now
  carries JSDoc: entry points describe their behavior and the error codes they throw, input, result,
  and event shapes document each property, and the config, provider, and adapter types inlined from
  the workspace packages are documented too. Editors show these on hover. No runtime behavior, output,
  or type signature changes.
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

## 0.7.1

### Patch Changes

- 0e5dfb8: Report the reason a run failed, in both output modes.

  Three gaps closed, all of them cases where the CLI knew why something failed and did not say so:

  - A usage error under `--json` (an unknown option, a missing required argument, an unknown command)
    exited `2` with an empty stdout, so a consumer piping stdout to a parser got nothing to parse. It
    now writes the documented single `ok: false` envelope, with code `USAGE_ERROR` and `command: null`
    when the failure happened before a command was resolved.
  - `watch --json` wrote no envelope when the watcher failed to start or failed to stop, while the
    identical error under `translate --json` did. Both now emit one error envelope on the NDJSON
    stream, the same shape a failed run already used.
  - A locale that failed because its provider calls failed carries no `error` object (it reports
    through `providerFailures` and its notices), so the human output rendered a bare `de: failed` with
    no code, no message, and no cause. Locale lines now list the provider-failed keys and each
    notice's code and message, so a withheld sub-batch names its cause (for example `RATE_LIMITED` or
    `PROVIDER_UNAVAILABLE`) and says it will be retried. `provider-failed` is also counted on the
    locale line alongside the other withholding counts.

  No change to any exit code, and nothing new on stdout without `--json`. Output gains lines only
  where a withheld key or a notice previously had no detail: a locale carrying provider failures or
  notices now also lists them, so a partial locale that used to show only a `notices` count now shows
  each notice too.

  - @verbatra/sdk@0.7.1

## 0.7.0

### Minor Changes

- 7085769: Classify a provider HTTP 5xx as its own `PROVIDER_UNAVAILABLE` error code instead of the generic
  `PROVIDER_ERROR` fallback.

  A hard provider outage returns 5xx, which previously matched none of the status or error-class
  checks and fell through to `PROVIDER_ERROR`, the code reserved for failures nothing could classify.
  An outage and an unrecognized failure are different things, and only the first is worth retrying
  later or routing to another provider, so they now carry different codes.

  The new code is deliberately separate rather than folded into `TIMEOUT` or `RATE_LIMITED`: both of
  those name a specific, different failure, and reporting an outage as "the request timed out" or
  "you were rate-limited" would be untrue in the text a user reads. A sub-batch withheld during an
  outage now names `PROVIDER_UNAVAILABLE` in its notice.

  Classification of every other failure is unchanged. In particular 401 and 403 still classify as
  `AUTH_FAILED`, which remains permanent and not worth retrying.

- 6fb1941: Add a CSV and TSV translator interchange alongside the Excel workbook.

  `export` and `import` take a `--format` flag (`xlsx` by default, plus `csv` and `tsv`), and the SDK's
  `exportWorkbook` and `importWorkbook` take the matching optional `format` field. Passing no format
  keeps the existing xlsx behavior exactly as it was.

  A delimited export writes one `<locale>.csv` or `<locale>.tsv` per target locale, so `--out` names a
  directory for those formats (default `verbatra-translations`) and stays a file path for `xlsx`. The
  directory is created if it is missing. Import accepts either that directory or a single interchange
  file, and takes the locale from the file name. Files carry the same columns as the workbook, are
  written with LF line endings (and a UTF-8 BOM for `csv`, which Excel needs), and are quoted per
  RFC 4180, so a value containing the delimiter, a quote, a line break, or padding whitespace
  round-trips exactly.

  Every imported row runs the same source-drift, placeholder, and ICU gate as the workbook path. A
  delimited file has no cell protection, so its source-hash column is visible and editable: an edited
  or blanked hash is never trusted, the row is withheld as drift and reported. Parsing is bounded by
  explicit input-byte, row, field-count, and field-length caps, and a malformed row or a duplicate key
  is reported per row instead of aborting the file.

- 6871028: Report the file line as well as the record number for a malformed row or duplicate key in a csv or tsv
  import.

  A delimited record that holds a quoted line break covers one spreadsheet row but several editor lines,
  so the record number alone stopped matching what a translator saw in a text editor as soon as any
  earlier row contained such a break. Both numbers are now reported and labelled: `row` is the record
  number a spreadsheet shows, and the new optional `line` on `MalformedRowReport` and
  `DuplicateKeyReport` is the file line the record starts on. The line is correct for LF, CRLF, and lone
  CR breaks, and is derived from the same single scan of the file.

  The CLI renders `row 4, line 7 (Status)` for a delimited import and the unchanged `row 4 (Status)` for
  an xlsx one, which carries rows rather than lines and reports no `line` at all.

- e2157a3: Wrap every `--json` record on stdout in one discriminated envelope, and emit one for a failed run.

  Before this change a caller driving the CLI with `--json` could parse a success but not a failure:
  a whole-run error left stdout empty, so the only machine-usable signal was the exit code and the
  only way to learn why was to scrape the human-readable stderr line. The success payloads had the
  matching gap in the other direction: they were a bare summary object with no marker of which command
  produced them or which shape version they followed.

  Every `--json` record on stdout is now one line of one shape:

  - success: `{ "ok": true, "version": 1, "command": "check", "result": { ...the previous payload } }`
  - failure: `{ "ok": false, "version": 1, "command": "check", "code": "CONFIG_INVALID", "message": "..." }`

  Three contract decisions worth stating, since consumers depend on them:

  - `version` is the version of the envelope shape, not the package version, and it is an integer so
    a consumer compares it with `===` and is never tempted to range-parse it. Adding a field does not
    bump it, so ignore fields you do not recognize.
  - The command payload is nested under `result` rather than spread next to `ok`, so an envelope field
    can never collide with a payload field and the payload stays versionable on its own.
  - `watch --json` keeps one NDJSON record per run and now uses the same envelope for each, with
    `ok` carrying what the old `status` field carried. A failed run does not terminate the stream.

  A failing run writes exactly one envelope line to stdout and still exits `2`. Exit codes are
  unchanged in every case. The human-readable stderr line is unchanged in both modes, byte for byte,
  so consumers that read the exit code and stderr are unaffected. The envelope carries the same
  secret-free `{ code, message }` projection the stderr line renders, so it can disclose nothing the
  stderr line would not have. Progress and lock-wait records stay on stderr.

  This is a breaking change for anything parsing `--json` stdout: read `result` instead of the bare
  object, and branch on `ok`. The bundled GitHub action already understands both shapes, so a pinned
  older `verbatra-version` keeps working.

- 21459a6: Add locale directory layout styles and the locale path resolver.

  `files` gains an optional `localeStyle` of `"literal"`, `"posix"`, or `"android"`. It controls what
  the `{locale}` token in `files.pattern` expands to for each locale:

  - `"literal"` is the default and what a config without the field gets: the configured tag verbatim.
    Every existing project resolves to exactly the paths it did before, byte for byte.
  - `"posix"` replaces `-` with `_`, for gettext directories (`locale/pt_BR/LC_MESSAGES/messages.po`)
    and the Java `messages_{locale}.properties` suffix layout.
  - `"android"` expands the token to a complete Android resource-directory segment, `values` prefix
    included: `values` for the source locale, `values-de`, `values-pt-rBR`, `values-fil-rPH`, and the
    modified BCP-47 form `values-b+zh+Hans`, `values-b+es+419`, `values-b+sr+Latn+RS` where the legacy
    qualifier cannot express the tag. The pattern is `res/{locale}/strings.xml`, and the token must
    occupy a whole path segment under this style.

  The new `createLocalePathResolver(cwd, config)` is exported from the package root. It resolves a
  locale to its absolute file path (`pathFor`) and a path back to the locale that owns it
  (`localeFor`, `undefined` for a path the project does not own). Every SDK flow now resolves paths
  through it, so a consumer that watches or reports on locale files uses the same mapping rather than
  re-deriving it.

  `SdkErrorCode` gains two members, both raised when the resolver is created and so before any file is
  read and before any provider call:

  - `LOCALE_LAYOUT_INVALID`: the pattern and style cannot be combined, or the style has no valid
    spelling for a configured locale (`zh-Hans` under `"posix"`, for instance), or a locale expands to
    something that is not a single path segment. A style refuses rather than guesses, because a wrong
    directory name is written successfully and then silently ignored at runtime.
  - `LOCALE_PATH_COLLISION`: two configured locales resolve to the same absolute path.

- 4720494: Stop a narrower delimited re-export from leaving locale files a later import reads as fresh.

  A `csv` or `tsv` export writes one file per locale into a directory, so re-exporting into a directory
  that still holds output from an earlier run with a wider `--locales` selection left the dropped
  locales' files behind, indistinguishable from the ones just written. The next import read them and
  applied outdated translations silently.

  A delimited export now records the locales it wrote in a hidden per-format manifest in the output
  directory (`.verbatra-export-csv.json` or `.verbatra-export-tsv.json`), written after the locale
  files. Import reconciles a handoff directory against it: a locale file the most recent export did not
  write is refused as a leftover and reported as that locale's failure (`HANDOFF_FILE_STALE`) instead
  of being applied. A directory with no readable manifest (assembled by hand, or round-tripped through
  an archive that dropped the hidden file) is read exactly as before, and naming a single interchange
  file directly is still taken at face value.

  The export deletes nothing. Nothing in the output directory is removed or overwritten except the
  per-locale files this export writes and its own manifest, so an unrelated file placed there is never
  at risk.

### Patch Changes

- 2d119f8: Refresh the npm package metadata. The cli and sdk descriptions now name the providers, including running against an openai-compatible local or self-hosted model, and their keywords cover the supported formats (XLIFF, YAML, ARB, Flutter, Java properties) alongside the i18n libraries. The studio keywords gained the terms its dashboard is searched by, and its homepage now points at the Verbatra Studio documentation page. `verbatra --help` prints the same positioning as the package listing, so the banner no longer contradicts it.
- 1d3d92d: Refresh the bundled provider SDKs to their current patch and minor releases.

  `@anthropic-ai/sdk` moves from 0.115.0 to 0.116.0, `@google/genai` from 2.15.0 to 2.16.0, and
  `openai` from 7.3.0 to 7.4.0. These are the versions a consumer installs alongside
  `@verbatra/sdk`, so they reach the consumer lockfile, audit surface, and SBOM.

  This is a routine dependency refresh with no verbatra API change: the provider strategies, the
  shared `runLlmTranslation` layer, and the translation response schema are all untouched, and no
  configuration or CLI behavior changes.

- Updated dependencies [7085769]
- Updated dependencies [6fb1941]
- Updated dependencies [6871028]
- Updated dependencies [21459a6]
- Updated dependencies [2d119f8]
- Updated dependencies [6b911af]
- Updated dependencies [1d3d92d]
- Updated dependencies [4720494]
  - @verbatra/sdk@0.7.0

## 0.6.4

### Patch Changes

- 5827f45: Leave `.gitignore` untouched on a dry run.

  `translate` and `import` top up an existing `.gitignore` with the entries a project
  scaffolded before `verbatra.cache.json` existed is missing. That top-up ran before the
  dry-run branch, so `translate --dry-run` and `import --dry-run` appended to the file even
  though `--dry-run` is documented as previewing "without writing files", and `import
--dry-run` did it even when the run then failed on an unreadable workbook.

  Writing there is not harmless: `.gitignore` is tracked, so a preview dirtied the working
  tree and could fail a CI job that asserts a clean checkout. The top-up now runs only on a
  real run. `watch` is unaffected, having no dry-run mode.

- Updated dependencies [07df69b]
- Updated dependencies [e6de185]
- Updated dependencies [1ae3be9]
- Updated dependencies [9aafc43]
  - @verbatra/sdk@0.6.4

## 0.6.3

### Patch Changes

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

## 0.6.2

### Patch Changes

- 62dbc7e: Add optional locale-level concurrency to the translate flow. `translate()` and `watch()` now accept an optional `concurrency` (a positive integer, surfaced on the CLI as the `--concurrency <n>` flag on `translate` and `watch`), running up to that many target locales at once through a bounded worker pool. The default is 1, which stays strictly serial and byte-identical to before: same written files, same `RunSummary.locales` order, same lock-file content. Regardless of completion order, results are always collected back into source-locale order. Because a token budget's stop guarantee is order-dependent, a live run that sets `concurrency` greater than 1 while `maxTokens` is configured is refused up front with a `CONCURRENCY_BUDGET_CONFLICT` error (a dry run is exempt); an invalid value is rejected with `CONCURRENCY_INVALID`. No new locking is added: the per-locale write locks already isolate concurrent locales on disk.
- ca2d99a: Add a content-addressed translation-memory (TM) cache so a translation whose source content is unchanged is reused for free instead of being re-sent to the provider. A translation is reused even when its key was renamed, and identical source text shared across two keys is paid for once. The cache lives in a local, gitignored, regenerable `verbatra.cache.json` sibling to the lock file (scaffolded into `.gitignore` by `init`); it is never a field on the lock file and never committed.

  Each entry is keyed by `(sourceContentHash, targetLocale, fingerprint)`, nested by fingerprint under a top-level `version`. The fingerprint is a stable hash over the provider id, model, tone, and sorted glossary; format is deliberately excluded because every reused value is re-checked by the placeholder/ICU integrity gate against the current source before it is applied, so a hit that no longer matches the target format is discarded and its key falls through to the provider. Reused hits apply silently (never flagged for review). A changed fingerprint (for example a different tone) never serves a stale value.

  The cache is resilient by design: a missing, corrupt, oversized, or unrecognized-version file degrades to an empty cache and never fails a run (unlike the fatal lock-file). It is read once as an immutable snapshot at run start and written once at the end (best-effort, dry-run-skipped), which keeps it safe under locale concurrency. Values accepted by `importWorkbook`, `editEntry`, and `retranslateEntry` are also fed into the cache so a later run reuses them.

  The cache is on by default. `translate()` and `watch()` accept an optional `cache` input (surfaced on the CLI as `--no-cache`) that bypasses both the read and the write for a run, making it behave exactly as if no cache existed and leaving any existing cache file untouched. To rebuild or discard the cache, delete `verbatra.cache.json`; it is regenerated naturally on the next run. `LocaleSummary` gains a `cacheHits` bucket (rendered as "from cache" in the CLI) reporting the keys served from cache as avoided provider usage.

  Within a single run, byte-identical source text shared across two or more keys is translated once per target locale: the provider misses are deduplicated by source content hash, one representative is sent, and its accepted value is fanned out to every key that shares the content (and cached and lock-advanced identically). This holds even when the keys would otherwise fall into separate provider batches.

  Known limitation: generated plural forms are out of v1 TM scope. A synthesized CLDR plural form is neither served from nor written to the cache; only main-path diff candidates participate.

- Updated dependencies [a6767a6]
- Updated dependencies [62dbc7e]
- Updated dependencies [72bacc3]
- Updated dependencies [b98d7f2]
- Updated dependencies [ca2d99a]
  - @verbatra/sdk@0.6.2

## 0.6.1

### Patch Changes

- Updated dependencies [67f1768]
- Updated dependencies [a90bc7e]
- Updated dependencies [720716c]
- Updated dependencies [adc9536]
  - @verbatra/sdk@0.6.1

## 0.6.0

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

## 0.5.0

### Minor Changes

- b6c871f: Harden the CLI's error handling at four boundary points that previously bypassed the structured error
  scaffold and could surface a raw stack instead of a clean exit code:

  - `translate` and `watch` now load `.env`/`.env.local` inside the same try that maps errors to exit
    `2`. A missing `.env` file is still a silent no-op, but a non-ENOENT read error (for example an
    unreadable file, or a directory named `.env`) now renders as a structured error instead of an
    unhandled exception.
  - `--debounce` is now validated instead of silently defaulted. A non-integer, zero, negative, or
    unit-suffixed value (like `250ms`) is rejected as a usage error (`INVALID_DEBOUNCE`, exit `2`); it no
    longer falls back to the 300ms default. This is a user-facing behavior change: a `--debounce` value
    that previously silently defaulted now fails the run.
  - All six one-shot commands (`translate`, `watch`, `export`, `import`, `check`, `diff`) now validate
    their options with a zod schema inside the error scaffold. `import`'s option parsing in particular
    moved inside the try, so a malformed option object can no longer escape as an unhandled rejection.
  - The exit-code documentation in the package header and `run()`'s JSDoc now also names `check`/`diff`
    returning `1` for drift or pending changes, alongside `translate`/`import`'s "some locales failed".

  `@verbatra/sdk` is version-locked with `@verbatra/cli` and picks up the same bump with no behavior
  change of its own.

- 7d50d22: `translate` and `watch` now persist each non-dry-run's review-flag and token/usage
  data to a new gitignored file, `.verbatra-local/run-status.json`, written once after
  the per-locale loop completes. A new SDK function, `runStatus`, reads it back:
  `{ available: false }` when no file exists yet or it cannot be parsed, or
  `{ available: true, version, generatedAt, usage?, budget?, locales }` when it does.
  The write is best-effort (any failure is caught and swallowed, never failing the run
  or reaching `RunSummary`) and is skipped on dry-run, mirroring the existing lock-file
  write discipline. `verbatra.lock.json` itself is unchanged.

  `verbatra init` now also scaffolds `.verbatra-local/` into a project's `.gitignore`,
  alongside the existing `.env`/`.env.local` entries.

- 314aefa: Add `retranslateEntry`, a new sdk seam that retranslates exactly one source key into exactly one
  target locale: a single-entry provider call through the same `selectProvider` registry
  `translate()` already uses, gated through a new shared `gateCandidateValue` accept/reject check
  before anything reaches disk. On acceptance it writes the target locale file (merging only the
  requested key, leaving every other key untouched) and updates the lock entry for that key; on
  rejection it writes nothing and reports the candidate value and which check failed it. Add a new
  `UNKNOWN_KEY` error code, thrown when the requested key does not exist in the source resource.

  Also extract the placeholder and ICU integrity check that `translate()`/`watch()` and workbook
  import already ran independently into this one shared `gateCandidateValue` function, and route
  both existing call sites through it. This adds a real behavior change to `translate()`/`watch()`:
  the provider-translation path previously only compared placeholders before accepting a
  translation; it now also validates the candidate against the format's message syntax (ICU
  plural/select, for `next-intl-json` and `arb`), so a well-formed-on-placeholders but malformed ICU
  candidate is now withheld where it was previously accepted. This has no effect on non-ICU formats,
  whose message validation always passes.

  `@verbatra/cli`'s `studio` command gains one new flag, `--allow-spend`, with an environment
  variable fallback (`VERBATRA_STUDIO_ALLOW_SPEND`); the CLI flag wins when both are given. It
  defaults to off and is the only way to enable Studio's provider-calling actions, including the
  new gated retranslate action. Local editing of the project's own locale files is always
  available and needs no flag; only provider spend is gated.

  `keyIntegrity`'s per-key result gains a new `icuValid: boolean` field, computed unconditionally
  and independently of the placeholder check: a target value can now be reported as placeholder-valid
  but ICU-invalid, the exact failure the gated retranslate action exists to fix. Always true for a
  non-ICU format.

  `translate()`/`watch()` and `importWorkbook()` now serialize their writes per target locale: each
  locale's read-translate-write step, including the provider call, holds a new real, cross-process
  advisory lock for that locale before touching its target file or lock-file entry, so a concurrent
  writer for the same locale (another CLI run, a workbook import, or a Studio `retranslateEntry`
  call) can never interleave with it and silently lose a key. A new `LOCK_CONTENDED` error code is
  thrown if a locale's lock cannot be acquired within its timeout, naming the lock file's path. This
  also removes the lock-file's previous compare-and-swap retry, which left a residual race window of
  its own; mutual exclusion is now provided entirely by the new lock. A dry run never acquires a
  lock, since it never writes anything.

  Breaking change: the exported `SdkFs` interface gains two new required methods, `createExclusive`
  and `deleteFile`, backing the new lock. Any custom `SdkFs` implementation passed to `translate()`,
  `watch()`, `importWorkbook()`, or any other SDK entry point's `deps.fs` must add both, or it will
  fail to type-check and, since the new lock is now taken unconditionally on every write path, throw
  at runtime the first time a locale is written.

- d99347a: Add `editEntry`, a new sdk seam that writes exactly one human-typed correction into exactly one
  target locale: gated through the shared `gateCandidateValue` accept/reject check before anything
  reaches disk, wrapped in `withLocaleWriteLock` across read-target through lock-update, mirroring
  `retranslateEntry`'s own critical section exactly. Unlike `retranslateEntry`, it never calls a
  provider: `EditEntryDeps` carries no `createProvider` field, so there is no path to one even if the
  seam were miswired. On acceptance it writes the target locale file (merging only the requested key)
  and updates the lock entry for that key; on rejection it writes nothing and reports the candidate
  value and which check failed it. Never writes to, or reads for the purpose of updating,
  `.verbatra-local/run-status.json`.

  Add `keyValue`, a new read-only sdk function that reads a key's current source and target value for
  exactly one target locale, live via the same `readSource`/`readTarget` calls `check`, `diff`,
  `retranslateEntry`, and `editEntry` already use. `target` is absent exactly when the key does not
  yet exist in that target locale. No provider call, no file write, no lock.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own behavior
  is unchanged.

### Patch Changes

- a53e0c4: Deduplicate the tolerant target-locale read into a single shared helper. The export, import, and per-locale translate flows now delegate to the same implementation as diff and check, so the empty-resource shape and the file-existence check can no longer drift apart. No behavior change.
- bcd68e8: Rewrite all JSDoc from the implementation and remove non-documentation comments. Corrects stale API documentation, including the SdkError per-code thrown-by attributions, the translate() docblock attachment, and the CLI watch-session exit-code contract.
- 0ae2f52: Preserve document key order exactly on round-trip for the JSON-family, YAML, and ARB adapters. Integer-like keys such as "2", "10", or "404" are no longer hoisted to the front and re-sorted on read or write, so files keyed by numeric ids, HTTP status codes, or years keep their own key order, and new keys added by a translate run now append after the target's existing keys in source-document order instead of alphabetically. As part of the YAML conformance, a document using a map or sequence as a mapping key is now rejected with a structured INVALID_STRUCTURE error instead of silently collapsing to "[object Object]".
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

## 0.5.0-next.4

### Patch Changes

- Updated dependencies [81dd225]
- Updated dependencies [435e048]
- Updated dependencies [ad431ca]
  - @verbatra/sdk@0.5.0-next.4

## 0.5.0-next.3

### Minor Changes

- b6c871f: Harden the CLI's error handling at four boundary points that previously bypassed the structured error
  scaffold and could surface a raw stack instead of a clean exit code:

  - `translate` and `watch` now load `.env`/`.env.local` inside the same try that maps errors to exit
    `2`. A missing `.env` file is still a silent no-op, but a non-ENOENT read error (for example an
    unreadable file, or a directory named `.env`) now renders as a structured error instead of an
    unhandled exception.
  - `--debounce` is now validated instead of silently defaulted. A non-integer, zero, negative, or
    unit-suffixed value (like `250ms`) is rejected as a usage error (`INVALID_DEBOUNCE`, exit `2`); it no
    longer falls back to the 300ms default. This is a user-facing behavior change: a `--debounce` value
    that previously silently defaulted now fails the run.
  - All six one-shot commands (`translate`, `watch`, `export`, `import`, `check`, `diff`) now validate
    their options with a zod schema inside the error scaffold. `import`'s option parsing in particular
    moved inside the try, so a malformed option object can no longer escape as an unhandled rejection.
  - The exit-code documentation in the package header and `run()`'s JSDoc now also names `check`/`diff`
    returning `1` for drift or pending changes, alongside `translate`/`import`'s "some locales failed".

  `@verbatra/sdk` is version-locked with `@verbatra/cli` and picks up the same bump with no behavior
  change of its own.

### Patch Changes

- Updated dependencies [35fe0f6]
- Updated dependencies [874cf70]
- Updated dependencies [e617c6b]
- Updated dependencies [dfd2b77]
  - @verbatra/sdk@0.5.0-next.3

## 0.5.0-next.2

### Patch Changes

- Updated dependencies [565eb89]
- Updated dependencies [4c6fd52]
- Updated dependencies [2127234]
- Updated dependencies [f3fd15f]
  - @verbatra/sdk@0.5.0-next.2

## 0.5.0-next.1

### Patch Changes

- Updated dependencies [14e9719]
- Updated dependencies [440212e]
- Updated dependencies [54a641a]
- Updated dependencies [400e044]
- Updated dependencies [2fe16b2]
- Updated dependencies [b945e53]
  - @verbatra/sdk@0.5.0-next.1

## 0.5.0-next.0

### Minor Changes

- a923c09: Add a `verbatra studio` command that starts Verbatra Studio, a local, read-only translation dashboard served from `@verbatra/studio`. The command loads the project config before anything else, prints a one-time tokenized loopback URL once the server is listening, and exits cleanly on Ctrl-C (a second interrupt force-stops it). It reaches `@verbatra/studio` only through a dynamic import, so it fails with a clear install hint instead of a crash when that package is not present. `@verbatra/sdk` is version-locked with `@verbatra/cli` and picks up the same bump; its own behavior is unchanged.

### Patch Changes

- Updated dependencies [5597f98]
- Updated dependencies [4a789ff]
  - @verbatra/sdk@0.5.0-next.0

## 0.4.4

### Patch Changes

- Updated dependencies [8591e82]
- Updated dependencies [43e3dbe]
- Updated dependencies [714324f]
- Updated dependencies [f3f47ad]
- Updated dependencies [e8a1e1d]
- Updated dependencies [75f54cb]
- Updated dependencies [d119616]
  - @verbatra/sdk@0.4.4

## 0.4.3

### Patch Changes

- Updated dependencies [0470883]
- Updated dependencies [55fc543]
- Updated dependencies [3b6d79f]
- Updated dependencies [c525929]
  - @verbatra/sdk@0.4.3

## 0.4.2

### Patch Changes

- 2ac8ad6: Remediate open npm audit advisories with pnpm overrides. Lifts the transitive uuid copy bundled through exceljs to >=11.1.1 (GHSA-w5hq-g745-h8pq) on the published path, and the dev-only js-yaml (GHSA-h67p-54hq-rp68, to the patched v3 line) and esbuild (GHSA-g7r4-m6w7-qqqr) copies. No source or public API change; this records the change to the resolved dependency tree of the published packages.
- Updated dependencies [2ac8ad6]
  - @verbatra/sdk@0.4.2

## 0.4.1

### Patch Changes

- 792c889: Fix `defineConfig` and config authoring failing to typecheck in consumer projects. The published `.d.ts` files imported unpublished `@verbatra/*` internals that do not exist in a consumer install, so the provider model types degraded to `never` and every `defineConfig` call failed with TS2769. The SDK declaration build now inlines those private workspace types, so the published declarations no longer reference `@verbatra/core`, `@verbatra/ai-providers`, or `@verbatra/format-adapters`. `defineConfig` now typechecks for every provider id with per-provider model autocomplete preserved.
- Updated dependencies [792c889]
  - @verbatra/sdk@0.4.1

## 0.4.0

### Minor Changes

- 6dc983c: Add a read-only `check` command and the matching SDK `check()` surface. `verbatra check` reports, per target locale, how many keys are missing (present in the source, absent from the target), how many are stale (the source changed since the target was last translated), and how many are up to date. It calls no provider, needs no API key, writes no files, and never touches the lock.

  Exit codes make it CI-friendly: `0` when every locale is in sync, `1` when at least one locale has a missing or stale key (the full per-locale report is still printed), and `2` when the run could not start (a structured error to stderr, with stdout left clean for `--json` piping). Flags mirror the other commands: `--cwd`, `--config`, `--locales`, and `--json` (the JSON form is the SDK `CheckSummary` verbatim).

  The SDK exposes `check(input, deps?)` returning a `CheckSummary` of `{ inSync, locales }`, where each `LocaleCheckSummary` carries `{ locale, missing, stale, upToDate, inSync }`. It reuses the existing source read, adapter selection, lock baseline, and core `diffResources`, so there is one definition of drift in the codebase.

- 986d832: Add a read-only `diff` command and the matching SDK `diff()` surface, the detailed sibling of `check`. Where `check` reports per-locale counts, `verbatra diff` reports the actual keys: per target locale it lists the keys that would be added (missing from the target), the keys that would be re-translated (the source changed since the target was last translated), and the keys that are orphaned (present in the target, absent from the source). It calls no provider, needs no API key, writes no files, and never touches the lock.

  Exit codes make it CI-friendly: `0` when no locale has pending changes, `1` when at least one locale has a missing or changed key (the full per-locale report is still printed first), and `2` when the run could not start (a structured error to stderr, with stdout left clean for `--json` piping). Orphaned keys are always reported but never on their own flip the exit code, because a default `translate` run does not prune. Flags mirror the other commands: `--cwd`, `--config`, `--locales`, and `--json` (the JSON form is the SDK `DiffSummary` verbatim, with the full key lists).

  The SDK exposes `diff(input, deps?)` returning a `DiffSummary` of `{ hasPendingChanges, locales }`, where each `LocaleDiff` carries `{ locale, missing, changed, orphaned, hasPendingChanges }`. Internally, `check` and `diff` now share a single read-plus-diff orchestration over the existing source read, adapter selection, lock baseline, and core `diffResources`, so there is one definition of drift in the codebase. The `check` public contract is unchanged.

- b0a558f: Add three new format adapters: XLIFF, YAML, and Flutter ARB. verbatra can now point at XLIFF (`.xlf`, `.xliff`), YAML (`.yml`, `.yaml`), and ARB (`.arb`) locale files in the same translate and watch flows, with no change to how the tool is run. Select a new format through the existing config `format` key; the SDK and CLI pick the adapters up through the registry automatically.

  - XLIFF: parses XLIFF 1.2 (file/body/trans-unit) and 2.0 (file/unit/segment), reading the target over the source. Writes update the target in place, leaving the source, every attribute, and every note untouched so they round-trip. A missing destination is rejected with a structured error, because source, target, and attributes cannot be synthesized from a flat key/value map (standard tooling seeds the target file first).
  - YAML: a nested tree like JSON in YAML syntax, with i18next-compatible `{{double-brace}}` interpolation. Anchor-alias expansion is bounded against billion-laughs input, and non-object roots and non-string leaves are rejected.
  - ARB: JSON-based Flutter resource bundles. `@`-prefixed metadata keys are preserved and round-tripped in document order, never sent for translation. Message values are ICU MessageFormat, so placeholders, plurals, and message validity reuse the shared ICU analysis.

  Internally, the JSON adapter factory is generalized into a shared tree-file factory (hosting the JSON family, ARB, and YAML) plus a small flat-file factory (XLIFF), both reusing the same bounded read, structured errors, and atomic write. The four existing JSON adapters are unchanged. Two runtime dependencies are added to `@verbatra/sdk`: `yaml` and `@xmldom/xmldom`, both with permissive licenses and no native bindings.

### Patch Changes

- 86d7fcb: Centralize the CLI `init` lookup tables behind an SDK scaffolding-metadata surface and consolidate the one-shot whole-run error scaffold. This is a behavior-preserving refactor: the scaffolded `verbatra.config.ts`, `.env.example`, and `.gitignore` bytes are identical, and every command exit code (`0`, `1`, `2`, `130`) is unchanged.

  `@verbatra/sdk` gains one additive, read-only export, `scaffoldingMetadata` (provider id to env var, LLM provider id to a cosmetic default scaffold model, and the supported format ids), plus a re-exported `SupportedFormat` type. The values are sourced from `@verbatra/core` (format ids) and `@verbatra/ai-providers` (provider env vars and scaffold models); the SDK assembles a pass-through and owns no copy. A `Record<ProviderId, string>` compile guard ties the env-var table to the canonical provider union.

  The CLI `init` command now reads provider ids, env-var names, and default models from `scaffoldingMetadata` instead of hand-maintained local tables, so a provider, env-var, model, or format-id change in a lower package breaks the CLI build instead of silently drifting. The `FORMAT_BY_DEP` npm-dependency-to-format detection map stays CLI-local by design, with its format ids typed against `SupportedFormat`. The repeated load-config plus try/catch plus `return 2` scaffold in `runTranslate`, `runExport`, `runImport`, `runCheck`, and `runDiff` is consolidated into one `withWholeRunErrors` helper; `runWatch` keeps its own streaming error model and the `130` force-stop path.

  The new SDK export is internal-facing and the change is behavior-preserving, so this is a patch on the version-locked `sdk` and `cli` pair. The private `core` and `ai-providers` packages ship no changeset.

- Updated dependencies [6dc983c]
- Updated dependencies [986d832]
- Updated dependencies [b0a558f]
- Updated dependencies [86d7fcb]
  - @verbatra/sdk@0.4.0

## 0.3.0

### Minor Changes

- 4fd6165: feat(sdk): warn on missing CLDR plural categories, with opt-in generation (`generatePlurals`)

  When a target language requires more CLDR plural categories than the i18next source supplies (for
  example Arabic, Polish, or Russian against an English one/other source), verbatra emits a per-locale
  `PLURAL_CATEGORIES_INCOMPLETE` notice naming the locale and the missing categories; the run still
  succeeds. Opt-in `generatePlurals` makes verbatra synthesize the missing target forms so the written
  plural set is complete, instead of only warning. This is off by default: enable it with a
  `generatePlurals: true` config option or a per-run `generatePlurals` override (the override takes
  precedence), mirroring the `prune` pattern.

  Generation is supported for i18next-JSON projects translated by an LLM provider only. DeepL,
  non-i18next formats, and target languages not in the static category lookup fall back to the existing
  `PLURAL_CATEGORIES_INCOMPLETE` warning and never hard-fail. Generated forms ride the existing provider
  path: the source plural value travels in the data channel and the CLDR category travels as data context
  (meaning), so the prompt-injection boundary is unchanged and no provider request shape or schema changes.
  Each generated form is placeholder/ICU integrity-checked like any translation; a failing form is withheld
  (surfaced in `integrityMismatches`) and keeps the warning. Generated keys are tracked in the lock by a
  hash of their governing source plural forms (not regenerated while those are unchanged, reconsidered when
  they change, retried when withheld) and are surfaced on the run summary as a new `generated` field,
  distinct from `translated`. The warning is suppressed only when a supported case produced a complete,
  integrity-passing set.

  The CLI surfaces this on its default human output: the per-locale line now shows a `generated` count
  (only when non-zero, matching how `orphaned` and `pruned` are shown), so a user not using `--json` sees
  when plural forms were synthesized. The JSON and NDJSON output already carried the `generated` field
  verbatim.

- 4fd6165: feat: add opt-in orphan pruning (`--prune`)

  Pruning is off by default and never deletes translator work silently. Enable it with the new
  `translate --prune` flag or a `prune: true` option in the config (the flag takes precedence per run).
  When on, verbatra removes exactly the orphaned keys (present in a target file but absent from the
  source) from the written target file and the lock; no other key is ever touched. Combine
  `--prune --dry-run` to preview which keys would be removed without writing anything. The run summary
  (human and `--json` / watch NDJSON) reports a per-locale pruned count and key list alongside the
  existing orphaned reporting.

### Patch Changes

- e1117b6: fix(init): scaffold a real default model per provider

  `verbatra init` now writes a real default model (anthropic `claude-sonnet-4-6`, openai
  `gpt-5.4-mini`, gemini `gemini-2.5-flash`) instead of the `<your-model>` placeholder, so a
  freshly scaffolded `verbatra.config.ts` type-checks immediately under the per-provider model
  restriction. Change it to any model the provider supports; the runtime accepts any non-empty
  string, so the default going stale is cosmetic.

- 4fd6165: fix(cli): handle a rejected watcher stop so a failed shutdown exits cleanly

  Both watch-session stop seams now catch a rejection from the underlying stop: the error is rendered to stderr and the session resolves exit code 2 instead of leaking an unhandled rejection that could crash the process. A clean stop still resolves 0 and a forced second stop still resolves 130.

- Updated dependencies [4fd6165]
- Updated dependencies [4fd6165]
- Updated dependencies [2ba217b]
- Updated dependencies [4fd6165]
- Updated dependencies [4fd937b]
  - @verbatra/sdk@0.3.0

## 0.2.2

### Patch Changes

- Updated dependencies [82c4555]
  - @verbatra/sdk@0.2.2

## 0.2.1

### Patch Changes

- 3d38db5: Bring the published package READMEs up to the shipped 0.2.0 surface. The CLI README now lists all
  five commands (adds `export` and `import`) with their documentation links and a note on the manual
  -translation workflow. The SDK README documents all six exported functions (adds `exportWorkbook`
  and `importWorkbook` with signatures) and the optional `glossary` and `tone` config fields. The
  npm `homepage` now points at the documentation site. No runtime code changed.
- Updated dependencies [3d38db5]
  - @verbatra/sdk@0.2.1

## 0.2.0

### Minor Changes

- fc83588: Add the Excel manual-translation workflow: export untranslated strings to a styled `.xlsx`
  workbook and import the filled workbook back into the locale files.

  - New package `@verbatra/exchange`: a neutral, format-agnostic workbook row model with
    `buildWorkbook` and `readWorkbook`. The xlsx library (exceljs) is isolated here. The
    untrusted workbook parse is bounded (entry, decompressed-byte, sheet, row, and cell caps)
    and its XML is rejected if it declares a DTD or entity; structural problems surface as a
    structured, secret-free `WORKBOOK_INVALID` error.

    Threat model and design reasoning for the workbook parse guards:

    - The decompressed-byte cap is checked both against each entry's declared (header) size and
      against the bytes actually produced as the entry decompresses, so a zip whose header lies
      about the uncompressed size cannot bypass the cap (a decompression-bomb / "zip bomb"
      defense).
    - The DTD/entity rejection (`assertNoDoctype`) is a deliberately parser-independent,
      defense-in-depth guard against XXE and entity-expansion. exceljs parses XML with saxes,
      which by analysis does not resolve external entities by default; rather than depend on that
      default holding across library versions, the guard rejects any part that even declares a
      DTD or entity before exceljs ever parses it. It runs on every decompressed entry, not only
      `.xml`/`.rels`, because exceljs also parses markup parts such as `.vml`, so a DOCTYPE or
      ENTITY smuggled into one of those must be caught before parsing. A well-formed xlsx contains
      neither construct in any part.
    - These caps and the DTD/entity guard were added during the security review of the workbook
      interchange feature.

  - `@verbatra/sdk`: `exportWorkbook` and `importWorkbook`, composing the existing source read,
    adapter selection, lock baseline, diff, and the core placeholder/ICU/drift checks. Import
    returns a `RunSummary` structurally identical to `translate`'s; withheld rows (placeholder
    mismatch, invalid ICU, source drift) are reported and never written, and the lock is not
    updated for them.
  - `@verbatra/cli`: `verbatra export` and `verbatra import <workbook>`, thin wrappers over the
    SDK with `--include-unchanged` on export and `--dry-run` on import. The import exit-code rule
    matches `translate`.
  - `@verbatra/format-adapters`: one additive, non-breaking `FormatAdapter.validateMessage(value)`
    method to ICU-check a filled value before writing (next-intl delegates to its existing ICU
    logic; the other adapters report every value valid).

### Patch Changes

- Updated dependencies [fc83588]
  - @verbatra/sdk@0.2.0

## 0.1.0

### Minor Changes

- fef4a2e: Add @verbatra/cli, the v1 command-line interface and a thin wrapper over @verbatra/sdk. It exposes a
  `verbatra` binary with two subcommands: `translate` (one-shot) and `watch` (long-running). The CLI
  parses arguments with commander, loads config via the SDK's loadConfig, calls the SDK's translate()
  or watch(), and renders the returned structured result - adding no translation, diff, or lock logic
  of its own. Shared `--cwd` and `--config` (a pass-through to loadConfig's configPath); `translate`
  adds `--dry-run` and `--json`; `watch` adds `--debounce` and `--json` (NDJSON, one record per run).
  Human output by default, with strict stdout/stderr discipline so `--json` stdout is a clean,
  parseable stream. Exit codes: 0 success, 1 a per-locale failure, 2 a whole-run/startup/usage error,
  130 a forced second Ctrl-C during watch. SIGINT triggers a graceful stop that awaits the in-flight
  run. The only new dependency is commander (pinned exact).

### Patch Changes

- Updated dependencies [c5d8cd6]
- Updated dependencies [8861ed8]
- Updated dependencies [1390e2d]
  - @verbatra/sdk@0.1.0
