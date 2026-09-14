# 1. Source string extraction

- Status: accepted
- Date: 2026-09-14
- Applies to: `@verbatra/extract`, `@verbatra/sdk`, `@verbatra/cli`

## Context

Every input path verbatra has today starts from a locale file that already exists. A
`FormatAdapter` (`packages/format-adapters/src/adapter.ts`) reads one catalog file into
`LocaleResource`, and the workbook import path still requires the keys to pre-exist in the source
catalog. That makes verbatra a tool for projects that are already internationalized. A project
that has `t("app.title")` scattered through its source and no catalog at all cannot use it.

Reading translation call sites out of application source is a different capability class from
reading a catalog file: code to intermediate representation, not file to intermediate
representation. It does not fit `FormatAdapter`, whose `read(filePath, locale)` contract is one
catalog file to one `LocaleResource` and whose `canHandle` discriminates by extension plus a
content sample. `SupportedFormat` (`packages/core/src/model/supported-format.ts`) is a closed set
that `config.format` is validated against, so adding a source language there would change what
`format` means for every other flow.

Two further capabilities are planned on top of the same parser (reporting catalog keys no longer
referenced by any call site, and flagging hardcoded literals that should be translated). They will
be built as separate follow-ups. The seam this decision fixes is what they build against, so the
port design matters more here than the number of frameworks covered.

Four constraints in the repository shape the parser choice:

- `'@swc/core': false` sits in `allowBuilds` in `pnpm-workspace.yaml`, so an SWC-based parser's
  native postinstall build is denied repository-wide and would need an explicit opt-in plus a CI
  story.
- `typescript` is pinned to the 6.x line in `pnpm-workspace.yaml` because TypeScript 7 drops the
  JavaScript compiler API that tsup's bundled `rollup-plugin-dts` needs. A parser built on the
  TypeScript compiler API inherits that pin and drags the whole compiler into the published bytes.
- A new runtime dependency needs a `catalogs.bundled` entry plus a re-declaration in
  `packages/sdk/package.json`, and `scripts/check-dependency-changeset.mjs` fails a pull request
  that moves a bundled entry without a changeset.
- Neither existing I/O port can enumerate a directory. `SdkFs` (`packages/sdk/src/fs.ts`) has no
  `readdir`, `opendir`, or glob, and neither does `AdapterFs`
  (`packages/format-adapters/src/fs-port.ts`). No package declares `glob`, `fast-glob`,
  `tinyglobby`, or `picomatch`. Source discovery is a genuinely new I/O primitive.

## Decisions

### 1. A purpose-built tokenizer, no third-party parser

The first increment ships its own comment-, string-, template- and regex-literal-aware tokenizer
rather than adopting SWC, the TypeScript compiler API, or a JavaScript parser from npm.

The reason is cost against benefit. Finding `t("key")` call sites needs exactly two things from a
parser: knowing when a character sequence is code rather than a comment or a string, and reading
the first argument of a call. A token stream delivers both. A full abstract syntax tree buys
scope analysis and JSX structure, neither of which the first increment consumes. Against that, a
third-party parser costs a bundled-catalog entry, an sdk re-declaration, a dependency-changeset
obligation, and, for the two obvious candidates, either an `allowBuilds` opt-in or the TypeScript
6.x pin propagating into published bytes.

The tokenizer is an implementation detail behind the `SourceExtractor` interface, not part of any
published contract. Swapping it for a real parser later changes one file per framework and nothing
in the port, the config surface, the SDK entry point, or the CLI command. That is the property
this decision is protecting, and it is why the seam is specified before any breadth is added.

Known limits, accepted deliberately and reported as data rather than papered over:

- A key argument that is not a complete static string literal (an identifier, a member expression,
  a template literal carrying an expression, or a concatenation such as `"user." + id`) is reported
  as a dynamic call site. It is never guessed at, never truncated to the fragment the tokenizer
  could read, and never silently dropped. The same completeness rule applies to a default value: a
  concatenated default yields no default rather than its first fragment.
- A namespace-qualified key, the `t("common:nav.home")` form, is reported as a dynamic call site
  and never written. See decision 8 for why, and for what that costs.
- JSX translation components are not read in this increment.
- A call site written inside a template literal expression is read, because the tokenizer descends
  into `${ }`.
- Regex literals are disambiguated from division by the preceding significant token, the standard
  heuristic. A pathological case resolves to a diagnostic on that file, not a wrong key.
- A method signature named `t` is distinguished from a call by what follows its parameter list, so
  an object-literal member, a class member, and a type or interface member are not read as call
  sites. A `t` compared with `<` to a call, the one shape that resembles a type-argument list, is
  not read either.

### 2. i18next is the only framework in the first increment

`SourceFramework` is a closed union whose sole member is `"i18next"`. It covers the `t(...)`,
`$t(...)`, and `<object>.t(...)` call shapes across `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`,
`.mts`, and `.cts`, including the `t("key", "Default")` and `t("key", { defaultValue: "Default" })`
argument forms, and including the optional-call (`t?.("key")`) and explicit type-argument
(`t<string>("key")`) spellings of each.

i18next is chosen over the alternatives because it is the most widely deployed of the ecosystems
verbatra already adapts and because its call shape is the one the other JavaScript frameworks
resemble most closely, so the shared call-site scan built for it is the piece the next framework
reuses rather than replaces.

Resolution goes through a mapped-type factory table over the union, in
`packages/sdk/src/config/extraction-config.ts`, mirroring `providerFactories` in
`provider-config.ts`. A framework added to the union without a table entry fails to compile. There
is exactly one resolution path; no second registry is introduced.

The framework is configured explicitly rather than inferred from `config.format`. The two are
different axes: `next-intl-json` names an ICU JSON catalog layout, not the framework whose call
sites appear in the source.

### 3. Directory enumeration is a readdir-style port, added to `SdkFs` as optional

`SdkFs` gains one optional member:

```ts
readDirectory?(path: string): Promise<readonly DirectoryEntry[]>;
```

where `DirectoryEntry` is `{ name: string; kind: "file" | "directory" | "other" }`.

It is readdir-style, not glob-style. A glob primitive would put pattern-matching semantics into a
published port, where every quirk of the chosen syntax becomes part of the contract and a caller
supplying its own `deps.fs` has to reimplement them. A readdir primitive is one operation with one
meaning, and the include and exclude rules stay in the extraction package where they can change
without touching published API.

It is optional because `SdkFs` is published API and an external `deps.fs` implementation written
against today's interface must keep compiling. `mkdir?` is already optional in the same file for
exactly this reason. An extraction run against an `fs` without `readDirectory` fails with a
structured `SdkError` naming the missing member.

The port's `kind` is also the containment guarantee. A symlink is reported as `other` and skipped,
so the walk cannot leave the configured roots by following one, and paths are built by joining a
root with an entry name rather than by resolving anything the file system hands back. `node_modules`
is in the default excluded set and is never walked.

### 4. `extract` is a new top-level command, not a flag on an existing one

It has its own inputs (source roots, a framework), its own output (a changed source catalog rather
than target catalogs), and its own failure modes. Folding it into `translate` would give that
command a mode in which it writes the source locale, which every other part of its contract
promises it never does.

The command takes `--cwd`, `--config`, `--dry-run`, and `--json`, matching the shared conventions.
It never constructs a provider and never reads an API key environment variable.

### 5. The catalog wins; extraction never overwrites an existing value

A key already in the source catalog keeps its value byte-for-byte. Only genuinely new keys are
added. When the same key is found at two call sites with two different default values, both values
are reported as a conflict and neither is written; last-write-wins would make the output depend on
directory traversal order.

The reasoning is that the catalog is edited by people and by the translation flows, while a default
in source is what a developer typed once at a call site. Letting code overwrite the catalog would
silently revert an editorial fix, and because the value feeds the content hash it would invalidate
every target translation of that key.

A call site with no static default is written with an empty value and reported separately, so the
author can see which keys still need source text. Writing the key itself as the value was rejected:
it would put machine-generated text into the catalog that a provider would then translate as prose.

### 6. A catalog key no longer present in the source is left untouched

Extraction adds and reports; it does not delete. Deciding that a key is unused requires a complete
and correct scan of every call site, including the dynamic ones this increment can only report, so
acting on that judgement belongs to the separate follow-up that owns it.

### 7. Package placement: a new private workspace package

`@verbatra/extract` is a new private workspace package taking the same graph position as
`@verbatra/exchange`: no dependency on `core`, `format-adapters`, or `ai-providers`, joining the
graph at the sdk. The dependency arrow stays acyclic and one-way.

The justification is the capability class, not build weight. tsup inlines the sdk's workspace
devDependencies into `packages/sdk/dist/index.js`, so the tokenizer ships inside the sdk's
published bytes either way. What the split buys is a boundary: a Strategy family with its own
interface, its own file-system port, and its own coverage gate, which cannot reach into the
adapter or provider plumbing and which the two planned follow-ups can depend on without depending
on the sdk.

### 8. A namespace-qualified key is dynamic, not extracted

i18next lets a call site name a namespace in the key itself, as `t("common:nav.home")`. Such a key
is reported as a dynamic call site and never written to the catalog.

The reason is that one verbatra config addresses one catalog file. `files.pattern` resolves a
single path per locale, and `LocaleResource` carries a single `namespace`, so there is no second
file for `common:` to land in. Writing the key verbatim would be worse than not writing it: the
adapter splits a key on `.`, so `common:nav.home` becomes a top-level `common:nav` object that the
running application never looks in, and that nobody notices until a translated string fails to
appear.

The cost is worth stating plainly, because it decides who can use this increment. A project that
spells a namespace at every call site gets a run in which every call site is dynamic and nothing is
added. `extract` is useful today on a project that keeps one namespace and writes its keys without
the prefix; a project organized around several namespaces has to wait. Lifting this is the first
thing to do after the second framework, and it is a config-surface question (one catalog file per
namespace) rather than a parser question, so the tokenizer choice in decision 1 does not block it.

## Consequences

- The translation-memory cache fingerprint (`packages/sdk/src/cache/fingerprint.ts`) is unchanged.
  It covers the inputs that change a provider's output for a given source string: provider, model,
  tone, and glossary. Extraction changes which keys exist, never how an existing source string is
  translated, so folding the extraction config into the fingerprint would invalidate every cached
  translation for no behavioural reason.
- `verbatraConfigSchema` is a strict object, so the `extract` block is declared there and nowhere
  else, and it flows into the shipped `packages/sdk/dist/config-schema.json`.
- The block is optional. A project that does not configure it is unaffected, and no existing
  default changes.
- Three new `SdkErrorCode` members are added: `EXTRACT_NOT_CONFIGURED` and `EXTRACT_FS_UNSUPPORTED`
  for the two ways the command cannot start, and `SOURCE_UNWRITABLE` because this is the only entry
  point that writes the source locale, so the existing `TARGET_UNWRITABLE` does not cover it.
- Adding the second framework is a new file plus a union member plus a table entry. If that turns
  out not to be true, this decision was wrong and the parser choice is the first thing to revisit.
