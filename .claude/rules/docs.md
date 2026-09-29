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
- `verify-docs-registry-parity.test.mjs`: the overview table in `formats*.mdx` lists every
  `SUPPORTED_FORMATS` id in order, `providers*.mdx` opens one `##` section per `providerFactories`
  id plus `none`, the `cli/doctor*.mdx` check table follows the setup checks in `doctor.ts`, and
  every `.command(...)` in `run.ts` appears in `cli/meta*.json` and the `cli/index*.mdx` table, with
  its page's flags table naming exactly its `.option(...)` flags and the `--json` list in
  `ci-and-exit-codes*.mdx` naming exactly the commands that take `--json`.
- `verify-docs-registry-counts.test.mjs`: no MDX page spells out a count of formats, providers,
  or commands ("fourteen formats", "sieben Provider"). Link to the list instead, or name the
  items.

## The `<AvailableFrom />` badge

Component: `apps/docs/components/available-from.tsx`. Renders a small inline badge ("Available
from X.Y.Z", with the upgrade advice as its `title`) sourced from the `docs.availableFrom`
translation namespace (`messages/*.json`), so its copy is translated like any other UI string, not
hand-duplicated per locale MDX file. Written on its own line directly under a `##` to `####`
heading, it is moved into that heading at build time (`lib/available-from-heading.ts`, after the
TOC is taken, so the TOC and the heading's anchor stay clean); anywhere else it sits on its own
line where it is written.

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
  forever; do not go back and strip it once the "from" version is old.

## Register and tone

Informal address throughout: German `du` (not `Sie`), Spanish `tú` (not `usted`), French `tu` (not
`vous`). This is the same tone the automated translation already applies
(`apps/docs/verbatra.config.ts`: `tone: "informal"`), so agent-translated MDX content should match
it for consistency between the UI strings and the pages.

Never use the em dash (U+2014) in any locale, including German, Spanish, or French content an agent
wrote. Use a spaced hyphen, a colon, or parentheses instead, exactly as the repo-wide rule
requires for English.
