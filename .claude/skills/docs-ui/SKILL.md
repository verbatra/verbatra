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
and codified in `apps/docs/app/global.css` (448 lines). Two layers stack: the
Fumadocs UI theme, then a verbatra layer that overrides it. Generic frontend advice
that assumes a greenfield page will fight both. This skill states what is fixed, what
is yours to extend, and where to look things up.

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
   `--color-fd-accent`, `--color-fd-accent-foreground`, `--color-fd-ring`. These exist so
   Fumadocs' own components inherit the verbatra palette. Change one only to retheme
   Fumadocs itself.
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

`.vk-gradient-text` applies `--gradient-headline` with background-clip. It is the
established treatment for a highlighted headline span. Reuse it instead of writing a new
gradient.

## Reuse before you build

- **Primitives:** `components/ui/` holds `badge`, `button`, `card`, `command-line`, `tabs`.
  `Button` takes `variant: "primary" | "secondary" | "ghost"` and `size: "sm" | "md" | "lg"`.
  Extend the variant union rather than passing ad hoc `className` overrides.
- **Landing:** `components/landing/` holds 26 components (~2,800 lines) including
  `section.tsx` and `section-head.tsx` for structure, `feature-card.tsx`,
  `card-spotlight.tsx`, `terminal.tsx`, `package-install.tsx`, and an `fx/` folder. A new
  section composes `Section` plus `SectionHead`; it does not re-derive page padding or
  heading rhythm.
- **Docs-facing:** `components/available-from.tsx` renders the version callout. Its rules
  live in `.claude/rules/docs.md`.

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
- Tests are co-located. `apps/docs` extends `testInclude` to cover `.test.tsx`; existing
  examples are `components/landing/faq.test.tsx` and `pillar-skeletons.test.tsx`.
- Run `pnpm check` or `pnpm format` for Biome before committing.

## Verify before you trust this file

Tokens drift. Before quoting a value from this skill, confirm it:

```bash
grep -n '\--surface-\|--text-\|--accent\|--radius-\|--shadow-' apps/docs/app/global.css
```

If the file and this skill disagree, the file wins, and this skill needs updating in the
same change.
