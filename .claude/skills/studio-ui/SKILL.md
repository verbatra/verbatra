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
queue, or spending provider budget. Its look is decided by the shared design tokens in
`packages/ui/src/tokens.css`, which `packages/studio/src/app/styles.css` imports and maps onto
Tailwind utilities.

Two things make generic frontend advice wrong here, and both are enforced by tests:

1. The app ships **two themes**, light and dark, and every token is defined twice, in the
   shared `@verbatra/ui` token file.
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

- `vite` 8.3.4, `@vitejs/plugin-react` 6.1.2, `tailwindcss` 4.3.3 through
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
- `src/app/index.html` is deliberately bare: a `<div id="root">`, one module script and one
  classic `<script src="/theme-init.js">` in the head. Nothing else belongs in it.

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
  bundled through Vite. Geist is: `@verbatra/ui/fonts.css` carries the `@font-face` rules and
  the woff2 files, and the server answers `.woff2` as `font/woff2`
  (`src/server/content-type.ts`).
- **No `<style>` element and no literal `style="..."` in markup.** A React `style` prop
  is fine: React DOM writes through CSSOM, which CSP does not govern. Use it only for a
  value Tailwind cannot express, such as a computed percentage.
  `src/app/ProgressBar.tsx` (`style={{ width: \`${clamped}%\` }}`) is the single
  precedent in the app and should stay close to the only one.
- Anything that wants to reach a third-party origin at runtime is blocked by
  `default-src 'none'` and `connect-src 'self'`. Do not design a feature that needs one.

## Typography: Geist, self-hosted

`@verbatra/ui/fonts.css` (imported first in `styles.css`) declares Geist and Geist Mono as
variable woff2 faces, latin and latin-ext, `font-display: swap`, and points
`--font-geist-sans` and `--font-geist-mono` at them with a system stack behind each. The ui
tokens bind `--font-sans` and `--font-mono` to those variables, so `font-sans` and `font-mono`
utilities, `body` and headings all resolve to Geist.

Vite emits the font files as hashed assets (`assetsInlineLimit: 0` keeps them out of the CSS as
data URLs, which `csp-build-output.test.ts` asserts). The OFL text ships at
`/licenses/OFL-Geist.txt` from `src/app/public/licenses/`, byte-equal to the copy beside the font
files in `packages/ui/src/fonts/`.

Two families is the whole set. A third needs a reason that survives review. Do not add a `<link>`
to a font CDN; CSP will block it.

## Token layers: always use the outermost one

Studio owns no palette. `packages/ui/src/tokens.css` defines the brand primitives (`--v-*`), the
semantic layer (`--surface-*`, `--border-default`, `--text-*`, `--accent*`, `--focus-ring`,
`--scrim`, `--status-*`, `--diff-*`), the radius and shadow scales and the type scale.
`src/app/styles.css` imports it and holds two small things:

1. **A plain `@theme` entry** for `--shadow-panel`, so Tailwind generates the `shadow-panel`
   utility. The ui value is unlayered and wins over it.
2. **`@theme inline`**, which maps every `--color-*` onto a ui semantic token. That is what turns
   a token into utilities such as `bg-card`, `text-muted-foreground`, `border-border`,
   `bg-success-soft`.

Never put a ui `--text-*` color token into `@theme`: Tailwind reads that namespace as font sizes.
Map text colors through `--color-*` instead.

Component code writes `className="bg-card text-muted-foreground"`. It does not write a raw
`hsl()` and it does not write `var(--surface-card)`. A raw color value in a component is a
defect: it breaks the single point of change and it will be wrong in one of the two themes.

The token families the utilities expose:

```
surface/base   background  card  popover  muted  border
                foreground  muted-foreground
brand          primary  primary-strong  primary-foreground  accent
                accent-foreground  ring
sidebar        sidebar  sidebar-foreground  sidebar-muted  sidebar-border
                sidebar-accent  sidebar-active
status          success  warning  danger  neutral (each with a -soft companion)
                danger-foreground (text on a solid danger fill)
diff            diff-missing  diff-changed  diff-orphaned  diff-protected (each with -soft)
shadow          shadow-panel  shadow-panel-lg
overlay         overlay (modal scrim)
```

Conventions carried by that list:

- **Every status and diff hue is a pair**: a readable foreground (`--status-success`) and a
  low-alpha background (`--status-success-soft`). A new semantic hue ships both, with a contrast
  test in `packages/ui/src/tokens.test.ts`, or it is not finished.
- **Protected is not Changed.** `diff-protected` is teal, `diff-changed` amber; the pill carries a
  word as well, never color alone.
- **The sidebar currently aliases the card, text and hover surfaces.** It is no longer a separate
  dark palette; it is interim until the navigation shell is rebuilt.

**The modal scrim has its own token.** `OverlayBackdrop` (`src/app/ui.tsx`) draws it with
`bg-overlay`, which maps to `--scrim`: a dark, translucent fill in each theme. Do not use
`bg-foreground/40`: it brightens the page in dark theme, because a token whose polarity flips
between themes is the failure mode to watch for.

**A solid danger fill uses `danger-foreground`.** The `danger` Button variant
(`src/app/Button.tsx`) fills with `bg-danger` and writes `text-danger-foreground`. Use it for a
destructive confirmation, not for an ordinary row action, which stays a tinted `secondary` button.

The scales come from ui and are not Studio's to override: radii `--radius-sm` 6px, `--radius-md`
10px, `--radius-lg` and `--radius-xl` 12px; shadows `--shadow-panel` and `--shadow-sm`, each
redefined per theme.

## Both themes, every time

The ui palette sits under `.dark, [data-theme="dark"]` and `.light, [data-theme="light"]`. Studio
sets `data-theme` on `<html>` to the RESOLVED theme (`light` or `dark`, never `system`). Two
writers do it, and they must agree:

- `src/app/public/theme-init.js`, a classic script in the `<head>`, applies the stored or system
  theme before first paint. It is not bundled, so it cannot import ui;
  `src/app/lib/theme-init.test.tsx` runs it against the ui store for every stored value.
- `createThemeStore` from `@verbatra/ui/theme`, wired in `src/app/lib/theme-dom.ts`, applies the
  choice at runtime. It persists `"system" | "light" | "dark"` in `localStorage` under
  `verbatra-studio-theme`, tracks `(prefers-color-scheme: light)` live while the mode is
  `system`, and suppresses transitions through the `data-theme-switching` attribute declared in
  `tokens.css`. It never injects a `<style>` element, which the CSP forbids.

There is deliberately no `prefers-color-scheme` CSS fallback: it would duplicate the palette, and
the SPA needs JavaScript anyway.

Rules that follow:

- A new themed token is added to **both** theme blocks of `tokens.css` in the same change. One
  block only is a bug that ships looking fine on the author's machine.
- Do not use Tailwind's `dark:` variant to patch a component. The theme belongs in the token, not
  in the markup.
- Check contrast in both themes before calling a color done, particularly the `-soft`
  backgrounds, which sit at low alpha and shift against a light versus a dark surface.

## Reuse before you build

`src/app/` holds 39 non-test `.tsx` files at its top level (that count includes `App.tsx`,
`main.tsx`, `ui.tsx` and `test-support.tsx`; the rest are components, each with a
co-located test). Compose these before writing anything new.

- **Primitives:** `Button` (`variant: "primary" | "secondary" | "ghost" | "danger"`,
  `size: "sm" | "md"`, default `secondary`/`sm`), `Card` (`padding: "none" | "sm" | "md"`,
  `as: "div" | "section"`), `Badge` (`tone: "success" | "warning" | "neutral" | "danger"`, `wrap` to let a long
  user value break inside the pill instead of overflowing; pills stay on one line by default),
  `Input`, `Select`, `Dropdown`, `Popover`, `Tooltip`, `Tabs`, `Accordion`, `Table`,
  `Sheet`, `Skeleton`, `Loading`, `ProgressBar`, `Toast`, `ErrorMessage`, `ErrorBoundary`.
  Extend a variant union rather than passing ad hoc `className` overrides at call sites.
- **Layout and shared class strings:** `src/app/ui.tsx` exports `Container`, `Section`,
  `PageSection`, `SectionCard`, `DetailList`, `EmptyState`, `DrawerShell`,
  `OverlayBackdrop`, `DialogCloseButton`, `MonoValue`, plus the shared strings `tableClasses`,
  `pillClassName`, `pillDotClassName`, and `microLabelClassName`. A new panel composes
  `PageSection` or `SectionCard`; it does not re-derive page padding or heading rhythm.
  The uppercase tracked micro-label is already a token (`microLabelClassName`) and is
  meant for structural labels such as table headers, not decoration above every heading.
  Be aware the shipped code does not fully honour that: `PageHeader.tsx` and `Sheet.tsx`
  apply it to a `kicker`, and on the Review and Translations panels that kicker reads
  "Workspace", restating the sidebar zone header sitting at the same height a few hundred
  pixels to the left. `SettingsPanel.tsx` shows the good case, where the kicker adds
  information. Treat a kicker that repeats its own navigation as the tell it is.
- **Icons:** `src/app/Icon.tsx` is a closed set of 24 inline SVG paths keyed by
  `IconName`. There is no icon package. A new icon is a new entry in `ICON_PATHS` and a
  new member of the union, drawn on the same 24-unit stroked grid as its neighbours.
- **Class composition:** always `cn()` from `src/app/lib/cn.ts` (re-exports `cn` from `@verbatra/ui/cn`, clsx plus tailwind-merge),
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

## Capabilities are two flags, and the decision is a pure function

`StudioCapabilities` (`src/shared/rpc/snapshot.ts`) is
`{ spend: boolean; writeToDisk: boolean }`, plus a `spendWithheld` reason and the read-only
`limits` the server enforces (`retranslate` and `reviewDecision`, each `{ windowMs, max }`), which
`src/client/rate-budget.ts` checks a bulk action against before sending it. Do not conflate the
two flags:

- `spend` costs provider tokens and is off unless the server was started with
  `--allow-spend` (`packages/cli/src/studio-command.ts`). Retranslate and
  translate-pending need it.
- `writeToDisk` is local editing. It defaults to true
  (`src/server/methods/snapshot.ts`), so an edit control is normally live even when
  `spend` is off.

The eligibility decision lives in `src/client/` as a tested pure function, never inline
in a component: `canRetranslate` (`src/client/retranslate-eligibility.ts`, requires
`spend`) and `canTranslatePending` (`src/client/refresh-toast.ts`, requires `spend` and
`writeToDisk`). The component reads `useCapabilities()` and calls the helper.
`KeyDetailDrawer.tsx` is the precedent for both shapes: `canRetranslate(capabilities, pill)`
for the spend-gated action and a direct `capabilities?.writeToDisk === true` check for
edit. `RefreshToast.tsx` is the precedent for a gated toast action, and
`SettingsPanel.tsx` is the only place that renders `spend` as visible status.

Note what these precedents are *not*: `RetranslateButton.tsx` and `ReviewRowActions.tsx`
read no capability at all. They are presentational, take callbacks, and are gated by
their caller. Keep it that way. A new gated control adds its rule to the pure function in
`src/client/`, where it can be tested without a DOM, and stays dumb itself.

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
grep -n '^\s*--v-\|^\s*--status-\|^\s*--diff-\|^\s*--radius-' packages/ui/src/tokens.css
grep -n '^\s*--color-' packages/studio/src/app/styles.css
```

If a file and this skill disagree, the file wins, and this skill needs updating in the
same change.
