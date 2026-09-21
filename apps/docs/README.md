# @verbatra/docs

> Private package. Not published, not bundled. This is the source of the documentation site at
> [verbatra.kreitz-webdev.de](https://verbatra.kreitz-webdev.de), a Fumadocs site on Next.js.

The docs site dogfoods verbatra for its own interface strings and hand-maintains its MDX content
translations, because verbatra translates structured formats (JSON, XLIFF, YAML, ARB, properties),
not Markdown or MDX.

## Running it

From this directory:

```bash
pnpm dev        # next dev, after syncing the version banner
pnpm build      # production build
pnpm test       # the site's own Vitest suite
pnpm typecheck
```

No API key is needed to run, build, or test the site. A provider key is needed only to re-translate
the interface strings with `pnpm i18n` (see below).

## Where content lives

- `content/docs/**` is the documentation itself. English source is `page.mdx`; a translation is a
  locale-suffixed sibling, `page.de.mdx`, `page.es.mdx`, `page.fr.mdx`. Route groups carry a
  `meta.json` plus `meta.de.json`, `meta.es.json`, and `meta.fr.json`. These are hand-translated.
- `messages/en.json` is the source of the site's own interface strings, with `de.json`, `es.json`,
  and `fr.json` alongside it. These are machine-translated by verbatra.
- `app/`, `components/`, and `lib/` are the Next.js application; `public/` holds the images,
  including the Studio screenshots the root README links.

## Translating the interface strings

```bash
GEMINI_API_KEY=... pnpm i18n
```

That runs `verbatra translate` against `verbatra.config.ts` in this directory:
`format: "next-intl-json"`, `files.pattern: "messages/{locale}.json"`, targets `de`, `es`, `fr`,
provider `gemini`, `tone: "informal"`. Only new or changed keys are sent, so a run over unchanged
messages calls no provider and needs no key. The key is read from the environment, never from the
config.

`.github/workflows/docs-i18n-check.yml` runs the action in `check` mode on every pull request that
touches this app's messages, content, config, or lock file. That check validates only what
`verbatra.config.ts` covers, so it catches drift in `messages/*.json` and nothing else.

## Every user-facing change updates all four locales

A change to `messages/en.json` or to an English `page.mdx` is not complete until the matching `de`,
`es`, and `fr` files are updated in the *same* change, by hand for MDX content or by re-running
`pnpm i18n` for interface strings. CI backstops only the `messages/*.json` half of this; a stale
`.de.mdx`, `.es.mdx`, or `.fr.mdx` is not caught, so treat it as authoring discipline.

Register is informal throughout: German `du`, Spanish `tú`, French `tu`. No em dash in any locale.

## Conventions

The full set, including the `<AvailableFrom />` callout and which source files define what verbatra
actually ships, is in [`.claude/rules/docs.md`](../../.claude/rules/docs.md).
