---
name: docs-ui
description: 'Visual and component conventions for the verbatra docs site (apps/docs), a Fumadocs 16 / Next.js 16 / Tailwind 4 app. Use when adding or reshaping UI in apps/docs: landing sections, MDX-facing components, design tokens (packages/ui/src/tokens.css, imported by app/global.css), or anything touching the Fumadocs theme layer. Also use before accepting generic design advice that does not account for Fumadocs.'
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
and codified in `packages/ui/src/tokens.css` and `apps/docs/app/global.css`. Two layers stack:
the Fumadocs UI theme, then a verbatra layer that overrides it. Generic frontend advice that assumes a
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

- `fumadocs-ui` and `fumadocs-core` 16.18.4, `next` 16.4.6, `tailwindcss` 4.3.5, `next-intl` 4.14.10.
  `motion` is no direct dependency (Fumadocs still brings its own): no landing code imports it,
  and nothing animates through a React motion provider or an `m.*` element. Animate `opacity` and
  `transform` only (one paint-only exception, the cross-highlight of the highlights section, below), and keep layout shift at 0.
  Scroll-driven motion beyond the two edge-fade rules (`scroll(self inline)` masks on `.vk-edge-fade` and `.vk-home-tabs-scroller`, behind
  `@supports (animation-timeline: scroll())`, the only timelines outside `no-preference`) is allowed in exactly one place, the gate section's
  pinned stage, as a native CSS scroll timeline (`animation-timeline: view()`) behind `@supports`, `prefers-reduced-motion: no-preference` and the
  stage media query; `motion-root.test.tsx` lists every `animation-timeline` declaration against that allowlist. There is still no scroll listener and no library.
  Server sections and the reveals stay CSS keyframes and transitions in `app/global.css`, each with
  a `prefers-reduced-motion` opt-out.
  No animation library is a dependency: the lock-file demo's autoplay is one CSS keyframe per step
  (`vk-lock-progress`) whose `animationend` moves the frame (`lock-demo-motion.tsx`).
- Tailwind 4 uses CSS-first configuration. There is no `tailwind.config.js`. Tokens are
  CSS custom properties in `packages/ui/src/tokens.css` and `app/global.css`, not a JS config
  object.
- `app/global.css` opens with these imports in this order, and the order matters:

  ```css
  @import "tailwindcss";
  @import "fumadocs-ui/css/purple.css";
  @import "fumadocs-ui/css/preset.css";
  @import "tw-animate-css";
  @import "@verbatra/ui/tokens.css";
  ```

  The ui import follows `preset.css` so its unlayered token rules come after the Fumadocs preset
  in source order and win equal-specificity ties; the `--color-fd-*` aliases in `global.css`
  then override Fumadocs' own values the same way.

  `tw-animate-css` supplies the enter and exit utilities the shadcn primitives use
  (`animate-in`, `fade-in-0`); a `prefers-reduced-motion: reduce` rule
  on `[data-slot][data-state]` turns them off.

- `@source "../node_modules/fumadocs-ui/dist/**/*.js";` makes Tailwind scan the
  Fumadocs bundle. Removing it silently drops classes Fumadocs emits at runtime.
- Two themes, dark by default. The shared palettes live in `packages/ui/src/tokens.css` under
  `.dark, [data-theme="dark"]` and `.light, [data-theme="light"]`. `global.css` keeps the
  dark-default class contract on `<html>` (`:root` sets `color-scheme: dark`, `html.light` sets
  `color-scheme: light`), the `--color-fd-*` docs aliases, and the marketing tokens. `html.light`
  overrides only the docs-only tokens: `--color-fd-secondary` / `--color-fd-secondary-foreground`,
  `--surface-tile`, `--border-tile`, `--halo-strong` and `--halo-soft`. Everything
  else follows from the palette class. The theme is not a React context: Fumadocs' `RootProvider` runs with
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
  `aria-pressed` (pressed while the light theme shows), named by `docs.theme.light`, with a `title` that names the switch a click makes (`docs.theme.switchToLight` while dark, `docs.theme.switchToDark` while light), and it draws
  both a moon and a sun icon, leaving the choice to the stylesheet (`.vk-theme-icon-light` is
  hidden unless `html.light`), so nothing flashes before hydration; `aria-pressed` reads `false`
  and the `title` reads the dark-mode wording on the server, and both settle after hydration.

## Token layers: always use the outermost one

The token definitions live in the shared package `packages/ui/src/tokens.css` (`@verbatra/ui`),
not in `apps/docs/app/global.css`. Palettes sit under `.dark, [data-theme="dark"]` and
`.light, [data-theme="light"]`; theme-invariant scales (type, radius, motion, layout, fonts) sit
under `:root`. `apps/docs/app/global.css` imports the file right after the Fumadocs and Tailwind
imports, keeps its own dark default and `html.light` for the marketing and Fumadocs-compat tokens,
and aliases the Fumadocs surface, text, border, primary, accent and ring tokens onto semantic
tokens, the callout hues (info, warning, error, success) onto `--v-*` primitives, and the
overlay onto `--scrim`. Studio consumes the same file. It also holds the status tokens
(`--status-*`, `--diff-*`, with `-soft` tints) that only Studio uses today; docs ignores them.
Change a shared token in `packages/ui/src/tokens.css`, never as a copy in a consuming app.

Three layers exist. Write against the third.

1. **Brand primitives.** One brand hue, violet 258. `--v-glow` is the accent (dark
   `hsl(258 60% 74%)`, light `hsl(258 55% 44%)`) and `--v-purple` its fill and bar shade (dark
   `hsl(258 52% 56%)`, light `hsl(258 55% 44%)`); the old magenta purple and pink are gone. Do not
   introduce a second brand hue. Beside them sit a few tints with one job each, never a general
   palette: `--v-status-new` (the accent) /
   `--v-status-changed` (amber, dark `hsl(38 85% 62%)`, light `hsl(30 90% 30%)`, also Fumadocs'
   warning callout color) / `--v-status-unchanged`: the `tone` colors of
   the `Badge` in `@verbatra/ui` and nothing on the landing (the exit code in the CI tile is
   `--text-danger`). There is no pink (`lib/landing-tokens.test.ts` fails if `--v-pink`
   or `--v-violet` comes back). The landing's light effects are tokens too, defined for both
   themes in `:root` and `html.light`: `--gradient-headline` (strong text into the accent, painted
   only on the hero `h1`), `--halo-strong` and `--halo-soft` (the accent fill and accent mixed into
   transparency, weaker in the light theme) for every glow, `--grid-line` for the faded grid behind the hero and the closer. Reach for one only in the role it already has.
2. **Fumadocs overrides.** `--color-fd-background`, `--color-fd-card`, `--color-fd-popover`,
   `--color-fd-muted`, `--color-fd-border`, `--color-fd-foreground`,
   `--color-fd-muted-foreground`, `--color-fd-primary`, `--color-fd-primary-foreground`,
   `--color-fd-accent`, `--color-fd-accent-foreground`, `--color-fd-ring`,
   `--color-fd-popover-foreground`, `--color-fd-overlay`, plus the callout
   hues `--color-fd-info`, `--color-fd-warning`, `--color-fd-error`, `--color-fd-success`, and in
   the light theme `--color-fd-secondary` / `--color-fd-secondary-foreground`.
   The surface, text, border, primary, accent, ring and popover-foreground ones are aliases of the
   semantic layer in `packages/ui/src/tokens.css` (`var(--surface-card)` and so on),
   `--color-fd-overlay` aliases `--scrim`, the callout hues alias `--v-*` primitives, and only `--color-fd-secondary` / `-foreground` carry values under `html.light`.
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
  radii sit above it and nowhere else: `--radius-card` (20px) for the feature
  cards of the stacked deck and the FAQ items, and `--radius-panel` (28px) for the closing panel. The hero itself sits on the page, in no
  card.
- Shadows: `--shadow-panel` (a neutral lift) and `--shadow-sm`. Two, not a ramp, each
  lighter in the light theme, and neither tinted (`lib/theme.test.ts` fails on a hue in either
  shadow). Violet light comes only from the halo tokens above, in the places that name them: the
  hero halo and the shadow under its front locale-file card, the CI tile, the closing
  panel, the staged lock-demo card (`.vk-lock-stage .vk-lock-card`, only while the stage is set), the pinned gate card
  (`.vk-gate-card`, only while the gate stage is pinned, where one gate card is visible at a time) and the
  glow of the primary `Button`.
- Layout: `--gutter` (40px from 768px up) via `.vk-gutter`, `--width-wide` via `.vk-w-wide`.
  `--cta-height` (56px) is the minimum height of `.vk-prompt-trigger` on `PromptCopyButton`;
  `--width-prompt-pop` (30rem, capped by `100cqw` of its container, never by `100vw`, which counts
  the scrollbar) is the width of the `.vk-prompt-pop` preview. `--head-gap` (2.5rem, 3.5rem from 64rem) is the one space
  between a section head and its content: the
  highlights panes and the feature deck (`margin-top: var(--head-gap)` on `.vk-hl` and
  `.vk-deck`), the row gap
  of `.vk-section-aside` (the FAQ) and the gap above the lock-file demo's stage (`.vk-lock-stage`); `section-bands.test.tsx` fails on an ad hoc
  `mt-10` or `lg:mt-14` there. `.vk-grid-12` is the landing grid: one column under 64rem,
  then `--grid-columns` (12) columns with a `--grid-gap` (24px) gap, where each child spans
  `--grid-span` columns (the full row when unset). `SectionHead` takes `layout`: `split` (the default, a
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
  64rem: the FAQ. The head sits in `.vk-section-aside-side` (span 4), the one unit that sticks. Its optional `trailing`
  is a function of a placement and renders twice: `side` inside that unit right after the head
  (shown from 64rem) and `after` as a direct grid child after the content (shown under 64rem), so
  only one copy is ever displayed, focusable or announced (the FAQ's docs link list). `section-bands.test.tsx` renders each section and pins the head shape it
  draws, so the page never goes back to one head shape everywhere.
- Landing surfaces: `--surface-band` (mixed from `--surface-card` and
  `--surface-bg`, never a raw value), the fill of `.vk-band`: `Section` with `band` renders a
  full-width `section.vk-band` (between two `--border-default` hairlines, `--section-md` above it
  and `--section-md` padding inside) around the usual `.vk-gutter` column. Every page/band edge is
  therefore one `--section-md` step of content gap on each side of its hairline: a page section
  opens with `--section-md` (its rhythm) and ends at its content, the band margin sets the space
  above the next hairline, the hero ends 3rem (7.5rem from 768px) under its locale files and CTAs, its halo masked to fade out before the marquee hairline, and the footer opens with
  `--section-sm` under its hairline. The one larger step is `--section-closer` above the
  closing panel. No landing section is a band. Order: hero (page, under its halo), marquee
  (page, `.vk-marquee-section`: `--border-default` hairlines above and below, `2.75rem` above and
  `3rem` below its content, `overflow-x: clip`, rows full-bleed across the viewport), lock-file demo
  (page, `.vk-lock`), gate (page, `.vk-gate`, no band), highlights (page), features (page), FAQ (page), closing panel (page), then the footer on the
  page surface under one hairline (`section-bands.test.tsx` pins the order and the surfaces).
  The page surface is `--surface-page` (dark `--v-void`, light `--color-fd-background`, the 98 percent
  page tone): it paints `.vk-home`, the footer and the sticky FAQ head, so white tiles read as raised in
  the light theme and the footer forms no band in either; `--v-void` itself stays for code surfaces.
  Landing tiles use two landing-scoped tokens, outside the semantic layer above:
  `--surface-tile` (dark `hsl(240 26% 8%)`, light white) and `--border-tile` (dark
  `hsl(240 22% 16%)`, light `--border-default`). They fill and border `.vk-deck-item`,
  `.vk-faq-item`, `.vk-closer`, `.vk-banner-file`,
  `.vk-lock-card`. The hero draws one `aria-hidden` `.vk-banner-halo` as its
  first child: two radial halos and a 64px `--grid-line` grid faded by a radial mask, behind the
  copy and the demo alike (`hero.test.tsx` pins it); there is no dot backdrop.
- Placeholder chip: the lock-file demo's en.json lines and the hero's locale-file cards draw one. `.vk-ph` sets a
  `{name}` or
  `{count}` in `--accent` on a 14 percent `--accent` tint (`color-mix`, radius 5px, 1px 4px padding,
  no border and no token of its own), in the source line and in every language, so the placeholder
  is visibly the same in each. Under `forced-colors` it is `CanvasText` on `Canvas` with a
  `Highlight` outline. The gate section draws the same chip in its source values, and
  `lib/landing-tokens.test.ts` fails if a `--placeholder-*` token comes back.
- Motion: see "Landing motion" below for the system. Its tokens: `--ease-standard` (entrances,
  hovers and state changes), `--duration-fast` (140ms, hover and press),
  `--duration-base` (240ms, state change), `--duration-slow` (560ms, every entrance), `--ease-exit` (the gate's slide-outs), `--reveal-distance` (`--motion-distance-lg`, 16px;
  `--motion-distance-md`, 8px, under 40rem), `--reveal-stagger` (70ms) and
  `--reveal-delay-max` (350ms, the stagger cap), and `--marquee-item-time` (5s: one marquee loop
  lasts that times the row's item count). Only `opacity` and `transform` / `translate`
  animate, with two exceptions: the paint-only cross-highlight of the highlights section and the discrete `pointer-events` of a gate frame (in its keyframes beside `opacity`, never `visibility`).

## Typography

Two families, loaded in `app/[lang]/layout.tsx` through `next/font/google` (latin subset):

| Role | Family | Variable | Mapped to |
|---|---|---|---|
| Body and display | Geist | `--font-geist-sans` | `--font-sans`, `--font-display` |
| Code | Geist Mono | `--font-geist-mono` | `--font-mono` |

`h1` through `h6` are globally bound to `--font-display`, which is Geist like the body; headings
differ by weight, size and tracking, not by family. You do not set a heading font per component.
Adding a third family needs a reason that survives review.

The type scale is a major third (1.25) held in `packages/ui/src/tokens.css`: `--text-display`, `--text-h2`
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
gradient). No landing headline ends with a period (`lib/landing-messages.test.ts`).

## Reuse before you build

- **Primitives:** `components/ui/` holds `badge`, `button`, `command-line`, `copy-announcement`,
  `copy-button`, `copy-control`, `tabs`. Every copy control runs on `useCopyToClipboard` (`lib/`: `idle`, `copied`,
  `failed`, an `attempts` count, `reset`, and `holdFailure` to keep a failure until the next copy)
  and announces through `CopyAnnouncement`, a polite live region whose text node is keyed on
  `attempts`, so a repeated copy is announced again. `CopyButton` shows "Copied" or, in
  `--text-danger`, "Copy failed", and drops its `aria-label` while it does, so the visible status
  is its accessible name; `CommandLine` renders `CopyButton` rather than its own button.
  `CopyButton` is `CopyControl` (`copy-control.tsx`) fed the `landing.install` copy strings; a plain
  `island()` that may not call `useTranslations` renders `CopyControl` with
  those strings passed in as props, never a copy of the button.
  `TabList` moves selection and focus with the arrow keys (wrapping), Home and End; its one
  underline look serves every tab row, and it wires no `id` or `aria-controls`, because no
  landing tab drives a panel of its own.
  `Button` takes `variant: "primary" | "secondary" | "outline" | "ghost"` and
  `size: "sm" | "md" | "lg"`. `Button` and `Badge` are owned by `@verbatra/ui`
  (`packages/ui/src/button.tsx`, `badge.tsx`, with the `.vk-btn*` rules in
  `packages/ui/src/components.css`); `components/ui/button.tsx` is only the link wrapper over
  `buttonClasses()` that renders `IntentPrefetchLink`. Every button carries `.vk-btn` (the transition on `transform`,
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
  `LANDING_SECTIONS` in `lib/landing-sections.ts` (hero, marquee, lockDemo, gate, highlights,
  features, faq, finalCta), which the home page maps
  over and `lib/landing-sections.test.ts` pins; add or move a section there, not by hand in
  `page.tsx`. The files: `hero.tsx` (the `h1` with a gradient second line, the lead (one product, one sentence: the lock file, only changed keys sent, CI failing on drift; the MCP server is not in it), the Get started button, the install chip (a `CommandRow` of `HERO_INSTALL_COMMAND` in `.vk-banner-install`) and last a "Compare with other tools" text link (an `IntentPrefetchLink`, not a `Button`) to the localized `/compare` (`COMPARE_PATH`, no count in the label) in a non-interactive `.vk-banner-compare-row` that supplies the row break, so the anchor (`.vk-banner-compare`) is as wide as its label, flush-left, at least 44px tall, with a low-alpha resting underline and an accent underline on hover; on the right an `aria-hidden`
  `.vk-banner-files` stack of three locale-file cards from `lib/landing-hero-files.ts`: `fr` and
  `es` behind, tilted, each its `heroFileName` and the `heroFilePreview` line, and `de` in front
  with a `landing.banner.keysChanged` badge and `heroFileLines` where the changed keys (the lock-file demo's, `LOCK_DEMO_PLAYGROUND_IDS`) are marked
  `data-changed` and start with `~ `; every value comes from `PLAYGROUND_TRANSLATIONS`, the
  back cards show only from 64rem and where the demo column is at least 28rem wide (a container
  query), so no value line is ever cut with an ellipsis, and every value line wraps at spaces; no trust line, no Node.js requirement line, no tabs and no
  terminal), `lock-demo.tsx` (`#lock-demo`, see "Lock-file demo" below),
  `gate.tsx` (`#gate`, "When the provider gets it wrong, nothing is written", see "Gate" below),
  `highlights.tsx` (`#highlights`, "four surfaces, one answer": a split head aligned to the start whose heading
  is "Ask any surface, get the same answer" (at most three lines at 1440 and at 391 in every locale) and whose lead says every surface reads one lock file and names the language of the dataset
  in words (German, Deutsch, alemán, allemand: no locale code inside prose), with the counts as ICU values (`{stale}`, `{upToDate}`, from `SURFACE_COUNTS`), then `.vk-hl`: a slim `verbatra.lock.json` rail (`.vk-hl-rail`, a lock-demo
  card, at most 110px at 1440, as wide as the pane columns: the head with the check badge and the two stale entries from `lockLines()`, side by side from 40rem, each tagged with the lock state word
  `stale`, `LOCK_STATE_STALE`, in English with `lang="en"` in every locale, the word the CLI prints) over `.vk-hl-panes`, four
  `article.vk-hl-pane` in the order CLI, Studio, SDK, MCP server (one column, two from 40rem, `--grid-gap` from 64rem, a stretched
  row). Each pane is one `.vk-lock-card` (the lock demo's card) whose `.vk-lock-head` holds an `h3.vk-hl-surface` naming the surface (capitalised in every locale) and a mono badge
  (`verbatra check`, `Locales`, `check()`, each `lang="en"`, and for MCP the translated "calls no provider", the lowercase word `provider` written the way the lock demo writes it in that locale), the artifact, and a `.vk-lock-foot.vk-hl-foot` with one `.vk-deck-link` to the
  surface's docs page (`SURFACE_DOCS_PATHS`: `docs/cli/check`, `docs/cli/studio`, `docs/sdk/inspect`, `docs/cli/mcp`); the SDK and MCP feet also carry their setup command
  (`SDK_INSTALL_COMMAND`, `MCP_ADD_COMMAND`, `keepPackageRunsWhole`) with the real `CopyButton` island (the SDK one drops below 40rem). Every artifact is data in
  `lib/highlights-surfaces.ts`, built from the hero fixture: the CLI lines are `HERO_CHECK_OUTPUT` under the command, the SDK pane the `check()` call and
  the first fields of `summary.locales[0]`, the MCP pane `status.check({})` and its response, each with a `...` that stands for the fields it leaves out, and the Studio
  pane a markup rendering of the Locales row in a `figure` whose translated `figcaption` is `sr-only` and whose table is `lang="en"` (coverage 86 percent by the rule of `packages/studio/src/client/coverage.ts`, `12 / 14 keys`, a bar scaled with
  `--vk-hl-fill`, kept at every width: under a 24rem container only the `12 / 14 keys` text drops; no lock or open column). `lib/highlights-surfaces.run.test.ts` runs the real sdk `check()` and executes the displayed SDK call against it,
  compares the CLI lines with `renderCheckHuman`, the MCP response with the real `status.check` tool (and checks the tool is outside the spending set of the tool registry), the
  Studio column labels with `LocalesSection.tsx` in order and `coveragePercent` with the coverage rule; it reads the Studio and CLI sources for those labels and the `check` command, it does not
  run Studio or the MCP transport. Code is `pre` in `lang="en"`; lines marked `collapse` leave under 40rem (`data-fold="drop"`, the SDK import) or under 64rem (`data-fold="narrow"`, the two CLI lines
  around the result), so the SDK and MCP panes are at most 6 lines on a phone and 8 at 1440 and the panes of a row stay within 8px of each other; the artifact is centred in the room a stretched row leaves, so at most 24px separate the last
  content line from the foot at 1440, 768 and 391; `up-to-date` and every hyphenated compound stay whole
  (`keepCompoundsWhole`). Interaction is pane level and CSS only: while any pane is hovered or holds focus (`:hover`, `:focus-within`, matched through
  `.vk-hl:has(...)`, no `tabindex`), every `.vk-hl-stale` field and every marked line lights (a 28 percent `--accent` tint, text `--text-strong`, at least 4.5:1 in both themes; the rail's values and signs at least 6:1 because they turn `--text-strong` too),
  and the stale field is already marked at rest (`--accent` text, dotted underline, radius `--radius-sm`). The tint fades over `--duration-fast` only under `prefers-reduced-motion: no-preference`;
  it is a paint-only change, the one transition on the landing that is neither opacity nor transform, and under `forced-colors` the lit field takes a `Highlight` outline and the coverage bar a `CanvasText` frame with a `Highlight` fill.
  The panes are consumers of `[data-reveal]`: `data-reveal` is the row (0 for CLI and Studio, 1 for SDK and MCP), so the second row starts 70ms later whatever the column count.
  `highlights.test.tsx` pins the markup and the stylesheet, `e2e/highlights.spec.ts` the heights in all four locales, the reflow, the rail on the column grid, the gaps, the cross-highlight, the contrast and the reveal), `features.tsx` (`#features`, a bracketed label, a split
  head aligned to the start and the command deck: `ol.vk-deck` of `LANDING_FEATURES` from `lib/landing-features.ts`, in
  workflow order (extract, types, doctor, watch, handoff, studio), each with its `command` and `docsPath`. Every `li.vk-deck-item`
  holds a `.vk-deck-row` (a radio, `input.vk-deck-radio`, one group, the first checked, `aria-controls` its pane; the `h3` whose
  `label` names the radio; the command in a `code`) and a `.vk-deck-pane`: one artifact card (`.vk-lock-card.vk-deck-card`, the lock demo's card, head,
  badge, code and line classes), a `.vk-deck-result` (the marked output line again), the body and a `.vk-deck-link` to the
  command's docs page whose text is that page's path (`docs/cli/extract`), pinned to the bottom of a text card. The deck has no client code. Below 64rem, or without `:has()`, it is a grid of
  text cards (one column, two from 40rem, three from 64rem): radios, commands and artifact cards are `display: none`; the result line shows only in
  this card grid from 40rem (not on phones, which keeps the phone page inside its length budget, and not in the staged deck). Inside
  `@supports selector(:has(*))` and `@media (min-width: 64rem)` the items become `display: contents` on the landing's twelve
  columns with `--grid-gap`, like the lock-file demo's stage: rows on the first four, every pane in the same cell on the other eight, all but the pane of the checked radio `visibility: hidden`, so the
  section keeps the height of its tallest pane and nothing below it moves. The transparent radio stretches over its row, so the whole row is the native control and takes the base-layer pointer, the
  checked row takes the accent border and bar with no transition (a faded border flashes when the layout crosses 64rem), the
  deck card carries no halo because the body and the link sit right under it, a focused radio outlines its row, and the checked row carries a transparent outline that `forced-colors` paints; arrow keys move through the group because
  they are native radios. The command of every row (`data-reveal` 0, `pointer-events: none` so the row stays one click target) and the artifact card inside every pane (`data-reveal` 1) reveal once as the deck enters, row then card; the pane itself never takes a mark, because it already transitions on a switch. A pane switch (a user action only, never on load) lifts the incoming pane by `--motion-distance-md` (8px, `translate`) beside its opacity fade over `--duration-base`; under reduced motion neither the translate nor the transition runs. Never add autoplay here: the lock-file demo above already moves.
  The artifacts are data in `lib/feature-artifacts.ts`, built from the hero fixture (`HERO_TERMINAL_SOURCE`, the playground file
  pattern) so every count derives from it: `ArtifactLine` is a command, an output line (optionally marked `hit`), or a fold
  (`more` with a count, `moreChecks` without one), and a block is CLI output, a file excerpt, the handoff sheet or the Studio
  shot. `lib/feature-artifacts.run.test.ts` runs the real CLI (`packages/cli/src/run`) for `extract --dry-run`, `types`,
  `doctor`, `translate --dry-run`, `watch` and `export --format csv` on that fixture and fails when a shown line, the declared
  types or a sheet cell differs from what verbatra prints or writes (the watch pane is the output of the real watcher,
  stopped at its waiting line, progress lines included); doctor is verbatim up to its one fold, which may hide only checks that passed. CLI and file text
  carries `lang="en"` on every locale; only the badges, the folds and the empty sheet cell are translated
  (`landing.features.badges`, `more`, `moreChecks`, `emptyCell`). `landing-markdown.ts` writes the same artifacts into `/index.md`.
  The Studio pane shows the `studio-overview` screenshot (`StudioCardShot`, `components/landing/studio-card-shot.tsx`, a
  server component: no client directive, no theme hook, no frame, none of `StudioScreenshot`'s props, which stays the docs frame).
  It renders the dark and the light file as two `img.vk-deck-shot`, each decorative (`alt=""` and `aria-hidden`: the `h3` names the
  feature), lazy, `width` and `height` 2880 by 1280 set, inside a `.vk-deck-shot-frame` that clips the capture's empty side margins and its last line (the image is 128.2% wide and
  offset by 14.1%; recapturing the screenshot means re-measuring both and the frame's aspect ratio), and served from this site through
  `/_next/image` with `CARD_SHOT_SIZES` (a one pixel candidate below 64rem, where the card is not shown). The stylesheet shows
  one: `.vk-deck-shot-light` is `display: none` and `html.light` swaps the pair, from the class the pre-paint script sets, like
  `.vk-theme-icon-light`, so the hidden file is never fetched and a page without JavaScript shows one image), `marquee.tsx`
  (`#marquee`, see "Marquee" below), and the comparison, which lives only on `/compare` (the landing reaches it from the hero link, the last FAQ answer, the FAQ's docs
  links and the footer). `lib/landing-compare.ts` holds its rows, tools and cells. A cell is typed
  (`compareCell(row, tool)`): a verdict (`yes`, `no`, `partial`, `unknown` or `noneFound`, whose mark comes from `verdictMark`: none
  found is the question mark, never a cross), a value (license, pricing, providers, formats and Verbatra's self-hosting: no mark) or not
  applicable (the manual column). Marks are data, never translated text; the words come from one shared vocabulary,
  `landing.compare.verdicts` (Yes, No, Partial, Unknown, None found, n/a), and each cell's copy is `landing.compare.rows.<row>.<tool>`
  with an optional `value` and an optional `note` (the qualifier), cut by `lib/landing-copy.test.ts` at 8 words (10 for eleven listed
  cells), a value at 4, in all four locales. There is no overall score, no rating per tool and no rating wording. Verbatra's providers
  cell is a plain count derived from `MACHINE_PROVIDER_IDS` through `compareCellView` (`lib/compare-cells.ts`), no names. The numbered
  source list (`compareSource(n)`, `cellFootnote`) is kept for `/compare.md` and `llms-full.txt` only; the page shows no footnote
  number, no Sources section and no `#source-n` anchor, and each cell carries one arrow-only link per source URL
  (`a[data-source]`: an inline arrow SVG with `aria-hidden`, an `sr-only` name of tool, criterion and "source", at least 24px, set small and
  `--text-muted`, `scroll-margin-block-start: 6rem` so a backward Tab walk never leaves one under the sticky header row). The first
  arrow of a cell sits in a no-wrap `.vk-compare-unit` with the last word (or hyphen segment) before it, and a verdict mark in one with
  its first word, so an arrow never drops to a line of its own and a two-word verdict wraps after the mark and first word; further
  arrows wrap freely. The qualifier is `--text-muted` and follows the verdict word after a plain space, with no dash. A mark is an inline SVG (`.vk-compare-mark`, `data-mark`): a check in `--accent`, a cross, a half circle and a
  question mark in `--text-muted`, never red, always beside the word, each a different shape so colour is never the only cue, drawn in
  `currentColor` so forced colors keep it. The page opens with the `h1`, one takeaway sentence, one scope sentence, one "where others are
  stronger" line and the "Last checked" date (`COMPARE_LAST_CHECKED`, with one short clause saying what "None found" means, `compare.noneFound`), then a skip
  link past the comparison, so the first comparison row sits within 400px at 1440 and at least two rows fit the first 391 by 844 screen
  and one the first 320 by 640 screen, in all four locales (under 23rem the intro gaps tighten and its secondary lines drop to
  `--text-xs`; `compare.takeaway` and `compare.stronger` stay one line in the 46rem intro). Under the comparison come the two
  next-step links. The layout is one `.vk-compare` container (`container-type: inline-size`) with two views of the same data, chosen by
  its width, never the viewport: from 67.5rem the full eight-column matrix (`table.vk-compare-table`, `table-layout: fixed`, fitted to the
  content width with no sideways scroll at any width from 320 to 2560, a sticky header row under the site header, the Verbatra column marked by
  `.vk-compare-self`: an inset `--accent-fill` start bar and a faint tint, a 3px `CanvasText` start border under `forced-colors`); below
  it Verbatra beside one chosen tool (`.vk-compare-pairs`, one `details.vk-compare-pair` per tool, each row a `dl` entry with the
  Verbatra line over the tool line, the canonical row order for every tool, the pair and the select capped at 44rem and 24rem; a
  tool's detail line, "current CLI and platform" and "no product, no sources", is one `.vk-compare-pair-detail` paragraph at the top
  of its pair, never on a row; under `forced-colors` both lines reserve the 3px start border so they align). Without a live picker
  (no JavaScript, a failed chunk, or before hydration) the pairs are seven collapsed sections, Lingo.dev open, each summary with the
  FAQ's `.vk-faq-mark` plus or minus. The `ComparePicker` island (`compare-picker.tsx`, a plain `island()`) sets
  `data-picker-live` on `.vk-compare` while it is mounted, and only then (under 67.5rem) are the select (`.vk-compare-picker`) shown
  and the unselected pairs and the selected summary hidden, so a picker that never arrives hides nothing. It starts on Lingo.dev, marks
  one pair `data-selected`, opens it and keeps the choice in the URL as `?tool=<id>` (`COMPARE_TOOL_PARAM`, carried through the header
  and footer language switch by `carriedSearch` in `lib/locale-switch.ts`)
  through `history.replaceState`, so it is shareable and survives a reload; the server HTML starts on Lingo.dev. Words never break
  mid-word (`hyphens: manual`, never `hyphens: auto`, `overflow-wrap: normal`), so a long German word in a cell is a wording
  problem, which `e2e/compare-page.spec.ts` checks at 1160, 1200, 1240, 1280 and 1440 in all four locales. The matrix verdict word is 13px (`calc(var(--text-xs) + 1px)`), the qualifier 12px. The article's single grid track is
  `minmax(0,1fr)`. `app/[lang]/(home)/compare/page.tsx` under the home layout renders `compare-page.tsx` (with `compare-table.tsx`:
  `CompareMatrix`, `ComparePairs`, `CompareCellBody`). `/compare.md` (and `Accept: text/markdown` on `/compare`) is
  `lib/compare-markdown.ts` served by `app/[lang]/site.mdx/[page]/route.ts`: it keeps the full table, now with the verdict words, the
  providers named, and the full numbered source list; `MARKDOWN_PAGES` in `lib/markdown-route.ts` lists the
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
  (`.vk-closer-title`, 36px to 72px), one lead sentence (a project that already has locale files, neither step needs an API key) and two
  `CommandRow`s in one `.vk-final-install` (36rem, commands start-aligned, the second `divided`):
  `INIT_COMMAND` (bare `npx @verbatra/cli init`), then `DRY_RUN_COMMAND`, in the quickstart's
  order after the hero's `npm i -D`), then one `ul.vk-closer-proof` of exactly five plain text links,
  in this order: npm provenance (`NPM_CLI`), MIT license (`LICENSE_URL`), "The CLI sends no
  telemetry" (the localized `/docs/data-handling`, the one same-tab link), "{threshold}% coverage
  gate" (`CODECOV_URL`, the number `COVERAGE_THRESHOLD`, which `scripts/sync-version.mjs` reads
  from the thresholds in `packages/config/vitest.base.mjs` into `lib/version.generated.json`, the
  lowest of the four, never typed) and the CI workflow (`CI_WORKFLOW_URL`). The ids, hrefs and
  external flag live in `lib/landing-proof.ts`, shared with the Markdown twin. Each link is a
  `vk-tap vk-footer-link` (muted, no fill, no border, the footer's hover underline) in a centered
  wrapping flex row (`.vk-closer-proof`, `--text-sm`), and the other-host ones open in a new tab with
  the footer's `rel` and `landing.openSource.newTab` announcement; nothing is fetched from those
  hosts, so no badge image and no Scorecard, star or download figure. There is no button and no
  other link in the panel.
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
  then a "Contributing guide" text link to `CONTRIBUTING.md` (`.vk-contribute-guide`, muted, there is
  no open avatar slot); the avatars carry no ring); then `FOOTER_GROUPS`, five named `nav`s on
  `.vk-footer-groups`, deliberately not a row of equal columns: product (`PRIMARY_GROUP`: the docs
  pages and the localized `/compare`) leads as the wide group, its links in
  `--text-strong` at 15px flowing down CSS columns (`columns: 2 9rem`, three from 48rem), and
  for agents (`AGENTS_GROUP`, titled `cols.agents.title`: the localized MCP docs page, `/llms.txt`,
  `/llms-full.txt` and `/.well-known/ai.txt`), packages (every package on npm and the release notes), community (contributor guide, code of
  conduct, security policy) and legal (license, Impressum, privacy, contact, `/licenses`) sit in
  `.vk-footer-secondary` as muted columns: beside product from 80rem on one row of four, narrow and
  content-sized behind a `--border-default` start rule; under it before that, on product's three
  column tracks from 48rem (three equal columns at `--grid-gap`, so each group starts where a
  product column does and the fourth wraps under the first), two columns under 48rem; group titles and the locale label are
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
  questions phrased the way people search (cost, providers, privacy and keys, CI, and last how Verbatra differs from other i18n tools, whose answer links `/compare` beside the aside's "Full comparison" link), each
  answer at most 30 words with a first sentence of at most 25, the heading and lead in the head column, the questions beside it, then a `nav` of docs links that
  follows the list in the DOM, so a phone reads the questions first, and that sits under the head
  from 64rem, each link a 44px target) is a server section: each item is a native
  `details`/`summary`, rendered closed on the server with its question in an `h3` inside the
  summary (`text-wrap: pretty`) and its answer in the HTML (at most 33rem wide), so it opens and
  reads without JavaScript. From 64rem and 42rem of height the head and the docs links are ONE sticky unit
  (`.vk-faq-aside > .vk-section-aside-side`, `position: sticky` at `--vk-landing-offset`, right under the site header, with `--head-gap` of its own
  `--surface-page` padding on top, pulled back by a negative margin, so it starts where it did): the label and the links never scroll
  under the head, so nothing is sliced, and a focused link is already in view. On a shorter window the unit is not sticky, so it can
  never be taller than the screen. The two copies of the links carry their own label ids (`faq-docs-label-side`,
  `faq-docs-label`) and `data-placement`; on a desktop the Tab order is head, links, questions, which is also the visual order, and
  on a phone the questions come first. `e2e/faq.spec.ts` scrolls the section in steps and fails when a label or link is partly covered or
  the gap between head and label changes. The open state swaps the `.vk-faq-mark` plus (a
  `--text-faint` boundary, `--accent` bars) for a filled minus (`--accent-fill`, its bar
  `--accent-fill-fg`) with no transition; under `forced-colors` the bars are `CanvasText` and the
  open mark `Highlight` with a `HighlightText` bar. `faq-keys.tsx` is a null-rendering client helper,
  loaded as the lazy `FaqKeys` island from `islands.tsx`, that adds arrow keys, Home and End between
  the summaries and leaves a modified key to the browser. `faqContent` (same file) builds each item's
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
  a brand mark (`kind: "brand"`), a stroke glyph (`kind: "glyph"`, one of `MARQUEE_GLYPHS`: the
  sliders of INI and the plug of the OpenAI-compatible endpoint, the two entries with no brand at
  all) or a file glyph (`kind: "file"`, `StackIcon` of `stack-icons.tsx` in its own `marquee-file`
  sprite; the type keeps it for a future format with no logo, and no entry uses it today: XLIFF
  draws the OASIS mark). Every other provider and
  format draws its official mark by maintainer decision (2026-11-12: use the logos, the
  maintainer handles brand permission requests himself, no generic glyph on licence grounds):
  Anthropic, Gemini, DeepL, Google Translate, OpenCode, LibreTranslate, i18next and GNU (gettext)
  from Simple Icons 16.35.0, OpenAI from Lobe Icons, Vue, Apple and Flutter from Font Awesome Free,
  Next.js, Spring and YAML from Devicon, Angular and Android from Simple Icons, XLIFF from the OASIS
  symbol on Wikimedia Commons, `.NET` from `dotnet/brand`. Brand marks follow the logo rule under "Reuse before you build" (the stack
  cards paragraph); every one is a `<use>` of the one `BrandMarkSprite`
  (`components/brand-marks.tsx`, prefix `marquee-mark`), drawn in a single fill (its brand colour, see "Brand colour" below, or `currentColor`) at
  `MARQUEE_MARK_SIZE` (22px, `lib/brand-marks.ts`), except the three most detailed marks, which
  `MARQUEE_OPTICAL_SIZE` draws at 24px (.NET, GNU, Google Translate: at 18px they read as blobs on a
  1x display; a mark is never redrawn, so size is the only lever). `marqueeMarkSize` reads both. A glyph (`.vk-marquee-glyph`: a 20px (`MARQUEE_GLYPH_SIZE`) unfilled `currentColor` stroke, 1.8 wide, round caps)
  is never a stand-in for a brand. Mark and
  glyph are `aria-hidden`; an item (`.vk-marquee-item`) is a bare `--text-muted` mark and label in
  `--text-base`, with no box, border or fill, and hovering it lifts its label (and a neutral mark) to
  `--text-strong`, with no glow or scale; a coloured mark keeps its brand colour. The name (`.vk-marquee-name`) is the item's text. A provider that
  `RELEASE_BADGE` dates in the current release line carries the depth pill (`NewPill`, `landing.marquee.new`) and nothing else:
  no version text, visible or hidden. It does not animate. The pause button is `variant="ghost"` with a
  `--radius-full` `--accent` 10 percent tint (18 percent on hover) and no border (a `ButtonText`
  outline under `forced-colors`). No count is typed. Each row is a muted `h3` that names its visible
  list, the list, and an "All providers" or "All formats" link after the moving track, so nothing focusable moves.
  The list sits in `.vk-marquee-viewport`, a `.vk-edge-fade` `role="group"` keyboard stop named by
  the row's `h3`. The server HTML is the static state with one list per row and no copy: once the island has
  mounted and `prefers-reduced-motion: no-preference` matches, `MarqueeMotion` clones each list `MARQUEE_COPIES` (`lib/marquee-copies.ts`) times into its
  track (`aria-hidden`, `inert`, no `aria-labelledby`, holding no link or button, `display: none` until motion runs) and only then sets
  `data-marquee`, so the lists and their copies start the loop in the same frame and stay in step. Under reduced motion no copy
  exists; a change of the preference at runtime adds or removes them, and two frames after the animations start each copy takes the first list's `startTime`, so every list of a row shares one start time (the browser would otherwise start a copy one frame late), and
  new rows from a refresh clone the copies again (the effect depends on `children`), so none goes stale; unmount removes them; two copies keep a row
  edge to edge up to at least 2560px (`e2e/marquee.spec.ts` checks 1440, 1920 and 2560 at five points of the loop).
  Under reduced motion or without JavaScript (`scripting: none`) the pause button is `display: none`
  and the list wraps from 40rem, which never changes; under 40rem the static list is one sideways-scrolling line instead, with an inset 2px focus ring like the other scroll blocks and the same gutter at its end as at its start
  (`flex-wrap: nowrap` in the `width < 40rem` block, the gutter kept, nothing moving), so a phone shows two one-line rows, about
  300px, instead of a 1,000px wrapped block (`e2e/marquee.spec.ts` holds the section under half of an 844px screen, with
  every item reachable by keyboard and by scrolling, in reduced motion and without JavaScript). Where motion may start (`prefers-reduced-motion:
  no-preference` and `scripting: enabled`) the static state already has the moving state's box: the
  pause button holds its row at `visibility: hidden` (so it is neither focusable nor announced) and
  each list is one line that scrolls sideways with no scrollbar, so every item stays reachable by
  keyboard, touch or trackpad, also after a failed island chunk, and the takeover shifts nothing
  (`e2e/marquee.spec.ts` measures the section's height before and after hydration at 375 and 1440
  and sums the layout shift). Only when `MotionRoot` has set `html[data-motion-ready]`, the island
  has hydrated (`data-marquee="running"` or `"paused"` on `.vk-marquee`, never set while motion is reduced) and that media query
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
  focused child, so no ring is faded). The focus ring is drawn inset
  (`outline-offset: -2px`) in one unlayered rule beside the global `:focus-visible`, outside every
  `@supports` block, because a frame clips with `overflow: hidden` and a layered utility loses to
  the global rule.
  `lib/hero-terminal.ts` keeps the recorded `verbatra check` and `verbatra translate` transcript
  (`HERO_TERMINAL_SCRIPT`, English on every locale, like all CLI output on the page) that the home
  social image, the lock-file demo and the highlights panes draw from: one locale (`de`), fourteen source values (`HERO_TERMINAL_SOURCE`), two of them edited (`before` is the old value), so check prints `0 missing, 2 stale, 12 up-to-date` and translate `2 translated, 12 unchanged`, with no token figure because the CLI prints none for a run without reported usage;
  `lib/hero-terminal.run.test.ts` pins the lines to the CLI's renderer and the lock hashes of `lib/lock-demo.ts` to the lock file the CLI writes;
  `MCP_ADD_COMMAND` in `lib/install-commands.ts` is the `claude mcp add` line the highlights'
  MCP pane foot and the markdown twin print, copied from the MCP client guide, and `INIT_COMMAND` and
  `DRY_RUN_COMMAND` (same file) the two commands of the closing panel;
  `lib/landing-hero-files.ts` builds the hero's locale-file cards from the playground data: its
  `HERO_FILE_IDS` list says which lines the front card shows and which are marked changed (the badge
  counts those, equal to the fixture's changed keys), and the preview line is `PLAYGROUND_DEFAULT_ITEM`,
  `CommandRow` (`components/command-row.tsx`: the closing
  section's two commands wrap under 30rem through `wrap="narrow"`, `wrap="always"` wraps a command at every width; elsewhere a `CommandRow` scrolls
  sideways inside `.vk-edge-fade`: a mask, not a painted background, so it stays see-through on any
  surface, and the end fade shows only while the command overflows, driven by a scroll timeline),
  `AiSetupPrompt` (`components/ai-setup-prompt.tsx`: the whole prompt, wrapped, under a `.vk-label`
  caption that shares its row with the prompt's small Copy button; its URL breaks only after a path
  `/`, through `breakUrlsAtSlashes` in `lib/word-breaks.tsx`) and `PromptCopyButton` in the same
  file (the large "Start with a prompt" button with the `.vk-prompt-pop` preview, used only by the
  docs home agent tip). The footer draws no pattern and no watermark. The landing draws exactly
  two, both decoration: the hero halo's faded grid and the closer's same grid; add no other. A new section composes `Section` plus
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
  the same way; the docs home
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
  A stack card shows the brand's official logo as a mark wherever the stack has a brand (maintainer
  decision of 2026-11-12: official logos everywhere, no generic substitute, the maintainer handles
  permission requests): React and Angular and Android from Simple Icons (their brand-granted
  licenses), Apple, Flutter and Vue from Font Awesome Free 7.3.1 (brands), Spring, Next.js and
  Nuxt from Devicon 2.18.0 (MIT; the monochrome "plain" drawing, or the single-color "original"
  where no plain one exists), GNU for gettext (Simple Icons), the OASIS symbol for XLIFF (Wikimedia Commons, `File:Logo_OASIS.svg`, public domain
  with a trademark restriction, the wordmark left out) and YAML (Devicon), all through
  `ICON_BRAND_MARKS` in `stack-cards.tsx` (the card's `icon` `po`, `xliff` or `yaml` resolves to its mark
  without an MDX `mark:`), and .NET
  from the `dotnet/brand` repository at a pinned commit (`logo/dotnet-logo.svg`; recorded as "Brand
  permission", never as CC0: the README grants the CC0 license to the illustrations and lets
  you "use the illustrations and logo to represent .NET in related content, per the .NET Brand
  Guidelines", while the logo stays copyright of the .NET authors; drawn as the square with the
  lettering knocked out, `fillRule: "evenodd"`). Each mark
  records its set, file, version, license and attribution in `BRAND_MARKS`, plus an optional
  `viewBox` for a drawing that is not on the 24 unit grid, and carries the notice "Logos are
  trademarks of their owners, used to identify compatibility." (Font Awesome adds: use brand logos
  only to represent the company, product or service they refer to). Neither the marquee nor the cards hold a mark back for licence
  reasons (see the logo rule below for what each record must state, including the Vue mark's
  CC BY-NC-SA terms, the GNU mark's CC BY-SA 2.0 terms and Simple Icons' CC0 data under the owners' trademarks). Only an entry with no
  brand at all keeps a neutral stroke glyph or labelled file outline (INI, the custom
  card), never a hand-drawn lookalike and no text chip (the text chip mechanism is gone).
  **Brand colour:** a mark is one path in one fill, and that fill is the brand's official hex
  (`color: { hex, source }` on every `BRAND_MARKS` record, the one source for the marquee and the
  cards, taken from Simple Icons' `hex` or the brand's own file). `BrandMark` adds the class
  `vk-brand-<id>`; `app/brand-colors.generated.css` (`lib/brand-colors.ts`, written by
  `scripts/sync-version.mjs`, imported by `global.css`) holds `html.dark .vk-brand-<id>` and
  `html.light .vk-brand-<id>` rules. The official colour is the rule and the neutral text colour the
  exception: a mark keeps its hex on a theme unless it would be close to invisible there, which is
  `MIN_BRAND_CONTRAST` (1.3:1, the contrast of the hex on the weaker of the two `BRAND_SURFACES`, the
  page and card tones). A logotype is exempt from the WCAG non-text contrast criterion, so 3:1 is
  stricter than needed; 1.3 sits in the gap of the data, where the dropped marks stay under 1.2 and
  every kept one reaches 1.4. Today that drops, in the dark theme only, the near-black marks (Anthropic,
  DeepL, OpenAI, OpenCode, Apple, Next.js, Angular), which inherit the surrounding text colour; no mark
  falls back in the light theme. No inline style, no `dark:` variant. `lib/brand-colors.test.ts` pins the data, the rule, the per-theme fallback list and the surfaces
  against the resolved tokens. The combined "Vue and Nuxt" card shows the Vue logo. YAML takes its YAML mark. The
  marquee draws Apple, Flutter, Next.js, Spring and YAML from the same Font Awesome and Devicon marks
  and the rest from Simple Icons or Lobe Icons. A format glyph is the one file
  outline carrying the format's own extension label (`FILE_GLYPH_LABELS` in `stack-icons.tsx`: `.po`, `XLF`,
  `INI`, `YAML`, `JSON`), an SVG `<text>` in `--font-mono`, bold, `currentColor` fill, its width fixed by
  `textLength` so no label leaves the outline; the glyph is drawn at 40px (`FILE_GLYPH_SIZE`) against 28px for the
  rest, so the label stays legible and its thin ink balances the marks. The `custom` card has no label. `stack-cards.test.tsx` pins the mark set in all four locales.
  Third-party logos appear in exactly three places: the GitHub mark
  (`components/landing/github-icon.tsx`), the marquee's brand marks and the stack cards' marks. The
  logo rule for those:
  a mark is inline SVG path data in `lib/brand-marks.ts` (`BRAND_MARKS`, each with its source
  package and version, file, license and attribution), never an `<img>`, a network request or an
  icon package in `package.json`; it is drawn in one fill, the brand colour above or `currentColor`, with no gradient or glow, and never redrawn. Since the maintainer decision of 2026-11-12 a
  logo is not held back for licence reasons: brand permission requests are the maintainer's to
  make, and an entry with no brand at all (INI, the OpenAI-compatible endpoint) keeps a neutral
  glyph. Each record states what is true: Simple Icons marks are CC0 data unless the icon's own `license` field in
  `data/simple-icons.json` says otherwise (Angular CC BY 4.0, Android CC BY 3.0, GNU CC BY-SA 2.0; read
  that field for every new mark), and their logos remain the owners' trademarks; the Vue mark is Font Awesome's CC BY 4.0 drawing of a logo that vuejs/art
  publishes under CC BY-NC-SA 4.0 with extra conditions (open source projects related to Vue.js
  and illustrating a product's Vue.js integration are allowed), and `third-party-licenses.test.ts`
  names it and the share-alike GNU mark as the only restricted marks. Every mark is
  listed as an asset in `THIRD_PARTY_NOTICES.md` and on `/licenses` through `ASSET_SOURCES` in
  `lib/third-party-licenses.ts` (run `licenses:sync` after a change), with the source URL, the
  CC BY attribution and change note where the license asks for one, and the sentence "Logos are
  trademarks of their owners, used to identify compatibility." `marquee.test.tsx` fails on a
  sprite symbol without a notice entry, a non-sprite reference or an embedded image, and
  `lib/third-party-licenses.test.ts` on an icon package, a missing entry or an NC or SA license
  other than the documented Vue one.
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

The landing moves little, on purpose: the format and provider marquee rows loop until paused, the lock-file demo steps through its three frames on a desktop screen with motion allowed (paused offscreen, by its pause button or by choosing a step; static and stacked on phones and under reduced motion), the gate section scrubs its three frames with the scroll while its stage is pinned, and the artifacts of the lower third (the highlights panes, the gate's three moving elements, the deck's commands and cards, the FAQ items, the closing commands and proof row, and the lock demo's cards where it does not autoplay) fade in once as they enter (see Reveals); nothing else
on the page fades in.

The policy, in one place:

- **Allowed.** `opacity` and `transform` / `translate` (and, in the gate frame keyframes only, the discrete `pointer-events` that keeps a frame that is not current from taking the pointer; never `visibility`), a scroll timeline that is native CSS
  (`animation-timeline: view()`) inside `@supports` and `prefers-reduced-motion: no-preference`, more than one reveal chain in a section, a sticky stage in exactly one section.
- **Still forbidden.** A scroll listener, an animation library, `motion` outside client islands (see "The stack"), heading, lead and prose fade-ups, parallax, a second autoplay, an animation of a layout
  property, motion in the first viewport, counters and typing effects, and text below 4.5:1 contrast in any state a reader holds: every hold and every static state meets it, and only the slide between two gate states (about 11svh of scroll each) passes through frames in mid-slide.
- **The single sticky stage.** The page has one: the gate's, from 64rem wide and 42rem tall (`.vk-gate-pin`). The lock demo's stage is not sticky and the FAQ's sticky head is a different thing (a head, not a stage).
- **Halos.** The hero halo and the shadow under its front card, the CI tile, the closing panel, the staged lock-demo card, the pinned gate card and the primary `Button` glow, and at most one haloed card per section.
- **Reduced motion, no JavaScript and `scripting: none`.** Stacked end states, exactly one state per value in the DOM, nothing hidden, no sticky stage.

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
  `n * --reveal-stagger`, capped at `--reveal-delay-max`. The consumers are artifacts only: the highlights panes (`n` is their row, not their index), the one moving element of each gate frame (`n` 0), the lock demo's three cards below 64rem
  (`n` 0 each; from 64rem the staged demo autoplays and `html[data-motion-ready] .vk-lock .vk-lock-card[data-reveal]` keeps them shown), the deck's row commands (0) and pane cards (1), the FAQ items as one chain (`n` their index, capped at 5) and the closing panel's two commands (0, 1) and its proof row (2). No section heading, lead or prose paragraph reveals
  (`SectionHead` takes no reveal prop), and the hero and the marquee never take a reveal and the footer none; the marquee
  loop below is its own motion, not reveals. Elements keep their box while hidden, so a reveal never moves layout.
  `reveal-marks.test.tsx` pins which sections may carry a mark and that no heading or paragraph does, each component test the marks of its section, `e2e/reveals.spec.ts` the hidden start within 16px, the 560ms entrance, the stagger cap, layout shift 0, the staged demo and the reduced-motion and no-JavaScript states, and `motion-root.test.tsx` the observer and
  the stylesheet guards.
- **Hero.** The hero is never revealed and the `h1` never moves (it is the largest paint); no
  layout animation runs in it on load;
  `motion-root.test.tsx` fails on any animated `.vk-banner` rule. The locale-file cards are static, server-rendered and `aria-hidden`;
  the install chip's `CommandRow` is the hero's only island, with no timer and no GSAP (`hero.test.tsx` fails on a static GSAP import
  and on any `HeroTracks` or `landing-tracks` reference there). `e2e/hero.spec.ts` pins the cards,
  the install chip, the action row order and alignment in all four locales (primary and chip centred, the compare
  link content-width and flush-left with a 44px hit area, the empty row beside it inert, the Tab order primary,
  copy button, compare link) and 320px and 375px without a sideways scroll.
- **Marquee.** The one looping motion on the page, a CSS keyframe with no JavaScript animation:
  it runs only in the state described under "Marquee" above, pauses through its button, hover
  and focus inside a row, and is static otherwise (one sideways-scrolling line where motion may
  start and on a phone, wrapped rows from 40rem under reduced motion or without JavaScript), so 2.2.2 holds without
  JavaScript.
- **Lock-file demo.** `lock-demo.tsx` (`#lock-demo`, a page section with a bracketed `.vk-eyebrow`
  label "The lock file" and a `stacked` `SectionHead` whose `h2` is `landing.lockDemo.heading`,
  `{count, plural, =2 {Two keys changed, two keys sent} ...}`, formatted with the fixture's changed
  count so it falls back to digits, and fails `lock-demo.test.tsx` in all four locales, when the
  fixture changes) replaces the former statement and SDK playground. Every number, key, value and
  hash comes from one fixture, `lib/hero-terminal.ts` (`HERO_TERMINAL_SOURCE`): `lib/lock-demo.ts`
  turns it into three frames of `CodeLine`s, hashes with `contentHash` from `@verbatra/core` at build
  time (`LOCK_DEMO_HASHES`, old and new, pinned to the lock file the real CLI writes by
  `hero-terminal.run.test.ts`), and reads the German values of the two edited keys from
  `lib/playground/translations.json` through `lib/landing-playground.ts`
  (`LOCK_DEMO_PLAYGROUND_IDS` maps `checkout.title` to `checkoutTitle`; the generator's
  `scripts/playground/source.ts` holds the same English text, pinned by `lock-demo.test.ts`), with
  the model and date from its metadata block. The three frames are `figure.vk-lock-frame`s, each a
  `figcaption` (step label and sentence) over a `.vk-lock-card` with a mono head (file name, badge):
  1. `en.json` as the real nested file, the two changed lines marked (`~`, the `changed` tag),
  unchanged keys folded into "... N more, unchanged" gap lines; 2. `verbatra.lock.json` with the real
  shape (`version`, `locales`, the locale object, keys sorted), the two stale entries showing the
  recorded old hash and the `stale` tag, badge `2 stale, 12 up-to-date` in the CLI's wording
  (`HERO_CHECK_BADGE`, `lang="en"`); 3. the CLI line for German (`$ npx @verbatra/cli translate`
  and `de: 2 translated, 12 unchanged`, `lang="en"`, only text the CLI prints), then `de.json` with
  only those two values (each `lang="de"`) under the single label "pre-generated, not live", and a
  foot with the model, the date and the lock update. No token figure and no baseline comparison
  appear until a measured baseline exists. Code is `pre` with `white-space: pre-wrap` and hanging
  indents, so nothing scrolls and no block is a tab stop or carries an `aria-label`; the tag
  text is at least 11px. Marked lines use `--accent` on a 14 percent `--accent` tint like `.vk-ph`;
  gap lines `--text-muted`.
  Without JavaScript, and on phones and under reduced motion, the frames stack with their captions. Below 64rem with motion allowed each stacked card reveals once (see Reveals).
  The island (`lock-demo-motion.tsx`, `LockDemoMotion`, a block `island()` fed the labels and the steps, each
  with its dwell time, with the frames as children) reads one media query,
  `(min-width: 64rem) and (prefers-reduced-motion: no-preference) and (scripting: enabled)`; when it matches the stage
  (`data-mode="stage"`) shows a step list (`aria-controls` per frame, `aria-current="step"`) in
  columns 1 to 4 and one frame at a time in columns 5 to 12, the others `inert` and `aria-hidden`.
  Each step's `.vk-lock-prog` bar runs `vk-lock-progress` for its dwell (the lock frame longest) only
  while `data-mode="stage"` is set, so a late hydration never misses its `animationend`, which advances
  the frame; the bar is paused (inline `animation-play-state`) while the
  section is offscreen or the "Pause animation" button (2.2.2) was used, and choosing a step pauses.
  Frames keep their natural height; the stage is as tall as the tallest, so no card stretches.
  Before the island mounts the CSS already draws the stage (first frame, no captions, the side list
  hidden from the layout). If the island has not mounted after 10s (scripts blocked or failed), CSS
  animations with `forwards` fill retire that layout: the frames, their captions and the plain card
  border are exactly the stacked layout (same offsets, no accent border or halo), the step list and
  the pause button leave the layout. When the island arrives later it reads the retired side list
  (`visibility: hidden`) and stays stacked instead of snapping back to the stage; it still listens to
  the stage condition, so a page that leaves the wide layout and returns gets the real stage rather
  than the fallback's ten seconds again. The island's `STAGE_QUERY` is the stylesheet's media
  condition word for word, `scripting: enabled` included, so a browser that does not know that
  feature stacks in both. The keyframes never animate `display`.
  Under 40rem the lock frame drops its unchanged neighbour rows (the gap rows carry the folded
  count from the fixture), the send frame drops its head row and its lock-update line, indents are
  1ch per level and every tag sits on its own row. In forced colors the current step takes a
  2px `Highlight` outline.
  `lock-demo-motion.test.tsx` pins the island, `lock-demo.test.tsx` the markup and `e2e/lock-demo.spec.ts`
  the browser behaviour.
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
  token that nothing reads), so there is no instant duration until something
  uses one; `--ease-exit` is read by the gate's slide-outs.
- **Bracketed labels, never numbered.** Most landing sections open with their `h2`. Only the
  lock-file demo, the features and the closing panel set a `.vk-eyebrow` label above it (`{ LABEL }`,
  the braces drawn in CSS with empty alt text); no section carries an index or a counter, and
  `reveal-marks.test.tsx` fails on a CSS counter or a numbered section list.
- **Gate.** `gate.tsx` (`#gate`, a server component, no island) is `Section` plus `SectionHead` (split, aligned to the start, no eyebrow, no trailing period; its lead ends in the one `docs/translation-safety` link, `GATE_DOCS_PATH`, so no focusable element sits inside a frame) over `.vk-gate-track` >
  `.vk-gate-pin` > `.vk-gate-stage`: three `figure.vk-gate-frame` (`data-state` `candidate`, `refused`, `stale`) on ONE key, `profile.greeting`, each a caption (`.vk-lock-caption`, whose label row ends in an `aria-hidden` three-segment marker, `.vk-gate-marker`, the current segment lit, no number) over a card
  (`.vk-lock-card.vk-gate-card`) that spans the eight columns that follow the caption's four from 64rem (stacked and static) or the first eight (pinned). The three cards are within 60px of each other in height. 1. Candidate: head with the key and the fixture's model id (`GATE_MODEL`, shared with the run test's config), the English
  source edit before and after (`GATE_SOURCE_BEFORE`, `GATE_SOURCE`, as a `-` and `+` row), the provider's German candidate, which dropped `{name}`, with a dashed `{name}` chip marked "missing" (the frame's moving element, `.vk-gate-slot`, a drop that is
  already raised before the pin and is the first thing the scrub does). 2. Refused: the real `verbatra translate` lines (`de: failed, 0 translated, 13 unchanged, 1 integrity-withheld`, `integrity-withheld:`, `profile.greeting: placeholder (-{name})`, the totals), the
  refused line tinted `--text-danger`, a "not written" stamp in the card head in the page language (`.vk-gate-stamp`, the moving element, announced, never inside a `pre`), and a `de.json` sub-row "unchanged" holding the old value. 3. Still stale: `verbatra check` with `exit 1` in
  `--text-danger` (`.vk-gate-exit`, the moving element), the real check lines, the same `de.json` sub-row and the foot "The old value stays in de.json. CI fails until the key gets a value that keeps {name}." Under 40rem the rows marked `data-fold="drop"` leave (the removed source row, the candidate foot, frame 3's file row). No frame promises that a re-run succeeds, and the
  section shows no review state (review stays with the deck). Every CLI line, the file names, the docs path and both German values are data in `lib/gate-demo.ts`, pinned by `lib/gate-demo.run.test.ts`, which runs the real sdk `translate` with a stub provider that drops `{name}`,
  the CLI's real renderers and the real `check`, and asserts the target file and the lock are byte-identical after the refused run; the component types no CLI line. `.vk-gate-code` keeps flags and compounds whole (`keepCompoundsWhole`, `keepPackageRunsWhole`).
  From 64rem wide and 42rem tall, with `scripting: enabled`, `prefers-reduced-motion: no-preference` and `@supports (animation-timeline: view())`, the stage is pinned: `.vk-gate-track` is `--vk-gate-pin` (150svh, `GATE_PIN_SVH`) plus one stage tall and declares the named
  view timeline `--vk-gate` (inset by `--vk-landing-offset`), `.vk-gate-pin` is `position: sticky` and vertically centres the head and the stage, so the heading never scrolls away and the free space above the heading and below the current card differ by at most 24px
  at 1440 by 900, 1920 by 1080 and 2560 by 1440, and the three frames share one grid cell, each centred in it and animated by
  `animation-timeline: --vk-gate`. `lib/gate-timeline.ts` (`GATE_PHASES`, in svh of the 150svh range) is the one schedule: the candidate holds 6 to 40, the refused frame 60 to 94, the stale frame 114 to 150, so every state is complete and untransformed for at least `GATE_HOLD_FLOOR_SVH` (34svh, 228px at 672 tall, at least 220px). Each caption and card slides in from the right (`GATE_SLIDE_PX` 64px, the card from `scale(0.96)`) and out to the left, with the same distance and the card a little behind the caption in time (caption 47 to 51, card 48 to 54, exit 94 to 98 and 95 to 100, the candidate's 40 to 44 and 41 to 46), the CLI lines of the last two frames slide in 24px from the right one 1svh after the other with the refused line last (`--n` per line, `--vk-lines-*` per frame), the stamp lands from `scale(1.25)`, the exit badge and the chip drop 12px, and the marker segment of the current frame fills with `scaleX`; each frame is opacity 0 at least 1svh before the next one starts (`GATE_CLEAR_SVH`). Entrances ease with `--ease-standard`, exits with `--ease-exit`, the marker fill is linear. The stage clips (`overflow: clip` with `overflow-clip-margin`, so the slide and the halo are not cut and the page never scrolls sideways); the stylesheet's percentages, `gate.test.tsx` and `e2e/gate.spec.ts` all derive from the schedule. A frame fades out and the next fades in with a gap between, so two frames never exceed 0.1 opacity together, and a frame that is not current has `pointer-events: none` (the frame keyframes animate `opacity` and the discrete `pointer-events`, never `visibility`,
  so every frame stays in the accessibility tree and in find-in-page); the current card is what `elementFromPoint` returns at its middle. The pinned layout is a caption line over one wide card, never the lock demo's rail plus card. Below that, or without the timeline, the frames are stacked and static (from 64rem a caption cell and a card cell per frame, under 64rem the caption over the card) with the one moving element of each revealed once
  through the shared observer (`html[data-motion-ready] .vk-gate .vk-gate-track .vk-gate-moves` lifts the reveal's offset while pinned); reduced motion, no JavaScript and `scripting: none` show the stacked end states, whose card heights equal the pinned ones. In forced colors every card and the refused line take a 2px
  `Highlight` outline. The gate adds no eyebrow: `.vk-eyebrow` stays on the lock demo, the features and the closing panel. `gate.test.tsx` pins the markup and the stylesheet (supports test, query, the schedule, no overprint, allowed properties, no literal colour), `e2e/gate.spec.ts` the measured holds (stopping at the pin end), the overprint, the pointer,
  the free space, the card heights, the heading, layout shift 0, the axe scans, the path with the timeline out of reach, reflow and the phone height (1300px in English, 1350px in the other locales).
- **Phone length.** The English landing stays under 12.25 screens at 391 by 844 with motion and with
  reduced motion (`e2e/landing.spec.ts`, measured from the built page and rounded up to the next quarter screen; the gate section is at most 1300px tall on a phone in English and 1350px in the other locales, the highlights section at most 1350px). Under 40rem the section steps are 88px, 64px and 48px, `--head-gap` is 2rem,
  and the footer link rows sit at their 44px targets with no row gap. A new section's height is measured and the ceiling raised to it, not paid for by cuts.
- **Budget.** Layout shift 0 over a full scroll at 390, 1440 and a 844 by 390 landscape phone; no
  scroll listener; a reveal chain only on an artifact (the elements listed under Reveals; the hero, the footer
  and the marquee loop are not reveals) with a total stagger of at most `--reveal-delay-max`; no entrance over 16px or 600ms.

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
  but `FaqKeys` and `CopyButton` is), never a Suspense boundary, since React outlines a completed Suspense
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
on `html`, so an in-page jump and every focused control (a comparison source link reached by
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
  the `.vk-banner-lead` subline (at most 25 words in English, 30 in de, es and fr, tested in all four), `.vk-banner-ctas` with Get started
  (`/docs/quickstart`), the `.vk-banner-install` chip and last a "Compare with other tools" text link (`/compare`, `.vk-banner-compare` inside `.vk-banner-compare-row`, content-width, label on the column's left edge, never a second primary button; `align-items: center` keeps Get started at 50px beside the taller chip), the chip a borderless `--surface-card` `CommandRow` (`wrap="narrow"`)
  of `HERO_INSTALL_COMMAND`, in the wider column beside the demo (`.vk-banner-demo`: the
  `.vk-banner-files` stack, three `.vk-banner-file` cards of `--radius-lg` on `--surface-tile`; the
  front `de` card takes `--border-accent`, `--surface-raised` and a `--halo-strong` shadow, the `fr`
  and `es` cards behind it are tilted, opaque and `--text-faint` with no opacity (a faded card shows
  the one behind through it, and faded text fails the axe contrast scan even under `aria-hidden`),
  and show from 64rem only). There is no trust line, no Node.js line, no facts block and no
  prompt in the hero. `hero.test.tsx` pins the
  order, the install chip, the absent trust line and facts, the halo and the cards, and `e2e/hero.spec.ts` the
  columns, the fold, the action row order, alignment and hit area, and the focus order. The home social image (`HomeOgFrame` in `lib/og-image.tsx`, served
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
  framed Studio screenshot's title, which only docs pages show (the landing's Studio card is `StudioCardShot`, with no frame), are sentence-case sans, `--text-sm` medium `--text-strong` and
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
  `<AvailableFrom>` badge is the same depth pill, or nothing (`components/available-from.tsx`): the
  docs always describe the latest release, so a badge in the current release line of its package
  renders `NewPill` with `.vk-available-from` and the translated `docs.statusBadges.new` text (no
  version in the visible text; the upgrade advice is its `title`), and any older badge renders
  nothing, no element and no space. The rule is `isStillNew` in `lib/release-line.ts`, the same
  one the sidebar NEW pill and the marquee use, and the decision is made on the server: no client
  script, data attribute or stored choice, and no version picker. The pill sits after the heading
  text when it is inside a heading (a 0.5rem start margin, none in the wrapped anchor), and the
  heading anchor wraps it under the text under 768px; the full rules are in `.claude/rules/docs.md`.
  The landing's marquee shows the New pill alone, and only for an item in the current line.
  `RELEASE_BADGE` (`lib/release-badge.ts`) is the landing's one list of
  what was new in a release: `providers` (read through `providerReleaseBadge`, and `providerIsNew`
  for the current-line test) and `features` (`provider-none`, read through `featureReleaseBadge`).
  The data stays when its release leaves the current line, so the marquee then shows no pill, and a
  future release marks items again by rewriting it; the MDX badges stay literal (`<AvailableFrom version="0.12.0" />`), and
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
  `className` and `title`) is a 5px-radius chip, 2px by 6px, on a 90deg gradient from `--pill-new-start`
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
  in the marquee's current-line provider badge (the word alone, no version), the sidebar NEW marker
  and the in-page `<AvailableFrom>` marker. A quickstart tag stays the `.vk-pill` outline. The pill is
  also the in-page `<AvailableFrom>` marker, in a heading, a table cell or a paragraph.
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
  landing's closing section shows `INIT_COMMAND` and `DRY_RUN_COMMAND` from `lib/install-commands.ts`
  as two plain `CommandRow`s (no link inside a command) and no package-manager tabs; the docs home has no install
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
  the end-edge fade `.vk-edge-fade` uses, and the header is not sticky. Cells are compact (0.625rem
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
grep -n '\--surface-\|--text-\|--accent\|--radius-\|--shadow-\|--scrim\|--width-page\|--header-height\|--crumb-height' packages/ui/src/tokens.css apps/docs/app/global.css
grep -n 'vk-page-\|vk-crumb\|vk-docs-footer\|vk-callout\|vk-header-search\|nd-toc\|nd-sidebar' apps/docs/app/global.css
grep -n 'vk-available-from' apps/docs/app/global.css | head
grep -rn 'isStillNew\|RELEASED_VERSIONS' apps/docs/lib apps/docs/components | grep -v test | head
grep -rln 'vk-version\|VERSION_INIT_SCRIPT\|version-pills\|release-lines' apps/docs --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.turbo --exclude-dir=e2e | head
grep -n 'MIN_BRAND_CONTRAST\|MARQUEE_MARK_SIZE\|MARQUEE_OPTICAL_SIZE\|MARQUEE_GLYPH_SIZE' apps/docs/lib/brand-colors.ts apps/docs/lib/brand-marks.ts
grep -n 'FORMAT_ICONS\|PROVIDER_ICONS' apps/docs/components/landing/marquee.tsx
```

If the file and this skill disagree, the file wins, and this skill needs updating in the
same change.
