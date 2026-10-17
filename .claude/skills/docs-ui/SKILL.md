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

- `fumadocs-ui` and `fumadocs-core` 16.17.1, `next` 16.4.0, `tailwindcss` 4.3.3, `next-intl` 4.14.9.
  `motion` is no direct dependency (Fumadocs still brings its own): no landing code imports it,
  and nothing animates through a React motion provider or an `m.*` element. Animate `opacity` and
  `transform` only, and keep layout shift at 0.
  Server sections and the reveals stay CSS keyframes and transitions in `app/global.css`, each with
  a `prefers-reduced-motion` opt-out.
  `gsap` 3.15.0 and `@gsap/react` 2.1.2 (the Standard "no charge" GSAP license, which the
  `/licenses` page and `THIRD_PARTY_NOTICES.md` print as written and link) are direct dependencies
  with one consumer. `lib/gsap.ts` registers `useGSAP` once;
  `lib/gsap-scramble.ts` adds `ScrambleTextPlugin` for `components/landing/playground-scramble.tsx`,
  which the playground island reaches through a dynamic `import()` on the first pointer, focus or
  touch inside it (and on Translate). It never loads on first paint or under reduced motion, and it
  is its own chunk. No other plugin is registered.
- Tailwind 4 uses CSS-first configuration. There is no `tailwind.config.js`. Tokens are
  CSS custom properties in `app/global.css`, not a JS config object.
- `app/global.css` opens with three imports in this order, and the order matters:

  ```css
  @import "tailwindcss";
  @import "fumadocs-ui/css/purple.css";
  @import "fumadocs-ui/css/preset.css";
  @import "tw-animate-css";
  ```

  `tw-animate-css` supplies the enter and exit utilities the shadcn primitives use
  (`animate-in`, `fade-in-0`); a `prefers-reduced-motion: reduce` rule
  on `[data-slot][data-state]` turns them off.

- `@source "../node_modules/fumadocs-ui/dist/**/*.js";` makes Tailwind scan the
  Fumadocs bundle. Removing it silently drops classes Fumadocs emits at runtime.
- Two themes, dark by default. `:root` holds the dark values (`color-scheme: dark`), and
  `html.light` (declared after the semantic `:root` block, so the first match of a token in the
  file stays the dark value that `lib/og-image.test.tsx` reads) overrides every theme-dependent token: the brand primitives, the `--color-fd-*` layer,
  `--text-faint` and the two shadows. The semantic layer is derived from those, so it follows on
  its own. The theme is not a React context: Fumadocs' `RootProvider` runs with
  `theme: { enabled: false }` (`components/themed-root-provider.tsx`), so `next-themes` never
  mounts, because a context value that changes after hydration (`next-themes` re-memoizes on the
  system preference) forces every island still waiting for its chunk to client-render, and throws
  away its server HTML when that chunk fails. `lib/theme-store.ts` owns it instead: `currentTheme()`
  reads the class on `<html>`, `setTheme()` stores the choice under `THEME_STORAGE_KEY`, swaps the
  `dark` / `light` class and `color-scheme` with transitions off for one frame, rewrites the
  `theme-color` and `color-scheme` meta tags (`applyThemeMeta`) and notifies its subscribers, and a
  `storage` event from another tab does the same. Components read it through `useSiteTheme()`
  (`lib/use-site-theme.ts`, `useSyncExternalStore` with an `undefined` server snapshot), and
  `lib/theme-store.test.ts` fails on any `next-themes` or `useTheme` import. The layout
  server-renders `DEFAULT_THEME` (`dark`) as a class on `<html>` (with `suppressHydrationWarning`),
  so a visitor without JavaScript still gets the dark Shiki tokens. No layout exports a viewport
  `themeColor` or `colorScheme`: React matches a hoisted meta tag by its `content`, so a tag the
  script had changed came back as a second pair after hydration. `THEME_INIT_SCRIPT` (`lib/theme.ts`,
  the inline script that opens `<body>`, hashed into the CSP by `scripts/write-csp-hashes.mjs` like
  every inline script) owns both tags instead: it applies a stored light theme to the class and
  `color-scheme`, and writes exactly one `theme-color` and one `color-scheme` meta tag
  (`THEME_COLORS`) before the first paint; `applyThemeMeta` puts them back if anything removed them. A visitor without JavaScript gets `DefaultThemeMeta` (`components/default-theme-meta.tsx`, a `<noscript>` in both documents' `<head>`): one dark `theme-color` and the dark `color-scheme`, with no light variant and no `media` query, because without the script the page always renders dark and a light bar would not match it. A browser with scripting on parses it as text, so there is still exactly one of each. A component never branches on the
  theme in JavaScript and needs no `dark:` variant: write against the semantic tokens and both
  themes follow. `lib/theme.test.ts` pins the light override of every token and holds every text
  pair at 4.5:1 and the focus ring at 3:1 in both themes.
- The theme toggle is `ThemeToggle` (`components/theme-toggle.tsx`), passed as
  `slots.themeSwitch` in `lib/layout.shared.tsx`: `SiteHeaderFrame` renders it after the language
  select from 768px, the home drawer footer beside the language select, and Fumadocs renders the
  same slot in the docs sidebar footer and phone drawer. It is one native `button` with
  `aria-pressed` (pressed while the light theme shows), named by `docs.theme.light`, and it draws
  both a moon and a sun icon, leaving the choice to the stylesheet (`.vk-theme-icon-light` is
  hidden unless `html.light`), so nothing flashes before hydration; `aria-pressed` reads `false`
  on the server and settles after hydration.

## Token layers: always use the outermost one

Three layers exist. Write against the third.

1. **Brand primitives.** One brand hue, violet 258. `--v-glow` is the accent (dark
   `hsl(258 60% 74%)`, light `hsl(258 55% 44%)`) and `--v-purple` its fill and bar shade (dark
   `hsl(258 52% 56%)`, light `hsl(258 55% 44%)`); the old magenta purple and pink are gone. Do not
   introduce a second brand hue. Beside them sit a few tints with one job each, never a general
   palette: `--v-status-new` (the accent) /
   `--v-status-changed` (amber, dark `hsl(38 85% 62%)`, light `hsl(30 90% 30%)`, also Fumadocs'
   warning callout color) / `--v-status-unchanged` (the `tone` colors of
   `components/ui/badge.tsx`). There is no pink and no headline gradient token any more
   (`components/landing/landing-tokens.test.ts` fails if `--v-pink`, `--v-violet` or
   `--gradient-headline` comes back). Reach for one only in the role it already has.
2. **Fumadocs overrides.** `--color-fd-background`, `--color-fd-card`, `--color-fd-popover`,
   `--color-fd-muted`, `--color-fd-border`, `--color-fd-foreground`,
   `--color-fd-muted-foreground`, `--color-fd-primary`, `--color-fd-primary-foreground`,
   `--color-fd-accent`, `--color-fd-accent-foreground`, `--color-fd-ring`, plus the callout
   hues `--color-fd-info`, `--color-fd-warning`, `--color-fd-error`, `--color-fd-success`, and in
   the light theme `--color-fd-secondary` / `--color-fd-secondary-foreground`.
   These exist so Fumadocs' own components inherit the verbatra palette. Change one only to
   retheme Fumadocs itself.
3. **Semantic layer.** This is the one to use in components:

   ```
   --surface-bg  --surface-card  --surface-raised  --surface-hover
   --border-default  --border-danger  --border-accent
   --text-strong  --text-body  --text-muted  --text-faint
   --text-link  --text-danger  --text-success
   --accent  --accent-fill  --accent-fill-fg  --focus-ring
   ```

New component code references `var(--surface-card)`, never `hsl(240 28% 14%)` and never
`var(--color-fd-card)` directly. A raw hex or hsl value in a component is a defect: it
breaks the single point of change. The same goes for Fumadocs utility classes: write
`border-(--border-default)`, `text-(--text-muted)`, `text-(--text-strong)`, `bg-(--surface-hover)`
or `text-(--accent)`, never `border-fd-border`, `text-fd-muted-foreground` or `bg-fd-accent`, and
never the arbitrary-value spelling `text-[color:var(--text-muted)]` (`lib/theme.test.ts` fails on it), and
`var(--accent)` / `var(--accent-fill)` rather than `var(--v-glow)` / `var(--v-purple)`.
`--border-accent` (the accent mixed 45 percent into `--border-default`) is the glow-tinted border
of a flat panel or a copy button on hover; it is the one token for that mix. In
`components/` and `app/`, only two brand primitives may still be named directly, each in its one
documented role: `--v-void` (void code surfaces), `--v-status-*` (badge tones and the
failing exit chip of the hero tracks). `lib/theme.test.ts` fails on any
other `fd-*` class, `var(--color-fd-*)` or `--v-*` reference there.

Scales are fixed and narrow, deliberately:

- Radii: `--radius-sm` 6px, `--radius-md` 10px, and `--radius-lg`, `--radius-xl`,
  `--radius-2xl` all 12px. The large sizes collapsing to one value is intentional. Do not
  reintroduce a spread. There is no larger radius: the landing hero sits on the page, in no card.
- Shadows: `--shadow-panel` (a neutral lift) and `--shadow-sm`. Two, not a ramp, each
  lighter in the light theme, and neither tinted: the page carries no violet haze anywhere
  (`lib/theme.test.ts` fails on a hue in either shadow).
- Layout: `--gutter` (40px from 768px up) via `.vk-gutter`, `--width-wide` via `.vk-w-wide`.
  `--cta-height` (56px) is the minimum height of `.vk-prompt-trigger` on `PromptCopyButton`;
  `--width-prompt-pop` (30rem, capped by `100cqw` of its container, never by `100vw`, which counts
  the scrollbar) is the width of the `.vk-prompt-pop` preview. `--head-gap` (2.5rem, 3.5rem from 64rem) is the one space
  between a section head and its content: the
  comparison and contribution content (`mt-(--head-gap)`), the row gap
  of `.vk-section-aside` (the marquee and the FAQ) and of the playground grid; `section-bands.test.tsx` fails on an ad hoc
  `mt-10` or `lg:mt-14` there. `.vk-grid-12` is the landing grid: one column under 64rem,
  then `--grid-columns` (12) columns with a `--grid-gap` (24px) gap, where each child spans
  `--grid-span` columns (the full row when unset), starting on `--grid-start` when set. `SectionHead` takes `layout`: `split` (the default, a
  `.vk-grid-12`: the heading block spans 8, the lead 4, bottom-aligned by default; `align="start"`
  top-aligns them (`data-align`), which the comparison uses, its lead kept to three lines at
  1440 in every locale by `e2e/compare.spec.ts`), `stacked` (the lead
  under the heading on the first column, for a section whose content runs the full row: the
  contribution steps), `inline` (the same
  stacked block at a narrower measure, `.vk-section-head-inline`, set inside the column beside an
  artifact rather than over it: the SDK playground renders it on the server as a sibling before
  its island, and its grid puts it at the top of the control column next to the sticky snippet).
  A split head without a lead renders stacked; `stacked` and `inline`
  keep their shape either way. `SectionHead` is the head only and takes no children.
  `SectionAside` (same file) is the head beside its content: a `.vk-section-aside` `.vk-grid-12`
  with the stacked heading and lead (`data-layout="aside"`) in span 4 at the start and its
  `children` in `.vk-section-aside-content`, span 8, top-aligned; one column, head first, under
  64rem: the marquee and the FAQ. Its optional `trailing` renders after the content as a direct grid child (the FAQ's docs link
  list, placed in the head column's second row from 64rem by `.vk-faq-aside`). `section-bands.test.tsx` renders each section and pins the head shape it
  draws, so the page never goes back to one head shape everywhere.
- Landing surfaces: `--surface-band` (mixed from `--surface-card` and
  `--surface-bg`, never a raw value), the fill of `.vk-band`: `Section` with `band` renders a
  full-width `section.vk-band` (between two `--border-default` hairlines, `--section-md` above it
  and `--section-md` padding inside) around the usual `.vk-gutter` column. Every page/band edge is
  therefore one `--section-md` step of content gap on each side of its hairline: a page section
  opens with `--section-md` (its rhythm) and ends at its content, the band margin sets the space
  above the next hairline, the hero ends at its tracks (no bottom padding), and the footer opens with
  `--section-md` under its hairline like a band. The one larger step is `--section-closer` above the
  closing section. Page and band strictly
  alternate, so no two bands touch: hero (page), marquee (band), SDK playground (page),
  comparison (band), FAQ (page), contribution (band), final call to
  action (page), then the flat footer band (`section-bands.test.tsx` pins the order and the
  surfaces). The hero draws no
  pattern and no glow (`hero.test.tsx` fails on a `.vk-banner-glow` element, rule or
  `--banner-glow` token); there is no wash token and no dot backdrop.
- No placeholder chip: the landing has no signature token motif. The SDK playground shows its
  placeholders as plain text, and `components/landing/landing-tokens.test.ts` fails if a
  `--placeholder-*` token comes back; draw a new motif only together with the pane that uses it.
- Motion: see "Landing motion" below for the system. Its tokens: `--ease-standard` (entrances,
  hovers and state changes), `--duration-fast` (140ms, hover and press),
  `--duration-base` (240ms, state change), `--duration-slow` (560ms, every entrance), `--reveal-distance` (`--motion-distance-lg`, 16px;
  `--motion-distance-md`, 8px, under 40rem), `--reveal-stagger` (70ms) and
  `--reveal-delay-max` (350ms, the stagger cap), and `--marquee-item-time` (5s: one marquee loop
  lasts that times the row's item count). Only `opacity` and `transform` / `translate`
  ever animate.

## Typography

Two families, loaded in `app/[lang]/layout.tsx` through `next/font/google` (latin subset):

| Role | Family | Variable | Mapped to |
|---|---|---|---|
| Body and display | Geist | `--font-geist-sans` | `--font-sans`, `--font-display` |
| Code | Geist Mono | `--font-geist-mono` | `--font-mono` |

`h1` through `h6` are globally bound to `--font-display`, which is Geist like the body; headings
differ by weight, size and tracking, not by family. You do not set a heading font per component.
Adding a third family needs a reason that survives review.

The type scale is a major third (1.25) held in `app/global.css`: `--text-display`, `--text-h2`
(capped at 3rem, read only by `.vk-h2`), `--text-h3`, `--text-h4`, `--text-lead`, with `--leading-*`
and `--tracking-*` companions. Above it sits `--text-hero` (fluid, 2.5rem to 6.25rem) with
`--weight-hero` (700), used only by the landing headline (`.vk-banner-title`, through
`--banner-title`, which caps it at `13.5cqi` of the copy column). Landing headings take the `.vk-h2`, `.vk-h3`, `.vk-h4` and `.vk-lead`
classes (declared in `@layer components`, so a Tailwind utility still overrides them)
rather than inline `fontSize` / `letterSpacing` styles. The docs page title, description and prose
`h2` to `h4` sit on the same scale through the `#nd-page` rules. Headings never hyphenate on their
own (`hyphens: manual`, `overflow-wrap: anywhere`, which also lets a long word shrink the heading's
flex or grid track instead of overflowing it), so a German compound breaks only where the copy
puts a hyphen. The wordmark is lowercase `verbatra` everywhere: the header, the footer and both
social images (`OG_WORDMARK` in `lib/og-image.tsx`).

Headlines are solid `--text-strong` on both surfaces. No heading carries a gradient.

## Reuse before you build

- **Primitives:** `components/ui/` holds `badge`, `button`, `command-line`, `copy-announcement`,
  `copy-button`, `copy-control`, `tabs`. Every copy control runs on `useCopyToClipboard` (`lib/`: `idle`, `copied`,
  `failed`, an `attempts` count, `reset`, and `holdFailure` to keep a failure until the next copy)
  and announces through `CopyAnnouncement`, a polite live region whose text node is keyed on
  `attempts`, so a repeated copy is announced again. `CopyButton` shows "Copied" or, in
  `--text-danger`, "Copy failed", and drops its `aria-label` while it does, so the visible status
  is its accessible name; `CommandLine` renders `CopyButton` rather than its own button.
  `CopyButton` is `CopyControl` (`copy-control.tsx`) fed the `landing.install` copy strings; a plain
  `island()` that may not call `useTranslations` (the SDK playground) renders `CopyControl` with
  those strings passed in as props, never a copy of the button.
  `TabList` takes an `idPrefix` to wire `id` / `aria-controls` to `tabPanelId` panels and moves
  selection and focus with the arrow keys (wrapping), Home and End; `tabPanelProps(prefix, id,
  active)` gives a panel its `id`, `role`, `aria-labelledby`, `data-active` and `inert`. Its
  `variant: "segmented"` is the `.vk-segmented` switch (tabs rounded by `--radius-segment`, 7px)
  that the hero track switcher uses, never a hand-made copy. The default `underline` variant serves every other tab row;
  there is no second tab primitive.
  `Button` takes `variant: "primary" | "secondary" | "outline" | "ghost"` (`secondary` and
  `outline` both draw a `--text-faint` border that holds 3:1 on its own; `outline` also shows a
  pressed `--accent` border through `aria-pressed`) and `size: "sm" | "md" | "lg"`. `primary`
  carries `.vk-btn-primary`, a fill with no border; under `forced-colors`, where the fill drops, it
  gets a 1px inset `ButtonText` outline (not a border, so its size never changes), left to the
  focus ring while it is `:focus-visible`.
  Extend the variant union rather than passing ad hoc `className` overrides.
  A control's boundary never relies on `--border-default` alone (about 1.3 to 1.5:1): a bordered
  button, the `.vk-segmented` switch and `CopyControl` draw it in `--text-faint`, and the copy
  button's copied and failed states in `--accent` and `--text-danger`, every one at 3:1 or more on
  `--surface-bg`, `--surface-band`, `--surface-card` and `--v-void` in both themes
  (`components/ui/control-boundaries.test.tsx`). `--border-default` stays the hairline of panels
  and frames, which are not controls.
- **shadcn/ui primitives:** `components.json` (style `new-york`, Tailwind 4 with an empty
  `tailwind.config`, `cssVariables`) points the `ui` alias at `@/components/ui/shadcn`, so the
  CLI never overwrites the hand-written `components/ui/button.tsx` and `tabs.tsx`. That folder
  holds `sheet`, taken from the new-york-v4 registry
  with two changes: it imports its own `@radix-ui/react-dialog` package (the versions Fumadocs
  already resolves) instead of the `radix-ui` meta package, and
  `SheetContent` takes a `closeLabel` (a translated string; no close button without it) instead of
  the hard-coded English "Close". `cn` is `lib/utils.ts`. The shadcn color names are mapped in one
  `@theme inline` block in `app/global.css` straight onto the semantic layer (`background` to
  `--surface-bg`, `primary` to `--accent-fill`, `accent` to `--surface-hover`, `ring` to
  `--focus-ring`, and so on); there is no second palette and no shadcn `--radius` scale, so
  `rounded-md` and friends keep the site radii. The shadcn `--accent` variable is never declared:
  `--accent` stays the site's violet text accent, and `bg-accent` reads `--color-accent`. Every
  button, inside a shadcn composition or not, is the site button in `components/ui/button.tsx`; add a
  registry primitive only together with the code that uses it.
- **Landing:** `components/landing/` holds one component per section. Their order on the page is
  `LANDING_SECTIONS` in `lib/landing-sections.ts` (hero, marquee, playground,
  compare, faq, openSource, finalCta), which the home page maps
  over and `lib/landing-sections.test.ts` pins; add or move a section there, not by hand in
  `page.tsx`. The files: `hero.tsx` (the `NewAnnouncement` depth pill linking the current cli
  release notes, the `h1`, the lead, two buttons, the trust line and the `HeroTracks` island; no
  install box, no copy button, no facts block and no diff), `hero-tracks.tsx` (see "Hero" under
  "Landing motion"), `playground.tsx` (`#playground`, the SDK playground, see
  "SDK playground" below), `marquee.tsx`
  (`#marquee`, see "Marquee" below), `compare.tsx` (`#compare`, a band opened by a split head with
  a lead (`landing.compare.lead`, which also states the integrity gate: no cited source covers it
  for the other tools, so it stays out of the table): the short table, five rows (`SHORT_ROWS`) by
  Verbatra, Lingo.dev, one hosted TMS column summing up Crowdin, Lokalise and Phrase (headed
  "Hosted TMS", the three names in an `sr-only` span from `HOSTED_TMS_NAMES`, and in the Markdown
  header), and the manual workflow (`SHORT_COLUMNS`, at most four, Verbatra first). `lib/landing-compare.ts` holds the full table's rows and tools too,
  and one numbered source list, `compareSource(n)`, so a footnote number names the same source on
  the landing and on `/compare`; `cellFootnote` derives each cell's number from its row and tool,
  and the manual column cites the note `M`. A short cell is a check (`.vk-compare-yes`, an
  `aria-hidden` `.vk-compare-yes-glyph` stroke with an `sr-only` `landing.compare.marks.yes`,
  `--text-muted` at a 2 stroke, and `--text-strong` at 2.75 in the Verbatra column, so the lead
  column's checks never read weaker than the rest) only where the full table's own English text
  says yes (`SHORT_CELLS` in `lib/landing-compare.ts`; `lib/landing-compare.test.ts` derives every
  mark from `landing.compare.rows`: a cell opening with "Yes", or on the CI row naming an official
  Action, and not hedged by "No", "Not", "Unknown" or "no official"; the hosted TMS column only
  where all three vendor cells say yes), with or without a few words
  (`landing.compare.brief.<row>.<column>`), or words alone for anything partial, unknown or not
  applicable; never a cross ("none found" is not "no") and never a rating. A `/compare` cell stays
  text only. Every cell is followed by its footnote links (`[data-footnotes]`, each at least 24px,
  named "Source n, tool", set small (0.6875rem mono) and `--text-muted` with no underline until
  hover, so the sources stay reachable without outweighing the cell text); `TextWithRefs` keeps the cell's last word and its links in one `whitespace-nowrap` run,
  so a link never starts a line alone. The source list itself lives only on `/compare` (`li` with
  `value={n}` and `id="source-n"`, the note `id="source-m"`): the landing passes `sourcesPage`
  (the localized `/compare`) so its links are plain `a` elements to `/compare#source-n`, a full
  navigation that sets `:target`. Under the table, in one wrapping `.vk-compare-foot` row: the
  concession (what Tolgee and the hosted platforms offer that Verbatra does not, with
  `CONCESSION_FOOTNOTES`, shared with `/compare`), "Last checked" with `COMPARE_LAST_CHECKED` as a
  `time`, and the link to `/compare`; the framing sentence (`landing.compare.fairness`) shows only
  on `/compare`. `compare.test.tsx` holds the landing's prose outside the heading, the table and
  the scroll hint to 40 words. The table is a
  hairline table (`.vk-compare-table`, `table-layout: fixed`): a top and bottom rule, rows split by
  `--border-default`, the header row on `--compare-head` (the band surface) over a `--text-faint`
  rule, no filled header and no tinted column; the Verbatra column is marked by `.vk-compare-mark`,
  an inset `--accent-fill` start bar (under `forced-colors`, where the shadow drops, a 3px
  `CanvasText` start border), with medium-weight cells and its header in `--accent`; every
  column header is medium weight too. Every
  surface of the region (its background, the opaque sticky cells, the fade, the no-timeline
  shades) reads `--compare-surface`, the page under `.vk-compare` and the band under
  `.vk-band .vk-compare`. The table scrolls sideways inside a focusable `section` named by its
  caption (`aria-labelledby`), with the row headers pinned at `--compare-sticky` (16% on the
  landing, 11rem on `/compare`, at most 7.5rem (38cqi, 46cqi on `/compare`) while the column is narrower than 56rem,
  where the row headers drop to `--text-xs` with 0.5rem/0.375rem inline padding so every criterion
  word, a trailing hyphen included, fits unbroken in all four locales down to a 320px window with a
  classic scrollbar (305px), which `expectStickyLabelsFit` checks word by word), which is
  also the region's `scroll-padding-inline-start`, so a focused link scrolls clear of the pinned
  column; Chrome leaves a link that is only partly under it unscrolled, so the lazy `CompareFocus`
  island (`compare-focus.tsx`, one `focusin` listener) scrolls a control focused inside the region,
  only when it `:focus-visible` (a pointer press is never moved out from under the pointer),
  with `scrollIntoView` at `nearest`, which honours that padding and the footnote link's 0.25rem
  `scroll-margin-inline` (room for its focus ring), and `e2e/compare-page.spec.ts` checks the
  geometry, not a hit test; the focused link (`.vk-compare-ref:focus-visible`) still sits above the
  pinned column on the region surface; `scroll-padding-inline-end: 3rem` keeps a focused link at the end edge clear of the fade,
  and the fade is dropped (`display: none`) while the region holds focus. A row header breaks a
  long word (`overflow-wrap: anywhere`; never `hyphens: auto`, which `lib/theme.test.ts` bans), and a
  pill in a cell wraps inside it. A thin scrollbar thumb, here and on every other sideways
  scroller of the site (prose tables, code frames, tab rows), is `--text-faint`,
  never `--border-default`. While the
  column is narrower than the table (40rem on the landing, whose table is `min-w-[40rem]`; 100rem on
  `/compare`) a `landing.compare.scrollHint` line before it says so
  (not wired as a description, since it is `display: none` on a wide column) and
  `.vk-compare-fade` fades the end edge on the region's scroll timeline; without scroll timelines
  the fade is dropped and the region shades its end edge with a `local` cover over a `scroll`
  shade, which clears at the scroll end. A followed source (`.vk-compare-source:target`) gets an
  `--accent-fill` tint and start bar, its number inside the tint (`list-inside` with a hanging
  indent), and `scroll-margin-top` clears the sticky header. `TextWithRefs` keeps a closing quote or
  other punctuation-only tail with the word before it, and French copy puts U+202F inside `« »`. The
  region, its caption and sticky headers, the footnote links and the source list (two CSS
  columns from 64rem, each URL breaking after its slashes through `breakUrlAfterSlashes` and,
  with `overflow-wrap: anywhere`, inside a long slug at 320px; each link and its `;` in one
  `inline-block` with `py-1`, which spaces the links far enough apart for the 24px target rule) live in
  `compare-table.tsx` (`CompareRegion`, `FootnoteRefs`, `TextWithRefs`, `SourceList`), shared
  with `/compare`:
  `app/[lang]/(home)/compare/page.tsx` under the home layout renders `compare-page.tsx`, one `h1`
  (`compare.heading`, `.vk-h2` size), the full table of `COMPARE_ROWS` by `COMPARE_TOOLS` (every
  cell is `landing.compare.rows.<row>.<tool>`; the short table takes its row labels from the same
  rows and its cells from `brief`, footnoted with the same numbers, the hosted TMS cell with
  exactly the Crowdin, Lokalise and Phrase cells it sums up (`lib/landing-compare.test.ts`); the Verbatra providers cell lists `badgedProviderNames(locale)` with the
  `RELEASE_BADGE` pill and the formats cell counts `SUPPORTED_FORMAT_IDS`, both through
  `lib/compare-cells.ts`), the dated notes, its own concession, links to the quickstart and home,
  and all sources under an `h2`. The article's single grid track is `minmax(0,1fr)`, so no long
  item widens the column past the gutter (`e2e/compare-page.spec.ts` checks every visible element
  against the viewport edge at 320px and 375px). Its 100rem-wide table sits in `.vk-compare.vk-compare-full`, whose
  container query at 100rem shows the hint and fade on a desktop column too. `/compare.md` (and
  `Accept: text/markdown` on `/compare`) is `lib/compare-markdown.ts` served by
  `app/[lang]/site.mdx/[page]/route.ts`; `MARKDOWN_PAGES` in `lib/markdown-route.ts` lists the
  non-docs pages with a Markdown variant beside the landing's `/index.md`, and `SITE_MARKDOWN` in
  `lib/site-markdown.ts` maps each to its generator; a direct `.mdx` url is redirected to its `.md`
  url once in `proxy.ts`), `open-source.tsx` (`#open-source`, the contribution section on the
  `openSource` messages, a band after the FAQ with a `stacked` head: `ol.vk-contribute-steps`, the
  `CONTRIBUTION_STEPS` of `CONTRIBUTING.md` (set up with `pnpm install`, a focused change checked
  with `pnpm verify`, a pull request with a `pnpm changeset` where needed; `open-source.test.tsx`
  reads the guide and fails when a command or step leaves it) across one row from 64rem, each step
  a top hairline, an `aria-hidden` `--accent-fill` numeral, a `.vk-h4` title that carries the whole
  step (no body sentence) and its command in mono on `--v-void`; from 64rem each step spans three
  rows of the list's grid with `grid-template-rows: subgrid`, so titles and commands line up across
  the row however the copy wraps (`e2e/contribute.spec.ts` checks it at 1024 and 1440 in every
  locale); under the steps the contributors from `lib/contributors.json` (a `div` with
  `role="group"` named by its heading, never a nested `section` landmark), each a self-hosted 32px
  avatar from `public/contributors/` with the login beside it, refreshed by hand with
  `pnpm contributors`, then one open slot (`landing.openSource.contributorSlot`, a dashed
  `--text-faint` 32px ring drawn in CSS, no image, `--accent` on hover) linking the issue list
  (`CONTRIBUTOR_SLOT_URL`), beside a `nav` of project links (repository, contributor guide, the
  root `AGENTS.md` guide for coding agents, code of conduct, license; plain `.vk-prose-link`s, 44px
  tall, no icon and no arrow, `landing.openSource.newTab` in an `sr-only` span). The section holds
  its visible copy to 60 words (`open-source.test.tsx`). No good-first-issue label link while
  that label has no open issue), `faq.tsx` (`#faq`) and `final-cta.tsx` (the closing
  section on `landing.closing`, the page's only centered section: `.vk-final-cta` opens
  `--section-closer` (`--section-lg`, the only large step besides the hero) under the contribution
  band on the page surface, and `.vk-closer` centers one `h2`, one lead sentence, the install
  `CommandRow` in `.vk-final-install` (36rem, its command start-aligned) and `.vk-closer-actions`:
  Get started (`/docs/quickstart`) and the repository on GitHub as a plain `secondary` anchor in a
  new tab with the `sr-only` `landing.openSource.newTab`, stacked to the command's full width under
  24rem; no card, wash or glow). The footer is not a section; `app/[lang]/(home)/layout.tsx` passes
  it to the home layout (the landing and `/compare`). `FullFooter` (`footer.tsx`, `footer.vk-footer`) is one flat
  `--surface-band` under a `--border-default` top hairline, with no gradient wash and no gradient
  rule, in three rows, no longer the brand column beside five link columns: a top row with the
  wordmark and the one-line tagline at the start and GitHub and the npm org (`NPM_ORG`) at the end
  (`.vk-footer-top`, a hairline under it); then `FOOTER_GROUPS`, four named `nav`s on
  `.vk-footer-groups`, deliberately not a row of equal columns: product (`PRIMARY_GROUP`: the docs
  pages, the localized `/compare` and the files for AI agents) leads as the wide group, its links in
  `--text-strong` at 15px flowing down CSS columns (`columns: 2 9rem`, three from 48rem), and
  packages (every package on npm and the release notes), community (contributor guide, code of
  conduct, security policy) and legal (license, Impressum, privacy, contact, `/licenses`) sit in
  `.vk-footer-secondary` as muted columns: beside product from 80rem, narrow and content-sized behind a
  `--border-default` start rule; under it before that, on product's three column tracks from 48rem
  (three equal columns at `--grid-gap`, so each group starts where a product column does); group titles and the locale label are
  medium `--text-strong`, links keep a 0.5rem row gap and a 2px focus offset; then `.vk-footer-bottom` (a hairline above it): the locale switch, and
  the version line (`landing.footer.versionParts` with the `lib/site.ts` versions), the license and
  the copyright as plain spans. Links are `.vk-footer-link` (24px tall, muted, an `--accent`
  underline at 45% on hover). The locale switch is `LocaleLinks` (`components/locale-links.tsx`,
  a small client component loaded as the block `LocaleLinks` island of `chrome-islands.tsx`, so it
  is server-rendered into the HTML, works without JavaScript and adds nothing to the first load;
  its label id comes from `useId`):
  `nav.vk-locale-links` named by its visible `landing.footer.language` label, one plain link per
  locale to the current page (`localeSwitchHref` in `lib/locale-switch.ts`, from `usePathname`:
  the bare locale root for a home page, no trailing slash), each with `hrefLang`, `lang` and its
  endonym from `LOCALE_DISPLAY_NAMES`, the reader's own marked `aria-current="page"` (strong text,
  `--accent` underline). `LegalFooter` (`components/legal-footer.tsx`, legal pages and every docs
  page) shows it beside its legal links when its layout passes `FooterLocaleLinks`
  (`components/footer-locale-links.tsx`) as `localeSwitch`; the global not-found page (every
  missing docs slug too) passes none, since the switch there would link to more missing pages, and
  so loads no island.
  `e2e/footer.spec.ts` checks the surface and every same-site link in all four locales, and on the
  landing, `/compare`, legal and docs pages, with JavaScript off, that the switch's links equal the
  page's `hreflang` alternates and answer 200 without a redirect. Section ids are unique; never render two sections that claim the same one.
  The FAQ (`faq.tsx`, on the page surface `--v-void`, `SectionAside` with `.vk-faq-aside`: five
  questions phrased the way people search (cost, providers, privacy and keys, CI, repeat runs), each
  answer at most 30 words with a first sentence of at most 25, the heading and lead in the head column, the questions beside it, then a `nav` of docs links that
  follows the list in the DOM, so a phone reads the questions first, and that sits under the head
  from 64rem, each link a 44px target) is a server section: each item is a native
  `details`/`summary`, rendered closed on the server with its question in an `h3` inside the
  summary (`text-wrap: pretty`) and its answer in the HTML (at most 33rem wide), so it opens and
  reads without JavaScript. From 64rem the head is `position: sticky` at
  `--vk-landing-offset`, right under the site header, with `--head-gap` of its own `--v-void`
  padding on top (pulled back by a negative margin, so it starts where it did), so it stays beside a
  long open list and the docs links scroll under it, never through a gap above it. A focused docs
  link still lands below the head: each link's `scroll-margin-top` is the head's height
  (`--faq-head-size`, which `faq-keys.tsx` keeps current on `.vk-faq-aside` with a
  ResizeObserver; 21rem without JavaScript) plus 0.5rem. The open state swaps the `.vk-faq-mark` plus (a
  `--text-faint` boundary, `--accent` bars) for a filled minus (`--accent-fill`, its bar
  `--accent-fill-fg`) with no transition; under `forced-colors` the bars are `CanvasText` and the
  open mark `Highlight` with a `HighlightText` bar. `faq-keys.tsx` is a null-rendering client helper,
  loaded as the lazy `FaqKeys` island from `islands.tsx`, that adds arrow keys, Home and End between
  the summaries, leaves a modified key to the browser and sets `--faq-head-size`. `faqContent` (same file) builds each item's
  question, rich answer and plain answer from one translator call; the home page builds it once and
  passes the items to `Faq` and the plain ones to `faqPageLd`, so the FAQPage JSON-LD always equals
  the visible text. A hyphenated word in an answer (`OpenAI-compatible`) is kept whole. Ids, order and
  links live in `lib/landing-faq.ts`; answers use a `link` tag (that item's docs page, localized),
  `license`, and `code` for a command or file name (plain in the JSON-LD) only. Facts that change with a release come in as values, never typed: the providers
  answer lists `publishedProviders()` (`MACHINE_PROVIDER_IDS` whose `RELEASE_BADGE` version is at
  most `PACKAGE_VERSION`), names the rest with the badge version, and says how to choose (the
  `provider` block, `none`). Formats are left to the marquee. `FORMAT_DISPLAY` in `lib/landing-facts.ts` is every format's display
  label, which the structured data's format list reads too, so a new format fails to
  compile until it has one. The marquee (`marquee.tsx`, `#marquee`, a band right under the
  hero, its `SectionAside` head at the start of the band and the rows beside it at the end from
  64rem)
  shows two rows inside the `MarqueeMotion` island (`marquee-motion.tsx`): the providers,
  `landingProviders()`, each with its mark from
  `PROVIDER_ICONS` (a `Record<MachineProviderId, MarqueeMark>`), and the formats,
  `SUPPORTED_FORMAT_IDS` by their `FORMAT_DISPLAY` label with their mark from `FORMAT_ICONS` (a
  `Record<SupportedFormat, MarqueeMark>`), so a new provider or format fails to compile until it
  has one. A `MarqueeMark` is either a brand mark (`kind: "brand"`) or a file-extension chip
  (`kind: "chip"`). Brand marks follow the logo rule under "Reuse before you build" (the stack
  cards paragraph); every one is a `<use>` of the one `BrandMarkSprite`
  (`components/brand-marks.tsx`, prefix `marquee-mark`), drawn at 18px in a single
  `currentColor` fill. A chip (`.vk-marquee-chip`: mono `--text-xs` text in an inset 1px
  `--border-default` ring, `--radius-sm`, no fill) stands in for an item with no admissible
  mark: `.json` (vue-i18n), `.xlf`, `.po`, `.ini`, `.resx` (the .NET wordmark is unreadable at
  18px) and `/v1` for the OpenAI-compatible endpoint. Every chip is at least 2.75rem wide
  (`min-inline-size`, its text centered), the width of the longest extension, so the chips read as
  one size.
  Mark and chip are `aria-hidden` and `--text-muted`; hovering a row (which also pauses it) lifts
  them to `--text-strong`, with no glow, scale or brand color. The name (`.vk-marquee-name`) is
  the item's text. A provider that `RELEASE_BADGE` dates carries the depth pill (`NewPill`, `landing.marquee.new`)
  with the "Available from" label in an `sr-only` span and, after it, the release version as visible
  `aria-hidden` mono text (`.vk-marquee-release`, `--text-muted`), so a reader on the current
  release sees the provider is not in it yet. Its glint is held (`animation-name: none` under
  `.vk-marquee:not([data-glint])`) until `MarqueeMotion`'s `IntersectionObserver` sees half the
  marquee and sets `data-glint="on"`; it then runs its three finite loops, never under reduced
  motion, and never without JavaScript.
  Each item (`.vk-marquee-item`) is a `--surface-bg` fill with no
  border or ring, since it is a fact, not a control. No count is typed. Each row is a muted `h3` that names its visible list,
  the list, `MARQUEE_COPIES` copies of it (`aria-hidden`, `inert`, holding no link or button), and
  an "All providers" or "All formats" link after the moving track, so nothing focusable moves. The
  list sits in `.vk-marquee-viewport`, a `.vk-edge-fade` `role="group"` keyboard stop named by the
  row's `h3`. The server HTML is the static state, and the copies are `display: none` in it. Under
  reduced motion or without JavaScript (`scripting: none`) the pause button is `display: none` and
  the list wraps, which never changes. Where motion may start (`prefers-reduced-motion:
  no-preference` and `scripting: enabled`) the static state already has the moving state's box:
  the pause button holds its row at `visibility: hidden` (so it is neither focusable nor announced)
  and each list is one line that scrolls sideways with no scrollbar, so every item stays reachable
  by keyboard, touch or trackpad, also after a failed island chunk, and the takeover shifts
  nothing (`e2e/marquee.spec.ts` measures the section's height before and after hydration at 375
  and 1440 and sums the layout shift). Only when `MotionRoot` has set `html[data-motion-ready]`,
  the island has hydrated (`data-marquee="running"` or `"paused"` on `.vk-marquee`) and that media
  query matches do the rows turn into one masked line that runs
  `vk-marquee` (a `transform` keyframe, `--marquee-items` times `--marquee-item-time` per loop,
  the formats row reversed through `--marquee-direction`), and the pause button shows before the
  rows: an `outline` `Button` at `size="md"` (44px tall, like the other landing controls) whose visible text is its name and says the action it takes next:
  `landing.marquee.pause` while running, `landing.marquee.play` while paused, with no `aria-pressed`
  (a changing name plus a pressed state would read "Play animation, pressed"), and its
  `aria-hidden` glyph swapping on `data-marquee`. Hover and focus inside
  a row pause that row. `marquee.test.tsx` pins the registry rows, the badge, the copies, the static
  state and the pause toggle, and `e2e/marquee.spec.ts` the motion in a browser. The shared building blocks: `section.tsx` and
  `section-head.tsx` for structure,
  the scroll fades: every sideways-scrolling mono block fades its end edge while there is more to
  see, through a mask on the element's own inline scroll timeline (one `@supports` rule for every
  scroll fade, `.vk-edge-fade` included, dropped while the element shows a focus ring or holds a
  focused child, so no ring is faded), and without scroll timelines a `--scroll-shade` (neutral,
  never violet) over a `local` void cover; `.vk-scroll-fade` is that rule for the playground blocks, each a `ScrollBlock` (`components/landing/scroll-block.tsx`: a
  `div` with `role="group"`, never a landmark, and `tabIndex={0}`, like the code frames' `pre`)
  named by its caption through `aria-labelledby`. Both draw their focus ring inset
  (`outline-offset: -2px`) in one unlayered rule beside the global `:focus-visible`, outside every
  `@supports` block, because a frame clips with `overflow: hidden` and a layered utility loses to
  the global rule.
  `lib/hero-terminal.ts` keeps the recorded `verbatra check` and `verbatra translate` transcript
  (`HERO_TERMINAL_SCRIPT`, English on every locale, like all CLI output on the page) that the home
  social image draws from and `HERO_TERMINAL_TITLE` (`~/app`), the title of every shell frame;
  `lib/hero-terminal.run.test.ts` pins the lines to the CLI's renderer;
  `lib/landing-tracks.ts` holds the three hero tracks, `translate`, `agents` and `ci`
  (`LANDING_TRACKS`: per track a docs path, the shell frame title, its `steps` (each a command
  and the recorded output it printed), the exit code, and its files: the agents track's `.mcp.json` and the CI track's workflow),
  every command and file pinned to its source by `lib/landing-tracks.test.ts`: the
  translate track runs `HERO_TERMINAL_SCRIPT` of `lib/hero-terminal.ts` (check, then translate,
  the same script the social image draws) and the CI track `HERO_CHECK_COMMAND` with its transcript,
  then `TRACK_CHECK_WORKFLOW` (`.github/workflows/i18n.yml`: a `pull_request` job of checkout and
  `verbatra/action` with `command: check`, its step copied from the GitHub Action guide's gate,
  both actions pinned through `lib/action-refs.ts` to the SHAs this repository's own workflows
  run, and `version` set to `PACKAGE_VERSION`), each command with the transcript it printed, checked against the published cli flags in
  `test-support/cli-0.11.1-flags.json` and the `check` exit codes of `checkExitCode`; the agents
  track runs the `claude mcp add` line and shows the `.mcp.json` block, both copied from the MCP
  client guide, and has no recorded output, so its result is empty. A track never shows a command
  whose output it does not print),
  `CommandRow` (`components/command-row.tsx`: the closing
  section's npm install wraps under 30rem through `wrap="narrow"`, `wrap="always"` wraps a command at every width; elsewhere a `CommandRow` scrolls
  sideways inside `.vk-edge-fade`: a mask, not a painted background, so it stays see-through on any
  surface, and the end fade shows only while the command overflows, driven by a scroll timeline),
  `AiSetupPrompt` (`components/ai-setup-prompt.tsx`: the whole prompt, wrapped, under a `.vk-label`
  caption that shares its row with the prompt's small Copy button; its URL breaks only after a path
  `/`, through `breakUrlsAtSlashes` in `lib/word-breaks.tsx`) and `PromptCopyButton` in the same
  file (the large "Start with a prompt" button with the `.vk-prompt-pop` preview, used only by the
  docs home agent tip). The footer draws no pattern and no watermark, and neither does the hero: the landing
  has no background pattern. A new section composes `Section` plus
  `SectionHead`; it does not re-derive page padding or heading rhythm. `Section` takes
  `labelledBy`, the id of its `h2`, and renders it as `aria-labelledby`, so every landing section
  is a named region; the hero and the closing section set it themselves (`e2e/landing.spec.ts`
  fails on a nameless section). Check
  `ls apps/docs/components/landing` before quoting a file name from this list. The CLI transcripts
  on the landing (`lib/hero-terminal.ts` with the check lines of `lib/check-demo.ts`) are real CLI
  output, English on every locale, and their tests pin each line to `packages/cli/src/render.ts`
  (`lib/hero-terminal.run.test.ts` imports
  `renderCheckHuman` from it by relative path, and also drives `run` from
  `packages/cli/src/run.ts` over the real sdk `check` for the exit code, in those run tests only,
  never from `lib/`), so a change to the CLI's output fails until the demo is recaptured.
- **Docs-facing:** `<StartHere />` (`components/start-here.tsx`) opens every page in
  `START_HERE_PAGES` (`lib/agent-entry.ts`, the agent guides only, not reference pages): a void
  `aside` at the prose measure with no start bar (so it never doubles the locale notice's callout
  bar), a `.vk-label` title and one lead, then the agent `CommandRow` for `AGENT_INIT_COMMAND` and
  the same `AiSetupPrompt` row, so `AGENT_INIT_COMMAND` and `AI_SETUP_PROMPT`
  (`lib/ai-setup-prompt.ts`) each have one source. `<McpInstallLink client="vscode" />`
  (`components/mcp-install-link.tsx`; VS Code only, since a Cursor link installs user-wide where
  `${workspaceFolder}` is the home folder) is a plain anchor in the secondary button style
  (`buttonClasses` from `components/ui/button.tsx`, not `Button`, whose `href` goes through
  `next/link`), built from `AGENT_CLIENT_CONFIGS` in `@verbatra/cli` by `lib/mcp-install-links.ts`.
  `remarkAgentEntryMarkdown` gives the page's `.md` output no runnable fence for the banner: one
  localized, conditional sentence (`docs.startHere.markdown`), and nothing at all on
  `start-with-ai`, whose own steps install the CLI first; the install button becomes a Markdown link
  with its localized label.
  `components/available-from.tsx` renders the version badge. Its rules live in
  `.claude/rules/docs.md`. `components/docs-home.tsx` holds the docs landing (`DocsHomeHeader`,
  `DocsHomeTabs`, `DocsHomeAgentTip`, `DocsHomeNote`, `DocsHomeBody`, `DocsHomeSection`,
  `DocsHomePaths`, `DocsHomeSteps`, `DocsHomeFeatures`), all registered in `components/mdx.tsx` and
  driven by `content/docs/index.mdx` and its three locale siblings, which write every label,
  including the tab names and the tip text, as MDX props or children. The docs home is a docs entry,
  not a second landing: `DocsHomeHeader` is a compact header (a `.vk-label` eyebrow, the headline in
  `.vk-docs-home-title` at `--text-h3`, weight 500, tight tracking, and one `.vk-docs-home-lead`
  sentence at `--text-base`; both rules are scoped under `#nd-page` so they beat the docs
  `#nd-page h1` and `h1 + p` rules), with no hero wash, no buttons, no install box and no facts row.
  Its children are `DocsHomeTabs`, an underline tab row of real links (`.vk-home-tabs`,
  `.vk-home-tabs-track`, `.vk-home-tab`; no tab is active on the home) that bleeds to the screen
  edge under 768px and scrolls sideways inside `.vk-edge-fade` (`.vk-home-tabs-scroller`, which also
  fades its start edge once scrolled, through `--vk-start-fade` on the same scroll timeline), and
  `DocsHomeAgentTip`, the "Using a coding agent?" callout with `PromptCopyButton` at the end of its
  row once the tip itself is 36rem wide (a container query on `.vk-agent-tip`, never the viewport,
  since the sidebar takes width; its preview then opens toward the start edge, capped inside the
  tip). Its text links the setup guide and the MCP page, and a link label stays whole when it has at
  most two words, otherwise keeps each hyphenated compound whole (`keepLinkLabelWhole`).
  `DocsHomeNote` is the same ringed callout (`.vk-home-callout`: an inset 1px `--border-default`
  ring, no fill, an `--accent` icon, the title at `--leading-snug` and the body at
  `--leading-normal`) without the button; the docs home puts one after the stack grid ("Don't see
  your stack?"). The header and the body share one frame (`HOME_FRAME`: one max width, one gutter).
  A section head stacks its `vk-h4` heading and its lead (`--text-sm`, muted) in one block, the lead
  directly under the heading. Every `DocsHomePaths` card is the same flat panel; there is no filled
  primary card, and the three cards share their title, body and page-name rows through
  `grid-rows-subgrid`, so a wrapped title never shifts the body or the link out of line. A
  backticked span in a header or section lead renders in code type (`withInlineCode`,
  `lib/inline-code-text.tsx`; the landing sets a command or value in a step
  and the closing install hint the same way; the docs home
  `DocsHomeSteps` reads `landing.steps.items`, the check, translate and CI steps, with its own
  `DOCS_HOME_STEP_IDS`), and a path card title keeps a hyphenated compound on
  one line (`keepCompoundsWhole`, `lib/word-breaks.tsx`). `StackCards`
  (`components/stack-cards.tsx`) is the stack picker on the docs home and at the top of
  `pick-your-stack`: one borderless grid
  (`.vk-stack-grid`: one column, two from a 36rem container, three from a 54rem container,
  `--stack-grid-column-gap` 24px by `--stack-grid-row-gap` 40px, the last row left ragged). Each
  card (`.vk-stack-card`, a reversed flex row so the text comes first in the DOM and the glyph shows
  first) has no border or background: only the round `--stack-chip-size` (56px)
  `.vk-stack-card-chip` on `--surface-card` with an inset `--border-default` ring, holding a
  generic outline glyph. The name (`.vk-stack-card-name`, 16px, 600) is the card's one link
  (`.vk-stack-card-link`), stretched over the card by a `::before` that reaches
  `--stack-card-hit-outset` past it and carries the focus ring; a badge sits inside that link as a
  `.vk-pill.vk-stack-card-badge`, beside the name, so it adds no line. The text column is
  `.vk-stack-card-text`. A small chevron (`.vk-stack-card-chevron`) after the link fades from
  opacity 0 to 1 on hover and on `:focus-visible` of the link, and nothing else changes. Under the
  name come an optional `description` (`.vk-stack-card-description`, 14px, muted) and the `--format`
  ids (`.vk-stack-card-formats`, mono `--text-faint`), each id `whitespace-nowrap`
  (`FORMAT_ID_CLASS`): a list breaks at its comma, and only under a 23.5rem container (the longest
  rendered id plus 15 percent, pinned by its test) does an id wrap, then only after a hyphen. The
  glyphs live in `components/stack-icons.tsx` (`STACK_ICON_PATHS`: `web`, `mobile`, `server` for a
  framework's kind, a file outline per file format (`json` among them) and `custom`), stroked in
  `currentColor`; a stack card never draws a brand mark, and a stack is recognised by its name.
  Third-party logos appear in exactly two places: the GitHub mark
  (`components/landing/github-icon.tsx`) and the marquee's brand marks. The logo rule for those:
  a mark is inline SVG path data in `lib/brand-marks.ts` (`BRAND_MARKS`, each with its source
  package and version, file, license and attribution), never an `<img>`, a network request or an
  icon package in `package.json`; it is drawn in one `currentColor` fill, never in brand colors,
  with a gradient or a glow; and it is admitted only under a license that allows commercial use
  and changes (no NC, no SA: Vue's mark is CC BY-NC-SA, so vue-i18n gets a chip). Every mark is
  listed as an asset in `THIRD_PARTY_NOTICES.md` and on `/licenses` through `ASSET_SOURCES` in
  `lib/third-party-licenses.ts` (run `licenses:sync` after a change), with the source URL, the
  CC BY attribution and change note where the license asks for one, and the sentence "Logos are
  trademarks of their owners, used to identify compatibility." `marquee.test.tsx` fails on a
  sprite symbol without a notice entry, a non-sprite reference or an embedded image, and
  `lib/third-party-licenses.test.ts` on an icon package, a missing entry or an NC or SA license.
  Anything with no admissible mark gets a file-extension chip, never a lookalike drawn by hand. The grid is a `nav` named by `labelledBy`, the id of the heading above it
  (the docs home section's `id`, or `page-title` on the docs `<h1>`), and that id also prefixes its
  sprite's symbol ids, so two grids on one page never collide. On the docs home, a stack with its
  own quickstart (`STACKS` in `lib/stacks.ts`) links its card to `/docs/quickstart/<id>` and carries
  a `badge` (the link reads "React, Quickstart"); every other card, and every card on
  `pick-your-stack` itself, jumps to a `pick-your-stack` section.
  `scripts/verify-docs-registry-parity.test.mjs` pins every card's `formats` to `SUPPORTED_FORMATS`,
  a section card's anchor to the page's sections and a quickstart card's format to its stack, in all
  four locales. Fumadocs' `Steps` and `Step` are registered there too, for numbered tutorial steps
  such as the quickstart's.
- **Stack quickstarts:** `<StackBlock name="..." />` and `<StackText field="..." />` are not
  React components. The remark plugin `remarkStackBlocks` (`lib/stack-blocks.ts`, first in
  `source.config.ts`) replaces them at compile time with fenced code (file-labelled through
  `title="..."`) and inline text from the page's `stack` frontmatter, so they render, search and
  print to `.md` like hand-written Markdown. The plugin never emits a heading: headings stay in
  the template, where the TOC and the parity tests see them. Content rules for the templates
  and stubs are in `.claude/rules/docs.md`.

## Landing motion

The landing moves little, on purpose: the hero types the default track once when it first comes
into view and a track's commands when the reader switches tracks, the depth pills glint three
times (the marquee's only once it is in view), the
provider and format marquee loops until it is paused, the SDK playground scrambles its results
once per Translate press, and nothing else on the page fades in.
There is no scroll-driven motion, no pinning and no parallax (the SDK playground's snippet column
is only `position: sticky` from 64rem, which moves nothing on its own), and no scroll listener;
`motion` is reserved for client islands (see "The stack").

- **Reveals.** One system: an element marked `data-reveal="<n>"` (`n` from 0 to 5) is hidden
  (opacity 0, `translate: 0 var(--reveal-distance)`) only while two things hold:
  `prefers-reduced-motion: no-preference` and `html[data-motion-ready]`. `MotionRoot`
  (`components/landing/motion-root.tsx`, mounted once at the end of the home page, rendering
  nothing) sets that attribute after hydration, so without JavaScript, before hydration and under
  reduced motion everything is visible. Before it sets the attribute it marks every element already
  on screen `data-revealed`, so nothing in the first viewport blinks out, then hands the rest to one
  shared `IntersectionObserver` (`rootMargin: 0px 0px -10% 0px`) that adds `data-revealed` and
  unobserves, so each element reveals once. Only the reveal transitions; hiding is instant. Focus
  moving into a block that has not revealed yet shows it at once (`:focus-within`). The delay is
  `n * --reveal-stagger`, capped at `--reveal-delay-max`. No landing section carries a mark
  today: the system stays for a demo artifact that earns one. No section heading reveals
  (`SectionHead` takes no reveal prop), and the hero, marquee, SDK playground, comparison,
  contribution, FAQ and closing panel never take a reveal; the hero's typing and the marquee
  loop below are their own motions, not reveals. Elements keep their box while hidden, so a reveal never moves layout.
  `reveal-marks.test.tsx` pins that no section file carries a mark and `motion-root.test.tsx` the observer and
  the stylesheet guards.
- **Hero.** The hero is never revealed and the `h1` never moves (it is the largest paint); no
  layout animation runs in it on load. On load only the announcement's depth pill (see "Depth
  pill" under "The docs surface"), whose glow, ring and shimmer run three times and stop, and the
  one typing run of the default track (below) move, both only under `prefers-reduced-motion:
  no-preference`; `motion-root.test.tsx` still fails on any
  animated `.vk-banner` rule. The `HeroTracks` island (`components/landing/hero-tracks.tsx`, a
  plain `island()` fed every string as a prop) renders the three `LANDING_TRACKS` of
  `lib/landing-tracks.ts` (`LANDING_TRACK_IDS` order: translate, AI agents, CI gates) behind one
  segmented `TabList` (`idPrefix` `hero-track`, named by `landing.hero.tracks.label`: roving
  tabindex, arrow keys wrapping, Home and End, `aria-selected`, `aria-controls`). Each panel is a
  `.vk-track-terminal` on `--v-void` (a bar with the track's `terminalTitle` and, when the track
  has an exit code, an `exit n` chip, `--v-status-changed` when it is not 0), its `lang="en"` body
  with every command after an `aria-hidden` `$`, each followed directly by the result lines it
  printed, then the track's files as compact blocks (`.vk-track-file`, `--text-xs`): the agents
  track's `.mcp.json` in place of a transcript nobody recorded, and the CI track's workflow under
  the `check` output, sized so the CI content fills the terminal the translate track sets at 1440.
  Each file line is a `.vk-track-file-line` grid of its leading spaces and its text, which wraps with
  a 2ch hanging indent under its own YAML or JSON indentation, never at the left edge and never
  sideways (`e2e/hero.spec.ts` checks the workflow at 375); under the frame one `landing.hero.tracks.<id>.summary` sentence and the link to the
  track's `docsPath`. No command, flag or line is typed by hand: all of it is pinned by
  `lib/landing-tracks.test.ts`. The panels share one grid cell: `.vk-tracks-panels` has two rows
  (`minmax(0, 1fr) auto`), every panel spans both through `grid-template-rows: subgrid`, and the
  terminal is `auto 1fr` inside, so every terminal fills the tallest one's height and every summary
  starts at the same y (`e2e/hero.spec.ts` compares the boxes at 375 and 1440). The closed panels
  are `visibility: hidden` and `inert`, so the tallest track sets the height and a switch moves
  nothing. The server HTML (and a page without JavaScript) shows the translate track in its final
  state, and hydration keeps it. After hydration one `IntersectionObserver` on `.vk-tracks`
  (`LOAD_RUN_THRESHOLD`, a fifth of it, since the phone stack is tall) plays the default track's
  typing once, when it first comes into view, unless the reader has already chosen a track,
  motion is reduced, or the island hydrated more than `LOAD_RUN_LATE_MS` (300ms) after the first
  contentful paint (`msSinceFirstContentfulPaint` in `lib/first-paint.ts`), so a slow load keeps
  the server-rendered final state instead of blanking it, then disconnects. That run and a switch, only under `prefers-reduced-motion:
  no-preference`, type the commands into an `aria-hidden` `.vk-track-typed` layer laid over the
  real text (which stays in the DOM at `opacity: 0`, so assistive technology always reads the full
  command), its `.vk-track-caret` keyed on the typed length so each character mounts a new caret
  rather than moving one (a moved box is a layout shift; `e2e/hero.spec.ts` fails on any shift
  inside `.vk-tracks` during a run), `TYPE_CHAR_MS` per character with `TYPE_COMMAND_PAUSE_MS` after each command, then
  fades that command's result lines in `TYPE_LINE_MS` apart before the next command types (`opacity`, `--duration-base`); a timer chain,
  no GSAP (`hero.test.tsx` fails on a static GSAP import in the hero or its island). Under reduced
  motion a switch shows the final state at once and nothing plays on load. `hero-tracks.test.tsx`
  pins the keyboard, the timeline, the load run and the reduced-motion path; `e2e/hero.spec.ts` pins them in a browser, with the
  server HTML without JavaScript, the load run, the fixed height and shared rows on a switch,
  the finite pill animations and
  320px and 375px without a sideways scroll.
- **Marquee.** The one looping motion on the page, a CSS keyframe with no JavaScript animation:
  it runs only in the state described under "Marquee" above, pauses through its button, hover
  and focus inside a row, and is static otherwise (one sideways-scrolling line where motion may
  start, wrapped rows under reduced motion or without JavaScript), so 2.2.2 holds without
  JavaScript.
- **SDK playground.** `playground.tsx` (`#playground`, on the void, an `inline` head whose `h2` is
  `landing.playground.heading`, rendered on the server as the first child of
  `.vk-playground-layout`, before the `PlaygroundDemo` island and never inside it, so it stays
  visible without JavaScript and after a failed island chunk on a client navigation, which
  `e2e/playground.spec.ts` drives by aborting that chunk) reads `lib/playground/translations.json` once through
  `lib/landing-playground.ts`, which parses it with `lib/playground/schema.ts` on the server, so zod
  never reaches the client, and builds `PLAYGROUND_SNIPPET` (`loadConfig({ configOverride:
  defineConfig(...) })` for `gemini` and `next-intl-json`, the model from the JSON metadata, then
  `translate({ config })`, one `targetLocales` entry per line) from `playgroundSnippet` in
  `lib/playground-snippet.ts`, a zod-free builder the island shares. The server highlights it
  through `highlightPlaygroundSnippet` (`lib/playground-snippet-highlight.ts`), whose Shiki
  transformer marks each locale line `data-snippet-locale` with `display: var(--vk-snippet-<code>,
  inline)` and moves the line's newline inside it; the island frames it in `CodeFrameShell`
  (`components/landing/code-frame-shell.tsx`) with a
  `CopyControl`, sets `--vk-snippet-<code>: none` on `.vk-playground-code` for each unchecked
  language once hydrated (all four while none is checked, and in the server HTML), and copies
  exactly the lines it shows. `playground.test.tsx` parses the full snippet with the public
  `verbatraConfigSchema`. The `PlaygroundDemo` island (`playground-demo.tsx`, a plain `island()`
  fed every string as a prop, so it adds no client namespace) holds a native radio fieldset of the
  source strings (each label `lang="en"`) and a checkbox fieldset of the languages, both
  `appearance: none` with a `--text-faint` boundary and an `--accent-fill` checked fill, 2.5rem
  tall (the source strings flow in CSS `columns: 14rem`, so the arrow keys move down a column in
  the order they read), then a `type="button"` Translate (no `form`, so nothing submits before hydration). In the
  DOM the head and the controls come first, then the results and the label with the metadata, then the snippet
  (`.vk-playground-main` and `.vk-playground-code`; `.vk-playground` is `display: contents`, so
  both join `.vk-playground-layout` beside the head: one column, then from 64rem the areas
  `"head code" / "main code"`, the snippet spanning both rows and sticky below the header), so on a phone the
  result sits right under Translate and the focus order is the visual order at every width. The
  island takes its first item, languages and focus from the server-rendered form it replaces
  (`[data-playground-demo]`, each control marked `data-control`), so a choice made before it loads
  is kept. The results are one `li` slot per language, in the languages' order: a language the
  last press left out is `data-empty` and `aria-hidden` and shows its name with a muted
  `landing.playground.notSelected` label; each slot stacks a hidden sizer of that language's
  translations, and the source line one of every source string, so no press moves anything. Once
  the selection differs from what the results show, the result block carries `data-stale`: the
  source line and the results dim by `opacity` and `.vk-playground-stale`
  (`landing.playground.stale`, always rendered, `visibility` only, in no live region) shows beside
  the results heading until Translate is pressed. Each filled
  slot holds the value with its own `lang` and an `aria-hidden` `.vk-playground-scramble` layer laid
  over it. A press loads the scramble module (waiting at most `SCRAMBLER_WAIT_MS`); while it waits,
  the results carry `aria-busy` and Translate `aria-disabled` (still focusable, presses ignored),
  and the results stay busy until the run settles. GSAP `scrambleText` then runs from the source to
  each translation, `SCRAMBLE_STAGGER_S` apart (a Latin target with lowercase letters, a CJK one
  with the distinct characters of its own text, `scrambleChars`), tweening a Text node in each layer so the plugin
  writes `textContent`, never `innerHTML`. `Scrambler` creates one `gsap.matchMedia` on
  `(prefers-reduced-motion: no-preference)` inside `useGSAP` for its whole lifetime; each play kills
  the previous timeline, a finished, stopped (a press with no language checked) or superseded run
  kills its timeline and empties the layers, and an unmount reverts the matchMedia. Under reduced
  motion, or when the module fails or is late, the texts swap at once; a failed load is dropped, so
  the next press imports again. One polite, `sr-only` live region, empty until then, announces the
  result (each value with its `lang`) only after the animation. The label
  `landing.playground.label` and the provider, model and generation date (`dl.vk-playground-meta`,
  from the JSON metadata) follow the results, and the demo content is the same in every locale.
  Without JavaScript (`scripting: none`) the controls and results are `display:
  none` and `.vk-playground-static`, a captioned table of every string and language in a
  `ScrollBlock`, shows instead. Links to `/docs/sdk-quickstart`, `/docs/sdk` and
  `/docs/providers` close the section. `e2e/playground.spec.ts` pins the browser behaviour.
- **Back to top.** `scroll-top.tsx` (`ScrollTop`, a plain block `island()` (`{ as: "div" }`) in `islands.tsx` that the
  home page mounts after `MotionRoot`, fed `landing.fab.label` and `MAIN_CONTENT_ID` as props)
  renders an `aria-hidden` `.vk-scroll-top-sentinel` (absolute, `100vh` tall from the top of the
  `position: relative` `.vk-home`, so no ancestor decides where it sits) and,
  only once an `IntersectionObserver` sees that sentinel scrolled out above the screen
  (`passedFirstViewport`), a `button.vk-scroll-top`: fixed at `right` and `bottom` (physical, like
  the `env(safe-area-inset-right)` and `-bottom` insets they add to `--fab-offset`; the site is
  left to right), `--fab-size` (44px) round on `--surface-raised` with a
  `--text-faint` boundary and an inline chevron. No scroll listener. The server HTML and a page
  without JavaScript carry no button. A press scrolls to the top (`smooth` only under
  `prefers-reduced-motion: no-preference`, `instant` otherwise) and focuses `main` with
  `preventScroll`, which hides the button again. A smooth scroll is watched frame by frame
  (`requestAnimationFrame`, still no scroll listener): when it stops short of the top for
  `STALL_FRAMES` frames, as when something resets the scroll position on the way up, it is
  issued again, at most `MAX_SCROLL_RETRIES` times. The watch ends
  after `MAX_WATCH_FRAMES` frames in any case, after `AWAY_FRAMES` frames in a row that move away
  from the top (a scrollbar drag), on `pagehide` or `popstate`, when the button unmounts (the
  press returns its stop), and a wheel, touch, key or pointer press hands the page back to the
  reader at once. When the sentinel comes back
  into view while the button holds focus, focus moves to `main` first, so it never drops to the
  body. It enters with `@starting-style` (opacity and an
  `--motion-distance-md` translate, `--duration-base`, `--ease-emphasized`) only when motion is
  welcome, and appears at once otherwise; its transition list is exactly opacity and translate,
  plus color and border color for the hover state. Once the island has mounted (the sentinel's
  client-only `data-active`, so a page without JavaScript keeps no room),
  `scroll-padding-bottom` and the footer's end padding are `--fab-clearance`, so the button never
  covers a focused element (2.4.11); `e2e/scroll-top.spec.ts` tabs from the FAQ to the end at 375
  to prove it. The motion tokens `--ease-emphasized` (the button's entrance) and `--motion-distance-sm` / `-md` / `-lg`
  (4px for the prompt preview's lift, 8px for the button and the phone reveal, 16px for the
  reveal) sit beside them, one name per value; every one of them has a consumer
  (`motion-root.test.tsx` fails on a declared `--duration-*`, `--ease-*` or `--motion-distance-*`
  token that nothing reads), so there is no instant duration and no exit easing until something
  uses one.
- **No section eyebrows.** A landing section opens with its `h2`; nothing sits above it, no
  index and no label word. `reveal-marks.test.tsx` fails on a `.vk-eyebrow` style.
- **Version pill.** On the landing only (the `landingLocale` gate in `lib/i18n.ts`), `HomeSiteHeader` passes
  `VersionPill` (`components/version-pill.tsx`) as the frame's `badge`, rendered right after the
  wordmark and outside the primary nav, which stays Docs, Reference and GitHub. It reads
  `v{PACKAGE_VERSION}` (`lib/site.ts`, from the cli version that `scripts/sync-version.mjs` writes
  to `lib/version.generated.json`) in `--font-mono` at `--text-xs` inside a `--radius-full`
  `--border-default` outline, and links the cli's GitHub release (`releaseUrl` in
  `components/landing/links.ts`, the `@verbatra/cli@<version>` tag) in a new tab, counted
  declaratively as `outbound-link` with `target: version` and `location: header`. Its accessible
  name is `landing.nav.version.label`, which contains the visible text. `.vk-version-pill` is
  `display: none` under 768px. `lib/layout.shared.test.tsx` pins it.
- **Budget.** Layout shift 0 over a full scroll at 390, 1440 and a 844 by 390 landscape phone; no
  scroll listener; at most one reveal chain per section, and only on a demo artifact (the hero
  typing and the marquee loop are not reveals); no entrance over 16px or 600ms.

## Keep the client payload small

Mobile Lighthouse is dominated by bytes that arrive before the first paint, so:

- No `motion` in the landing graph: no static import, no page-wide provider. Section reveals
  stay CSS keyframes and transitions in `app/global.css`, each with a `prefers-reduced-motion`
  opt-out; `MotionRoot` toggles attributes from one `IntersectionObserver` and stays well under
  1 KB gzipped.
- Every first-load request costs a round trip before the largest paint, and Lighthouse counts every
  script that runs before that paint, so the landing's client code arrives after it. A landing
  server section imports its client components from `components/landing/islands.tsx`, and the
  header from `components/chrome-islands.tsx`: each is an `island()` (`lib/island.tsx`), which
  server-renders the component inline (preloaded through top-level `await preloadIslands`) inside an
  `<Activity mode="visible">` and a box-less `.vk-island` wrapper (`display: contents`; a `span`, or
  a `div` with `{ as: "div" }` for an island whose root is a block, as every landing section island
  but `FaqKeys`, `CompareFocus` and `CopyButton` is), never a Suspense boundary, since React outlines a completed Suspense
  boundary over 500 bytes to the end of a long stream (the fallback flash measured CLS 0.497).
  Activity boundaries are written inline (`<!--&-->`) yet hydrate on their own, so each island
  hydrates when its chunk lands and a slow one holds no other back. In the browser
  `preloadIslands` starts every registered chunk together once the first contentful paint resolves
  (`afterFirstContentfulPaint` in `lib/first-paint.ts`, a 3s fallback whose timer is cleared). A rejected chunk is retried
  (`retrying` in `lib/retry.ts`). Until the first failure, an island instance waits on one shared
  bounded attempt: the load raced against what is left of `timeoutMs` (8s by default, counted from
  the start of that first load), the same limit for hydration and for a client mount. That 8s is the
  longest any transition or soft navigation ever waits on an island, and only before its first
  failure: once that attempt has timed out or the load has failed (`degraded`), no mount suspends
  again, whatever reload is running. A new mount then renders the failed state at once (a hydrating
  one keeps the server HTML, a client mount renders nothing) and subscribes to the shared takeover
  list, and a mount after a successful load renders it at once. After a failure the island never
  throws: a server-rendered one hydrates its wrapper with an empty `dangerouslySetInnerHTML` (React
  compares the `__html` string, so it never writes it, not even after a Fast Refresh), which keeps
  the server HTML in place, non-interactive, until its props change, when it renders nothing for
  good rather than stale markup (props are compared structurally by `sameValue` in
  `lib/same-value.ts`: elements by type, key and props, Flight and `React.lazy` wrappers by their
  resolved value, with a cycle guard). While any failed instance is mounted, the island reloads in
  the background, one load at a time, never one per mount: the first reload right after the first
  failure, each later one after `reloadDelaysMs` (0, 5s, 15s, then every 30s), and none once the
  last waiting instance unmounts. Every waiting instance takes over as soon as a load succeeds; an
  unmounted one leaves the list, so a load that never settles holds none of them.
  `lib/island.test.tsx` pins all of this, the paint gate through a fake `PerformanceObserver`;
  `island(load, { gate, retryDelaysMs, reloadDelaysMs, timeoutMs, as })` takes these as options. A test that
  renders an island under jsdom awaits `preloadRegisteredIslands()` (`test-support/islands.ts`)
  itself; there is no global setup file.
  `intlIsland()` wraps it in `withIntl` (`components/intl-boundary.tsx`), so `next-intl` loads with
  the island; `components/landing/islands.test.tsx` fails when a plain `island()` module tree calls
  `useTranslations`, or an `intlIsland()` one does not.
  A server module pulls every client module it imports into the first load, used or not, so the
  root layout holds no providers: the docs and legal layouts wrap `SiteProviders`, the landing
  `LandingProviders` (`components/landing-providers.tsx`, no `NextIntlClientProvider`, only the
  `ClientMessagesProvider` context the islands read), both over `ThemedRootProvider` and
  `loadClientIntl` (`components/themed-root-provider.tsx`), which pass the locale and time zone
  explicitly. Every localized layout and page calls `setRequestLocale` itself, since they render in
  parallel (`app/[lang]/request-locale.test.ts`). `components/landing/islands.test.tsx` pins
  the import rules.
- Nothing a hydrated page asks for may race the first paint, since Lighthouse's simulation counts
  every request that starts before the observed largest paint: island chunks, `/api/stats`
  (`useLiveCount`) wait for `afterFirstContentfulPaint`. Links never prefetch on their own: they go
  through `useIntentPrefetch` (`lib/use-intent-prefetch.ts`, `false` until the link is hovered,
  focused or touched, then the link's own choice) in `FrameworkLink`
  (`lib/framework-provider.tsx`, which every Fumadocs sidebar and header link reaches) and
  `IntentPrefetchLink` (`components/ui/intent-prefetch-link.tsx`), so the docs sidebar does not
  fetch some 35 route payloads on load and the landing fetches no docs layout before a visitor
  reaches for a docs link. The header wordmark never prefetches the home page it sits on.
- `experimental.turbopackChunking` (`minChunkSize` 200000, `requestCost` 1000000 in
  `next.config.mjs`) merges client chunks site-wide on purpose. Scoping it to the landing through
  `priorityRoutes` changed no chunk with Next 16.3.8 (not even `/./`), and the merge helps the docs
  too: a docs page loads 11 scripts, 281.7 KB gzip, against 18 and 286.2 KB with the default
  chunker (the landing 9 against 11, the privacy page 10 against 13). The "built first load" block
  in `next.config.test.ts` holds those script counts whenever a `.next` build exists (it does
  under `pnpm verify`).
- `NextIntlClientProvider` and `ClientMessagesProvider` receive only `CLIENT_MESSAGE_NAMESPACES`
  (`lib/client-messages.ts`), not the whole catalog. A new `useTranslations` namespace in a `"use client"` file must be added
  there; `lib/client-messages.test.ts` fails until it is.
- A glyph repeated on a page (the stack cards) is drawn once as an SVG `<symbol>`
  and referenced with `<use>`, since every copy is serialized twice: in the HTML and in the RSC
  payload.
- Keep both `next/font` families preloaded. Every one of them sets text in the first
  viewport, so it is fetched before the first paint either way; without the preload it is only
  discovered after the stylesheet, at a higher priority that delays the first contentful paint.
- `gsap` only through the playground's dynamic `import()` of `playground-scramble.tsx` (see "The
  stack"): the island chunk itself (`playground-demo.tsx`) imports no GSAP, so it is in neither the
  first load nor the island batch, and `playground.test.tsx` fails on a static import.
- Content only needed after an interaction is loaded with a dynamic `import()` on hover, focus,
  or click. The AI setup prompt is not: it is short, and its text ships in the page, in the
  `PromptCopyButton` preview.

## Fumadocs UI strings

Fumadocs' own chrome (search, "On this page", page actions, sidebar aria-labels, pagination) is
translated in `lib/ui-translations.ts`, added to `translations` in `lib/root-provider-options.ts`. The
object is typed against `fumadocs-ui/i18n`'s `Translations`, and `lib/ui-translations.test.ts`
fails when a Fumadocs upgrade adds a key that de, es or fr lacks.

## One header for both surfaces

`components/site-header.tsx` owns the navbar. `SiteHeaderFrame` renders the markup (wordmark,
centred search, text links, icon links, call to action, language select, phone-width search and
menu trigger) and two thin wrappers feed it from each layout's context: `HomeSiteHeader` and
`DocsSiteHeader` (from `useNotebookLayout`, adding the sidebar collapse and drawer triggers).
`lib/locale-home-layout.tsx` renders `HomeSiteHeader` itself (with `SiteWordmark`, no Fumadocs
`HomeLayout`), and `app/[lang]/docs/layout.tsx` passes `DocsSiteHeader` as `slots.header`. Link
items go through `lib/link-items.tsx`, never `fumadocs-ui/layouts/shared` at runtime, whose
module carries the default popover language select.
On the docs surface `lib/layout.shared.tsx` supplies the primary navigation, exactly Docs,
Reference and the GitHub icon (`lib/layout.shared.test.tsx` pins it). The home header (landing and
legal pages) has no search box and its own items, from `components/home-nav.tsx`: a nav named by
`landing.topNav.label` holding Docs, Changelog (GitHub Releases, new tab) and GitHub with the star
count, then a primary "Get started" (`GetStartedLink` at `size="sm"`, carrying the `vk-nav-cta` hook
class, which has no rule in `app/global.css`, to `/docs/quickstart`, visible at every width),
the language select and the theme toggle. Its labels and the star count reach the client through
`HomeNavProvider`, which `LocaleHomeLayout` fills on the server (`homeNavValue`: `landing.topNav`
strings and the build-time star count from `loadProjectStats`, compacted with
`formatCompactNumber`), so the header adds no client message namespace. After hydration the count
and the link's `aria-label` (`landing.topNav.starsAria`, filled on the client through `fillCount`)
follow the one shared `/api/stats` request (`useLiveCount` in `lib/live-stats.ts`); without a build-time count the GitHub link shows no number
and no `aria-label`, and a failed request keeps the build-time number and is not cached, so the next mount asks again. Under 768px the items move into `HomeMobileMenu`, a shadcn `Sheet`
(focus trap, Escape, focus back to the trigger, close button named by `landing.topNav.menu.close`)
titled `landing.topNav.menu.title`, with a full-width "Get started" (`size="md"`, the `vk-nav-cta-menu`
hook class, again without a stylesheet rule, counted as
`click-cta` with `location: menu`) under its nav and the language select and theme toggle in its
footer.
The AI setup guide, the contributor guide, npm and the contact page are reached from the docs
sidebar and the landing footer, never from the header. The text links and the icon show from 768px
(`md`), exactly where the phone search and menu trigger hide. At least 24px separate the search box
from the first text link and the last text link from the GitHub icon. A text link carries
`data-active` and `aria-current` (`page` on an exact path match, `true` for a section or tab), from
the root tabs on docs and from the current path elsewhere. The home layout renders a `<div id="nd-home-layout">`
(`components/home-container.tsx`) in place of Fumadocs' home container and renders its own `<main>` around the page, with the landing
footer passed in by `app/[lang]/(home)/layout.tsx`, so the header and footer stay banner and
contentinfo landmarks; a page under that layout must not render another `<main>`. Fumadocs' own
`HomeLayout` and notebook headers are never rendered, so do not style `#nd-nav` or `#nd-subnav`;
style `.vk-header` and `.vk-header-link` instead, and change the header in one place. The header
has its own fill, `--surface-chrome` (`--surface-bg` at 94 percent, so
content scrolling under it stays out of the way of its text), over one plain 1px
`--border-default` hairline (`.vk-header::after`, absolutely placed so it adds no height), never a
gradient. Every page with a `.vk-home`
container sets `scroll-padding-block-start: var(--vk-landing-offset)` (3.5rem, the header height)
on `html`, so an in-page jump and every focused control (a comparison footnote reached by
Shift+Tab, too) land below the sticky header (WCAG 2.4.11); add only the extra gap as a
`scroll-margin-top`, never the header height again.

Both surfaces share one layout width: `--width-layout` (97rem, the notebook layout's own
default) feeds `--fd-layout-width` from `:root` and again on the home container, so the
docs header row and the docs grid sit in the same centred column on a wide monitor. The home
header (landing and legal pages) passes `rowWidth="wide"` to `SiteHeaderFrame`, so its
`.vk-header-row` takes `--width-wide` and the `--gutter` padding instead, and the wordmark and the
call to action line up with the landing sections. The landing's
content (the hero, every section and the closing section) shares one narrower column instead,
`.vk-gutter` plus `.vk-w-wide`, so the hero `h1`, every section heading and the closing heading
(no card border or inset of its own) start at one left edge; the footer bleeds on purpose.

Every URL that matches no page, and every `notFound()`, renders `app/global-not-found.tsx`
(`experimental.globalNotFound` in `next.config.mjs`, since the root layout sits under `[lang]`): a
full document in English on the dark default, with the same `THEME_INIT_SCRIPT`, `SiteProviders`,
`LocaleHomeLayout` header and `LegalFooter` as the legal pages, a `notFound` namespace in
`messages/*.json`, and `robots: noindex`. It is prerendered as `/_not-found`, whose inline script
hashes the proxy serves for any path it has no entry for. The fonts both documents load live in
`lib/fonts.ts`.

## The docs surface

`app/global.css` carries a docs layer keyed on Fumadocs' DOM ids (`#nd-sidebar` and its phone-width
twin `#nd-sidebar-mobile`, `#nd-toc`, `#nd-page`, `#nd-nav`) and on `figure.shiki`. Every sidebar
rule is written for both ids; a rule that names only one of them is a bug, since the drawer is a
separate `aside` outside `#nd-sidebar`. It exists so a reader coming from the landing page
recognizes the same product. The shared vocabulary, and where each piece comes from:

- **Solid white display headlines.** The landing hero (`hero.tsx`) and the docs home header both
  set a solid `--text-strong` headline. The hero sits straight on the void page, left-aligned, with no
  backdrop pattern and no glow: `.vk-banner-grid` is one column (copy, then tracks), and from
  64rem an asymmetric 5fr / 7fr split, top-aligned, the copy (`.vk-banner-copy`: the
  `.vk-announce` depth pill link, the `h1` `.vk-banner-title` (at most eight words, one sentence),
  the `.vk-banner-lead` subline (at most 25 words), `.vk-banner-ctas` with Get started
  (`/docs/quickstart`) and Star on GitHub, then `.vk-banner-trust`, one muted line: the license
  link `landing.banner.license` and the Node.js range) in the narrower column beside the wider
  demo (`.vk-banner-demo`: the `HeroTracks` switcher and terminal). There is no facts block, no
  install box and no prompt in the hero: the closing section owns the install command and the
  marquee the counts. `hero.test.tsx` pins the order, the absent install box, facts, backdrop and
  glow, and `e2e/hero.spec.ts` the columns and the fold. The home social image (`HomeOgFrame` in `lib/og-image.tsx`, served
  by `app/[lang]/(home)/home-og/route.tsx`) is a monochrome and violet card on `OG_PALETTE.void`:
  the wordmark and host, the localized `landing.banner.headline`, then a few real terminal lines
  (`HERO_OG_LINES` in `lib/hero-terminal.ts`, every line taken from the recorded transcript, the prompt
  `$` in violet). `OG_PALETTE` mirrors the tokens (`lib/og-image.test.tsx` pins each one), and the
  image draws with the subset Geist and Geist Mono files in `assets/og-fonts/`
  (`lib/og-fonts.ts`), stripped of their kerning tables, since satori turns kerning into doubled
  word gaps; its headline wraps with `textWrap: "balance"`, and `lib/og-image.test.tsx` fails when a
  font lacks a glyph the image draws. Provenance: Geist 1.800 (`Geist-Medium.ttf`, `Geist-Bold.ttf`)
  and Geist Mono 1.700 (`GeistMono-Regular.ttf`), from `dist/fonts/geist-sans` and
  `dist/fonts/geist-mono` of the `geist` npm package 1.7.2, OFL 1.1 with the licence beside them
  (`OFL-Geist.txt`), each subset with fontTools:
  `pyftsubset <upstream>.ttf --unicodes="U+0020-007E,U+00A0-017F,U+2018-201E,U+2026"
  --layout-features="" --no-hinting --drop-tables+=GPOS,GSUB,kern,DSIG --output-file=<name>.ttf`.
  A new character outside those ranges in a headline needs the subset rerun. `PromptCopyButton` is
  `.vk-prompt` (`.vk-prompt-trigger`, `.vk-prompt-pop` holding
  the exact prompt in `.vk-prompt-text`, sans `--text-xs` with a hanging indent per numbered line,
  its URL broken only after a path `/` and each flag, and the value after it
  (`--skill verbatra-cli`), kept whole through `breakUrlsAtSlashes(text, keepFlagsWhole)`), whose
  preview opens on hover and on keyboard focus, CSS only, and stays shut once dismissed
  (`data-dismissed`). A copy announces "copied" (again on every copy) or, when the clipboard
  refuses, the short "Copy failed" (`landing.install.copyFailed`) in its polite live region, while
  the tooltip alone carries the full reason, so the failure is not read twice, and counts
  `copy-ai-prompt` only on success. A failure turns the trigger `--text-danger` with an alert icon
  and holds the preview open with the reason (`.vk-prompt-failed`, `data-status="failed"`) so the
  prompt can be selected by hand, on touch too, until a pointer goes down outside it or Escape is
  pressed. On the docs home it sits in `.vk-agent-tip`, a `.vk-home-callout`
  (`.vk-home-callout-icon`, `.vk-home-callout-body`, `.vk-home-callout-title`) whose
  `.vk-agent-tip-action` wraps under the text, with the preview spanning it, while the tip is under
  36rem. Neither uses a gradient headline.
  On the docs surface only the docs home header carries an eyebrow (a `.vk-label`); no landing
  section does. No card or button on the docs home appends an arrow to its label: the hover border,
  or on a stack card the chevron, is the affordance.
- **`.vk-label`**: the small mono, uppercase, `0.14em`-tracked, `--text-faint` label of the docs
  surface; the landing does not use it for headings or titles (the footer column titles and the
  Studio screenshot frame title are sentence-case sans, `--text-sm` medium `--text-strong` and
  `--text-xs` medium `--text-muted`). The sidebar's top-level folders and separators inside each tab
  (group triggers such as "CLI", the `For AI agents` separator), the TOC's "On this page" title,
  table headers, and the sidebar tabs all use this treatment. A top-level page ("Introduction",
  "Error codes", `llms.txt`) keeps its name as written: a page name, and above all a file name, is
  never uppercased. `DocsHomePaths` cards do not: the goal is the card title in sentence case, and
  the page name sits below the body. The sidebar gets it from `lib/docs-group-labels.tsx`, which
  wraps every folder and separator name directly under a root folder (the Docs and Reference tabs)
  in the class before the tree reaches `DocsLayout`, and leaves the tab names themselves plain; do
  not target Fumadocs' or Radix's internal DOM for it. Use the class for a new label rather than
  restating the four declarations.
- **Owned hooks, not library internals**: callouts carry `.vk-callout` (added by the `Callout`
  mapping in `components/mdx.tsx` and passed explicitly by the locale notice in the docs page), and
  the prev/next footer carries `.vk-docs-footer` through `DocsPage`'s `footer.className`. Style
  those classes, not Fumadocs' utility classes.
- **Flat panels**: `rounded-xl border border-(--border-default)` on `var(--surface-bg)`, with
  `--border-accent` as the border on hover.
  `DocsHomePaths`, `DocsHomeFeatures`, and the prev/next footer cards follow it; no docs home
  card is filled.
- **Void code surfaces**: `figure.shiki` sits on `var(--v-void)` inside a `--border-default`
  border, like `CommandBox`. On an untitled fence the copy button sits on a void
  backing, and a one-line fence ends its scroll area before the button, so a long command never
  runs under it. A `// [!code highlight]` line gets the landing's
  highlight treatment: 22 percent `--v-purple` tint plus a 3px `--v-purple` bar on the start
  edge. `DocsHomeFeatures` cards carry the same 3px `--v-purple` start bar. Code blocks use
  Fumadocs' dual Shiki themes, which follow the `dark` / `light` class; comment tokens are raised to
  AA in both themes, and the light theme's orange property token (`#E36209`) to `#8f3600`, which
  `lib/theme.test.ts` holds at 4.5:1 on every code surface, under the highlighted-line tint and
  under Fumadocs' diff tints.
- **Callouts**: one 3px bar plus the icon, both in `--callout-color`, which Fumadocs derives
  from `--color-fd-<type>`. The override block in `global.css` pins `--color-fd-info` and
  `--color-fd-success` to the glow and `--color-fd-warning` to `--v-status-changed` (amber), so
  an info and a warn callout stay distinguishable now that the brand has one hue. Vertical padding is one step under
  Fumadocs' default, and a callout is capped at the prose measure like the text around it.
- **Locale notice**: every translated page opens with the machine-translated info callout. When
  the English page was committed after its translation, the same callout turns into a warn
  callout titled from `docs.outdatedTranslation`, with the English link kept. The comparison reads
  `lib/translation-freshness.generated.json`, which `scripts/sync-translation-freshness.mjs`
  writes from the git history of `content/docs` before dev, build, typecheck and test. Without a
  full history (a shallow clone, or the Docker build, whose context excludes `.git`) it keeps a
  snapshot written earlier or writes an empty one, and an empty one shows no outdated notice.
- **Pills**: `.vk-pill` is the badge shape for everything except a "new" announcement: an outline
  pill in `--accent` text with the glow-tinted border, mono, `--text-xs`, no fill. The sidebar NEW badge
  (`components/new-badge.tsx`; the landing footer carries none, `footer.test.tsx` pins it) adds `.vk-pill-status` (smaller, uppercase) and is hidden in the
  breadcrumb (`.vk-breadcrumb`, set on `DocsPage`), which shares the sidebar's tree; the
  `<AvailableFrom>` badge adds `.vk-available-from`, which sits after the heading text when it is
  inside a heading. Its markup is `AvailableFromPill` (`components/available-from.tsx`); the
  landing's marquee does not render it, but takes its `docs.availableFrom` label for
  `RELEASE_BADGE.version` through `availableFromCopy` (see "Marquee"). `RELEASE_BADGE` (`lib/release-badge.ts`) is the landing's one list of
  what is new in that release: `providers` (read through `providerReleaseBadge`) and `features`
  (`provider-none`, read through `featureReleaseBadge`), so emptying it removes every landing badge
  at once; the MDX badges stay literal (`<AvailableFrom version="0.12.0" />`), and
  `lib/release-badge.test.ts` holds the two together: a machine provider carries a badge of that
  version directly under its `providers*.mdx` heading, in all four locales, exactly when
  `RELEASE_BADGE` lists it, and `provider-none` is dated exactly by the page badge of
  `human-only-workflow*.mdx`. A badge placed directly under a heading is moved into it. Where a badge may
  sit in the MDX at all is set by "Badge placement" in the "Docs budget" section of
  `.claude/rules/docs.md`, and `lib/docs-badge-placement.test.ts` enforces it. A heading whose
  key a table's "Since" column already dates (the key table on `config-file`) carries no badge.
- **Depth pill**: the one filled pill, and only for a "new" announcement, because the product
  owner asked for an announcement badge that reads as new at a glance (modelled on the
  `app-new-badge` of docs.nestjs.com). `NewPill` (`components/new-pill.tsx`, `.vk-pill-new`) is a
  5px-radius chip, 2px by 6px, on a 90deg gradient from `--pill-new-start` (`--accent-fill`) to
  `--pill-new-end` (a darker violet, its own value in each theme; in the light theme
  `hsl(254 70% 26%)`, at least 1.6:1 from the start stop, with a 1px `--pill-new-rim` outer
  hairline of the end stop at 45 percent, so the light chip never reads flat;
  `components/new-pill.test.tsx` pins both), in `--pill-new-fg` (white)
  10.5px, weight 700, uppercase, 0.04em tracking. `lib/theme.test.ts` holds `--pill-new-fg` at
  4.5:1 on both stops in both themes. Its depth comes from four layers: a `::before` glow
  (`--pill-new-glow`, the start stop at 55 percent), a static `::after` rim (a 1px masked border,
  white at 60 percent on the 165deg diagonal ends), an `aria-hidden` `.vk-pill-new-ring` (a 1px
  masked rim over a conic highlight on a 200 percent square that rotates) and an `aria-hidden`
  `.vk-pill-new-shimmer` (a 40 percent skewed band that sweeps once in the first 32 percent of the
  loop). The glow, ring and shimmer each run 4.5s three times and stop: every animation is finite.
  Under `prefers-reduced-motion: reduce` none of them runs and the shimmer is `display: none`;
  under `forced-colors` the layers drop and the chip gets a `CanvasText` border.
  `NewAnnouncement` in the same file is its wide form: the depth pill inside a `.vk-announce`
  link, a `--radius-full` outline with a `--text-faint` boundary (3:1 like every control), the
  announcement text and a chevron that moves 2px on hover, with the `sr-only` new-tab note. The
  hero opens with it, pointing at the release notes of the newest cli release (`PACKAGE_VERSION`)
  with text that names the release without repeating the pill's word (`landing.banner.announcement.text`,
  "v{version} is out"; `hero.test.tsx` checks it in every locale). The depth pill appears in
  exactly two places: that hero announcement and the marquee's upcoming-release provider badge,
  which always carries its visible version. At most one depth pill per section (the marquee's
  `aria-hidden` copies repeat its one item). Anything else (a version, a status, a dated feature)
  stays the `.vk-pill` outline; never put the depth pill in a table, the sidebar or a heading.
- **Prose measure**: paragraphs, lists, block quotes and callouts in `#nd-page` stop at
  `--width-measure` (about 72 characters of body text); tables and code blocks run the full
  column, and so does a `not-prose` element and everything inside it.
- **Cards**: MDX `<Cards>` / `<Card>` are Fumadocs' own, mapped in `components/mdx.tsx` to add
  `.vk-link-card` (flat panel, glow border on hover, no prose underline) and to localize `href`.
  "Next" sections end in a `<Cards>` block. A card that points at the page's own prev/next footer
  target is dropped at render time (`lib/docs-neighbours.ts`, passed to `getMDXComponents` by the
  docs page), so the footer and the cards never link the same page twice.
- **Install commands as package-manager tabs**: an install command is an `npm` fence (`` ```npm ``)
  holding the one npm command. `remarkPackageManagerTabs` (`lib/package-manager-tabs.ts`, after
  `remarkStackBlocks` in `source.config.ts`) runs Fumadocs' own `remarkNpm` on it, so it renders as
  Fumadocs' `CodeBlockTabs` (npm, pnpm, yarn, bun) with one remembered choice (`groupId`
  `package-manager`), and prints the npm command alone in the page's `.md` output. The preset plugin
  stays off (`remarkNpmOptions: false`), and `lib/install-commands.test.ts` fails on an `npm` fence
  that is not an `npm install`, so every other command stays one `npx` line in a `bash` fence.
  `StackBlock name="runtime-install"` emits the `npm` fence for an `npm install` (`isNpmInstall`,
  the predicate the test shares) and `bash` for any other tool, and `<InitCommand format>` accepts
  only a format id from the published `@verbatra/sdk/config-schema.json`. The plugin turns each
  fence into its own tabs and marks that node for the `.md` output, never another `CodeBlockTabs` on
  the page. A `` ```verbatra-run `` fence (`RUN_FENCE_LANG`) holds only the arguments (`<command>`)
  and becomes the same tabs with the binary each manager runs (`npx @verbatra/cli`, `pnpm verbatra`,
  `yarn verbatra`, `bun run verbatra`), sharing the remembered choice; `cli/index` uses it. The
  landing's closing section takes `NPM_INSTALL_COMMAND` from `lib/install-commands.ts` as plain
  text (no link inside the command) and shows no package-manager tabs; the docs home has no install
  box (its Quickstart tab and agent tip lead there).
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
- **Content tabs**: MDX `<Tabs>` is `DocsTabs` (`components/docs-tabs.tsx`), Fumadocs' `Tabs`
  with `.vk-docs-tabs`: the trigger row hides its scrollbar, fades its end edge like
  `.vk-edge-fade`, and scrolls the active trigger into view whenever it changes (a click, a
  remembered group choice, or a TOC jump into a tab).
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
- **Table of contents**: TOC entries never break inside a word (`overflow-wrap: normal` on `#nd-toc`
  and the phone popover); `pageToc` (`lib/page-toc.tsx`) offers a break after each underscore with
  `<wbr>` (`breakAfterUnderscores`), so `AGENT_FILE_INVALID` wraps as `AGENT_ / FILE_ / INVALID`. A
  page whose TOC would be taller than the viewport sets `tocDepth: 2` in its frontmatter (all four
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
  `vk-article` size container, and every table rule keys on its width, never on the viewport. From
  45rem up the wrapper is `overflow: visible` and the header row is sticky below the header
  (`top: var(--fd-docs-row-3)`); below 45rem the wrapper scrolls sideways with the end-edge fade
  `.vk-scroll-fade` uses, and the header is not sticky, because a sticky cell inside a scroll
  container is offset against that container, not the page. Cells are compact (0.5rem by 0.75rem,
  top-aligned). A table of three or more columns gets `.vk-table-stack` and a `data-label` per body
  cell from `lib/stacked-tables.ts` at build time, unless every body row holds at most
  `COMPACT_ROW_MAX_CHARACTERS` of text (the error code index), which stays a table at every width.
  Only while the article column is under 30rem (a phone) does a stacked table's row become a card:
  the first cell as its title, every other cell under its column name. A table of
  `WIDE_TABLE_MIN_COLUMNS` (six) or more columns also gets `.vk-table-stack-wide` and stacks below
  56rem, with its column names beside the values, since it cannot fit the desktop article column
  (about 41.5rem at 1280). Under 30rem, long code and pills in a cell may wrap anywhere too, so a
  two-column table fits a phone. Short code (`.vk-code-short`) in a cell, at every width, breaks
  only at the points `breakInlineCode` offers. The header row stays in the DOM for assistive
  technology. Short inline code (up to `SHORT_INLINE_CODE_MAX` characters in `lib/inline-code.ts`)
  gets `.vk-code-short` from the MDX `code` mapping and never wraps elsewhere; longer inline code
  wraps, in cells and in prose alike, and the mapping runs it through `breakInlineCode`
  (`lib/word-breaks.tsx`): a `<wbr>` after every underscore, so `verbatra_project_snapshot` wraps at
  `_` before anywhere else, a `.vk-code-break` (a zero-width space drawn by CSS, never copied) after
  a `.`, `/` or `]` between word characters, so `result.config.files` wraps at a dot, and every
  `--flag` or other hyphenated piece kept whole in a `whitespace-nowrap` span, so `--agent` never
  wraps after its hyphen.
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
