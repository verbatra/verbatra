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
  No animation library is a dependency: the playground's typing and decoding are timer-driven state
  (`lib/playground-cycle.ts`).
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
   warning callout color) / `--v-status-unchanged`: the `tone` colors of
   `components/ui/badge.tsx` and nothing on the landing (the exit code in the CI tile is
   `--text-danger`). There is no pink (`lib/landing-tokens.test.ts` fails if `--v-pink`
   or `--v-violet` comes back). The landing's light effects are tokens too, defined for both
   themes in `:root` and `html.light`: `--gradient-headline` (strong text into the accent, painted
   only on the hero `h1`), `--halo-strong` and `--halo-soft` (the accent fill and accent mixed into
   transparency, weaker in the light theme) for every glow, `--art-dim` (the resting strokes and
   dot grid of the feature canvases, read at runtime by `lib/landing-canvas.ts`), `--grid-line` for the faded grid behind the hero and the closer, and
   `--star` for the statement's starfield. Reach for one only in the role it already has.
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
documented role: `--v-void` (void code surfaces, and the dark value of the landing page surface `--surface-page`), `--v-status-*` (badge tones). `lib/theme.test.ts` fails on any
other `fd-*` class, `var(--color-fd-*)` or `--v-*` reference there.

Scales are fixed and narrow, deliberately:

- Radii: `--radius-sm` 6px, `--radius-md` 10px, and `--radius-lg`, `--radius-xl`,
  `--radius-2xl` all 12px. The large sizes collapsing to one value is intentional. Two landing
  radii sit above it and nowhere else: `--radius-card` (20px) for the highlight tiles and feature
  cards, and `--radius-panel` (28px) for the closing panel. The hero itself sits on the page, in no
  card.
- Shadows: `--shadow-panel` (a neutral lift) and `--shadow-sm`. Two, not a ramp, each
  lighter in the light theme, and neither tinted (`lib/theme.test.ts` fails on a hue in either
  shadow). Violet light comes only from the halo tokens above, in the places that name them: the
  hero halo and the shadow under its front locale-file card, the CI tile, the feature visuals, the closing
  panel and the glow of the primary `Button`.
- Layout: `--gutter` (40px from 768px up) via `.vk-gutter`, `--width-wide` via `.vk-w-wide`.
  `--cta-height` (56px) is the minimum height of `.vk-prompt-trigger` on `PromptCopyButton`;
  `--width-prompt-pop` (30rem, capped by `100cqw` of its container, never by `100vw`, which counts
  the scrollbar) is the width of the `.vk-prompt-pop` preview. `--head-gap` (2.5rem, 3.5rem from 64rem) is the one space
  between a section head and its content: the
  highlight tiles and the feature grid (`margin-top: var(--head-gap)` on `.vk-bento` and
  `.vk-feature-grid`), the row gap
  of `.vk-section-aside` (the FAQ) and of the playground grid; `section-bands.test.tsx` fails on an ad hoc
  `mt-10` or `lg:mt-14` there. `.vk-grid-12` is the landing grid: one column under 64rem,
  then `--grid-columns` (12) columns with a `--grid-gap` (24px) gap, where each child spans
  `--grid-span` columns (the full row when unset), starting on `--grid-start` when set. `SectionHead` takes `layout`: `split` (the default, a
  `.vk-grid-12`: the heading block spans 8, the lead 4, bottom-aligned by default; `align="start"`
  top-aligns them (`data-align`); the highlights and the features use the split head),
  `stacked` (the lead under the heading on the first column, for a section whose content runs the
  full row; no landing section uses it today), `inline` (the same
  stacked block at a narrower measure, `.vk-section-head-inline`; no landing section uses it today).
  A split head without a lead renders stacked; `stacked` and `inline`
  keep their shape either way. `SectionHead` is the head only and takes no children.
  `SectionAside` (same file) is the head beside its content: a `.vk-section-aside` `.vk-grid-12`
  with the stacked heading and lead (`data-layout="aside"`) in span 4 at the start and its
  `children` in `.vk-section-aside-content`, span 8, top-aligned; one column, head first, under
  64rem: the FAQ. Its optional `trailing` renders after the content as a direct grid child (the FAQ's docs link
  list, placed in the head column's second row from 64rem by `.vk-faq-aside`). `section-bands.test.tsx` renders each section and pins the head shape it
  draws, so the page never goes back to one head shape everywhere.
- Landing surfaces: `--surface-band` (mixed from `--surface-card` and
  `--surface-bg`, never a raw value), the fill of `.vk-band`: `Section` with `band` renders a
  full-width `section.vk-band` (between two `--border-default` hairlines, `--section-md` above it
  and `--section-md` padding inside) around the usual `.vk-gutter` column. Every page/band edge is
  therefore one `--section-md` step of content gap on each side of its hairline: a page section
  opens with `--section-md` (its rhythm) and ends at its content, the band margin sets the space
  above the next hairline, the hero ends 3rem (7.5rem from 768px) under its locale files and CTAs, its halo masked to fade out before the marquee hairline, and the footer opens with
  `--section-sm` under its hairline. The one larger step is `--section-closer` above the
  closing panel. Only the SDK playground is a band. Order: hero (page, under its halo), marquee
  (page, `.vk-marquee-section`: `--border-default` hairlines above and below, `2.75rem` above and
  `3rem` below its content, `overflow-x: clip`, rows full-bleed across the viewport), statement
  (page, starfield, `padding-block: clamp(5rem, 12.5vw, 11.25rem) clamp(0rem, 3.6vw, 3.25rem)`, so with the highlights' own `--section-md` it opens about 180px of gap at 1440), highlights (page), SDK
  playground (band), features (page), FAQ (page), closing panel (page), then the footer on the
  page surface under one hairline (`section-bands.test.tsx` pins the order and the surfaces).
  The page surface is `--surface-page` (dark `--v-void`, light `--color-fd-background`, the 98 percent
  page tone): it paints `.vk-home`, the footer and the sticky FAQ head, so white tiles read as raised in
  the light theme and the footer forms no band in either; `--v-void` itself stays for code surfaces.
  Landing tiles use two landing-scoped tokens, outside the semantic layer above:
  `--surface-tile` (dark `hsl(240 26% 8%)`, light white) and `--border-tile` (dark
  `hsl(240 22% 16%)`, light `--border-default`). They fill and border `.vk-tile`, `.vk-feature`,
  `.vk-faq-item`, `.vk-closer`, `.vk-banner-file`,
  `.vk-playground-pane`. The playground's static table (`.vk-playground-table-scroll`,
  the no-JavaScript fallback) stays on `--surface-card` with `--border-default`: it is a data
  table sharing the docs table treatment (header row on `--surface-card`), not a tile. The hero draws one `aria-hidden` `.vk-banner-halo` as its
  first child: two radial halos and a 64px `--grid-line` grid faded by a radial mask, behind the
  copy and the demo alike (`hero.test.tsx` pins it); there is no dot backdrop.
- Placeholder chip: the SDK playground and the hero's locale-file cards draw one. `.vk-ph` sets a
  `{name}` or
  `{count}` in `--accent` on a 14 percent `--accent` tint (`color-mix`, radius 5px, 1px 4px padding,
  no border and no token of its own), in the source line and in every language, so the placeholder
  is visibly the same in each. Under `forced-colors` it is `CanvasText` on `Canvas` with a
  `Highlight` outline. The integrity tile still colors each placeholder `--accent` inside a plain
  `mark` (`.vk-highlight-placeholder`, no fill, no border), and `lib/landing-tokens.test.ts`
  fails if a `--placeholder-*` token comes back.
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
(capped at 3rem, read only by `.vk-h2`; the marquee's centered `h2`, `.vk-marquee-heading`, is a small
mono uppercase label instead), `--text-h3`, `--text-h4`, `--text-lead`, with `--leading-*`
and `--tracking-*` companions. Above it sits `--text-hero` (fluid, 2.5rem to 6.25rem) with
used only by the landing headline (`.vk-banner-title`, through
`--banner-title`, `min(clamp(2.875rem, 6.6vw, 5.75rem), 15.5cqi)`, at weight 600 and `-0.05em` tracking). Landing headings take the `.vk-h2`, `.vk-h3`, `.vk-h4` and `.vk-lead`
classes (declared in `@layer components`, so a Tailwind utility still overrides them)
rather than inline `fontSize` / `letterSpacing` styles. The docs page title sits on `--text-h3`; the lead and prose
`h2` to `h4` use the docs steps `--text-doc-lead`, `--text-doc-h2`, `--text-doc-h3` and `--text-doc-h4`
(1.0625, 1.3125, 1.0625 and 0.9375rem), tokens of their own because the landing's fluid scale is
too large for a reading column, through the `#nd-page` rules. Headings never hyphenate on their
own (`hyphens: manual`, `overflow-wrap: anywhere`, which also lets a long word shrink the heading's
flex or grid track instead of overflowing it), so a German compound breaks only where the copy
puts a hyphen. The wordmark is lowercase `verbatra` everywhere: the header, the footer and both
social images (`OG_WORDMARK` in `lib/og-image.tsx`).

Headlines are solid `--text-strong` on both surfaces, with one exception: the hero `h1`
(`.vk-banner-title`) is solid `--text-strong` except its `.vk-banner-title-lit` span (the
`<accent>` part of `landing.banner.headline`, on its own line), which clips `--gradient-headline`
to its text, and falls back to solid
`CanvasText` under forced colors (`lib/landing-tokens.test.ts` fails if any other rule paints the
gradient). The statement's `h2` is the one headline set in two tones: its lit part `--text-strong`
in an `em` (underlined under forced colors), the rest `--text-faint`. Only the `{sent} keys` part is lit.
Its size is `--statement-title` (`clamp(2.5rem, 6.4vw, 5.75rem)`, weight 500, never above the
hero title's `--banner-title` cap). No landing headline ends with a period (`lib/landing-messages.test.ts`).

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
  `TabList` moves selection and focus with the arrow keys (wrapping), Home and End; its one
  underline look serves every tab row, and it wires no `id` or `aria-controls`, because no
  landing tab drives a panel of its own.
  `Button` takes `variant: "primary" | "secondary" | "outline" | "ghost"` and
  `size: "sm" | "md" | "lg"`. Every button carries `.vk-btn` (the transition on `transform`,
  `box-shadow`, `background-color`, `border-color`, `color` and `filter` over `--duration-fast` and
  `--ease-standard`, and the press: `translateY(1px)` plus `brightness(0.96)`; the hover lift of
  `translateY(-1px)` on primary and secondary; the transitions and transforms only under
  `prefers-reduced-motion: no-preference`, so reduced motion keeps color changes and no movement,
  and the hover lift and the primary glow only where `(hover: hover)` holds, so a tap leaves
  nothing stuck; the active `brightness` and the hover glow are not motion and stay). `primary` carries
  `.vk-btn-primary`, whose fill lives in the stylesheet (`@layer components`), not an inline style:
  a 180deg gradient from `--accent-fill` to `--btn-fill-end` (`--accent-fill` mixed half into
  `--pill-new-end`), a 1px inner top highlight (`--btn-highlight`, `--accent-fill-fg` at 38 percent),
  a 1px outer rim (`--btn-rim`, `--pill-new-end` at 80 percent) and a soft `--halo-strong` glow that
  widens on hover with a `brightness(1.08)`; it has no border. `components/ui/button.test.tsx`
  holds `--accent-fill-fg` at 4.5:1 on both gradient ends in both themes. Under `forced-colors`, where the fill drops, it
  gets a 1px inset `ButtonText` outline (not a border, so its size never changes), left to the
  focus ring while it is `:focus-visible`. `secondary` and `outline` carry `.vk-btn-secondary`
  (`--shadow-sm`) and both draw a `--text-faint` border that holds 3:1 on its own
  (`control-boundaries.test.tsx` reads the first `border-(--token)` of the class string): secondary
  sits on `--surface-card`, outline on a transparent fill and also shows a pressed `--accent` border
  through `aria-pressed`; on hover both turn the border `--accent` and the fill `--surface-hover`.
  `ghost` has no border and tints `--surface-hover` on hover as its text goes `--text-strong`. The
  trailing arrow moves 4px on hover (`motion-safe` only). The contact form's submit is this
  primary `Button`, never the Fumadocs `buttonVariants`.
  Extend the variant union rather than passing ad hoc `className` overrides.
  A control's boundary never relies on `--border-default` alone (about 1.3 to 1.5:1): a bordered
  button and `CopyControl` draw it in `--text-faint`, and the copy
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
  `LANDING_SECTIONS` in `lib/landing-sections.ts` (hero, marquee, statement, highlights,
  playground, features, faq, finalCta), which the home page maps
  over and `lib/landing-sections.test.ts` pins; add or move a section there, not by hand in
  `page.tsx`. The files: `hero.tsx` (the `h1` with a gradient second line, the lead, the Get started button beside the install chip, a
  `CommandRow` of `HERO_INSTALL_COMMAND` in `.vk-banner-install`; on the right an `aria-hidden`
  `.vk-banner-files` stack of three locale-file cards from `lib/landing-hero-files.ts`: `fr` and
  `es` behind, tilted, each its `heroFileName` and the `heroFilePreview` line, and `de` in front
  with a `landing.banner.keysAdded` badge and `heroFileLines` where the added keys are marked
  `data-added`; every value is the playground's default item from `PLAYGROUND_TRANSLATIONS`, the
  back cards show only from 64rem and where the demo column is at least 28rem wide (a container
  query), so no value line is ever cut with an ellipsis, and every value line wraps at spaces; no trust line, no Node.js requirement line, no tabs and no
  terminal), `statement.tsx` (`#statement`, a bracketed `.vk-eyebrow` label and one
  large sentence on a starfield whose counts come from `lib/hero-terminal.ts`, the lit part in an
  `em`, the rest `--text-faint`, with the first locale line of the translate run under it),
  `highlights.tsx` (`#highlights`, a split head aligned to the start over `.vk-bento`, six columns
  from 64rem: the translate run from `HERO_TRANSLATE_OUTPUT` in a `ScrollBlock`, its total line in
  `--accent` (span 4), the check's exit code in `--text-danger` (span 2; its glow is a strip of
  `--tile-halo-height` at the tile's end, under padding that clears the text, so no text ever sits
  over a halo), the playground's default item in every playground language with each placeholder
  in a `mark` (span 3), and the MCP setup command wrapped, not scrolled, breaking only between whole flags and arguments through `keepPackageRunsWhole` (span 3); every count
  derives from the hero terminal data, never typed; the CLI text (run, exit code, command) carries
  `lang="en"` on every locale, like the statement's proof line), `features.tsx` (`#features`, a bracketed label, a split
  head aligned to the start and `.vk-feature-grid` of `LANDING_FEATURES` from `lib/landing-features.ts`: each card a
  fixed-height `.vk-feature-visual` (halo and dot grid) holding one `aria-hidden` `canvas.vk-feature-canvas`
  (`feature-canvas.tsx`, a client island: motifs are the pure frame functions of `lib/landing-canvas.ts`,
  colors read from the `--accent`, `--art-dim`, `--text-muted`, `--border-default`, `--surface-card`,
  `--text-strong`, `--v-status-changed` and `--v-danger` tokens and re-read when `html.light`
  toggles, drawn at devicePixelRatio, paused offscreen and while the tab is hidden, a bounded run that lasts until `runEndSeconds`
  (at least `RUN_SECONDS` and less than `RUN_SECONDS + LOOP_SECONDS`, ending on a frame congruent to
  `STILL_TIME`, never forever) and then holds its `STILL_TIME` frame, one static frame under
  `prefers-reduced-motion`, no text ever drawn), and an `h3` whose link to the command's docs page
  stretches over the whole card), `playground.tsx` (`#playground`, the SDK playground, see
  "SDK playground" below), `marquee.tsx`
  (`#marquee`, see "Marquee" below), and the comparison, which lives only on `/compare` (the landing reaches it from the FAQ's docs
  links and the footer). `lib/landing-compare.ts` holds its rows and tools and one numbered source
  list, `compareSource(n)`; `cellFootnote` derives each cell's number from its row and tool, and
  the manual column cites the note `M`. A cell is text only, never a check, a cross or a rating.
  Every cell is followed by its footnote links (`[data-footnotes]`, each at least 24px,
  named "Source n, tool", set small (0.6875rem mono) and `--text-muted` with no underline until
  hover, so the sources stay reachable without outweighing the cell text); `TextWithRefs` keeps the cell's last word and its links in one `whitespace-nowrap` run,
  so a link never starts a line alone, and a checked cell keeps its glyph with its first word (up to
  a hyphen, so `check-Gate` may break after it), so the glyph never stands on a line alone. The source list (`li` with `value={n}` and `id="source-n"`, the note `id="source-m"`) sits under
  the table, so a followed footnote sets `:target`; under the table the framing sentence
  (`landing.compare.fairness`), the concession with `CONCESSION_FOOTNOTES` and "Last checked" with
  `COMPARE_LAST_CHECKED` as a `time`. The table is a
  hairline table (`.vk-compare-table`, `table-layout: fixed`): a top and bottom rule, rows split by
  `--border-default`, the header row on `--compare-head` (the band surface) over a `--text-faint`
  rule, no filled header and no tinted column; the Verbatra column is marked by `.vk-compare-mark`,
  an inset `--accent-fill` start bar (under `forced-colors`, where the shadow drops, a 3px
  `CanvasText` start border), with medium-weight cells and its header in `--accent`; every
  column header is medium weight too. Every
  surface of the region (its background, the opaque sticky cells, the fade, the no-timeline
  shades) reads `--compare-surface`, the page under `.vk-compare` and the band under
  `.vk-band .vk-compare`. The table scrolls sideways inside a focusable `section` named by its
  caption (`aria-labelledby`), with the row headers pinned at `--compare-sticky` (11rem, at most 7.5rem (46cqi) while the column is narrower than 56rem,
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
  column is narrower than the table (100rem) a `landing.compare.scrollHint` line before it says so
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
  cell is `landing.compare.rows.<row>.<tool>`; the Verbatra providers cell lists `badgedProviderNames(locale)` with the
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
  url once in `proxy.ts`), `faq.tsx` (`#faq`) and `final-cta.tsx` (the closing
  section on `landing.closing`, the page's only centered section: `.vk-final-cta` opens
  `--section-closer` (`--section-lg`, the one step above `--section-md`) under the FAQ, and
  `.vk-closer` is one bordered `--radius-panel` panel on `--surface-tile` with one halo in a strip
  of `--closer-halo-height` at its end edge, right of center, under extra end padding of the same
  height (axe cannot measure text over a gradient, so no text ever sits over the halo at any
  width, and the lead takes `--text-body`), its first child an `aria-hidden` `.vk-closer-grid`
  (the hero's faded grid); it centers a bracketed `landing.closing.label`, one `h2`
  (`.vk-closer-title`, 36px to 72px), one lead sentence and one `CommandRow` of `DRY_RUN_COMMAND`
  in `.vk-final-install` (36rem, its command start-aligned), with no button or link).
  `.vk-eyebrow` is the one section label style: mono, uppercase, `--text-muted`, wrapped in braces
  drawn as CSS content with empty alt text, so a screen reader reads the label alone (the closing
  brace follows a no-break space, so it never starts a line); it is never
  numbered (`reveal-marks.test.tsx`). The footer is not a section; `app/[lang]/(home)/layout.tsx` passes
  it to the home layout (the landing and `/compare`). `FullFooter` (`footer.tsx`, `footer.vk-footer`) sits on
  the page (`--surface-page`) under one `--border-default` top hairline and no inner rule, with no gradient wash and no gradient
  rule, in three rows, no longer the brand column beside five link columns: a top row with the
  wordmark and the one-line tagline at the start and GitHub and the npm org (`NPM_ORG`) at the end
  (`.vk-footer-top`, no rule under it); then `.vk-footer-people`, the contributors from
  `lib/contributors.json` (`contributors.tsx`: a `div` with `role="group"` named by a
  `.vk-footer-group-title`, never a landmark or heading, each a self-hosted 32px avatar from
  `public/contributors/` with the login beside it, refreshed by hand with `pnpm contributors`,
  then one open slot, a borderless `--accent` 14 percent tint circle linking the issue list; the avatars carry no ring); then `FOOTER_GROUPS`, four named `nav`s on
  `.vk-footer-groups`, deliberately not a row of equal columns: product (`PRIMARY_GROUP`: the docs
  pages, the localized `/compare` and the files for AI agents) leads as the wide group, its links in
  `--text-strong` at 15px flowing down CSS columns (`columns: 2 9rem`, three from 48rem), and
  packages (every package on npm and the release notes), community (contributor guide, code of
  conduct, security policy) and legal (license, Impressum, privacy, contact, `/licenses`) sit in
  `.vk-footer-secondary` as muted columns: beside product from 80rem, narrow and content-sized behind a
  `--border-default` start rule; under it before that, on product's three column tracks from 48rem
  (three equal columns at `--grid-gap`, so each group starts where a product column does); group titles and the locale label are
  medium `--text-strong`, links keep a 0.5rem row gap and a 2px focus offset; then `.vk-footer-bottom` (no rule): the locale switch, and
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
  `e2e/footer.spec.ts` checks the surface, the contributors (axe, 44px targets, avatars loaded from this site) and every same-site link in all four locales, and on the
  landing, `/compare`, legal and docs pages, with JavaScript off, that the switch's links equal the
  page's `hreflang` alternates and answer 200 without a redirect. Section ids are unique; never render two sections that claim the same one.
  The FAQ (`faq.tsx`, on the page surface `--v-void`, `SectionAside` with `.vk-faq-aside`, each item a bordered `--radius-card` `--surface-tile` panel: five
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
  compile until it has one.

- **Marquee markup.** The marquee (`marquee.tsx`, `#marquee`, a plain page section right under the
  hero, between two hairlines, with a centered `h2` `.vk-marquee-heading` in small mono uppercase
  over full-width rows, with the "All formats" and "All providers" links centered under them) shows
  two rows inside the `MarqueeMotion` island (`marquee-motion.tsx`), the formats first and the
  providers second: the providers, `landingProviders()`, each with its mark from `PROVIDER_ICONS` (a
  `Record<MachineProviderId, MarqueeMark>`), and the formats, `SUPPORTED_FORMAT_IDS` by their
  `FORMAT_DISPLAY` label with their mark from `FORMAT_ICONS` (a `Record<SupportedFormat,
  MarqueeMark>`), so a new provider or format fails to compile until it has one. A `MarqueeMark` is
  either a brand mark (`kind: "brand"`) or a stroke glyph (`kind: "glyph"`, one of
  `MARQUEE_GLYPHS`). Brand marks follow the logo rule under "Reuse before you build" (the stack
  cards paragraph); every one is a `<use>` of the one `BrandMarkSprite`
  (`components/brand-marks.tsx`, prefix `marquee-mark`), drawn at 18px in a single `currentColor`
  fill. A glyph (`.vk-marquee-glyph`: an 18px unfilled `currentColor` stroke, 1.8 wide, round caps)
  stands in for an item with no admissible mark: braces (vue-i18n), swap (XLIFF), a speech bubble
  (gettext), sliders (INI), a cube (.NET resx), a plug (the OpenAI-compatible endpoint), a globe
  (i18next), a chip (Anthropic, Gemini), two speech bubbles (DeepL, Google Translate) and a server
  (LibreTranslate). Those six brands have no drawing in Font Awesome Free, Devicon or another
  admitted set that their terms clear: Anthropic permits its marks only "as specifically permitted
  by us and only in materials we approve beforehand" and bars alteration, Google asks for approval
  of its product icons through the Partner Marketing Hub and bars changing its marks, LibreTranslate
  allows a logo only for unmodified programs and compatibility "in words (not logos or images)",
  DeepL's press page offers its logos for editorial use, and i18next publishes no logo terms. Mark and
  glyph are `aria-hidden`; an item (`.vk-marquee-item`) is a bare `--text-muted` mark and label in
  `--text-base`, with no box, border or fill, and hovering it lifts it to `--text-strong`, with no
  glow, scale or brand color. The name (`.vk-marquee-name`) is the item's text. A provider that
  `RELEASE_BADGE` dates carries the depth pill (`NewPill`, `landing.marquee.new`) with the "Available
  from" label in an `sr-only` span and, after it, the release version as visible `aria-hidden` mono
  text (`.vk-marquee-release`, `--text-muted`), so a reader on the current release sees the provider
  is not in it yet. It does not animate. The pause button is `variant="ghost"` with a
  `--radius-full` `--accent` 10 percent tint (18 percent on hover) and no border (a `ButtonText`
  outline under `forced-colors`). No count is typed. Each row is a muted `h3` that names its visible
  list, the list, `MARQUEE_COPIES` copies of it (`aria-hidden`, `inert`, holding no link or button),
  and an "All providers" or "All formats" link after the moving track, so nothing focusable moves.
  The list sits in `.vk-marquee-viewport`, a `.vk-edge-fade` `role="group"` keyboard stop named by
  the row's `h3`. The server HTML is the static state, and the copies are `display: none` in it.
  Under reduced motion or without JavaScript (`scripting: none`) the pause button is `display: none`
  and the list wraps, which never changes. Where motion may start (`prefers-reduced-motion:
  no-preference` and `scripting: enabled`) the static state already has the moving state's box: the
  pause button holds its row at `visibility: hidden` (so it is neither focusable nor announced) and
  each list is one line that scrolls sideways with no scrollbar, so every item stays reachable by
  keyboard, touch or trackpad, also after a failed island chunk, and the takeover shifts nothing
  (`e2e/marquee.spec.ts` measures the section's height before and after hydration at 375 and 1440
  and sums the layout shift). Only when `MotionRoot` has set `html[data-motion-ready]`, the island
  has hydrated (`data-marquee="running"` or `"paused"` on `.vk-marquee`) and that media query
  matches do the rows turn into one masked line that runs `vk-marquee` (a `transform` keyframe,
  `--marquee-items` times `--marquee-item-time` per loop, the providers row reversed through
  `--marquee-direction`, so the two rows run in opposite directions), and the pause button shows
  before the rows: a `ghost` `Button` at `size="md"` (44px tall, like the other landing controls)
  whose visible text is its name and says the action it takes next: `landing.marquee.pause` while
  running, `landing.marquee.play` while paused, with no `aria-pressed` (a changing name plus a
  pressed state would read "Play animation, pressed"), and its `aria-hidden` glyph swapping on
  `data-marquee`. Hover and focus inside a row pause that row. `marquee.test.tsx` pins the registry
  rows, the badge, the copies, the static state and the pause toggle, and `e2e/marquee.spec.ts` the
  motion in a browser.

- The shared building blocks: `section.tsx` and
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
  social image and the statement and highlights counts draw from;
  `lib/hero-terminal.run.test.ts` pins the lines to the CLI's renderer;
  `MCP_ADD_COMMAND` in `lib/install-commands.ts` is the `claude mcp add` line the highlights'
  MCP tile and the markdown twin print, copied from the MCP client guide, and `DRY_RUN_COMMAND`
  (same file) the one command of the closing panel;
  `lib/landing-hero-files.ts` builds the hero's locale-file cards from the playground data: its
  `HERO_FILE_IDS` list says which lines the front card shows and which are marked added (the badge
  counts those), and the preview line is `PLAYGROUND_DEFAULT_ITEM`,
  `CommandRow` (`components/command-row.tsx`: the closing
  section's npm install wraps under 30rem through `wrap="narrow"`, `wrap="always"` wraps a command at every width; elsewhere a `CommandRow` scrolls
  sideways inside `.vk-edge-fade`: a mask, not a painted background, so it stays see-through on any
  surface, and the end fade shows only while the command overflows, driven by a scroll timeline),
  `AiSetupPrompt` (`components/ai-setup-prompt.tsx`: the whole prompt, wrapped, under a `.vk-label`
  caption that shares its row with the prompt's small Copy button; its URL breaks only after a path
  `/`, through `breakUrlsAtSlashes` in `lib/word-breaks.tsx`) and `PromptCopyButton` in the same
  file (the large "Start with a prompt" button with the `.vk-prompt-pop` preview, used only by the
  docs home agent tip). The footer draws no pattern and no watermark. The landing draws exactly
  three, all decoration: the hero halo's faded grid, the closer's same grid and the statement's
  starfield; add no other. A new section composes `Section` plus
  `SectionHead`; it does not re-derive page padding or heading rhythm. `Section` takes
  `labelledBy`, the id of its `h2`, and renders it as `aria-labelledby`, so every landing section
  is a named region; the hero, the statement (a full-bleed starfield, which `Section`'s width cap
  would cut off) and the closing section set it themselves (`e2e/landing.spec.ts`
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
  `currentColor`; a card may carry a brand mark instead (its optional `mark` prop, an id of
  `BRAND_MARKS`), drawn at 28px in the chip as a `<use>` of a `BrandMarkSprite` whose prefix
  (`vk-stack-mark-<labelledBy>`) differs from the glyph sprite's, since `yaml` is both a glyph and a
  mark; the glyph sprite then holds only the glyphs of cards without a mark or text (YAML among them).
  A stack card shows the brand's logo as a mark drawn from a free-licensed icon set, or from a
  license the brand itself grants: React (MIT), Angular (CC-BY-4.0) and Android (CC-BY-3.0) come from
  the brand-granted licenses recorded in Simple Icons, Apple, Flutter and Vue from Font Awesome Free
  7.3.1 (brands, CC BY 4.0), Spring, Next.js and Nuxt from Devicon 2.18.0 (MIT; the
  monochrome "plain" drawing, or the single-color "original" where no plain one exists), and .NET
  from the `dotnet/brand` repository at a pinned commit (`logo/dotnet-logo.svg`; recorded as "Brand
  permission", never as CC0: the README grants the CC0 license to the illustrations and lets
  you "use the illustrations and logo to represent .NET in related content, per the .NET Brand
  Guidelines", while the logo stays copyright of the .NET authors; drawn as the square with the
  lettering knocked out, `fillRule: "evenodd"`). Each mark
  records its set, file, version, license and attribution in `BRAND_MARKS`, plus an optional
  `viewBox` for a drawing that is not on the 24 unit grid, and carries the notice "Logos are
  trademarks of their owners, used to identify compatibility." (Font Awesome adds: use brand logos
  only to represent the company, product or service they refer to). A mark is never under a
  non-commercial, share-alike or no-derivatives license, so an NC, SA or ND set is not admissible
  however recognizable the logo; a Simple Icons CC0 entry for a restricted logo is not admissible
  either, since the data license does not clear the brand's own terms. Simple Icons is the source
  only of marks whose brand grants its own license (Angular, Android, React). A brand with no admissible
  drawing in any verified set gets its generic stroke glyph, never a hand-drawn lookalike and no text
  chip (the text chip mechanism is gone). The combined "Vue and Nuxt" card shows the Vue logo. YAML takes its `yaml` file glyph, not a mark. The
  marquee draws Apple, Flutter, Next.js, Spring and YAML from the same Font Awesome and Devicon marks, so no
  mark of a restricted brand rests on a Simple Icons CC0 entry. gettext, XLIFF, INI, YAML and the custom card keep their glyph. A format glyph is the one file
  outline carrying the format's own extension label (`FILE_GLYPH_LABELS` in `stack-icons.tsx`: `.po`, `XLF`,
  `INI`, `YAML`, `JSON`), an SVG `<text>` in `--font-mono`, bold, `currentColor` fill, its width fixed by
  `textLength` so no label leaves the outline; the glyph is drawn at 40px (`FILE_GLYPH_SIZE`) against 28px for the
  rest, so the label stays legible and its thin ink balances the marks. The `custom` card has no label. `stack-cards.test.tsx` pins the mark set in all four locales.
  Third-party logos appear in exactly three places: the GitHub mark
  (`components/landing/github-icon.tsx`), the marquee's brand marks and the stack cards' marks. The
  logo rule for those:
  a mark is inline SVG path data in `lib/brand-marks.ts` (`BRAND_MARKS`, each with its source
  package and version, file, license and attribution), never an `<img>`, a network request or an
  icon package in `package.json`; it is drawn in one `currentColor` fill, never in brand colors,
  with a gradient or a glow; and it is admitted only under a license that allows commercial use
  and changes (no NC, no SA, no ND: the Vue logo in `vuejs/art` is CC BY-NC-SA, so the marquee's vue-i18n item keeps its glyph; the stack cards use the Font Awesome drawing, which is CC BY 4.0). A Simple Icons
  entry being CC0 data does not clear its logo: check the brand's own repository or guidelines first. Every mark is
  listed as an asset in `THIRD_PARTY_NOTICES.md` and on `/licenses` through `ASSET_SOURCES` in
  `lib/third-party-licenses.ts` (run `licenses:sync` after a change), with the source URL, the
  CC BY attribution and change note where the license asks for one, and the sentence "Logos are
  trademarks of their owners, used to identify compatibility." `marquee.test.tsx` fails on a
  sprite symbol without a notice entry, a non-sprite reference or an embedded image, and
  `lib/third-party-licenses.test.ts` on an icon package, a missing entry or an NC or SA license.
  Anything with no admissible mark gets a generic stroke glyph, never a lookalike drawn by hand. The grid is a `nav` named by `labelledBy`, the id of the heading above it
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

The landing moves little, on purpose: the format and provider marquee rows loop until paused, the SDK playground types a source string and decodes its translations in a timer-driven loop
(stopped by any interaction, offscreen, in a hidden tab and under reduced motion), and nothing else
on the page fades in.
There is no scroll-driven motion, no pinning and no parallax and no scroll listener;
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
  (`SectionHead` takes no reveal prop), and the hero, marquee, statement, highlights, SDK
  playground, features, FAQ and closing panel never take a reveal; the marquee
  loop below is its own motion, not reveals. Elements keep their box while hidden, so a reveal never moves layout.
  `reveal-marks.test.tsx` pins that no section file carries a mark and `motion-root.test.tsx` the observer and
  the stylesheet guards.
- **Hero.** The hero is never revealed and the `h1` never moves (it is the largest paint); no
  layout animation runs in it on load;
  `motion-root.test.tsx` fails on any animated `.vk-banner` rule. The locale-file cards are static, server-rendered and `aria-hidden`;
  the install chip's `CommandRow` is the hero's only island, with no timer and no GSAP (`hero.test.tsx` fails on a static GSAP import
  and on any `HeroTracks` or `landing-tracks` reference there). `e2e/hero.spec.ts` pins the cards,
  the install chip and 320px and 375px without a sideways scroll.
- **Marquee.** The one looping motion on the page, a CSS keyframe with no JavaScript animation:
  it runs only in the state described under "Marquee" above, pauses through its button, hover
  and focus inside a row, and is static otherwise (one sideways-scrolling line where motion may
  start, wrapped rows under reduced motion or without JavaScript), so 2.2.2 holds without
  JavaScript.
- **SDK playground.** `playground.tsx` (`#playground`, on the void, a `split` head (heading left,
  lead right) whose `h2` is
  `landing.playground.heading`, rendered on the server as the first child of
  `.vk-playground-layout`, before the `PlaygroundDemo` island and never inside it, so it stays
  visible without JavaScript and after a failed island chunk on a client navigation, which
  `e2e/playground.spec.ts` drives by aborting that chunk) reads `lib/playground/translations.json`
  once through `lib/landing-playground.ts`, which parses it with `lib/playground/schema.ts` on the
  server, so zod never reaches the client. `PLAYGROUND_PICKS` (the ids in `PLAYGROUND_PICK_IDS`)
  are the strings the demo shows and cycles; `sent` is `PLAYGROUND_SENT_STRINGS` (1) and `kept` is
  the rest of the committed strings, never typed. `PLAYGROUND_SNIPPET` (`loadConfig({
  configOverride: defineConfig(...) })` for `gemini` and `next-intl-json`, the model from the JSON
  metadata, then `translate({ config })`, one `targetLocales` entry per line) comes from
  `playgroundSnippet` in `lib/playground-snippet.ts`, a zod-free builder the island shares. The
  server highlights it through `highlightPlaygroundSnippet` (`lib/playground-snippet-highlight.ts`),
  whose Shiki transformer marks each locale line `data-snippet-locale` with `background-color:
  var(--vk-snippet-hot-<code>, transparent)` and moves the line's newline inside it; those lines are
  `display: block` in `.vk-playground-frame`, and every language is always shown. A span transformer
  recolors tokens onto the design tokens (`recolorToken`: keywords `--accent`, strings
  `--v-status-changed`, identifiers and constants `--text-strong`, comments untouched), and
  `.vk-playground-frame` draws a CSS-counter line-number gutter in `--text-muted`.
  The `PlaygroundDemo` island (`playground-demo.tsx`, a plain `island()` fed every string, already
  formatted, as a prop, so it adds no client namespace) is two `.vk-playground-pane` panels
  (`--surface-tile`, `--border-tile`, `--radius-card`, 1.05fr / 0.95fr from 64rem, stacked below).
  The result pane: a head (`en -> de, es, fr, ja`, the phase word `typing`, `running` or `done`,
  and `.vk-playground-pause`), the source line (`SOURCE (EN)`, 22px, a blinking caret drawn as the `::after` of `.vk-playground-live`, so it is no element that moves),
  the picks as `aria-pressed` pill buttons, one `.vk-playground-row` button per language (code,
  name, text, a check once its decode is done) and a status line: a pulse and
  `landing.playground.status.running`, then a shield and the integrity sentence with the counters
  `sent`, `kept` and `placeholders` (`intact/total`, counted from the data by
  `intactPlaceholders`). The code pane is the `CodeFrameShell` (with `CopyControl`) over a
  `translate()` bar with `queued`, `awaiting` and `resolved`. The server renders the default item
  fully settled and `useReducer` starts from that constant, so the first client render equals the
  server HTML. Only effects read `matchMedia`, `IntersectionObserver` and `visibilitychange`: once
  the section is in view, motion is allowed and the tab is shown, `start` holds the settled item
  for `HOLD_MS`, then each pick types (`TYPE_MS` per character), sends, and decodes the four languages
  `STAGGER_MS` apart over `DECODE_MS`, a Latin target scrambled with lowercase letters and a CJK one
  with its own characters (`scramblePool`), the placeholders never scrambled. The cycle advances
  through `PLAYGROUND_PICKS` and wraps. Any pick, language row or the pause control stops it for
  good (`touched`); a picked string plays once and settles; a row marks itself, tints its code
  line (the island sets `--vk-snippet-hot-<code>: var(--vk-hot-fill)` on its root) and is announced.
  The ticker is a 70ms interval that runs only while the scene is animating, in view and visible. Under
  `prefers-reduced-motion: reduce` it never starts (final state, no caret, no pause control, hidden
  with CSS), and a pick shows its translations at once. Every changing text sits in a
  `.vk-playground-reserve` grid with an invisible `.vk-playground-ghost` of every possible value
  (every pick, every translation, every status sentence, counters, phase and run words), so the
  height and width never move. The animated text is `aria-hidden`; each row holds the real
  translation in an `sr-only` span with its own `lang`, and one polite `sr-only` live region is empty
  until a visitor picks a string (all four languages) or a row (that language). The label
  `landing.playground.label` and the provider, model and generation date (`dl.vk-playground-meta`,
  from the JSON metadata) follow the panes. Without JavaScript (`scripting: none`) the result pane
  is `display: none` and `.vk-playground-static`, a captioned table of every string and language in
  a `ScrollBlock`, shows instead. Links to `/docs/sdk-quickstart`, `/docs/sdk` and
  `/docs/providers` close the section. `playground-cycle.test.ts` pins the state machine and
  `e2e/playground.spec.ts` the browser behaviour.
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
- **Bracketed labels, never numbered.** Most landing sections open with their `h2`. Only the
  statement, the features and the closing panel set a `.vk-eyebrow` label above it (`{ LABEL }`,
  the braces drawn in CSS with empty alt text); no section carries an index or a counter, and
  `reveal-marks.test.tsx` fails on a CSS counter or a numbered section list.
- **Budget.** Layout shift 0 over a full scroll at 390, 1440 and a 844 by 390 landscape phone; no
  scroll listener; at most one reveal chain per section, and only on a demo artifact (the hero
  the marquee loop is not a reveal); no entrance over 16px or 600ms.

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
  every request that starts before the observed largest paint: island chunks wait for
  `afterFirstContentfulPaint`. Links never prefetch on their own: they go
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
- Content only needed after an interaction is loaded with a dynamic `import()` on hover, focus,
  or click. The AI setup prompt is not: it is short, and its text ships in the page, in the
  `PromptCopyButton` preview.

## Fumadocs UI strings

Fumadocs' own chrome (search, "On this page", page actions, sidebar aria-labels, pagination) is
translated in `lib/ui-translations.ts`, added to `translations` in `lib/root-provider-options.ts`. The
object is typed against `fumadocs-ui/i18n`'s `Translations`, and `lib/ui-translations.test.ts`
fails when a Fumadocs upgrade adds a key that de, es or fr lacks.

## One header for both surfaces

The header search is a centered pill (`.vk-header-search`: `--radius-full`, `--surface-card`, a
`--border-default` border that turns `--border-accent` on hover, fixed-size `kbd` hints). The
search dialog is Fumadocs' own, restyled on tokens: a `--surface-raised` panel, `--radius-md` rows
and the active row filled with `--accent-fill`; `--color-fd-overlay` is `--scrim`.

Below 48rem the docs header carries a second row, the breadcrumb bar (`DocsCrumbBar`,
`.vk-crumb-bar`, `--crumb-height`, passed to `SiteHeaderFrame` as `subBar`): the Fumadocs sidebar
trigger at its start and the trail (tab, group, page) beside it. The trigger opens
`#nd-sidebar-mobile` as a sheet, full width under the header and the bar (`--header-height` plus
`--crumb-height`), fading in over `--duration-base` unless motion is reduced. While it is open the
header takes `z-index: 50` (`data-sheet-open`) so the trigger closes it, and otherwise stays below
the search dialog. `useDrawerContainment` (`components/use-drawer-containment.ts`) makes everything
outside the header trigger and the sheet `inert`, moves focus into the sheet, wraps Tab and
Shift+Tab between the trigger and the sheet, and returns focus to the trigger on close
(`useDrawerEscape` closes it on Escape). The header's own menu button is gone on docs pages: the
tabs, language and theme live in the sheet. The sidebar collapse button is a borderless ghost icon
at the end of the header; the landing header reserves a slot of the same width, so the links sit
at one position on both surfaces.

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
legal pages) is the same frame fed the same links: `lib/header-links.tsx` (`headerLinks`) builds
Docs, Reference and the GitHub icon for `lib/layout.shared.tsx` and for `homeNavValue`
(`lib/locale-home-layout.tsx`), so the two headers cannot drift. `HomeSiteHeader` passes them as
`navItems` and gives the frame the Fumadocs `FullSearchTrigger` and `SearchTrigger` as
`slots.searchTrigger`; the search context comes from the `RootProvider` that `LandingProviders`
mounts, so the trigger and Cmd/Ctrl+K open the same dialog as on the docs. There is no call to
action, no version pill, no star count and no Features or Changelog link. Its labels reach the
client through `HomeNavProvider` (`landing.topNav.label`, `menu.*`, `landing.openSource.newTab`),
so the header adds no client message namespace. Under 768px the search shows as the 44px icon
button and the links move into `HomeMobileMenu`, a shadcn `Sheet` (focus trap, Escape, focus back
to the trigger, close button named by `landing.topNav.menu.close`) titled
`landing.topNav.menu.title`, whose `MenuLinks` list the same items (GitHub with a new-tab hint)
and whose footer holds the language select and theme toggle. `StaticSiteHeader` (the global 404)
renders the same links as plain anchors with a `details` menu.
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
header (landing and legal pages) uses that same row (`HeaderRow`: `--fd-layout-width`, 1rem then
1.5rem padding from 768px), as does `.vk-legal-footer-nav`. The landing's
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

- **Display headlines.** The docs home header sets a solid `--text-strong` headline; the landing
  hero (`hero.tsx`) sets the same size with `--gradient-headline` clipped to its text (see
  "Typography"). The hero sits on the void page, left-aligned, over its `aria-hidden`
  `.vk-banner-halo` (one soft halo under the cards on a phone, two halos and the faded grid from
  64rem, all sized in rem so a tall narrow column never stretches them into a strip behind the
  text): `.vk-banner-grid` is one column (copy, then cards), and from
  64rem an asymmetric 6fr / 5fr split, vertically centered, the copy (`.vk-banner-copy`: the `h1` `.vk-banner-title` (at most eight words, one sentence),
  the `.vk-banner-lead` subline (at most 25 words), `.vk-banner-ctas` with Get started
  (`/docs/quickstart`) beside the `.vk-banner-install` chip, a borderless `--surface-card` `CommandRow` (`wrap="narrow"`)
  of `HERO_INSTALL_COMMAND`) in the wider column beside the demo (`.vk-banner-demo`: the
  `.vk-banner-files` stack, three `.vk-banner-file` cards of `--radius-lg` on `--surface-tile`; the
  front `de` card takes `--border-accent`, `--surface-raised` and a `--halo-strong` shadow, the `fr`
  and `es` cards behind it are tilted, opaque and `--text-faint` with no opacity (a faded card shows
  the one behind through it, and faded text fails the axe contrast scan even under `aria-hidden`),
  and show from 64rem only). There is no trust line, no Node.js line, no facts block and no
  prompt in the hero. `hero.test.tsx` pins the
  order, the install chip, the absent trust line and facts, the halo and the cards, and `e2e/hero.spec.ts` the
  columns and the fold. The home social image (`HomeOgFrame` in `lib/og-image.tsx`, served
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
  Every docs page carries an eyebrow (`.vk-page-eyebrow`, a `.vk-label` over the title row): the
  tab and the sidebar group, as `Reference / CLI` (just the tab for a page directly under it):
  `PageEyebrow` (`components/page-eyebrow.tsx`, a server component passed as the `DocsPage`
  `breadcrumb.component`) over `eyebrowTrail` in `lib/docs-breadcrumb.ts`, the one helper the
  breadcrumb bar and the JSON-LD trail share; the docs home header keeps its own. No landing
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
  the prev/next footer is `.vk-docs-footer` (the `footer.component` of `DocsPage`). Style
  those classes, not Fumadocs' utility classes.
- **Flat panels**: `rounded-xl border border-(--border-default)` on `var(--surface-bg)`, with
  `--border-accent` as the border on hover.
  `DocsHomePaths` and `DocsHomeFeatures` follow it; no docs home card is filled. The prev/next
  footer is not a card: see "Page header and footer".
- **Void code surfaces**: `figure.shiki` sits on `var(--v-void)` inside a `--border-default`
  border, like `CommandBox`. On an untitled fence the copy button sits on a void
  backing, and a one-line fence ends its scroll area before the button, so a long command never
  runs under it. A `// [!code highlight]` line gets the landing's
  highlight treatment: 22 percent `--v-purple` tint plus a 3px `--v-purple` bar on the start
  edge. A fence with a `title` keeps Fumadocs' bar above the code: the filename in mono
  `--text-xs` `--text-muted` on the start side, the copy button at the end, one `--border-default`
  rule under it and no language icon; an untitled fence stays bare. `DocsHomeFeatures` cards carry the same 3px `--v-purple` start bar. Code blocks use
  Fumadocs' dual Shiki themes, which follow the `dark` / `light` class; comment tokens are raised to
  AA in both themes, and the light theme's orange property token (`#E36209`) to `#8f3600` and its red
  keyword token (`#D73A49`) to `#a1161f`, which
  `lib/theme.test.ts` holds at 4.5:1 on every code surface, under the highlighted-line tint and
  under Fumadocs' diff tints.
- **Callouts**: a 3px start bar, a tint of 9 percent of `--callout-color` over `--surface-bg` and a
  bold lead word in the same color; the icon is dropped. `--callout-color` is derived by Fumadocs
  from `--color-fd-<type>`. The lead word is the author's `title`, or, for an untitled `info` or
  `warn` callout, `docs.callout.note` or `docs.callout.warning` (`DocsCallout`,
  `components/docs-callout.tsx`). The override block in `global.css` pins `--color-fd-info` and
  `--color-fd-success` to the glow and `--color-fd-warning` to `--v-status-changed` (amber), so
  an info and a warn callout stay distinguishable now that the brand has one hue. The lead word is
  `.vk-callout-title` and its body `.vk-callout-body`; style only those, never `.vk-callout > p`, since a
  bare `CalloutContainer` (the privacy objection) holds a heading and plain paragraphs. A callout is capped at the prose measure like the text around it.
- **Locale notice**: every translated page opens with the machine-translated info callout, above
  the page header, rendered through `DocsCallout`. When
  the English page was committed after its translation, the same callout turns into a warn
  callout titled from `docs.outdatedTranslation`, with the English link kept. The comparison reads
  `lib/translation-freshness.generated.json`, which `scripts/sync-translation-freshness.mjs`
  writes from the git history of `content/docs` before dev, build, typecheck and test. Without a
  full history (a shallow clone, or the Docker build, whose context excludes `.git`) it keeps a
  snapshot written earlier or writes an empty one, and an empty one shows no outdated notice.
- **Pills**: `.vk-pill` is the badge shape for everything except the "new" marker: an outline
  pill in `--accent` text with the glow-tinted border, mono, `--text-xs`, no fill. The sidebar NEW badge
  (`components/new-badge.tsx`; the landing footer carries none, `footer.test.tsx` pins it) is the depth pill (see "Depth pill") and is hidden in the
  phone breadcrumb bar, which reads the sidebar's tree (the eyebrow and the prev/next footer take plain
  names and never show it); the
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
- **Depth pill**: the one filled pill, and the one marker for everything "new", because the product
  owner asked for a badge that reads as new at a glance (modelled on the `app-new-badge` of
  docs.nestjs.com). `NewPill` (`components/new-pill.tsx`, `.vk-pill-new`, taking an optional
  `className`) is a 5px-radius chip, 2px by 6px, on a 90deg gradient from `--pill-new-start`
  (`--accent-fill`) to `--pill-new-end` (a darker violet, its own value in each theme; in the light
  theme `hsl(254 70% 26%)`, with a 1px `--pill-new-rim` outer hairline of the end stop at 45
  percent, so the light chip never reads flat; `components/new-pill.test.tsx` pins both), in
  `--pill-new-fg` (white) 10.5px, weight 700, uppercase, 0.04em tracking. `lib/theme.test.ts` holds
  `--pill-new-fg` at 4.5:1 on both stops in both themes (5.4:1 on the dark start stop, the
  weakest). Its depth comes from four layers: a `::before` glow (`--pill-new-glow`, the start stop
  at 55 percent), a static `::after` rim (a 1px masked border, white at 60 percent on the 165deg
  diagonal ends), an `aria-hidden` `.vk-pill-new-ring` (a 1px masked rim over a rotating conic
  highlight) and an `aria-hidden` `.vk-pill-new-shimmer` (a 40 percent skewed band that sweeps once
  in the first 32 percent of the loop). The glow, ring and shimmer each run 4.5s three times and
  stop: every animation is finite. Under `prefers-reduced-motion: reduce` none of them runs and the
  shimmer is `display: none`; under `forced-colors` the layers drop and the chip gets a `CanvasText`
  border. `NewBadge` (`components/new-badge.tsx`) is the sidebar's NEW marker: the same pill with
  `ms-1.5`, hidden in `.vk-crumbs`. The hero carries no announcement or pill. The pill appears
  in the marquee's upcoming-release provider badge (which always carries its visible version)
  and the sidebar NEW marker. A version, a dated feature or a quickstart tag stays the `.vk-pill` outline;
  never put the pill in a table or a heading.
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
- **Table of contents**: the `normal` TOC style, skinned as a rail: `#nd-toc` and the phone popover
  hide Fumadocs' curved SVG track and its thumb and draw one straight 1px `--border-default` rail
  on the list, with the heading level indent kept from Fumadocs' inline padding, a mono
  `.vk-label` "On this page" title, and the active entry in `--text-strong` at weight 500 with a
  1px `--accent` marker over the rail; `tableOfContent={{ single: true }}` keeps one entry active. TOC entries never break inside a word (`overflow-wrap: normal` on `#nd-toc`
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
- **Tables**: a quick-reference table with no frame: the scroll wrapper (`div:has(> table)`) has no
  border, radius or fill of its own beyond the sideways-scroll fade, the header row is plain
  `--text-strong` 13px semibold over one `--text-faint` rule, every body row ends in a
  `--border-default` hairline, and the first cell's inline code is mono `--accent` at weight 500
  (the flag, key or code the row is about). The generated `.vk-type-table` uses the same hairline treatment, with no frame or fill. `#nd-page .prose` is the
  `vk-article` size container, and every table rule keys on its width, never on the viewport. The wrapper scrolls sideways with
  the end-edge fade `.vk-scroll-fade` uses, and the header is not sticky. Cells are compact (0.625rem
  block, 0.75rem inline end, top-aligned). A table of three or more columns gets `.vk-table-stack` and a `data-label` per body
  cell from `lib/stacked-tables.ts` at build time, unless every body row holds at most
  `COMPACT_ROW_MAX_CHARACTERS` of text (the error code index), which stays a table at every width.
  Only while the article column is under 30rem (a phone) does a stacked table's row become a
  hairline block under a faint top rule: the first cell as its title, every other cell under its
  column name. A table of
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
  The shim adds `.vk-type-table` (no frame or fill, the header row plain strong text over one
  `--text-faint` rule, like a Markdown table's)
  and a unique `id` per table, and gives the `.md` output a plain Markdown table. Descriptions are
  the published English JSDoc in every locale; the framing prose around them stays translated.
- **Links**: `--accent` text with a 40 percent glow underline that turns solid on hover, the
  same `LINK_CLASS` the landing rows use. Heading anchors are explicitly exempt so a
  section title never renders as a link. `.vk-prose-link` shares that exact rule in
  `app/global.css`, for a link that must look like a prose link inside a `not-prose` block
  (the contact form's privacy notice); use it rather than restating the declarations.
- **Page header and footer**: a non-home docs page is the eyebrow, then `.vk-page-head`: a row of
  the title (`--text-h3`, weight 500) with the page actions at its end (wrapping under it on a
  phone), then the lead (`.vk-page-lead`, 17px `--text-muted`). The reading column is
  `--width-page` (46rem), centered; prose stays at `--width-measure`. The prev/next footer
  (`PageNeighbours`, `components/page-neighbours.tsx`, `.vk-docs-footer`) is a `nav` named by
  `docs.pagination.label`: a top hairline, then a `.vk-label` direction label (Fumadocs' own
  "Previous Page" and "Next Page", already localized in `lib/ui-translations.ts`, through
  `lib/docs-pagination.ts`) over the page name, with no cards and no description; the small print under it is the
  legal footer.
- **Legal pages**: `/imprint`, `/privacy` and `/licenses` (the `(legal)` route group, under the home
  header and `LegalFooter`) use `LegalPage` and `LegalPageHead` (`components/legal-page.tsx`): an
  `article.vk-legal-page.prose` at `--width-page`, opened by the docs page header (`.vk-page-head`: a
  `.vk-page-eyebrow` reading the footer's `landing.footer.cols.legal.title`, the `h1` and, where the page
  has an intro, `.vk-page-lead`). The h1, lead, `h2` to `h4` rhythm and prose measure rules that docs pages
  key on `#nd-page` carry a `.vk-legal-page` twin in the same selector lists, so the two surfaces cannot
  drift (`app/[lang]/(legal)/legal-layout.test.ts`); the license list (`.vk-license-list`) runs the full
  column. `/licenses` adds, under a summary line, `nav.vk-legal-jump`, named by the docs "On this page" label
  (`onThisPageLabel`), with one pill link per `h2` (the assets, then each license group through
  `licenseGroupId`; each link is `.vk-legal-jump-link`, the pill form of the outline button: a
  `--text-faint` boundary and `--radius-full`, where `buttonClasses` would give the 10px radius and
  semibold weight; the count is `aria-hidden` and an `sr-only` ", N packages" names it); the
  header is `not-prose`, so Typography adds no margin or line height to the title, eyebrow and lead,
  and a page with only a date (privacy) passes it as the lead; the eyebrow and the jump navigation are chrome, so the Markdown twin carries
  neither. The contact page keeps the plain `prose` article.
- **Page actions**: every non-home docs page renders Fumadocs' `MarkdownCopyButton` and
  `ViewOptionsPopover` beside the title (`.vk-page-actions`: `--text-faint` bordered buttons, 32px
  tall from 48rem and 44px below), fed by `app/[lang]/docs.mdx/[[...slug]]/route.ts`,
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
grep -n '\--surface-\|--text-\|--accent\|--radius-\|--shadow-\|--scrim\|--width-page\|--header-height\|--crumb-height' apps/docs/app/global.css
grep -n 'vk-page-\|vk-crumb\|vk-docs-footer\|vk-callout\|vk-header-search\|nd-toc\|nd-sidebar' apps/docs/app/global.css
```

If the file and this skill disagree, the file wins, and this skill needs updating in the
same change.
