---
name: studio-ui
description: 'Visual and component conventions for the Verbatra Studio dashboard (packages/studio), a React 19 / Vite 8 / Tailwind 4 single-page app served over a local verbatra project. Use when adding or reshaping UI under packages/studio/src/app: panels, primitives, design tokens in app/styles.css, theming, or anything rendered in the dashboard. Also use before accepting generic design advice that does not account for the dual light/dark theme or the strict Content-Security-Policy this app is served under.'
license: MIT
metadata:
  author: verbatra
  version: '1.0'
  source: 'internal'
user-invocable: true
---

# Studio UI (packages/studio)

## Overview

`@verbatra/studio` is a published, prebuilt single-page app that the `verbatra studio`
command serves over a real project on localhost. It is an operator console, not a
marketing page: the reader is a developer checking translation drift, clearing a review
queue, or spending provider budget. Its look is already decided and codified in
`packages/studio/src/app/styles.css` (172 lines).

Two things make generic frontend advice wrong here, and both are enforced by tests:

1. The app ships **two themes**, light and dark, and every token is defined twice.
2. The server sends a **strict CSP** with no `unsafe-inline` and no remote origins, so
   fonts, styles, and scripts cannot come from a CDN.

This skill states what is fixed, what is yours to extend, and where to look things up.

**When to use:** adding or restyling anything under `packages/studio/src/app/`, adding a
color/radius/shadow token, adding a panel, changing theming, or judging whether an
external design suggestion fits this app.

**When NOT to use:** the docs site (`apps/docs` has its own stack and its own skill,
`docs-ui`), the studio *server* under `packages/studio/src/server/` (no UI), or the
framework-neutral logic under `packages/studio/src/client/` (pure functions, tested
headlessly, no DOM).

## The stack, and why it constrains you

- `vite` 8.3.0, `@vitejs/plugin-react` 6.1.1, `tailwindcss` 4.3.3 through
  `@tailwindcss/vite`, `clsx` 2.1.1, `tailwind-merge` 3.7.0. React and TypeScript come
  from the workspace catalog.
- Tailwind 4 uses CSS-first configuration. There is no `tailwind.config.js` and no
  PostCSS config. Tokens are CSS custom properties and `@theme` blocks in
  `src/app/styles.css`.
- `vite.config.ts` sets `root: "src/app"`, `outDir: "../../dist/app"`, and
  `assetsInlineLimit: 0`. Nothing is inlined as a data URI; every asset is emitted as a
  file.
- There is no router library and no state library. Navigation is the URL hash, parsed by
  `src/client/routes.ts` and dispatched through the `PAGE_PANELS` table in
  `src/app/App.tsx`. State is React hooks plus small stores in `src/app/api.ts`.
- `src/app/index.html` is deliberately bare: a `<div id="root">` and one module script.
  Nothing else belongs in it.

## The CSP is a design constraint, not just a security header

`src/server/security-headers.ts` sends:

```
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:;
font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none';
frame-ancestors 'none'
```

`src/server/csp-build-output.test.ts` runs a real Vite build and asserts the built HTML
contains no inline `<script>` with a body, no `<style>` element, no `on*` event handler
attribute, and no `javascript:` URL. Consequences for UI work:

- **No Google Fonts, no CDN stylesheet, no remote image.** `font-src 'self'` and
  `img-src 'self' data:` permit same-origin only. A web font must be self-hosted and
  bundled through Vite.
- **No `<style>` element and no literal `style="..."` in markup.** A React `style` prop
  is fine: React DOM writes through CSSOM, which CSP does not govern. Use it only for a
  value Tailwind cannot express, such as a computed percentage.
  `src/app/ProgressBar.tsx` (`style={{ width: \`${clamped}%\` }}`) is the single
  precedent in the app and should stay close to the only one.
- Anything that wants to reach a third-party origin at runtime is blocked by
  `default-src 'none'` and `connect-src 'self'`. Do not design a feature that needs one.

## Typography: no web font is loaded, and that is deliberate

`@theme` declares two families:

| Role | Stack head | Variable |
|---|---|---|
| Body | `"Inter"` then `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, ...` | `--font-sans` |
| Code | `"JetBrains Mono"` then `ui-monospace, SFMono-Regular, Menlo, Monaco, ...` | `--font-mono` |

There is no `@font-face`, no `@fontsource` dependency, and no `<link>` in `index.html`.
Confirmed with a grep across `src/` and `vite.config.ts`. The named families are used
only if the operator already has them installed; otherwise the app renders in the system
UI font. This keeps the served bundle small and the CSP tight.

If you want a guaranteed typeface, that is a deliberate decision with a cost: add the
font files to the package, self-host them through Vite so they are served same-origin,
and accept the bundle growth. Do not add a `<link>` to a font CDN; CSP will block it and
the page will silently fall back.

Two families is the whole set. A third needs a reason that survives review.

## Token layers: always use the outermost one

`src/app/styles.css` has three layers. Write against the third, through Tailwind
utilities.

1. **Raw theme values, defined twice.** `--v-*` custom properties under `:root` (light)
   and again under `:root[data-theme="dark"]`. This is the only place a literal `hsl()`
   belongs.
2. **Static scales.** `@theme` holds the two font stacks and the radius scale. These do
   not change per theme.
3. **The Tailwind color mapping.** `@theme inline` maps every `--color-*` to its `--v-*`
   source, which is what turns a token into utilities such as `bg-card`,
   `text-muted-foreground`, `border-border`, `bg-success-soft`, `shadow-panel`.

Component code writes `className="bg-card text-muted-foreground"`. It does not write
`hsl(241 28% 11%)` and it does not write `var(--v-card)`. A raw color value in a
component is a defect: it breaks the single point of change and it will be wrong in one
of the two themes.

The token families, as they exist today:

```
surface/base   background  card  popover  muted  border
                foreground  muted-foreground
brand          primary  primary-strong  primary-foreground  accent
                accent-foreground  ring
sidebar        sidebar  sidebar-foreground  sidebar-muted  sidebar-border
                sidebar-accent  sidebar-active
status          success  warning  danger  neutral (each with a -soft companion)
diff            diff-new  diff-changed  diff-orphaned (each with a -soft companion)
shadow          shadow-panel  shadow-panel-lg
```

Two conventions carried by that list, both worth keeping:

- **Every status and diff hue is a pair**: a readable foreground (`--v-success`) and a
  low-alpha background (`--v-success-soft`). A new semantic hue ships both or it is not
  finished. `src/app/Badge.tsx` shows the pairing in use.
- **The sidebar is its own family and is dark in both themes.** In the light theme
  `--v-sidebar` is `hsl(244 48% 12%)`, a near-black indigo. That is intentional
  chrome-versus-canvas contrast, not an oversight. Do not "fix" it by mapping the sidebar
  onto the surface tokens.

Scales are fixed and narrow, deliberately:

- Radii: `--radius-sm` 4px, `--radius-md` 6px, `--radius-lg` 8px, `--radius-xl` 12px.
  These are tighter than the docs site's scale on purpose; a dense operator console reads
  better with less rounding. Do not import the docs values.
- Shadows: `--shadow-panel` and `--shadow-panel-lg`. Two, not a ramp, and each is
  redefined per theme because a lift that works on white is invisible on near-black.

## Both themes, every time

`:root` is light, `:root[data-theme="dark"]` is dark. The attribute is written by
`src/app/lib/theme-dom.ts` onto `document.documentElement`; the preference is
`"system" | "light" | "dark"`, persisted in `localStorage` under
`verbatra-studio-theme` (`src/client/theme.ts`), and `system` tracks
`(prefers-color-scheme: light)` live.

Rules that follow:

- A new `--v-*` token is added to **both** blocks in the same change. One block only is a
  bug that ships looking fine on the author's machine.
- Do not use Tailwind's `dark:` variant to patch a component. The theme belongs in the
  token, not in the markup. If a component needs different treatment per theme, the token
  it consumes is the wrong token or a new one is missing.
- Check contrast in both themes before calling a color done, particularly the `-soft`
  backgrounds, which sit at 10 to 18 percent alpha and shift substantially against a
  light versus a dark surface.

## Reuse before you build

`src/app/` already holds 38 components, each with a co-located test. Compose these before
writing anything new.

- **Primitives:** `Button` (`variant: "primary" | "secondary" | "ghost"`,
  `size: "sm" | "md"`, default `secondary`/`sm`), `Card` (`padding: "none" | "sm" | "md"`,
  `as: "div" | "section"`), `Badge` (`tone: "success" | "warning" | "neutral" | "danger"`),
  `Input`, `Select`, `Dropdown`, `Popover`, `Tooltip`, `Tabs`, `Accordion`, `Table`,
  `Sheet`, `Skeleton`, `Loading`, `ProgressBar`, `Toast`, `ErrorMessage`, `ErrorBoundary`.
  Extend a variant union rather than passing ad hoc `className` overrides at call sites.
- **Layout and shared class strings:** `src/app/ui.tsx` exports `Container`, `Section`,
  `PageSection`, `SectionCard`, `DetailList`, `EmptyState`, `DrawerShell`,
  `OverlayBackdrop`, `DialogCloseButton`, plus the shared strings `tableClasses`,
  `pillClassName`, `pillDotClassName`, and `microLabelClassName`. A new panel composes
  `PageSection` or `SectionCard`; it does not re-derive page padding or heading rhythm.
  The uppercase tracked micro-label is already a token (`microLabelClassName`) and is
  reserved for structural labels such as table headers, not decoration above every
  heading.
- **Icons:** `src/app/Icon.tsx` is a closed set of 24 inline SVG paths keyed by
  `IconName`. There is no icon package. A new icon is a new entry in `ICON_PATHS` and a
  new member of the union, drawn on the same 24-unit stroked grid as its neighbours.
- **Class composition:** always `cn()` from `src/app/lib/cn.ts` (clsx plus tailwind-merge),
  never string concatenation. It is what makes a caller's `className` override predictable.
- **Accessibility:** `use-dialog-a11y.ts` (focus trap and restore) and
  `src/client/roving-tabindex.ts` already exist. Any new overlay, drawer, or keyboard
  listbox uses them rather than hand-rolling focus management.
- **Panels:** the four panels under `src/app/panels/` all take `PanelProps`
  (`{ refreshToken: number }`, `src/app/panel-props.ts`) and are wired through
  `PAGE_PANELS`, `PAGE_LABELS`, `PAGE_ICONS`, and the `WORK_PAGES` / `REFERENCE_PAGES`
  split in `App.tsx`. Adding a page means adding it to `PAGE_IDS` in
  `src/client/routes.ts` and to every one of those tables; `App.tsx` throws at module load
  if the two zone arrays do not partition `PAGE_IDS` exactly.

## Spending money is a gated interaction

Retranslate and translate-pending cost provider tokens. They are gated behind
`--allow-spend` (`packages/cli/src/studio-command.ts`,
`src/app/panels/SettingsPanel.tsx`) and surfaced through `use-capabilities.ts`. UI for a
spending action must read the capability and degrade visibly when it is absent, never
render an enabled control that fails on click. `RetranslateButton.tsx` and
`ReviewRowActions.tsx` are the precedents.

## React and Next questions go to Context7

Do not answer React, Vite, or Tailwind 4 API questions from memory. Query Context7, one
concept per query. `vercel-react-best-practices` covers rendering and data-fetching
patterns; this app is a client-rendered SPA, so ignore its server-component guidance.

## Repository rules that bite in UI work

- No em dash (U+2014) anywhere, including inside JSX text.
- No prose comments and no JSDoc on internal code. Component names and structure carry
  intent. `@verbatra/studio` is published, so a declaration that reaches
  `packages/studio/dist/index.d.ts` is public API and does take JSDoc; a component under
  `src/app/` does not reach it.
- No emojis and no decorative formatting.
- Tests are co-located and this package extends `testInclude` with
  `src/app/**/*.test.tsx` (`packages/studio/vitest.config.ts`). The 90 percent coverage
  gate applies to `src/app/**/*.tsx` too. A new component ships its test in the same
  change.
- `@verbatra/studio` is publishable and versions independently of the sdk/cli pair. Any
  `src` change needs a changeset naming `@verbatra/studio`.
- Run `pnpm check` or `pnpm format` for Biome before committing.

## Verify before you trust this file

Tokens drift. Before quoting a value from this skill, confirm it:

```bash
grep -n '^\s*--v-\|^\s*--radius-\|^\s*--color-' packages/studio/src/app/styles.css
```

If the file and this skill disagree, the file wins, and this skill needs updating in the
same change.
