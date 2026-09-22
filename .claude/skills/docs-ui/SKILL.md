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
  `motion` 13.4.0, `next-intl` 4.14.5.
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
   Two colors, nothing else. Do not introduce a third brand hue casually.
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
- Shadows: `--shadow-panel` (a purple-tinted lift) and `--shadow-sm`. Two, not a ramp.
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

Headlines are solid `--text-strong` on both surfaces. `--gradient-headline` exists for the
footer's oversized watermark only; do not clip it onto a heading.

## Reuse before you build

- **Primitives:** `components/ui/` holds `badge`, `button`, `card`, `command-line`, `tabs`.
  `Button` takes `variant: "primary" | "secondary" | "ghost"` and `size: "sm" | "md" | "lg"`.
  Extend the variant union rather than passing ad hoc `className` overrides.
- **Landing:** `components/landing/` holds the landing sections (`proof.tsx`, `loop.tsx`,
  `providers.tsx`, `gains.tsx`, `faq.tsx`, `final-cta.tsx`, `footer.tsx`, `marquee.tsx`)
  plus the shared building blocks: `section.tsx` and `section-head.tsx` for structure,
  `terminal.tsx`, `package-install.tsx`, `command-box.tsx`, `reveal.tsx`, `hero-facts.tsx`
  (the release / formats / providers / license row), and an `fx/` folder
  (`grid-pattern.ts`, `hero-wash.ts` with `HERO_BACKGROUND` and `HERO_BORDER`). A new
  section composes `Section` plus `SectionHead`; it does not re-derive page padding or
  heading rhythm. Check `ls apps/docs/components/landing` before quoting a file name from
  this list.
- **Docs-facing:** `components/available-from.tsx` renders the version callout. Its rules
  live in `.claude/rules/docs.md`. `components/docs-home.tsx` holds the docs landing
  (`DocsHomeHero`, `DocsHomeBody`, `DocsHomeSection`, `DocsHomePaths`, `DocsHomeSteps`,
  `DocsHomeFeatures`), all registered in `components/mdx.tsx` and driven by
  `content/docs/index.mdx` and its three locale siblings.

## One header for both surfaces

`components/site-header.tsx` owns the navbar. `SiteHeaderFrame` renders the markup (wordmark,
centred search, text links, icon links, language select, phone-width search and menu trigger)
and two thin wrappers feed it from each layout's context: `HomeSiteHeader` (from
`useHomeLayout`, plus a `SidebarProvider` drawer so the landing's phone menu is the same drawer
the docs use) and `DocsSiteHeader` (from `useNotebookLayout`, adding the sidebar collapse and
drawer triggers). They are wired through `slots.header` in `lib/locale-home-layout.tsx` and
`app/[lang]/docs/layout.tsx`; `lib/layout.shared.tsx` still supplies the links, title and
language select for both. Fumadocs' own `HomeLayout` and notebook headers are never rendered,
so do not style `#nd-nav` or `#nd-subnav`; style `.vk-header` and `.vk-header-link` instead,
and change the header in one place.

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
  landing footer uses for its column titles. The sidebar's top-level entries (group triggers,
  group links such as "CLI reference", the "Introduction" page, the `For AI agents`
  separator), the TOC's "On this page" title, table headers, and the tags on
  `DocsHomePaths` cards all use this treatment. The sidebar gets it from
  `lib/docs-group-labels.tsx`, which wraps every top-level page-tree name in the class before
  the tree reaches `DocsLayout`; do not target Fumadocs' or Radix's internal DOM for it.
  Use the class for a new label rather than restating the four declarations.
- **Owned hooks, not library internals**: callouts carry `.vk-callout` (added by the `Callout`
  mapping in `components/mdx.tsx` and passed explicitly by `available-from.tsx` and the locale
  notice in the docs page), and the prev/next footer carries `.vk-docs-footer` through
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
  warn callout stay distinguishable without a third hue.
- **Tables**: the header row is a `.vk-label` on `--surface-card`; the border and radius sit on
  Fumadocs' scroll wrapper (`div:has(> table)`), not the table, so a wide table scrolls inside
  a visible frame at phone width. Inline code in cells never wraps.
- **Links**: `--accent` text with a 40 percent glow underline that turns solid on hover, the
  same `LINK_CLASS` the landing rows use. Heading anchors are explicitly exempt so a
  section title never renders as a link.
- **Page actions**: every non-home docs page renders Fumadocs' `MarkdownCopyButton` and
  `ViewOptionsPopover` under the description, fed by `app/[lang]/docs.mdx/[[...slug]]/route.ts`,
  which serves the processed Markdown of the page in its own locale. Keep that route in step
  with `app/llms-full.txt/route.ts` if the Markdown shape changes.

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
  `lib/**/*.test.tsx`, `components/**/*.test.tsx`, `app/**/*.test.ts`, and `proxy.test.ts`;
  existing examples are
  `components/landing/faq.test.tsx`, `lib/landing-messages.test.ts`, and
  `app/[lang]/docs.mdx/[[...slug]]/route.test.ts`.
- Run `pnpm check` or `pnpm format` for Biome before committing.

## Verify before you trust this file

Tokens drift. Before quoting a value from this skill, confirm it:

```bash
grep -n '\--surface-\|--text-\|--accent\|--radius-\|--shadow-' apps/docs/app/global.css
```

If the file and this skill disagree, the file wins, and this skill needs updating in the
same change.
