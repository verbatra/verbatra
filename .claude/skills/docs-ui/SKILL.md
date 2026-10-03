---
name: docs-ui
description: 'Visual and component conventions for the verbatra docs site (apps/docs), a Fumadocs 16 / Next.js 16 / Tailwind 4 app. Use when adding or reshaping UI in apps/docs: landing sections, MDX-facing components, design tokens in app/global.css, or anything touching the Fumadocs theme layer. Also use before accepting generic design advice that does not account for Fumadocs.'
license: MIT
metadata:
  author: verbatra
  version: '1.0'
  source: 'internal'
user-invocable: true
---

# Docs UI (apps/docs)

## Overview

apps/docs is a Fumadocs site, not a blank Next.js app. Its look is already decided
and codified in `apps/docs/app/global.css`. Two layers stack: the Fumadocs UI theme,
then a verbatra layer that overrides it. Generic frontend advice that assumes a
greenfield page will fight both. This skill states what is fixed, what is yours to
extend, and where to look things up.

The site has two surfaces that must read as one product: the landing page
(`app/[lang]/(home)`, built from `components/landing/`) and the documentation
(`app/[lang]/docs`, Fumadocs notebook layout with `nav.mode: "top"`). The docs surface
borrows its vocabulary from the landing page on purpose, for name recognition, and the
section "The docs surface" below lists exactly which pieces are shared.

**When to use:** adding a landing section or UI component under `apps/docs/components/`,
changing colors, spacing, radii or typography, restyling a Fumadocs surface, or judging
whether an external design suggestion fits this site.

**When NOT to use:** MDX prose content (that is `.claude/rules/docs.md`), the Studio
dashboard in `packages/studio` (different app, different stack), or anything outside
`apps/docs`.

## The stack, and why it constrains you

- `fumadocs-ui` and `fumadocs-core` 16.15.11, `next` 16.3.5, `tailwindcss` 4.3.3,
  `next-intl` 4.14.5. There is no animation library in the client bundle: landing motion is
  CSS keyframes and transitions in `app/global.css`, each with a `prefers-reduced-motion` opt-out.
- Tailwind 4 uses CSS-first configuration. There is no `tailwind.config.js`. Tokens are
  CSS custom properties in `app/global.css`, not a JS config object.
- `app/global.css` opens with three imports in this order, and the order matters:

  ```css
  @import "tailwindcss";
  @import "fumadocs-ui/css/purple.css";
  @import "fumadocs-ui/css/preset.css";
  ```

- `@source "../node_modules/fumadocs-ui/dist/**/*.js";` makes Tailwind scan the
  Fumadocs bundle. Removing it silently drops classes Fumadocs emits at runtime.
- The site is dark-only: `:root { color-scheme: dark; }`. There is no light theme and
  no `.dark` toggle. Do not add `dark:` variants or a theme switcher without deciding
  that question first.

## Token layers: always use the outermost one

Three layers exist. Write against the third.

1. **Brand primitives.** `--v-purple: hsl(291 64% 42%)` and `--v-glow: hsl(258 47% 74%)`.
   Two brand hues, nothing else. Do not introduce a third brand hue casually. Beside them sit a
   few tints with one job each, never a general palette: `--v-glow-soft` (the lighter end of
   `--gradient-headline`, and flag tokens in `Terminal`), `--v-violet` (the far end of
   `--gradient-headline` and one corner of `HERO_BACKGROUND` in `fx/hero-wash.ts`), `--v-pink`
   (only through `--v-status-changed`), and `--v-status-new` / `--v-status-changed` /
   `--v-status-unchanged` (the `tone` colors of `components/ui/badge.tsx`). Reach for one only in
   the role it already has.
2. **Fumadocs overrides.** `--color-fd-background`, `--color-fd-card`, `--color-fd-popover`,
   `--color-fd-muted`, `--color-fd-border`, `--color-fd-foreground`,
   `--color-fd-muted-foreground`, `--color-fd-primary`, `--color-fd-primary-foreground`,
   `--color-fd-accent`, `--color-fd-accent-foreground`, `--color-fd-ring`, plus the callout
   hues `--color-fd-info`, `--color-fd-warning`, `--color-fd-error`, `--color-fd-success`.
   These exist so Fumadocs' own components inherit the verbatra palette. Change one only to
   retheme Fumadocs itself.
3. **Semantic layer.** This is the one to use in components:

   ```
   --surface-bg  --surface-card  --surface-raised  --surface-hover
   --border-default  --border-danger
   --text-strong  --text-body  --text-muted  --text-faint
   --text-link  --text-danger  --text-success
   --accent  --accent-fill  --accent-fill-fg  --focus-ring
   ```

New component code references `var(--surface-card)`, never `hsl(240 28% 14%)` and never
`var(--color-fd-card)` directly. A raw hex or hsl value in a component is a defect: it
breaks the single point of change.

Scales are fixed and narrow, deliberately:

- Radii: `--radius-sm` 6px, `--radius-md` 10px, and `--radius-lg`, `--radius-xl`,
  `--radius-2xl` all 12px. The large sizes collapsing to one value is intentional. Do not
  reintroduce a spread.
- Shadows: `--shadow-panel` (a purple-tinted lift) and `--shadow-sm`. Two, not a ramp. The one
  exception is the providers deck (`.vk-card` in `app/global.css`): its resting and fanned-out
  shadows are part of the fan motion and stay local to it; do not reuse them elsewhere.
- Layout: `--gutter` (40px from 768px up) via `.vk-gutter`, `--width-wide` via `.vk-w-wide`.

## Typography

Three families, loaded in `app/[lang]/layout.tsx` through `next/font/google`:

| Role | Family | Variable | Mapped to |
|---|---|---|---|
| Body | Inter | `--font-inter` | `--font-sans` |
| Code | JetBrains Mono | `--font-jetbrains-mono` | `--font-mono` |
| Display | Space Grotesk | `--font-space-grotesk` | `--font-display` |

`h1` through `h6` are globally bound to `--font-display`. You do not set a heading font
per component. Adding a fourth family needs a reason that survives review.

The type scale is a major third (1.25) held in `app/global.css`: `--text-display`, `--text-h2`,
`--text-h3`, `--text-h4`, `--text-lead`, with `--leading-*` and `--tracking-*` companions. Landing
headings take the `.vk-display`, `.vk-h2`, `.vk-h3`, `.vk-h4` and `.vk-lead` classes (declared in
`@layer components`, so a Tailwind utility still overrides them) rather than inline `fontSize` /
`letterSpacing` styles. The docs page title, description and prose `h2` to `h4` sit on the same
scale through the `#nd-page` rules.

Headlines are solid `--text-strong` on both surfaces. `--gradient-headline` exists for the
footer's oversized watermark only; do not clip it onto a heading.

## Reuse before you build

- **Primitives:** `components/ui/` holds `badge`, `button`, `command-line`, `copy-button`, `tabs`.
  `TabList` takes an `idPrefix` to wire `id` / `aria-controls` to `tabPanelId` panels and handles
  arrow-key focus.
  `Button` takes `variant: "primary" | "secondary" | "ghost"` and `size: "sm" | "md" | "lg"`.
  Extend the variant union rather than passing ad hoc `className` overrides.
- **Landing:** `components/landing/` holds the landing sections (`proof.tsx`, `loop.tsx`,
  `providers.tsx`, `control.tsx`, `gains.tsx`, `faq.tsx`, `final-cta.tsx`, `footer.tsx`,
  `marquee.tsx`) plus the shared building blocks: `section.tsx` and `section-head.tsx` for
  structure, `terminal.tsx` (with a `bare` variant; lines never
  wrap, they scroll sideways inside `.vk-terminal-scroll`, which fades the end edge while there is
  more to see), `hero-demo.tsx` (the hero's Terminal /
  Studio tabs), `evidence.tsx` (the mono evidence chip; a linked chip
  takes the flat-panel glow border on hover and focus through `.vk-evidence-link`), `package-install.tsx` and
  `command-box.tsx` (each an `@container`: a command wraps once the box is under 30rem, only at
  a space since `HighlightedCommand` keeps each word whole, so the package name is never clipped;
  the install box's second row shows the whole AI setup prompt, wrapped, under a `.vk-label`
  caption), `reveal.tsx` (the scroll
  entrance, used once: the providers deck, whose fan-out it triggers; sections do not animate in), `hero-facts.tsx` (the release / formats / providers /
  license row), and an `fx/` folder
  (`grid-pattern.ts`, `hero-wash.ts` with `HERO_BACKGROUND` and `HERO_BORDER`). A new
  section composes `Section` plus `SectionHead`; it does not re-derive page padding or
  heading rhythm. Check `ls apps/docs/components/landing` before quoting a file name from
  this list. Every CLI transcript on the landing (`lib/hero-demo.ts`, `lib/gate-demo.ts`) is
  real CLI output, English on every locale, and its test pins each line to
  `packages/cli/src/render.ts`, so a change to the CLI's output fails until the demo is
  recaptured.
- **Docs-facing:** `components/available-from.tsx` renders the version badge. Its rules
  live in `.claude/rules/docs.md`. `components/docs-home.tsx` holds the docs landing
  (`DocsHomeHero`, `DocsHomeBody`, `DocsHomeSection`, `DocsHomePaths`, `DocsHomeSteps`,
  `DocsHomeFeatures`), all registered in `components/mdx.tsx` and driven by
  `content/docs/index.mdx` and its three locale siblings. The hero and the body share one frame
  (`HOME_FRAME`: one max width, one gutter), so the hero panel and the sections below it start and
  end on the same edges; a section head sets its lead on the heading's last baseline.
  `StackCards` (`components/stack-cards.tsx`) is the stack picker on the docs home and at the top
  of `pick-your-stack`: one flat grid of flat-panel cards (one column, two from a 30rem container,
  three from 50rem), each a single-colour logo in a round `--surface-card` chip, the stack name in
  the display face, and its `--format` ids in mono `--text-faint`, with no group labels and no
  arrow. The logos come from `@icons-pack/react-simple-icons` through `components/stack-icons.tsx`
  (shared with the marquee), always `currentColor`, never a brand colour, since several brand
  colours are black on this dark-only site; a format with no brand mark gets an outline glyph
  there. The grid is a `nav` named by `labelledBy`, the id of the heading above it (the docs home
  section's `id`, or `page-title` on the docs `<h1>`), and that id also prefixes its sprite's symbol
  ids, so two grids on one page never collide. A card's name reads "React: i18next-json".
  `scripts/verify-docs-registry-parity.test.mjs` pins every card's `formats` and anchor to
  `SUPPORTED_FORMATS` and to the page's sections in all four locales. Fumadocs' `Steps` and `Step`
  are registered there too, for numbered tutorial steps such as the quickstart's.

## Keep the client payload small

Mobile Lighthouse is dominated by bytes that arrive before the first paint, so:

- No animation library. Landing motion is CSS keyframes and transitions in `app/global.css`,
  each with a `prefers-reduced-motion` opt-out.
- `NextIntlClientProvider` receives only `CLIENT_MESSAGE_NAMESPACES` (`lib/client-messages.ts`),
  not the whole catalog. A new `useTranslations` namespace in a `"use client"` file must be added
  there; `lib/client-messages.test.ts` fails until it is.
- A brand icon repeated on a page (the marquee's two tracks, the stack cards) is drawn once as an SVG `<symbol>`
  and referenced with `<use>`, since every copy is serialized twice: in the HTML and in the RSC
  payload.
- Keep all three `next/font` families preloaded. Every one of them sets text in the first
  viewport, so it is fetched before the first paint either way; without the preload it is only
  discovered after the stylesheet, at a higher priority that delays the first contentful paint.
- Content only needed after an interaction is loaded with a dynamic `import()` on hover, focus,
  or click. The AI setup prompt is not: it is a few lines, shown in full in the install box.

## Fumadocs UI strings

Fumadocs' own chrome (search, "On this page", page actions, sidebar aria-labels, pagination) is
translated in `lib/ui-translations.ts`, added to `translations` in `lib/layout.shared.tsx`. The
object is typed against `fumadocs-ui/i18n`'s `Translations`, and `lib/ui-translations.test.ts`
fails when a Fumadocs upgrade adds a key that de, es or fr lacks.

## One header for both surfaces

`components/site-header.tsx` owns the navbar. `SiteHeaderFrame` renders the markup (wordmark,
centred search, text links, icon links, language select, phone-width search and menu trigger)
and two thin wrappers feed it from each layout's context: `HomeSiteHeader` (from
`useHomeLayout`, plus a `SidebarProvider` drawer so the landing's phone menu is the same drawer
the docs use) and `DocsSiteHeader` (from `useNotebookLayout`, adding the sidebar collapse and
drawer triggers). They are wired through `slots.header` in `lib/locale-home-layout.tsx` and
`app/[lang]/docs/layout.tsx`; `lib/layout.shared.tsx` still supplies the links, title and
language select for both. The home layout swaps Fumadocs' `<main id="nd-home-layout">` container for a `<div>`
(`components/home-container.tsx`) and renders its own `<main>` around the page, with the landing
footer passed in by `app/[lang]/(home)/layout.tsx`, so the header and footer stay banner and
contentinfo landmarks; a page under that layout must not render another `<main>`.
Fumadocs' own `HomeLayout` and notebook headers are never rendered,
so do not style `#nd-nav` or `#nd-subnav`; style `.vk-header` and `.vk-header-link` instead,
and change the header in one place.

Both surfaces share one layout width: `--width-layout` (97rem, the notebook layout's own
default) feeds `--fd-layout-width` from `:root` and again on the home container, so the
header row, the docs grid, and the landing's hero and closing panels all sit in the same
centred column on a wide monitor. A landing section that should not bleed edge to edge takes
`mx-auto w-full max-w-(--width-layout)`; the marquee and the footer bleed on purpose.

## The docs surface

`app/global.css` carries a docs layer keyed on Fumadocs' DOM ids (`#nd-sidebar` and its
phone-width twin `#nd-sidebar-mobile`, `#nd-toc`, `#nd-page`, `#nd-nav`) and on
`figure.shiki`. Every sidebar rule is written for both ids; a rule that names only one of them
is a bug, since the drawer is a separate `aside` outside `#nd-sidebar`. It exists so a reader coming from
the landing page recognizes the same product. The shared vocabulary, and where each piece
comes from:

- **Solid white display headlines.** `DocsHomeHero` uses the same `HERO_BACKGROUND` /
  `HERO_BORDER` panel as `LandingHero` and the same `HeroFacts` row. Neither hero uses a
  gradient headline: the former `.vk-gradient-text` class is gone, and `--gradient-headline`
  remains only for the footer's watermark. Neither hero carries an eyebrow, and no card or
  button on the docs home appends an arrow to its label: the hover border is the affordance.
- **`.vk-label`**: the small mono, uppercase, `0.14em`-tracked, `--text-faint` label the
  landing footer uses for its column titles. The sidebar's top-level folders and separators
  inside each tab (group triggers such as "CLI", the `For AI agents` separator), the TOC's "On
  this page" title, table headers, and the sidebar tabs all use this treatment. A top-level page
  ("Introduction", "Error codes", `llms.txt`) keeps its name as written: a page name, and above
  all a file name, is never uppercased.
  `DocsHomePaths` cards do not: the goal is the card title in sentence case, and the page name
  sits below the body. The sidebar gets it from `lib/docs-group-labels.tsx`, which wraps every folder and separator
  name directly under a root folder (the Docs and Reference tabs) in the class before the tree reaches
  `DocsLayout`, and leaves the tab names themselves plain; do not target Fumadocs' or Radix's
  internal DOM for it.
  Use the class for a new label rather than restating the four declarations.
- **Owned hooks, not library internals**: callouts carry `.vk-callout` (added by the `Callout`
  mapping in `components/mdx.tsx` and passed explicitly by the locale notice in the docs page), and the prev/next footer carries `.vk-docs-footer` through
  `DocsPage`'s `footer.className`. Style those classes, not Fumadocs' utility classes.
- **Flat panels**: `rounded-xl border border-fd-border` on `var(--surface-bg)`, with a
  glow-tinted border on hover (`color-mix(in srgb, var(--v-glow) 45%, var(--border-default))`).
  `DocsHomePaths`, `DocsHomeFeatures`, and the prev/next footer cards follow it; the one
  filled card (the primary path) uses `--accent-fill` / `--accent-fill-fg`.
- **Void code surfaces**: `figure.shiki` sits on `var(--v-void)` inside a `--border-default`
  border, like `Terminal` and `CommandBox`. A `// [!code highlight]` line gets the landing's
  highlight treatment: 22 percent `--v-purple` tint plus a 3px `--v-purple` bar on the start
  edge. `DocsHomeFeatures` cards carry the same 3px `--v-purple` start bar.
- **Callouts**: one 3px bar plus the icon, both in `--callout-color`, which Fumadocs derives
  from `--color-fd-<type>`. The override block in `global.css` pins `--color-fd-info` and
  `--color-fd-success` to the glow and `--color-fd-warning` to the purple, so an info and a
  warn callout stay distinguishable without a third hue. Vertical padding is one step under
  Fumadocs' default, and a callout is capped at the prose measure like the text around it.
- **Locale notice**: every translated page opens with the machine-translated info callout. When
  the English page was committed after its translation, the same callout turns into a warn
  callout titled from `docs.outdatedTranslation`, with the English link kept. The comparison reads
  `lib/translation-freshness.generated.json`, which `scripts/sync-translation-freshness.mjs`
  writes from the git history of `content/docs` before dev, build, typecheck and test. Without a
  full history (a shallow clone, or the Docker build, whose context excludes `.git`) it keeps a
  snapshot written earlier or writes an empty one, and an empty one shows no outdated notice.
- **Pills**: `.vk-pill` is the one badge shape: an outline pill in `--accent` text with the
  glow-tinted border, mono, `--text-xs`, no fill. The sidebar and footer NEW badge
  (`components/new-badge.tsx`) adds `.vk-pill-status` (smaller, uppercase) and is hidden in the
  breadcrumb (`.vk-breadcrumb`, set on `DocsPage`), which shares the sidebar's tree; the
  `<AvailableFrom>` badge adds `.vk-available-from`, which sits after the heading text when it is
  inside a heading. A badge placed directly under a heading is moved into it. Where a badge may
  sit in the MDX at all is set by "Badge placement" in the "Docs budget" section of
  `.claude/rules/docs.md`, and `lib/docs-badge-placement.test.ts` enforces it. A heading whose
  key a table's "Since" column already dates (the key table on `config-file`) carries no badge.
  Do not bring back a filled purple pill.
- **Prose measure**: paragraphs, lists, block quotes and callouts in `#nd-page` stop at
  `--width-measure` (about 72 characters of body text); tables and code blocks run the full
  column.
- **Cards**: MDX `<Cards>` / `<Card>` are Fumadocs' own, mapped in `components/mdx.tsx` to add
  `.vk-link-card` (flat panel, glow border on hover, no prose underline) and to localize `href`.
  "Next" sections end in a `<Cards>` block. A card that points at the page's own prev/next footer
  target is dropped at render time (`lib/docs-neighbours.ts`, passed to `getMDXComponents` by the
  docs page), so the footer and the cards never link the same page twice.
- **One install command**: every install is shown as one npm command in a `bash` fence, with no
  package-manager tabs. remark-npm is off (`remarkNpmOptions: false` in `source.config.ts`), and
  `lib/install-commands.test.ts` fails on an `npm` fence anywhere in the content. The landing and
  docs home install box takes `NPM_INSTALL_COMMAND` from `lib/install-commands.ts`; a page that
  needs pnpm, yarn or bun says so in a sentence.
- **Output blocks**: a fence flagged `output` (`` ```text output ``) is what a command prints, not
  something to run. The flag, not a title, is the marker, so it reads the same in every locale:
  `parseCodeBlockMeta` (`lib/code-block-meta.ts`, wired as `rehypeCodeOptions.parseMetaString` in
  `source.config.ts`) turns it into a `data-output` prop, and the `pre` mapping renders
  `OutputCodeBlock` (`components/output-code-block.tsx`) with `.vk-code-output` (on
  `--surface-card` instead of the void, the caption as a `.vk-label`), no copy button, and the
  caption from `docs.codeBlock.output` in `messages/*.json`. Never write `title="Output"`: it stays
  an ordinary English-captioned block.
- **Steps**: Fumadocs' `.fd-steps` rail is a 3px `--v-purple` start bar (60 percent), and each
  step number sits in an outline circle on `--surface-bg` in mono `--accent`.
- **Sidebar tabs**: the Docs and Reference root folders render as two inline `.vk-label` links
  (`SidebarTabs` in `components/root-tabs.tsx`, the `.vk-sidebar-tabs` hook) in the sidebar banner
  slot of the sidebar and the phone drawer, with a `--accent` underline and `aria-current` on the
  tab of the current root folder; Fumadocs' dropdown switcher is off (`tabs={false}`). `rootTabs`
  in `lib/root-tabs.ts` builds the tabs, opening each on its first real page, since the Reference
  tab has no page of its own. The header's "Reference" link opens the same tab.
- **Sidebar titles**: a `sidebarTitle` frontmatter field (`lib/sidebar-title.ts`, a loader plugin in
  `lib/source.tsx`) names a page in the sidebar and the breadcrumb while its `<h1>` and `<title>`
  keep `title`. `cli/index` and `sdk/index` use it: titled "CLI reference" and "SDK reference"
  (localized) so no two pages share a title, and listed as "Overview" in their folder. Both
  overview pages list their pages as `<Cards>`; the SDK one comes from `<SdkEntryPoints />`
  (`components/sdk-reference.tsx`), one card per page naming its entry points.
- **Table of contents**: TOC entries never break inside a word (`overflow-wrap: normal` on
  `#nd-toc` and the phone popover); `pageToc` (`lib/page-toc.tsx`) offers a break after each
  underscore with `<wbr>` (`breakAfterUnderscores`), so `AGENT_FILE_INVALID` wraps as `AGENT_ / FILE_ / INVALID`. A page
  whose TOC would be taller than the viewport sets `tocDepth: 2` in its frontmatter (all four
  locales) to list only its H2 families; `error-codes` does. `codeHeadings: true` adds
  `.vk-code-headings` to the page body, which sets its H3s (one code name each) in `--font-mono`.
  The phone TOC button carries an explicit `aria-label` (Fumadocs' localized "On this page",
  `onThisPageLabel`), so its accessible name is not the progress ring's value.
- **Sidebar subgroups**: a `---Label---` entry in a folder's `meta.json` (and each locale's
  `meta.<lang>.json`) is a separator; `lib/docs-group-labels.tsx` wraps it in `.vk-sidebar-group`.
- **Sidebar command labels**: `withShortCommandLabels` in `lib/docs-page-tree.tsx` shows a CLI
  page as its bare command (`translate`) wrapped in `.vk-sidebar-command`, which sets it in
  `--font-mono`; the page `<h1>` keeps `verbatra translate`.
- **Tables**: the frame is Fumadocs' scroll wrapper (`div:has(> table)`): border, radius and a
  `--surface-bg` fill sit on it, the table itself is transparent, and only the `thead th` row is
  filled (`--surface-card`, a `.vk-label`), the same header treatment `.vk-type-table` gets, so a
  Markdown table and a generated type table read as one component. `#nd-page .prose` is the
  `vk-article` size container, and every table rule keys on its width, never on the viewport.
  From 45rem up the wrapper is `overflow: visible` and the header row is sticky below the header
  (`top: var(--fd-docs-row-3)`); below 45rem the wrapper scrolls sideways with the end-edge fade
  `.vk-terminal-scroll` uses, and the header is not sticky, because a sticky cell inside a
  scroll container is offset against that container, not the page. Cells are compact (0.5rem by
  0.75rem, top-aligned). A table of three or more columns gets `.vk-table-stack` and a
  `data-label` per body cell from `lib/stacked-tables.ts` at build time; while the article column
  is under 45rem each row stacks into a card, the first cell as its title and every other cell
  behind its column name, and under 30rem the column name moves above its value. Under 30rem,
  code and pills in a cell may wrap too, so a two-column table fits a phone. The header row stays
  in the DOM for assistive technology. Short inline code (up to `SHORT_INLINE_CODE_MAX`
  characters in `lib/inline-code.ts`) gets `.vk-code-short` from the MDX `code` mapping and never
  wraps elsewhere; longer inline code wraps, in cells and in prose alike, and the mapping offers a
  break after every underscore (`breakAfterUnderscores`, `lib/word-breaks.tsx`) so
  `verbatra_project_snapshot` wraps at `_` before anywhere else.
- **SDK type tables**: `<SdkTypeTable name="..." />` in `content/docs/sdk/*.mdx` becomes Fumadocs'
  `TypeTable`, generated at MDX compile time by `fumadocs-typescript`'s `remarkAutoTypeTable` from
  the built `packages/sdk/dist/index.d.ts` (`lib/sdk-type-table.ts`, wired in `source.config.ts`).
  The shim adds `.vk-type-table` (a flat panel on `--surface-bg`, the header row as a filled
  `.vk-label` like a Markdown table's)
  and a unique `id` per table, and gives the `.md` output a plain Markdown table. Descriptions are
  the published English JSDoc in every locale; the framing prose around them stays translated.
- **Links**: `--accent` text with a 40 percent glow underline that turns solid on hover, the
  same `LINK_CLASS` the landing rows use. Heading anchors are explicitly exempt so a
  section title never renders as a link. `.vk-prose-link` shares that exact rule in
  `app/global.css`, for a link that must look like a prose link inside a `not-prose` block
  (the contact form's privacy notice); use it rather than restating the declarations.
- **Page actions**: every non-home docs page renders Fumadocs' `MarkdownCopyButton` and
  `ViewOptionsPopover` under the description, fed by `app/[lang]/docs.mdx/[[...slug]]/route.ts`,
  which serves the processed Markdown of the page in its own locale. Readers and agents reach it
  as the page URL plus `.md` (`markdownUrl` in `lib/markdown-route.ts`), or by sending
  `Accept: text/markdown` to the page URL; `proxy.ts` rewrites both to that route, and every page
  advertises the `.md` URL as a `text/markdown` alternate. `llms.txt` links to the `.md` URLs.
  Keep that route in step with `app/llms-full.txt/route.ts` if the Markdown shape changes.

## Fumadocs API questions go to Context7

Do not answer Fumadocs API questions from memory, and do not rely on a generic web design
skill for them. Query Context7:

- `/fuma-nama/fumadocs` - the official repository, 1960 snippets, high reputation. Default
  choice for component APIs, layout options and theming.
- `/llmstxt/fumadocs_dev_llms_txt` - 5026 snippets, broader coverage. Use when the first
  returns nothing for a narrow topic.

Scope each query to one concept, per the Context7 convention already in use here.

## Four locales, every time

apps/docs ships `en`, `de`, `es`, `fr`. A UI change that adds or edits a user-facing string
touches `messages/en.json` and needs the other three updated in the same change, by running
`pnpm i18n` from `apps/docs`. `.github/workflows/docs-i18n-check.yml` only backstops
`messages/*.json`. MDX locale siblings are not checked by CI. Full rules:
`.claude/rules/docs.md`.

## Repository rules that bite in UI work

- No em dash (U+2014) anywhere, including inside JSX text and translated strings. Use a
  spaced hyphen, a colon, or parentheses.
- No prose comments and no JSDoc on internal code. Component names and structure carry
  intent. Preserve reasoning as a test, not a comment.
- No emojis and no decorative formatting.
- Tests are co-located. `apps/docs/vitest.config.ts` includes `lib/**/*.test.ts`,
  `lib/**/*.test.tsx`, `components/**/*.test.tsx`, `app/**/*.test.ts`, `app/**/*.test.tsx`,
  `proxy.test.ts`, and `proxy.cookies.test.ts`; existing examples are
  `components/landing/faq.test.tsx`, `lib/landing-messages.test.ts`,
  `app/[lang]/docs.mdx/[[...slug]]/route.test.ts`, and
  `app/[lang]/(legal)/privacy/page.test.tsx`.
- Run `pnpm check` or `pnpm format` for Biome before committing.

## Verify before you trust this file

Tokens drift. Before quoting a value from this skill, confirm it:

```bash
grep -n '\--surface-\|--text-\|--accent\|--radius-\|--shadow-' apps/docs/app/global.css
```

If the file and this skill disagree, the file wins, and this skill needs updating in the
same change.
