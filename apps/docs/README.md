# @verbatra/docs

> Private package. Not published, not bundled. This is the source of the documentation site at
> [verbatra.kreitz-webdev.de](https://verbatra.kreitz-webdev.de), a Fumadocs site on Next.js.

The docs site dogfoods verbatra for its own interface strings, while an AI agent translates its MDX
content in the same change as the English page, because verbatra translates structured locale
formats (such as JSON, XLIFF, YAML, ARB, and properties), not Markdown or MDX.

## Running it

Start the dev server from the repository root:

```bash
pnpm dev:docs
```

It goes through Turborepo, which first builds the workspace packages the site imports
(`@verbatra/cli`, `@verbatra/sdk`, `@verbatra/studio`), so the server never loads a stale `dist`.
Set `PORT` to serve on another port than 3000.

The other tasks run from this directory:

```bash
pnpm build      # production build
pnpm test       # the site's own Vitest suite
pnpm typecheck
```

The site enforces a Content-Security-Policy that allows no inline script except the ones it
prerendered: `pnpm build` ends by hashing every inline script of every prerendered page into
`.next/csp-script-hashes.json` (and fails if a page has none), and `proxy.ts` sends each page the
hashes of its own scripts. `proxy.ts` is the only source of the policy; `next.config.mjs` sends the
other security headers. A page rendered at request time would have no hashes, so every HTML route
is prerendered (`dynamicParams = false`). If the server cannot read the hash file, it logs one
error naming the file and keeps serving pages, but they no longer hydrate. The policy was enforced
directly, without a report-only period: the site has no report endpoint, so a report-only policy
would have produced no signal.

To check a build the way it is deployed, run the standalone server with the static assets and
`public` copied next to it, as the `Dockerfile` does, then point the smoke test at it:

```bash
cp -R .next/static .next/standalone/apps/docs/.next/static
cp -R public .next/standalone/apps/docs/public
NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 node .next/standalone/apps/docs/server.js
pnpm csp:smoke http://localhost:3000
```

`csp:smoke` loads the key pages in Chromium and fails on any CSP violation, any failed
`/_next/static` asset, a page that did not hydrate, analytics that did not run, a search that did
not answer, or an HTML response without exactly one hashed policy header. It needs
`pnpm exec playwright install chromium` once.

No API key is needed to run, build, or test the site. A provider key is needed only to re-translate
the interface strings with `pnpm i18n` (see below).

## Where content lives

- `content/docs/**` is the documentation itself. English source is `page.mdx`; a translation is a
  locale-suffixed sibling, `page.de.mdx`, `page.es.mdx`, `page.fr.mdx`. The sidebar's Docs and
  Reference tabs are the `(docs)` and `(reference)` folders, which hold only meta files that list
  the route groups; each meta file has `meta.de.json`, `meta.es.json`, and `meta.fr.json`
  siblings. An AI agent translates these in the same change as the English page;
  `lib/docs-locale-parity.test.ts` keeps the four locales structurally in sync.
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
