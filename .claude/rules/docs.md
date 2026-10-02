# Docs (apps/docs)

`apps/docs` (`@verbatra/docs`, private) is a Fumadocs/Next.js site. It dogfoods verbatra for its
own UI strings, while its MDX content translations are written by AI agents in the repository,
because verbatra translates structured formats (JSON, XLIFF, YAML, ARB, properties), not
Markdown/MDX.

## Two kinds of translated content, two mechanisms

- **UI strings**: `apps/docs/messages/en.json` (source) plus `de.json`, `es.json`, `fr.json`.
  Translated by running `pnpm i18n` from `apps/docs`, which runs `verbatra translate`
  (`apps/docs/package.json` `scripts.i18n`) against `apps/docs/verbatra.config.ts`:
  `format: "next-intl-json"`, `files.pattern: "messages/{locale}.json"`,
  `targetLocales: ["de", "es", "fr"]`, provider `gemini`, `tone: "informal"`. This is real, running
  verbatra. `.github/workflows/docs-i18n-check.yml` runs `verbatra/action` in `check` mode inside
  `apps/docs` on every pull request that touches `apps/docs/messages/**`,
  `apps/docs/content/docs/**`, `verbatra.config.ts`, or `verbatra.lock.json`. Its `check` only
  validates what `verbatra.config.ts` covers, `files.pattern: "messages/{locale}.json"`, so it
  detects drift in `messages/*.json` only. The `content/docs/**` path is a trigger, not something
  the check inspects: MDX locale parity is not enforced by CI and rests entirely on the author
  following the rule below.
- **MDX documentation content**: `apps/docs/content/docs/**`. English source is `page.mdx`; a
  translation is a locale-suffixed sibling: `page.de.mdx`, `page.es.mdx`, `page.fr.mdx` (confirmed
  by the `(agents)`, `(concepts)`, `(configure)`, `(get-started)`, `(guides)`, `(help)`, and `(sdk)`
  route groups and the `cli` and `sdk` folders). These are translated by an AI agent
  in the same change as the English page, following the tone rules below; verbatra's
  `next-intl-json` adapter only covers `messages/*.json`, not MDX. Every non-English page renders
  the "Machine-translated page" notice (`docs.machineTranslated` in `messages/*.json`), which is the
  honest state and stays. The FAQ answer "Is this site's content translated by AI?" says the same
  in all four locales, pinned by `apps/docs/lib/extract-faq.translation-claims.test.ts`.

## Sidebar: two tabs, built from meta files only

The sidebar has two tabs, **Docs** and **Reference**. They are Fumadocs root folders
(`"root": true`) whose folders `content/docs/(docs)/` and `content/docs/(reference)/` hold only a
`meta.json` and its `meta.de.json`/`meta.es.json`/`meta.fr.json` siblings. They list the existing
route groups with relative paths (`"../(guides)"`), and a group's `meta.json` may pull a page from
another route group the same way (`"../(configure)/network-policy"`). A page's URL never contains
a parenthesized folder, so regrouping the sidebar or moving a page between tabs changes no URL;
only renaming a file does. `(agents)` has no `meta.json`: its pages are listed by `(get-started)`
and `(guides)`. A link entry in a translated meta file (`[Label](/de/docs/...)`) carries its
locale prefix. `apps/docs/lib/docs-sidebar.test.ts` builds the real page tree and fails when a
page is missing from both tabs, listed twice, or a link leaves its locale.

A renamed page gets a permanent redirect for every locale and for its `.md` form: add the
`old: "new"` pair to `MOVED_DOCS_PAGES` in `apps/docs/next.config.mjs`, and
`apps/docs/next.config.test.ts` checks the four redirects and that the old file is gone.

## Source of truth: what's actually shipped

Never write an enumerated feature list into a docs rules file or a docs page from memory. Three
files define what verbatra actually ships, and they cannot go stale the way prose can, because
they are the code:

- `packages/cli/src/run.ts` - every `.command(...)` registration is a real CLI command. Grep
  `\.command\(` there for the current list rather than trusting a remembered one.
- `packages/format-adapters/src/default-registry.ts` - `createDefaultRegistry`'s
  `.register(...)` chain is the closed set of supported formats.
- `packages/sdk/src/config/provider-config.ts` - the `providerFactories` table (and the
  `providerConfigSchema` discriminated union above it) is the closed set of supported providers.

When documenting a command, format, or provider, check the matching file first. When a change adds
or removes a command/format/provider, the docs update belongs in the same change as the code
change (see `CONTRIBUTING.md` "Adding a provider or a format adapter" for the exact docs files each
extension touches: `providers.mdx`, `config-file.mdx`, `formats.mdx`, plus
`apps/docs/lib/structured-data.ts`'s `FORMAT_LABELS` for a new format).

## Every user-facing change updates all four locale files

A change to `messages/en.json` or to an English `page.mdx` is not complete until the corresponding
`de`, `es`, and `fr` files are updated in the *same* change, whether by an AI agent (MDX content)
or by re-running `pnpm i18n` (UI strings, `messages/*.json`). Do not land an English-only update and
leave the other three locales to catch up later. `docs-i18n-check.yml` only backstops the
`messages/*.json` half of this (see above). For MDX, `apps/docs/lib/docs-locale-parity.test.ts`
fails when a locale misses a page or a `meta` file, when a translated `meta` file lists other
pages, or when a translated page's `##` and `###` heading counts, code block count, or
`<AvailableFrom>` versions differ from the English page. It cannot tell whether the prose itself
is current, so keeping the wording in step stays an authoring discipline.

The reference tables are asserted in all four locales against the code by the `scripts/*.test.mjs`
parity tests (`pnpm test:scripts`):

- `verify-docs-reference-parity.test.mjs`: exactly one section per SDK entry point across the
  `sdk/` folder (the pages its `meta.json` lists), the `generateTypes` refusals in
  `cli/types*.mdx`, and `(reference)/error-codes*.mdx`: one `###` entry per code, in source
  order, for the CLI, `SdkErrorCode`, `ProviderErrorCode` and `AdapterErrorCode` families, the
  review gate codes, the review reasons and both notice families, with each error code's next step
  quoted exactly from `packages/sdk/src/error-hints.ts` or `packages/cli/src/cli-error-hints.ts`
  (in English in every locale, because that is what verbatra prints) and one unique anchor per
  code. `cli/output`, `sdk/errors` and `providers` link there instead of repeating the tables. An old `/docs/sdk#<entry>` link still lands:
  `<SdkAnchorForward />` on `sdk/index*.mdx` forwards it to the page that now heads the anchor,
  and `apps/docs/lib/sdk-anchors.test.ts` pins every anchor of the former single page per locale.
- `verify-docs-mcp-tool-names.test.mjs`: the tool table in `cli/mcp*.mdx` and in
  `packages/mcp/README.md` follows `ALL_TOOLS_IN_ORDER`, with exactly the spend-gated tools marked
  as calling a provider, and the client allowlists name only registered, non-spend tools.
- `verify-docs-studio-tool-names.test.mjs`: the read, write and spend tool tables in
  `(agents)/agent-tools-in-studio*.mdx` list exactly the tools of `TOOL_DESCRIPTORS`
  (`packages/studio/src/webmcp/register-tools.ts`), each in the table its `readOnlyHint` and
  `spendGated` flags put it in.
- `verify-docs-registry-parity.test.mjs`: the overview table in `formats*.mdx` lists every
  `SUPPORTED_FORMATS` id in order, `providers*.mdx` opens one `##` section per `providerFactories`
  id plus `none`, the `cli/doctor*.mdx` check table follows the setup checks in `doctor.ts`, and
  every `.command(...)` in `run.ts` appears in `cli/meta*.json` and the `cli/index*.mdx` table, with
  its page's flags table naming exactly its own `.option(...)` flags, and the global flags table in
  `cli/index*.mdx` naming, per shared flag (`--cwd`, `--config`, `--json`), exactly the commands
  that do not take it.
- `verify-docs-registry-counts.test.mjs`: no MDX page spells out a count of formats, providers,
  or commands ("fourteen formats", "sieben Provider"). Link to the list instead, or name the
  items.

## SDK reference entries

Every entry point in `apps/docs/content/docs/sdk/*.mdx` follows one template: the heading (with an
inline `<AvailableFrom />` when newer than the first release), one lead paragraph, a
`ts title="Signature"` block (`Signatur`, `Firma`, `Signature` in de, es, fr), an
`<SdkTypeTable name="<Input type>" />` for an object input, a **Returns** line, and a **Throws**
line linking each `SdkError` code to `/docs/error-codes#<code>`. The type table renders the
published English JSDoc on every locale; everything around it is translated. The Throws line is
test-pinned to each function's `@throws` tags (`scripts/verify-docs-reference-parity.test.mjs`), so
a new `@throws` code fails `pnpm test:scripts` until all four locales list it.

## The `<AvailableFrom />` badge

Component: `apps/docs/components/available-from.tsx`. Renders a small inline badge ("Available
from X.Y.Z", with the upgrade advice as its `title`) sourced from the `docs.availableFrom`
translation namespace (`messages/*.json`), so its copy is translated like any other UI string, not
hand-duplicated per locale MDX file. Written on its own line directly under a `##` to `####`
heading, it is moved into that heading at build time (`lib/available-from-heading.ts`, after the
TOC is taken, so the TOC and the heading's anchor stay clean); in a table cell or inline it renders
where it is written. Where a badge may sit at all is set by "Badge placement" under
[Docs budget](#docs-budget) below.

- Usage: `<AvailableFrom version="X.Y.Z" />` for a CLI/SDK feature, or
  `<AvailableFrom version="X.Y.Z" pkg="@verbatra/studio" />` when the feature belongs to a
  specific package (see the real usage in
  `apps/docs/content/docs/(agents)/agent-tools-in-studio.mdx`).
- Use it on any documented feature that shipped after the package's initial release, so a reader on
  an older version knows to upgrade instead of filing a "this doesn't work" report.
- To get the correct version, do not guess or copy the current `package.json` version by hand:
  run `pnpm changeset status` (or check the changeset that introduces the feature) to see what
  version the pending or landed change actually bumps to. `@verbatra/cli` and `@verbatra/sdk` are
  version-locked (`fixed` in `.changeset/config.json`), so a CLI/SDK feature uses their shared
  version; `@verbatra/studio` versions independently and needs its own number, which is why
  `pkg="@verbatra/studio"` exists.
- It never needs removing later. Once a version ships, the badge is historically accurate
  forever; do not go back and strip it once the "from" version is old. The 1.0 baseline under
  "Badge placement" below is a rule for when 1.0.0 ships, and even then it hides badges rather
  than deleting them from the source.

## Docs budget

Every page has a word ceiling, so a page that keeps growing gets split or trimmed on purpose
rather than by accident.

### Ceilings

Counted in English prose words by `proseWords` (`apps/docs/lib/page-type.ts`): frontmatter, fenced
code and JSX tags are stripped, and only tokens with a letter or digit count. The page type comes
from the `type` frontmatter field.

| Page | Ceiling |
| --- | --- |
| overview | 600 |
| tutorial | 900 |
| how-to | 1,200 |
| concept | 1,800 |
| reference | 3,000 |
| CLI command page (`cli/<command>.mdx`, not `cli/index` or `cli/output`) | 2,000 |
| lookup reference (`LOOKUP_REFERENCE_PAGES`: `(reference)/error-codes.mdx` only) | 12,000 |

The values live in `page-type.ts` (`WORD_CEILING`, `COMMAND_PAGE_CEILING`,
`LOOKUP_REFERENCE_CEILING`), and that one counter feeds every check:
`apps/docs/lib/docs-page-type.test.ts` holds every page to its ceiling, and
`scripts/verify-docs-registry-parity.test.mjs` holds each command page to the command cap.
`pnpm --filter @verbatra/docs docs:budget` lists every page at or above 90 percent of its ceiling,
so the headroom is visible in review rather than discovered on a failing test.

Until 0.12.0 is released, do not lower a ceiling. After the 0.12.0 release, lower concept to
1,600 and reference to 2,500, splitting `sdk/inspect`, `providers` or `config-file` if one cannot
fit.

### One owner per fact

A recurring fact is stated fully on one owner page; every other page gives it at most one sentence
and a link to the owner.

| Fact | Owner |
| --- | --- |
| `.env` loading | `cli/index#environment-files` |
| Exit codes, the JSON envelope | `cli/output` |
| Provider key variables | `providers#keys-come-from-the-environment` |
| Spend gating (flag, environment fallback, accepted values) | `cli/studio`, `cli/mcp#spend-tools` |
| Provider `none` | `human-only-workflow` |
| Network egress | `network-policy` |
| The integrity gate, review reasons | `translation-safety` |
| What leaves the machine | `data-handling` |
| Every error, notice and review code | `error-codes` |

### Growth rules

- **No hand-typed registry lists outside the owner.** A list that mirrors code (codes, commands,
  flags, environment variables, tools, formats, providers) is either pinned by a parity test or
  replaced by a link. A change that adds a registry member names the owner page and the test that
  pins it.
- **Budget-neutral growth.** A page at or above 90 percent of its ceiling grows only by an equal
  cut in the same change. A feature's docs plan names the pages it touches and their headroom.
- **New pages.** Add one only when the feature is its own task (a how-to) or its own lookup. A new
  page carries one page-level badge.

### Badge placement

`apps/docs/lib/docs-badge-placement.test.ts` enforces these rules in all four locales:

- A badge sits under a heading, in a table cell (a row's effect cell, or a header cell when the
  whole column is new), or at page level (on its own line before the first heading).
- On how-to, concept and tutorial pages a badge never stands alone before a paragraph or list item,
  and never sits inline in one. Move it to the heading or table row it belongs to; when only part
  of a section is new, give that part its own `###` (or `####`) and offset the heading's words.
  Reference pages may still date a paragraph or list item in place.
- At most one badge per heading. When a heading would need two, the second dates something
  narrower: give it a row, a subheading, or (on a reference page) the item it dates.
- No badge repeats the page-level badge, and a page carries at most one page-level badge. A page
  new in a release carries that release's page badge and no section badges of the same version.
- No prose restates a badge's version ("first appears in 0.12.0", "from 0.12.0" under a 0.12.0
  heading). Prose may still state a requirement ("needs `0.12.0` or newer") or date a change that
  has no badge.
- Moving a badge never drops its information: the feature it dated stays dated to the same
  version.
- 1.0 baseline, to apply when 1.0.0 ships (not implemented: `available-from.tsx` renders every
  badge today): set a baseline version and make badges at or below it render nothing. The source
  keeps them, so a badge is still never removed.

## Register and tone

Informal address throughout: German `du` (not `Sie`), Spanish `tú` (not `usted`), French `tu` (not
`vous`). This is the same tone the automated translation already applies
(`apps/docs/verbatra.config.ts`: `tone: "informal"`), so agent-translated MDX content should match
it for consistency between the UI strings and the pages.

Never use the em dash (U+2014) in any locale, including German, Spanish, or French content an agent
wrote. Use a spaced hyphen, a colon, or parentheses instead, exactly as the repo-wide rule
requires for English.
