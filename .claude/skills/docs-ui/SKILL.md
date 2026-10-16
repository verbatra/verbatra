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
  `motion` (14.1.0, the version Fumadocs already depends on) is a direct dependency with one
  consumer: the code showcase tabs. Each panel is one plain `div` for good, and the first pointer,
  focus or tab change `import()`s `code-showcase-fade.ts`, which fades a newly opened panel in with
  `animate` from `motion/mini` (opacity and a 4px lift), never under reduced motion (`fadeInPanel`
  checks `prefersReducedMotion` itself, so the tabs module never reads it). There is no page-wide
  provider and no `m.*` or `motion.*` element: swapping a plain panel for an `m.div` changes the
  element type and remounts the panel (copy state, focus and scroll lost), and rendering `m` from
  the start put about 30 KB gzip of motion into the first load's island batch, which cost the
  light-mode mobile run its 95. Animate `opacity` and `transform` only, and keep layout shift at 0.
  Server sections and the reveals stay CSS keyframes and transitions in `app/global.css`, each with
  a `prefers-reduced-motion` opt-out.
  `gsap` 3.15.0 and `@gsap/react` 2.1.2 (the Standard "no charge" GSAP license, which the
  `/licenses` page and `THIRD_PARTY_NOTICES.md` print as written and link) are direct dependencies
  with two consumers, each loading only its own plugins. `lib/gsap.ts` registers `useGSAP` once;
  `lib/gsap-scramble.ts` adds `ScrambleTextPlugin` for `components/landing/playground-scramble.tsx`,
  which the playground island reaches through a dynamic `import()` on the first pointer, focus or
  touch inside it (and on Translate), and `lib/gsap-draw.ts` adds `ScrollTrigger` and
  `DrawSVGPlugin` for `components/landing/flow-draw.tsx`, which the feature flow island reaches
  through a dynamic `import()` once the flow comes within one viewport of the screen. Neither loads
  on first paint or under reduced motion, and each is its own chunk, so the scramble chunk carries
  no DrawSVG and the drawing chunk no ScrambleText. No other plugin is registered.
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
   palette: `--v-glow-soft` (flag tokens in `Terminal`), and `--v-status-new` (the accent) /
   `--v-status-changed` (amber, dark `hsl(38 85% 62%)`, light `hsl(30 90% 30%)`, also Fumadocs'
   warning callout color) / `--v-status-unchanged` (the `tone` colors of
   `components/ui/badge.tsx`). There is no pink and no headline gradient token any more
   (`placeholder-chip.test.tsx` fails if `--v-pink`, `--v-violet` or `--gradient-headline` comes
   back). Reach for one only in the role it already has.
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
of a flat panel, an evidence chip or a copy button on hover; it is the one token for that mix. In
`components/` and `app/`, only three brand primitives may still be named directly, each in its one
documented role: `--v-void` (void code surfaces), `--v-status-*` (badge tones and the showcase and
problem marks) and `--v-glow-soft` (flag tokens in `Terminal`). `lib/theme.test.ts` fails on any
other `fd-*` class, `var(--color-fd-*)` or `--v-*` reference there.

Scales are fixed and narrow, deliberately:

- Radii: `--radius-sm` 6px, `--radius-md` 10px, and `--radius-lg`, `--radius-xl`,
  `--radius-2xl` all 12px. The large sizes collapsing to one value is intentional. Do not
  reintroduce a spread. There is no larger radius: the landing hero sits on the page, in no card.
- Shadows: `--shadow-panel` (a neutral lift) and `--shadow-sm`. Two, not a ramp, each
  lighter in the light theme, and neither tinted: the hero glow is the page's only violet haze
  (`lib/theme.test.ts` fails on a hue in either shadow).
- Layout: `--gutter` (40px from 768px up) via `.vk-gutter`, `--width-wide` via `.vk-w-wide`.
  `--cta-height` (56px) is the minimum height of `.vk-prompt-trigger` on `PromptCopyButton`;
  `--width-prompt-pop` (30rem, capped by `100cqw` of its container, never by `100vw`, which counts
  the scrollbar) is the width of the `.vk-prompt-pop` preview. `--head-gap` (2.5rem, 3.5rem from 64rem) is the one space
  between a section head and its content: the margin over the flow list (and, under 64rem, under
  the bento head through `.vk-bento-head`), the
  problem, code showcase, comparison and open source content (`mt-(--head-gap)`), the row gap
  of `.vk-section-aside` (the marquee and the FAQ) and of the playground grid; `section-bands.test.tsx` fails on an ad hoc
  `mt-10` or `lg:mt-14` there. `.vk-grid-12` is the landing grid: one column under 64rem,
  then `--grid-columns` (12) columns with a `--grid-gap` (24px) gap, where each child spans
  `--grid-span` columns (the full row when unset), starting on `--grid-start` when set (the open
  source contributors start on column 9). `SectionHead` takes `layout`: `split` (the default, a
  `.vk-grid-12`: the heading block spans 8, the lead 4, bottom-aligned, so the lead starts on
  column 9, the column where the problem list and the contributors start), `stacked` (the lead
  under the heading on the first column, for a section whose content runs the full row: the code
  showcase, and the feature flow, whose head keeps to the snippet column), `inline` (the same
  stacked block at a narrower measure, `.vk-section-head-inline`, set inside the column beside an
  artifact rather than over it: the SDK playground renders it on the server as a sibling before
  its island, and its grid puts it at the top of the control column next to the sticky snippet;
  the bento sets it in the first cell of its tile grid, beside the keys tile).
  A split head without a lead renders stacked; `stacked` and `inline`
  keep their shape either way. `SectionHead` is the head only and takes no children.
  `SectionAside` (same file) is the head beside its content: a `.vk-section-aside` `.vk-grid-12`
  with the stacked heading and lead (`data-layout="aside"`) in span 4 at the start and its
  `children` in `.vk-section-aside-content`, span 8, top-aligned; one column, head first, under
  64rem: the marquee and the FAQ. Its optional `aside` renders under the lead in the head column
  (the FAQ's docs link list). `section-bands.test.tsx` renders each section and pins the head shape it
  draws, so the page never goes back to one head shape everywhere.
- Landing surfaces: `--surface-band` (mixed from `--surface-card` and
  `--surface-bg`, never a raw value), the fill of `.vk-band`: `Section` with `band` renders a
  full-width `section.vk-band` (between two `--border-default` hairlines, `--section-sm` above it
  and `--section-md` padding inside) around the usual `.vk-gutter` column: the marquee under the
  hero, the feature flow, the code showcase and the comparison are banded, the FAQ sits on the page, the SDK
  playground between the marquee and the flow, the problem, features and open source sections sit
  on the void, and the code showcase and the comparison sit next to each other until the code
  showcase retires (`section-bands.test.tsx` pins the order). The hero draws no
  pattern, only its single decorative glow (`.vk-banner-glow` behind the demo column, from the
  `--banner-glow` token, lighter under `html.light`); there is no wash token and no dot backdrop.
- Placeholder chip: `PlaceholderChip` (`components/landing/placeholder-chip.tsx`, the
  `.vk-placeholder` class) is the page's one signature motif, a locked placeholder token
  (`{{amount}}`, `{count}`) drawn the same way in every pane: `--placeholder-fg` (`--accent`) on
  `--placeholder-fill` inside an inset `--placeholder-ring` box shadow, never a border. It pads the
  token by `--placeholder-inset` and pulls the same amount back with a negative margin, so a chip
  moves no character of a monospace line, and it never wraps; after a `+` or `-` sign
  or a quote (`data-keep-start`, set by `PlaceholderText`) it keeps its start margin and before a
  quote (`data-keep-end`) its end margin, so the ring never touches the mark beside it. `data-broken` strikes it in
  `--text-danger`, only for a token a reply broke. `PlaceholderText` in the same file cuts the
  tokens out of a line (`splitPlaceholders`: `{{name}}` and `{name}` only, so JSON braces stay text)
  and draws each as a chip; every showcase file pane and every `Terminal` line goes through it, and
  the showcase passes the tokens a refused reply added (the `+` details of its refusal) as the
  broken set.
- Motion: see "Landing motion" below for the system. Its tokens: `--ease-out` (entrances and
  state changes), `--duration-fast` (140ms, hover and press),
  `--duration-base` (240ms, state change), `--duration-reveal` (560ms, entrances),
  `--reveal-distance` (16px, 12px under 40rem), `--reveal-stagger` (70ms) and
  `--reveal-delay-max` (350ms, the stagger cap), and `--marquee-item-time` (5s: one marquee loop
  lasts that times the row's item count). Only `opacity` and `transform` / `translate`
  ever animate.
- Showcase: `--showcase-line` (1.125rem, 1.25rem from 40rem) is the line height of a file pane in
  the Try it demo, which reserves its longest scenario's row count with it (on a phone,
  where one file shows at a time, the tallest file's, `--showcase-rows-max`, so a file switch
  moves nothing), `--showcase-output-rows` (set inline from `showcaseRows().output`) reserves the
  output pane for its longest run, `--showcase-scroll-reserve` (0.75rem) is added to every pane's
  reserved height so a sideways scrollbar moves nothing, `--showcase-summary-lines` (3, 2 from
  40rem) reserves the status sentence, so a scenario never moves what sits below it,
  `--print-stagger` (90ms) paces the printed output lines, and `--showcase-bar-height` (3.125rem)
  is the height of its scenario bar from 64rem.

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
  that the hero command panel uses, never a hand-made copy. The code showcase tabs (`code-showcase-tabs.tsx`) use the default `underline` variant;
  there is no second tab primitive.
  `Button` takes `variant: "primary" | "secondary" | "outline" | "ghost"` (`secondary` and
  `outline` both draw a `--text-faint` border that holds 3:1 on its own; `outline` also shows a
  pressed `--accent` border through `aria-pressed`) and `size: "sm" | "md" | "lg"`.
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
  `LANDING_SECTIONS` in `lib/landing-sections.ts` (hero, marquee, playground, flow, proofStrip,
  problem, features, code, compare, openSource, faq, finalCta), which the home page maps
  over and `lib/landing-sections.test.ts` pins; add or move a section there, not by hand in
  `page.tsx`. The files: `hero.tsx` (the `h1`, the lead, the two quotable `landing.banner.quotes`
  sentences in `.vk-banner-summary`, two buttons, the locale diff with the `CommandPanel` install
  box under it, and the facts block; no terminal), `hero-diff.tsx` (`messages/en.json` beside
  `messages/de.json` from `lib/hero-diff.ts`, both written by the sdk's real next-intl adapter into
  `lib/hero-diff.generated.json` by `scripts/sync-format-samples.mjs` from `lib/hero-diff-seed.mjs`,
  git-ignored like the format samples; the two keys `verbatra check` reports missing are
  `.vk-hero-diff-line` rows marked `new`, each value in `.vk-hero-diff-value`, whose mark never
  wraps (the line scrolls sideways instead, and `.vk-hero-diff-code` is `max-content` wide so the
  tint runs under the whole line); `.vk-hero-diff` is an inline-size container and its two panes
  sit side by side only from a 40rem container, so they stack in the 7/12 demo column at 1024
  and sit side by side from about 1280, with no value clipped at either; each pane's code
  carries its file's `lang`, `en` and `de`, and the mark words the page's; the outer `figure` has
  no `aria-label`, its visible `.vk-hero-diff-caption` figcaption under the panes reads
  `landing.banner.diffLabel` in `--text-xs` `--text-muted`, its backticked `verbatra translate` in
  code type through `withInlineCode`), `hero-facts.tsx`
  (`.vk-banner-facts`: a visually hidden `h2` over a `dl.vk-facts` with no `aria-labelledby`, which
  a role-less `dl` may not take, every fact in text: license, the provider count
  `MACHINE_PROVIDER_IDS.length` in digits (`landing.facts.providersValue`) over the
  `landing.facts.providersLink` link to `/docs/providers`, the format count
  `SUPPORTED_FORMAT_IDS.length` linking `/docs/formats`, the Node.js range, the version line
  `landing.facts.versionParts` naming each package ("CLI and SDK v{cli}, Studio v{studio}, MCP
  server v{mcp}"), and `LANDING_LAST_UPDATED` as a `time`; no provider list, no pill and no
  install row, since the command panel in the demo column shows the command; each `.vk-fact` is
  `align-content: start`, so a label stays on the first line of its value in a multi-column row
  (two from 40rem, three from 64rem, where the facts run across the whole hero under both
  columns, six from 80rem); the copy column opens with the `h1`, with no eyebrow line above it),
  `proof-strip.tsx` (stars, npm weekly downloads, the providers and the format count, the stars
  and downloads from `lib/project-stats.ts`, read at build time so the page stays static, then
refreshed in place by `LiveStatValue` from `/api/stats`; every figure shows as fetched, with no
display threshold, and a figure the build could not fetch leaves its cell as a named link
(`landing.stats.starsFallback`, `downloadsFallback`: "Verbatra on GitHub", "Verbatra on npm"), never
an empty value, which `LiveStatFallback` still turns into the live figure once `/api/stats` answers;
both figure links open a new tab and say so in an `sr-only` `landing.openSource.newTab`; the format count is
`SUPPORTED_FORMAT_IDS.length`, never a typed number), `problem.tsx` (`#problem`, a real drift
  artifact from `lib/landing-problem.ts`), `flow.tsx` (`#flow`, the feature flow, see "Feature
  flow" below),
  `bento.tsx` (`#features`, one `.vk-bento` `.vk-grid-12` that holds the head and the tiles of
  `BENTO_TILES` in `lib/landing-bento.ts`, in reading order: the head is an `inline` `SectionHead`
  in `.vk-bento-head`, span 4 from 64rem beside the keys tile, and above the tiles under 64rem,
  where its `margin-block-end` tops the grid gap up to `--head-gap`. Each tile carries
  `span: { lg, xl? }` (`--grid-span` per breakpoint); only the first row's keys tile carries a
  `data-reveal` step. The keys tile
  leads (span 8: a `figure` with a `dl` pairing each provider's short label with its
  `BENTO_KEY_ENV_VARS` name, pinned to `packages/ai-providers/src/key-env-vars.ts`, the optional
  ones marked, the `apiKeyEnvVar` alternative noted where `configurable`, a provider that
  `RELEASE_BADGE` dates carrying the pill; beside it from 80rem the safety claims, each on an
  `--accent-fill` start bar, and links to `/docs/providers#keys-come-from-the-environment`
  (`PROVIDER_KEYS_ANCHORS` in `lib/docs-anchors.ts`, shared with the comparison sources) and
  `/docs/translation-safety`, the links following the claims), then the format tile (span 6, 7
  from 80rem: every `SUPPORTED_FORMAT_IDS` member as a `FORMAT_DISPLAY` chip, grouped by
  `FORMAT_FAMILY` in `lib/landing-bento.ts` (a `Record<SupportedFormat, FormatFamily>`, so a new
  format fails to compile until it has a family; each family an `h4` in `--text-muted`), then one
  real key line, `BENTO_FORMAT_EXAMPLE`, taken from the adapter output in
  `lib/format-samples.generated.json` with its file path, and the format chips under it), the
  provider tile (span 6, 5 from 80rem: the provider ids in mono grouped by `PROVIDER_KINDS`
  through `providersOfKind` in `lib/landing-providers.ts` (LLM, machine translation, self-hosted;
  `PROVIDER_DISPLAY.kind` is pinned by `lib/landing-providers.test.ts` to each strategy's `kind`
  and, for self-hosted, to a config that takes a base URL), a provider that `RELEASE_BADGE` dates
  carrying the pill, then the human-only `none` linking `/docs/human-only-workflow`, dated by the
  `provider-none` feature; the groups spread evenly over the panel so it fills the row, and the
  panel ends in the one config line, `BENTO_PROVIDER_LINE`, under its file name; then a link to
  `/docs/providers`), the SDK tile (span 12, text beside the code, the chip right under the lead:
  the `RunSummary` fields of the published sdk, `BENTO_RUN_SUMMARY_FIELDS`, pinned to
  `packages/sdk/dist/index.d.ts`, marked as an excerpt) and the framework strip (span 12, no
  card: a top hairline, the `STACKS` names each linking its quickstart, then all quickstarts at
  the same size). Chips (`evidence.tsx`) take a `--text-faint` border.
  `e2e/bento.spec.ts` measures every card tile at 1024px and 1440px in all four locales and fails
  on more than 48px unfilled inside a tile or the provider panel, or a pill cut by the panel edge;
  tile titles are `.vk-h4`
  `h3`s), `code-showcase.tsx` (`#code`, CLI, SDK, config and Action tabs from
  `lib/landing-code.ts`, highlighted on the server by `lib/landing-highlight.ts` with dual themes
  and framed by `code-frame.tsx`), `playground.tsx` (`#playground`, the SDK playground, see
  "SDK playground" below), `marquee.tsx`
  (`#marquee`, see "Marquee" below), `compare.tsx` (`#compare`, a band opened by a split head with
  a lead (`landing.compare.lead`): the short table, five rows (`SHORT_ROWS`) by Verbatra,
  Lingo.dev, Tolgee, one hosted TMS column summing up Crowdin, Lokalise and Phrase, and the manual
  workflow (`SHORT_COLUMNS`). `lib/landing-compare.ts` holds the full table's rows and tools too,
  and one numbered source list, `compareSource(n)`, so a footnote number names the same source on
  the landing and on `/compare`; `cellFootnote` derives each cell's number from its row and tool,
  and the manual column cites the note `M`. A cell states the fact in text only, never a mark or a
  rating, followed by its footnote links (`[data-footnotes]`, each at least 24px, named "Source n,
  tool"); `TextWithRefs` keeps the cell's last word and its links in one `whitespace-nowrap` run,
  so a link never starts a line alone. The source list itself lives only on `/compare` (`li` with
  `value={n}` and `id="source-n"`, the note `id="source-m"`): the landing passes `sourcesPage`
  (the localized `/compare`) so its links are plain `a` elements to `/compare#source-n`, a full
  navigation that sets `:target`. Under the table, on the same 8/4 split as the head: the framing
  sentence and the concession (what Tolgee and the hosted platforms offer that Verbatra does not,
  with `CONCESSION_FOOTNOTES`, shared with `/compare`) on the left, "Last checked" with
  `COMPARE_LAST_CHECKED` as a `time` and the link to `/compare` on the right. The table is a
  hairline table (`.vk-compare-table`, `table-layout: fixed`): a top and bottom rule, rows split by
  `--border-default`, the header row on `--compare-head` (the band surface) over a `--text-faint`
  rule, no filled header and no tinted column; the Verbatra column is marked by `.vk-compare-mark`,
  an inset `--accent-fill` start bar, with medium-weight cells and its header in `--accent`; every
  column header is medium weight too. Every
  surface of the region (its background, the opaque sticky cells, the fade, the no-timeline
  shades) reads `--compare-surface`, the page under `.vk-compare` and the band under
  `.vk-band .vk-compare`. The table scrolls sideways inside a focusable `section` named by its
  caption (`aria-labelledby`), with the row headers pinned at `--compare-sticky` (16% on the
  landing, 11rem on `/compare`, at most 7.5rem (36cqi) while the column is narrower than 56rem,
  where the row headers drop to `--text-xs` with tighter inline padding so every criterion word
  fits unbroken in all four locales), which is
  also the region's `scroll-padding-inline-start`, so a focused link scrolls clear of the pinned
  column; Chrome leaves a link that is only partly under it unscrolled, so a focused footnote link
  (`.vk-compare-ref:focus-visible`) rises above the pinned column on the region surface; `scroll-padding-inline-end: 3rem` keeps a focused link at the end edge clear of the fade,
  and the fade is dropped (`display: none`) while the region holds focus. A row header breaks a
  long word (`overflow-wrap: anywhere`; never `hyphens: auto`, which `lib/theme.test.ts` bans), and a
  pill in a cell wraps inside it. A thin scrollbar thumb, here and on every other sideways
  scroller of the site (prose tables, code frames, the showcase, tab rows), is `--text-faint`,
  never `--border-default`. While the
  column is narrower than the table (56rem) a `landing.compare.scrollHint` line before it says so
  (not wired as a description, since it is `display: none` on a wide column) and
  `.vk-compare-fade` fades the end edge on the region's scroll timeline; without scroll timelines
  the fade is dropped and the region shades its end edge with a `local` cover over a `scroll`
  shade, which clears at the scroll end. A followed source (`.vk-compare-source:target`) gets an
  `--accent-fill` tint and start bar, its number inside the tint (`list-inside` with a hanging
  indent), and `scroll-margin-top` clears the sticky header. `TextWithRefs` keeps a closing quote or
  other punctuation-only tail with the word before it, and French copy puts U+202F inside `« »`. The
  region, its caption and sticky headers, the footnote links and the source list (two CSS
  columns from 64rem, each URL breaking at its slashes through `breakUrlsAtSlashes`) live in
  `compare-table.tsx` (`CompareRegion`, `FootnoteRefs`, `TextWithRefs`, `SourceList`), shared
  with `/compare`:
  `app/[lang]/(home)/compare/page.tsx` under the home layout renders `compare-page.tsx`, one `h1`
  (`compare.heading`, `.vk-h2` size), the full table of `COMPARE_ROWS` by `COMPARE_TOOLS` (every
  cell is `landing.compare.rows.<row>.<tool>`, the short table reading the same keys, so a cell
  has one message; the one exception is the short table's hosted TMS summary,
  `rows.<row>.hostedTms`, its own message, footnoted with exactly the Crowdin, Lokalise and Phrase
  cells it sums up (`lib/landing-compare.test.ts`); the Verbatra providers cell lists `badgedProviderNames(locale)` with the
  `RELEASE_BADGE` pill and the formats cell counts `SUPPORTED_FORMAT_IDS`, both through
  `lib/compare-cells.ts`), the dated notes, its own concession, links to the quickstart and home,
  and all sources under an `h2`. Its 100rem-wide table sits in `.vk-compare.vk-compare-full`, whose
  container query at 100rem shows the hint and fade on a desktop column too. `/compare.md` (and
  `Accept: text/markdown` on `/compare`) is `lib/compare-markdown.ts` served by
  `app/[lang]/compare.mdx/route.ts`; `MARKDOWN_PAGES` in `lib/markdown-route.ts` is the list of
  non-docs pages with a Markdown variant), `open-source.tsx` (`#open-source`: license, contributing,
  issues, releases and the contributors; every project row opens a new tab and ends in an `aria-hidden` external-link icon, with `landing.openSource.newTab` in an `sr-only` span for screen readers, never an arrow character), `faq.tsx` (`#faq`) and `final-cta.tsx` (the closing
  section on `landing.closing`, set on the page gutter with no card border or inset, a `section` whose `vk-final-cta` class is a hook with no stylesheet rule, the install `CommandRow` counted with `location: final-cta`, then Get
  started and Read the docs). The footer is not a section; `app/[lang]/(home)/layout.tsx` passes
  it to the home layout. Section ids are unique; never render two sections that claim the same one.
  The FAQ (`faq.tsx`, page surface, `SectionAside`: heading, lead and a `nav` of docs links in the
  head column, the questions beside it) has no client island: each item is a native
  `details`/`summary`, rendered closed on the server with its question in an `h3` inside the
  summary and its answer in the HTML, so it opens and reads without JavaScript. The open state
  swaps the `.vk-faq-mark` plus (a `--text-faint` boundary, `--accent` bars) for a filled minus
  (`--accent-fill`) with no transition. `faq-keys.tsx` is a null-rendering client helper that adds
  arrow keys, Home and End between the summaries. `faqContent` (same file) builds each item's
  question, rich answer and plain answer from one translator call, and the home page feeds the
  plain ones to `faqPageLd`, so the FAQPage JSON-LD always equals the visible text. Ids, order and
  links live in `lib/landing-faq.ts`; answers use a `link` tag (that item's docs page, localized)
  and `license` only. Facts that change with a release come in as values, never typed: the npm
  answer lists `publishedProviders()` (`MACHINE_PROVIDER_IDS` whose `RELEASE_BADGE` version is at
  most `PACKAGE_VERSION`) and names the rest with the badge version, the formats answer reads
  `FORMAT_DISPLAY`, and the playground answer names `PLAYGROUND_METADATA.provider`. `FORMAT_DISPLAY` in `lib/landing-facts.ts` is every format's display
  label, which the structured data's format list reads too, so a new format fails to
  compile until it has one. The marquee (`marquee.tsx`, `#marquee`, a band right under the
  hero, its `SectionAside` head at the start of the band and the rows beside it at the end from
  64rem)
  shows two rows inside the `MarqueeMotion` island (`marquee-motion.tsx`): the providers,
  `landingProviders()`, whose count the facts block states, with their kind glyph
  (`PROVIDER_KIND_ICONS`), and the formats, `SUPPORTED_FORMAT_IDS` by their `FORMAT_DISPLAY` label with a file glyph
  (`FORMAT_ICONS`, a `Record<SupportedFormat, StackIconKey>`, so a new format fails to compile
  until it has one), every glyph a `<use>` of one `StackIconSprite` (prefix `marquee`). A provider
  that `RELEASE_BADGE` dates carries the shared `AvailableFromPill`, like its key variable in
  the bento keys tile. Each item (`.vk-marquee-item`) is a `--surface-bg` fill with no
  border or ring, since it is a fact, not a control. No count is typed and no third-party logo is
  drawn. Each row is a muted `h3` that names its visible list,
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
  rows: an `outline` `Button` at `size="md"` (44px tall, like the other landing controls) with one constant name (`landing.marquee.pause`), `aria-pressed` while
  paused, and only its `aria-hidden` glyph swapping between pause and play. Hover and focus inside
  a row pause that row. `marquee.test.tsx` pins the registry rows, the badge, the copies, the static
  state and the pause toggle, and `e2e/marquee.spec.ts` the motion in a browser. The format
  samples in `lib/format-samples.generated.json`, which only the bento format tile's key line reads (through
  `lib/landing-bento.ts`), are written by `scripts/sync-format-samples.mjs` before dev,
  build, typecheck and test (git-ignored like `lib/version.generated.json`) from
  `createDefaultRegistry` in `@verbatra/sdk` over the in-memory `AdapterFs` in
  `lib/format-samples-seed.mjs`. Nothing in the page graph imports the sdk at runtime, and the docs
  app never depends on `@verbatra/format-adapters`; `lib/format-samples.test.ts` re-reads every
  sample through the real adapter. The shared building blocks: `section.tsx` and
  `section-head.tsx` for structure,
  `terminal.tsx` (with a `bare` variant; by default lines never wrap, they scroll sideways inside
  `.vk-terminal-scroll`, which fades the end edge while there is more to see: a mask on the element's own inline scroll timeline (one `@supports` rule for every scroll fade, `.vk-edge-fade` included, dropped while the element shows a focus ring or holds a focused child, so no ring is faded), and without scroll timelines a `--scroll-shade` (neutral, never violet) over a `local` void cover; `.vk-scroll-fade` is the same rule for any other sideways-scrolling mono block, the problem panes and check output and the bento format key line, each a `ScrollBlock` (`components/landing/scroll-block.tsx`: a `div` with `role="group"`, never a landmark, and `tabIndex={0}`, like the code frames' `pre`) named by its caption through `aria-labelledby`; with `wrap` every line
  wraps through `.vk-wrap-line`, whose hanging indent is the line's own leading whitespace
  (`--wrap-lead`, set by `wrapLineStyle` in `wrap-text.tsx`) plus 2ch, and whose placeholder tokens
  (`{count}`, `(-{count})`) and hyphenated words (`up-to-date`) never break, through `WrapTokens`.
  `lib/hero-terminal.ts` keeps the recorded `verbatra check` and `verbatra translate` transcript
  (`HERO_TERMINAL_SCRIPT`, English on every locale, like all CLI output on the page) that the home
  social image draws from and `HERO_TERMINAL_TITLE` (`~/app`), the title of every shell frame;
  `lib/hero-terminal.run.test.ts` pins the lines to the CLI's renderer),
  `try-it.tsx`
  (the Try it demo, one `.vk-showcase-try` grid: from 40rem a scenario bar
  (`.vk-showcase-bar`) over a two-by-two board, `en.json` | `de.json` above `verbatra.lock.json` |
  output, cells split by 1px hairlines; on a phone the bar is one column, the scenarios wrapping on
  top with the actions under them, then the file switch picks one file pane and the output sits
  under it at all times. The actions follow the scenarios in the DOM at every width, so the focus
  order is the visual order, and on a phone they take no row while nothing in them shows. The
  scenario group holds four `aria-pressed` buttons (edit, add, remove, break a placeholder), each
  counted as `run-scenario`, beside the actions (Reset, and Try again after a failure). Under the
  bar, `.vk-showcase-breaks` is a native radio group (one `name`, so the arrow keys move through it)
  of the three ways a reply breaks the placeholder, `SHOWCASE_BREAKS` in `lib/showcase-seed.ts`: it
  drops `{{amount}}`, renames `{{amount}}` to `{{betrag}}` (the default) or adds `{{tax}}`; each
  label is `tryIt.breaks.<id>` with the reply token passed as `{token}` and `SHOWCASE_PLACEHOLDER`
  as `{placeholder}`, both drawn as chips. A radio is checked only while the break scenario is on
  screen or its run is pending, so every radio runs it when another scenario shows; picking one runs
  the break scenario with it (counted as `run-scenario` with a `break` property), the break button
  and Try again replay the last chosen reply, the refusal detail comes from `checkPlaceholders`, and
  Reset returns it to the default. The file panes (`.vk-showcase-file`: on a phone one at a time,
  picked by the `aria-pressed` file names of `.vk-showcase-file-switch`, which wraps rather than
  clip a name, each name kept on one line; each named by `data-pane`,
  which the stylesheet maps to its grid area); a marked line is `.vk-showcase-line[data-mark]`,
  tinted like a highlighted code line, its mark word in `--v-status-new` (added, missing, new) or
  `--v-status-changed` (edited, stale, changes); a refused reply shows as a struck
  `data-mark="refused"` line in `--text-danger` above the German value it leaves in place; the lock
  pane prints full 16-character hashes, and a rewritten hash shows before and after: the seed hash
  struck as `data-mark="replaced"` above the new one marked `changes`; a mark that does not fit
  drops to the next row), then the output pane (`.vk-showcase-output`, a `figure` with no caption,
  since its first line already reads `verbatra translate`, named by
  `landing.showcase.tryIt.result.outputLabel` and marked `lang="en"`,
  its fixed height adding `--showcase-scroll-reserve` so a sideways scrollbar on a phone moves
  nothing) printing, in English on every locale, exactly the lines `renderHuman` prints for that run
  (`showcaseRunLines` in `lib/showcase-cli.ts`, server-rendered for the seed; after a click the
  lines fade in one `--print-stagger` apart, under 600ms in all, and at once under reduced motion),
  a mono savings line (`result.savings`: strings sent against what a full retranslate sends,
  `showcaseSavings`), and one polite `role="status"` sentence (`result.seed`, `result.summary` or
  `result.failed`). Reset is hidden at the seed and returns focus to the first scenario; Try again
  is shown with an announced failure message when the module fails to load (the cached promise is
  dropped, so a retry loads again). Only the latest request applies: a Reset or a newer click while
  a load is pending wins. The seed state is server-rendered from `showcaseSeed()`; the first hover,
  focus or click `import()`s `lib/showcase-scenarios.ts`, the only client code that uses
  `@verbatra/core` (`diffResources`, `contentHash`, `checkPlaceholders`), over the scenario data in
  `lib/showcase-seed.ts` and the small nested-JSON flattener in `lib/showcase-flatten.ts`
  (`@verbatra/format-adapters` is not browser-safe). `lib/showcase-flatten.test.ts` pins the
  flattener to the real i18next adapter and `lib/showcase-scenarios.sdk.test.ts` pins every
  scenario's (and each other break variant's) sent, unchanged, orphaned and refused keys and lock
  hashes to a real sdk `translate` with a stub provider. Only the `.vk-showcase` panel carries a
  reveal; nothing inside the demo does. The copy says what verbatra would translate; it never
  claims the page translates), `evidence.tsx` (the mono evidence chip, which wraps inside a narrow
  column rather than growing past it; a linked chip takes the flat-panel glow border on hover and
  focus through `.vk-evidence-link`; an external one counts as `outbound-link` from `features`),
  `CommandRow` (`components/command-row.tsx`: the hero
  panel's npm install wraps under 30rem through `wrap="narrow"`, `wrap="always"` wraps a command at every width; elsewhere a `CommandRow` scrolls
  sideways inside `.vk-edge-fade`: a mask, not a painted background, so it stays see-through on any
  surface, and the end fade shows only while the command overflows, driven by a scroll timeline),
  `AiSetupPrompt` (`components/ai-setup-prompt.tsx`: the whole prompt, wrapped, under a `.vk-label`
  caption that shares its row with the prompt's small Copy button; its URL breaks only after a path
  `/`, through `breakUrlsAtSlashes` in `lib/word-breaks.tsx`) and `PromptCopyButton` in the same
  file (the large "Start with a prompt" button with the `.vk-prompt-pop` preview, used only by the
  docs home agent tip), `command-panel.tsx` (the hero's install island, under the locale diff:
  a `.vk-command-panel` whose segmented "Install | Prompt" `TabList` switches between the
  `CommandRow` for `NPM_INSTALL_COMMAND` (counted as `copy-install-command`) and the whole
  `AI_SETUP_PROMPT`; both panes are one `.vk-command-panel-pane` shape, a muted hint row with its
  `CopyButton` on the right, then the content at full width, top-aligned, and the prompt keeps each
  `npx` run and each long flag with its value on one line (`keepPackageRunsWhole`); the closed pane
  is `inert` and hidden at every width, so the install pane carries no empty height under its
  command and the panel resizes on a switch, and a switch counts `select-tab` with
  `location: hero`). The footer draws no pattern and no watermark, and neither does the hero: the landing
  has no background pattern. A new section composes `Section` plus
  `SectionHead`; it does not re-derive page padding or heading rhythm. `Section` takes
  `labelledBy`, the id of its `h2`, and renders it as `aria-labelledby`, so every landing section
  is a named region; the hero and the closing section set it themselves and the proof strip, which
  has no heading, carries an `aria-label` (`e2e/landing.spec.ts` fails on a nameless section). Check
  `ls apps/docs/components/landing` before quoting a file name from this list. The CLI transcripts
  on the landing (`lib/hero-terminal.ts`, `lib/gate-demo.ts`, `lib/check-demo.ts`,
  `lib/showcase-cli.ts`) are real CLI
  output, English on every locale, and their tests pin each line to `packages/cli/src/render.ts`
  (`lib/showcase-cli.run.test.ts` imports `renderHuman` and `lib/check-demo.run.test.ts` imports
  `renderCheckHuman` from it by relative path, and the latter also drives `run` from
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
  `lib/inline-code-text.tsx`; the landing sets a command or value in a step, a bento tile,
  a flow node, the showcase result and the closing install hint the same way; the docs home
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
  framework's kind, a file outline per file format (`json` among them), `custom`, and `llm` and
  `machine` for the marquee's provider kinds), stroked in `currentColor`. No
  third-party logo is drawn anywhere on the site except the GitHub mark
  (`components/landing/github-icon.tsx`); a stack is recognised by its name. The grid is a `nav` named by `labelledBy`, the id of the heading above it
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

The landing moves little, on purpose: the demos rise into place once as the visitor reaches them,
the hero diff fills its two missing values once, the provider and format marquee loops until it is
paused, the SDK playground scrambles its results once per Translate press, the feature flow's
path draws with the scroll, and nothing else on the page fades in.
There is no scroll-driven pinning and no parallax (the SDK playground's snippet column is only
`position: sticky` from 64rem, which moves nothing on its own). The flow's path is the only scroll-scrubbed motion and its
`ScrollTrigger` the only scroll listener, both inside the lazily loaded drawing module; `motion` is
reserved for client islands (see "The stack").

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
  `n * --reveal-stagger`, capped at `--reveal-delay-max`. Only the demo artifacts of four sections
  carry a mark: the Try it panel in the feature flow, the problem (its artifact, then its list), the
  bento's first row (the keys tile alone; the head beside it and the later tiles never) and the code showcase. No section heading reveals (`SectionHead` takes no reveal
  prop), and the hero, marquee, SDK playground, proof strip, comparison, open source, FAQ
  and closing panel never take a reveal; nothing else in the flow does either; the hero diff's fill and the marquee loop below are their own
  motions, not reveals. Elements keep their box while hidden, so a reveal never moves layout.
  `reveal-marks.test.tsx` pins which files carry marks and `motion-root.test.tsx` the observer and
  the stylesheet guards.
- **Hero.** The hero is never revealed and the `h1` never moves (it is the largest paint); no
  load animation runs in it. The locale diff is server-rendered filled
  (`data-diff-state="filled"`); the `HeroDiffMotion` island sets `missing` only after hydration,
  only while the diff is out of view and never under reduced motion, then fills it once when it
  scrolls in: once `HERO_DIFF_FILL_RATIO` of it shows, or its visible part covers
  `HERO_DIFF_FILL_VIEWPORT_SHARE` of the viewport (a short screen, where the whole diff never fits),
  or `HERO_DIFF_FILL_TIMEOUT_MS` after any part of it entered view. The values fade back in
  (`opacity`, `--duration-reveal`, one `--reveal-stagger` apart) and the `aria-hidden` "missing"
  mark swaps for "new". Focus inside the diff shows the values at once (`:focus-within`), so a
  keyboard user never meets a hidden value. A diff already in view at hydration never moves.
  `e2e/hero.spec.ts` drives the fill at 375 by 480, 320 by 256 and 568 by 320.
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
  (`components/landing/code-frame-shell.tsx`, the markup `CodeFrame` also renders) with a
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
- **Feature flow.** `flow.tsx` (`#flow`, a band right after the SDK playground, a `stacked` head whose
  `h2` is `landing.flow.heading`, set in `.vk-flow-head` on the snippet side: from 64rem it is
  capped to the snippet column's width, from `--flow-rail`, declared on the section's
  `.vk-flow-section` so the head and the nodes share it) is one `ol.vk-flow-list`, one `li.vk-flow-node` per entry of
  `FLOW_NODES` in `lib/landing-flow.ts`: an `h3`, two sentences, one docs link and one `CodeFrame`
  snippet, each titled (its file name, or `HERO_TERMINAL_TITLE`, `~/app`, for a
  command) so its copy button sits in the title bar and never over the code, each
  snippet taken from its source and pinned to it by `flow.test.tsx` (the next-intl
  sample from the real adapter, the `init`, `translate` and `check` commands and flags of the
  published `@verbatra/cli`, as recorded once from its release tag in
  `test-support/cli-0.11.1-flags.json`, with `init --path` naming the file the source node shows,
  the SDK quickstart call, the GitHub Action guide's workflow with `CHECKOUT_ACTION_REF`,
  `VERBATRA_ACTION_REF` and `PACKAGE_VERSION` and the key variable of the provider `init` sets up
  in place of the guide's, `check` with the exit codes of `checkExitCode`,
  `STUDIO_RUN_COMMAND`, and the Claude Code `.mcp.json` block of the MCP client guide). The
  incremental node also holds the Try it demo (`.vk-flow-demo`: the moved showcase lead, then the
  `.vk-showcase` panel), spanning the full row at every width, since its board needs the
  full width. From 64rem a node is three columns, snippet, rail and text; below that the rail sits
  on the start edge with the text and snippet stacked beside it. One `aria-hidden` rail
  (`.vk-flow-rail`, a box that an SVG with `preserveAspectRatio="none"` fills, since an
  absolutely positioned SVG keeps its intrinsic height instead of stretching between its insets) holds a `--border-default` track and the
  `--accent-fill` path, running from the first mark's centre to the last one's (CSS anchor
  positioning, `--vk-flow-start` and `--vk-flow-end`; without it the rail runs the list's full
  height), and each node has an `aria-hidden` numbered `.vk-flow-mark` on the rail.
  The server HTML is the drawn state: the path whole and every mark filled. The `FlowMotion`
  island (`flow-motion.tsx`) imports `flow-draw.tsx` once the flow comes within one viewport, after
  the first contentful paint and never under reduced motion. Its `FlowDraw` runs, inside
  `useGSAP({ scope })` and a `gsap.matchMedia` on `(prefers-reduced-motion: no-preference)`, one
  DrawSVG tween from `0%` to `100%` scrubbed by a `ScrollTrigger` from the first mark to the last
  (`trigger` the first mark, `endTrigger` the last, both `center center`, no pin), so the drawn
  tip sits at the middle of the viewport and the last mark fills while it is there, sets `data-flow="drawing"` on `.vk-flow` and gives each mark
  `data-revealed` once the drawn length reaches it; only then is an unreached mark hollow, its fill
  fading by `opacity`. Reverting (unmount or reduced motion turning on) restores the drawn state.
  No release badge is needed in the flow: every node works with the published packages, and any
  later badge comes from `RELEASE_BADGE`. `e2e/flow.spec.ts` pins the browser behaviour.
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
  scroll listener outside the flow's `ScrollTrigger`; at most one reveal chain per section, and only
  in the four demo sections (the hero diff fill, the marquee loop and the flow drawing are not
  reveals); no entrance over 16px or 600ms.

## Keep the client payload small

Mobile Lighthouse is dominated by bytes that arrive before the first paint, so:

- `motion` only through a dynamic `import()` of `motion/mini` inside a client island (today only
  `code-showcase-fade.ts`), never a static import and never a page-wide provider. Section reveals
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
  but `LiveStatValue` and `CopyButton` is), never a Suspense boundary, since React outlines a completed Suspense
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
  (`useLiveStats`) wait for `afterFirstContentfulPaint`. Links never prefetch on their own: they go
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
- `gsap` only through the playground's dynamic `import()` of `playground-scramble.tsx` and the
  flow's dynamic `import()` of `flow-draw.tsx` (see "The stack"): the island chunks themselves
  (`playground-demo.tsx`, `flow-motion.tsx`) import no GSAP, so it is in neither the first load nor
  the island batch, and `playground.test.tsx` and `flow.test.tsx` fail on a static import.
- Content only needed after an interaction is loaded with a dynamic `import()` on hover, focus,
  or click. The AI setup prompt is not: it is short, and its text ships in the page, in the hero
  command panel's Prompt tab and the `PromptCopyButton` preview.

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
follow the one shared `/api/stats` request (`useLiveCount` in `lib/live-stats.ts`, which the proof
strip's `LiveStatValue` island shares); without a build-time count the GitHub link shows no number
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
content scrolling under it stays out of the way of its text). An in-page jump lands a section
under the header through `--vk-landing-offset` (3.5rem, the header height), the
`scroll-margin-top` of every `.vk-home [id]`.

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
  backdrop pattern and one soft glow behind the demo column: `.vk-banner-grid` is one column (copy, demo,
  facts), and from 64rem an asymmetric 5fr / 7fr split, the copy (`.vk-banner-copy`: the `h1`
  `.vk-banner-title`, the `.vk-banner-lead`, the `.vk-banner-summary` and `.vk-banner-ctas` with
  Get started (`/docs/quickstart`) and Star on GitHub) in the narrower column beside the wider
  demo (`.vk-banner-demo`: the locale diff, the dominant visual, its panes side by side once the
  column reaches 40rem, its caption, then `.vk-banner-install` holding `CommandPanel` at the
  column's full width), and the facts block (`.vk-banner-facts`) as a full-width row under both,
  its values inside a 1440 by 900 first viewport. The hero draws no terminal. `hero.test.tsx` pins
  the order and the absent backdrop and terminal, `e2e/hero.spec.ts` the columns and the fold. The home social image (`HomeOgFrame` in `lib/og-image.tsx`, served
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
  border, like `Terminal` and `CommandBox`. On an untitled fence the copy button sits on a void
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
- **Pills**: `.vk-pill` is the one badge shape: an outline pill in `--accent` text with the
  glow-tinted border, mono, `--text-xs`, no fill. The sidebar NEW badge
  (`components/new-badge.tsx`; the landing footer carries none, `footer.test.tsx` pins it) adds `.vk-pill-status` (smaller, uppercase) and is hidden in the
  breadcrumb (`.vk-breadcrumb`, set on `DocsPage`), which shares the sidebar's tree; the
  `<AvailableFrom>` badge adds `.vk-available-from`, which sits after the heading text when it is
  inside a heading. Its markup is `AvailableFromPill` (`components/available-from.tsx`), which the
  landing's marquee and bento render with the `docs.availableFrom` copy for
  `RELEASE_BADGE.version`. `RELEASE_BADGE` (`lib/release-badge.ts`) is the landing's one list of
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
  Do not bring back a filled purple pill.
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
  landing hero's command panel takes `NPM_INSTALL_COMMAND` from `lib/install-commands.ts` as plain
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
  `.vk-terminal-scroll` uses, and the header is not sticky, because a sticky cell inside a scroll
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
