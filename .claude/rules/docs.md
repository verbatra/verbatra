# Docs (apps/docs)

`apps/docs` (`@verbatra/docs`, private) is a Fumadocs/Next.js site. It dogfoods verbatra for its
own UI strings but hand-maintains its MDX content translations, because verbatra translates
structured formats (JSON, XLIFF, YAML, ARB, properties), not Markdown/MDX.

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
  by the `(concepts)`, `(configure)`, `(get-started)`, `(guides)` route groups, each with a
  `meta.json` plus `meta.de.json`/`meta.es.json`/`meta.fr.json`). These are hand-translated;
  verbatra's `next-intl-json` adapter only covers `messages/*.json`, not MDX.

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
`de`, `es`, and `fr` files are updated in the *same* change, whether by hand (MDX content) or by
re-running `pnpm i18n` (UI strings, `messages/*.json`). Do not land an English-only update and
leave the other three locales to catch up later. `docs-i18n-check.yml` only backstops the
`messages/*.json` half of this (see above); a stale or missing `.de.mdx`/`.es.mdx`/`.fr.mdx` is
not caught by CI, so treat this as an authoring discipline, not a check you can rely on to fail.

## The `<AvailableFrom />` callout

Component: `apps/docs/components/available-from.tsx`. Renders a Fumadocs `Callout` sourced from
the `docs.availableFrom` translation namespace (`messages/*.json`), so its copy is translated like
any other UI string, not hand-duplicated per locale MDX file.

- Usage: `<AvailableFrom version="X.Y.Z" />` for a CLI/SDK feature, or
  `<AvailableFrom version="X.Y.Z" pkg="@verbatra/studio" />` when the feature belongs to a
  specific package (see the real usage in
  `apps/docs/content/docs/(guides)/agent-tools-in-studio.mdx`).
- Use it on any documented feature that shipped after the package's initial release, so a reader on
  an older version knows to upgrade instead of filing a "this doesn't work" report.
- To get the correct version, do not guess or copy the current `package.json` version by hand:
  run `pnpm changeset status` (or check the changeset that introduces the feature) to see what
  version the pending or landed change actually bumps to. `@verbatra/cli` and `@verbatra/sdk` are
  version-locked (`fixed` in `.changeset/config.json`), so a CLI/SDK feature uses their shared
  version; `@verbatra/studio` versions independently and needs its own number, which is why
  `pkg="@verbatra/studio"` exists.
- It never needs removing later. Once a version ships, the callout is historically accurate
  forever; do not go back and strip it once the "from" version is old.

## Register and tone

Informal address throughout: German `du` (not `Sie`), Spanish `tú` (not `usted`), French `tu` (not
`vous`). This is the same tone the automated translation already applies
(`apps/docs/verbatra.config.ts`: `tone: "informal"`), so hand-translated MDX content should match
it for consistency between machine- and hand-translated pages.

Never use the em dash (U+2014) in any locale, including hand-written German, Spanish, or French
content. Use a spaced hyphen, a colon, or parentheses instead, exactly as the repo-wide rule
requires for English.
