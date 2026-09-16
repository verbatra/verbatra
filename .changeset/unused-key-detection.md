---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Report source-catalog keys that your application source no longer references:
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
  or local `i18n.t` alias, a `Translation` render prop, `withTranslation("ns")(Component)`, or
  `import { t } from "i18next"`. Any other use of those sources (a wrapper hook, options passed by
  name, an exported `getFixedT` result) is reported as `unrecognised-translate-source`, and a
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

The source scan behind `verbatra extract` and the unused-key report now reads a regular expression
after a `<` operator correctly while keeping a JSX closing tag as markup.

In a `.tsx`, `.jsx`, or `.js` file, the same scan now reads JSX text and quoted attribute values as
markup rather than as code, so an apostrophe in them (`<p>Don't worry</p>`) never hides a call,
never pairs with another apostrophe to swallow the code between, and a word such as `t` in them
never counts as a use of the translate function. Such a file whose JSX element never closes, or
whose quoted string in code runs into the end of its line, is reported as an `unparseable`
diagnostic by `verbatra extract` and makes the unused-key report `unreliable` with
`incomplete-scan`, rather than being judged from a partial reading. `.ts`, `.mts`, `.cts`,
`.mjs`, and `.cjs` files are read as code only, as before.
