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
  `@tailwindcss/vite`. `clsx` and `tailwind-merge` come through `cn` from
  `@verbatra/ui`. React and TypeScript come from the workspace catalog.
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
  `packages/ui/src/progress-bar.tsx` (`style={{ width: \`${clamped}%\` }}`) is the single
  precedent in the app and should stay close to the only one.
- Anything that wants to reach a third-party origin at runtime is blocked by
  `default-src 'none'` and `connect-src 'self'`. Do not design a feature that needs one.

## Typography: Geist, self-hosted

`@verbatra/ui/fonts.css` (imported after `tailwindcss` and `tokens.css` in `styles.css`) declares Geist and Geist Mono as
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
`src/app/styles.css` imports it and holds one thing: **`@theme inline`**, which maps every
`--color-*` onto a ui semantic token and the two shadow utilities onto ui shadows
(`shadow-panel` is `--shadow-sm`, `shadow-panel-lg` is ui's large `--shadow-panel`). That is what
turns a token into utilities such as `bg-card` (the tile surface), `bg-input` (the raised
surface), `text-muted-foreground`, `border-border`, `bg-success-soft`.

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
  word as well, never color alone. Orphaned intentionally uses the neutral tone. Missing has its own
  blue (`--v-diff-missing`, hue 222), no longer the accent hue of links and focus; a test in
  `packages/ui/src/tokens.test.ts` keeps it at least 30 degrees from changed, protected, accent,
  danger, success and warning in both themes.
- **Navigation is a top header, not a sidebar.** `AppHeader.tsx` follows the docs site header: a
  `--surface-chrome` bar with a `--border-default` bottom line, text links in `--text-muted` that
  turn `--text-strong` on hover and `--accent` when `aria-current="page"`, with a 1px `--accent`
  underline: full strength on the current link, 40% on hover, hidden while a link has keyboard
  focus. Below `xl` the links move into a `Sheet` drawer. There are no `sidebar-*` tokens.

**The modal scrim has its own token.** `OverlayBackdrop` (`packages/ui/src/sheet.tsx`) draws it with
`bg-(--scrim)`: a dark, translucent fill in each theme. Do not use
`bg-foreground/40`: it brightens the page in dark theme, because a token whose polarity flips
between themes is the failure mode to watch for.

**A solid danger fill uses `--status-danger-fg`.** The `danger` Button variant
(`packages/ui/src/button.tsx`, `.vk-btn-danger` in `packages/ui/src/components.css`) fills with
`--status-danger` (`--status-danger-strong` on hover) and writes `--status-danger-fg`. Use it for
a destructive confirmation, not for an ordinary row action, which stays a tinted `secondary` button.

The scales come from ui and are not Studio's to override: radii `--radius-sm` 6px, `--radius-md`
10px, `--radius-lg` and `--radius-xl` 12px; shadows `--shadow-panel` and `--shadow-sm`, each
redefined per theme.

**Radius hierarchy.** Containers (cards, table cards, callouts, empty states) use `--radius-lg`.
Controls (buttons, fields, chips, selects) use `--radius-md`. Anything nested inside a container
or a control (a cell hit area, a badge, a code preview, a `kbd`) uses `--radius-sm`.
`rounded-full` is for dots and the pill search field only. Tailwind's `rounded-sm`, `rounded-md`
and `rounded-lg` resolve to these tokens, so either spelling is fine; a bare `rounded` is not.
The one exception is the navigation drawer's link rows (`NavDrawer.tsx`, `NavLink.tsx`), which keep
`rounded-lg` because they match the docs site drawer (`SHEET_ITEM` in
`apps/docs/components/nav-link-classes.ts`).

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

`src/app/` holds the Studio composites at its top level. Compose these before writing anything new.

- **Shared primitives (owned by `@verbatra/ui`, import from `@verbatra/ui`):** `Button`
  (`variant: "primary" | "secondary" | "outline" | "ghost" | "secondary-success" |
  "secondary-danger" | "danger"`, `size: "xs" | "sm" | "md" | "lg"`, default `secondary`/`sm`,
  `xs` for dense row actions and chip controls; the site look, with `.vk-btn*` in
  `packages/ui/src/components.css`), `Card` (`padding: "none" | "sm" | "md"`,
  `as: "div" | "section"`; the tile surface), `Badge` (`tone: "neutral" | "success" | "warning" |
  "danger"`, the diff tones `missing`, `changed`, `orphaned`, `protected`, and the site tones
  `glow`, `new`, `unchanged`, `solid`; `wrap` lets a long value break instead of overflowing,
  `verbatim` keeps a locale code, version or any user value in its own case; badges stay on one
  line and uppercase by default), `Icon`, the fields `TextField`, `TextArea`, `SearchInput` and
  `Select` (`size: "xs" | "sm" | "md"` on the same height scale as `Button`, so a form row
  aligns; `TextArea` takes no size; the focus ring is `.vk-field:focus-visible`), `Checkbox`,
  `Accordion`, `Kbd` (`tone: "muted" | "strong"`, the one keycap; sets `data-tone`), `Skeleton`,
  `ProgressBar`, `Toast`, `FilterBar` and `FilterChip` (`pressed`, `count`,
  and `unavailable` with the reason, which keeps the chip focusable and shows the reason in a
  `Tooltip` instead of disabling it), the `Table` family with `tableClasses` (`TableRow` takes
  `selected` for `aria-selected` and `data-selected`, and `active` for the row a keyboard queue
  highlights: `aria-current="true"`, `data-active` and `tableClasses.rowActive`, never `aria-selected`,
  so a table with selection checkboxes keeps the two apart; `TableCard` is a containing block, so
  visually hidden text inside it cannot widen the page),
  `Sheet` and `DrawerShell`, `OverlayBackdrop`, `DialogCloseButton`, `Tooltip` (`aria-describedby`
  on the control unless the label repeats its name or `decorative` says the control already
  carries the words, shown on hover and focus (or on keyboard focus alone with `trigger="focus"`,
  which ignores focus from a pointer press; `flip` opens it upward when the clipping box would cut it
  off, so an open bubble never grows the scroll area), dismissed with Escape, none on a disabled control,
  taking no layout while closed; `side`: `end`, `bottom`, `bottom-start`, `bottom-end`, `top` and
  `top-start` (`flip` opens a `bottom` side upward, and `top-start` downward as `bottom-start`, when
  the room is short; never `end`); on open the bubble is fitted inside the nearest clipping box and
  the viewport: shifted along the inline axis through layout offsets set from CSSOM (`--tooltip-x`,
  which the CSP allows), never a transform, so no scroll area keeps a stale width; `wide` lets a long
  label wrap in a bubble capped at 28rem or the box, whichever is smaller; `className` goes on the
  wrapper),
  `ThemeToggle` (a cycle over a theme store that
  leaves system for the opposite of the OS theme first, labelled through `label(current, next)`
  and `announce(mode)` props, with its own tooltip and a polite live region), the
  `useDialogA11y` hook (focus trap that holds from any start point, Escape, focus restore; only
  the topmost of nested dialogs reacts), and the layout parts `Container`, `Section`,
  `PageSection`, `SectionCard`, `DetailList`, `EmptyState`, `MonoValue` (`breakAnywhere` for long
  values on a narrow screen) and `microLabelClassName`. They theme through semantic tokens only
  and expose `data-variant`, `data-size`, `data-tone` and `data-padding` for tests. Change them in
  `packages/ui/src`, never as a Studio copy. Studio-local primitives: `Loading`, `ErrorMessage`,
  `ErrorBoundary`.
  Extend a variant union rather than passing ad hoc `className` overrides at call sites.
- **Layout and shared class strings:** `@verbatra/ui` exports the layout parts listed above
  and the shared strings `tableClasses` and `microLabelClassName`. A new panel composes
  `PageSection` or `SectionCard`; it does not re-derive page padding or heading rhythm.
  The uppercase tracked micro-label is already a token (`microLabelClassName`) and is
  meant for structural labels such as table headers, not decoration above every heading.
  A page `kicker` earns its place only when it adds information; a kicker that repeats the
  navigation is the tell it does not, and `PageHeader` renders none by default (no panel passes one).
- **Icons:** `packages/ui/src/icon.tsx` is a closed set of 25 inline SVG paths keyed by
  `IconName`. There is no icon package. A new icon is a new entry in `ICON_PATHS` and a
  new member of the union, drawn on the same 24-unit stroked grid as its neighbours.
- **Class composition:** always `cn()` from `src/app/lib/cn.ts` (re-exports `cn` from
  `@verbatra/ui/cn`, clsx plus tailwind-merge), never string concatenation. It is what makes a
  caller's `className` override predictable.
- **Accessibility:** `useDialogA11y` from `@verbatra/ui` (focus trap that also holds when focus
  starts outside the dialog, Escape, focus restore) and `src/client/roving-tabindex.ts` (used
  through `use-roving-table.ts` for the key table) already exist. Any new overlay, drawer, or
  keyboard listbox uses them rather than hand-rolling focus management.
- **Panels:** the five panels under `src/app/panels/` (Overview, Translations, Review, Glossary,
  Settings) all take `PanelProps` (`{ refreshToken: number }`, `src/app/panel-props.ts`) except
  Settings, which reads once and ignores the token (its configuration is fixed for the session; Retry
  re-reads), and are wired through `PAGE_PANELS` in `App.tsx` and
  `PAGE_LABELS`, `PAGE_ICONS` and `NAV_GROUPS` in `src/app/nav-groups.ts`. `DEFAULT_PAGE` in
  `src/client/routes.ts` is `overview`. Overview owns the metric row, the per-locale coverage
  table, the last run and the locale file history, in that order. The metric row is
  Needs attention, Waiting for review (the queue `App.tsx` already reads, passed to Overview only; N/A with a reason when `verbatra.provenance.json` is unreadable, never a green 0),
  Avg coverage and Locales in sync; a failed read shows N/A with a check-failed hint, never a
  loading caption. Coverage is sorted worst first, shows ten locales and a "Show all N locales"
  button (focus moves to the first new row), pins the locale column (`sticky start-0`, opaque fill)
  with the scroll hint above the card, and makes its scroll region a tab stop only on real
  overflow. Each row links to `#/translations?locale=` and `#/review?locale=` through `routeHash`
  in one trailing column: quiet links (table text, underline and a `-outline-offset-2` ring only on
  hover and focus), a visible word plus an sr-only locale suffix, 44px tall below `md`. Failed reads (diff,
  status, lock, review, usage, history)
  collapse into one page-level `ErrorMessage`, placed above the metric tiles so it stays above the
  fold, with the page's only Retry (`App.tsx` owns the one counter; it stays disabled until every
  read that Retry started has answered), which states the server's own reason (`errorDetail`) and names the stale sources that
  share its code plus the review queue, which has no section of its own. A section keeps its own
  alert, without a Retry, only when it failed for a different code. A failed
  refresh keeps the last diff, status, lock, usage and history with a stale notice. Figures
  (`MetricCard` values, the coverage percentage and key counts) are set in sans with
  `tabular-nums`, carry `data-figure`, and every number is `whitespace-nowrap`; mono is for
  identifiers (keys, locale tags, hashes, paths, ids), which take `MonoValue` and `dir="ltr"`.
  Text that is not focusable never gets a `title` or a `Tooltip`: it wraps (`break-words` or
  `wrap-anywhere`) and shows its full value. Git text (commit subject, author, paths) takes
  `dir="auto"`, and a commit date is visible text, formatted like the last run, inside
  `<time datetime>`. Metric tiles stack below the named `xs` breakpoint (22.5rem, `@theme` in `styles.css`) and the
  Last run tiles below `sm`, so a ten-digit token count never overflows its tile,
  never an arbitrary pixel variant. A route change made by a link (header, in-page, search) scrolls
  to the top once, from `link-scroll.ts`, for the navigation that link started and nothing else: a
  held navigation scrolls when its own proceed runs, and back, forward, a replace or a cancelled
  hold never scroll, however long the prompt stayed open. After a Retry in which every read answered and none failed,
  focus moves to the metric row (`data-overview-recovery`) if it was lost, or back to the new Retry
  when a slower read brings the banner back; a failed Retry keeps it on Retry and a later
  background recovery never moves it. Every hold that ends without proceeding (Keep editing, or a
  landing back on the position) drops a pending link mark. Translations is one `KeysTable` (the matrix of
  a status per locale, or one locale's entries with source, translation, status and origin) under
  `KeyFilters`, and keeps the editor; the glossary editor lives only on Glossary (see Glossary and Settings below). Adding a page
  means adding it to `PAGE_IDS` and `PAGE_PARAMS` in `src/client/routes.ts` and to every one of
  those tables.

**Key table rules.** The key column and the header row are sticky, with an opaque fill
(`--surface-table-head`, `--surface-row-hover`, the selected row's `--surface-hover`) and a seam
border on each cell (the table uses `border-separate`, since collapsed borders vanish on sticky
cells); the corner cell sits above both. Below `md` the key column is 7rem and truncates, the Source
column of the matrix is hidden, and the table flows in the page; from `md` up the card is a bounded
scroll region (`md:max-h-[calc(100dvh-12rem)] md:overflow-y-auto`), so the header stays in view with
many rows. The roving stops draw their focus ring inside (`-outline-offset-2`), so it is never
clipped by the card edge. The region sets `scroll-ps-28 md:scroll-ps-60` (the sticky key column's
width) and `scroll-pt-16` in the matrix or `scroll-pt-11` in the entries table (the header's
height), and a focused stop is scrolled into view with `block` and `inline` set to `nearest`, so the
ring is never under the sticky parts. ArrowLeft and ArrowRight stop at the row edges; ArrowUp and
ArrowDown wrap. Column widths are fixed with `w-*` and `min-w-*`, so the key column never jumps
while filtering. In sync is quiet text with a dot, never a bordered badge. A matrix cell is named by
its `aria-label` (key, locale, status, then each marker after a comma); its marker words also sit in
a `decorative` `Tooltip` on the cell's own focus stop, which adds no tab stop. In the entries table
the same words open from keyboard focus on the key button only (`trigger="focus"`, so the native
title of a truncated key and the tooltip never show together), the status marker carries a plain
title, and the words reach assistive technology through visually hidden text in the status cell. The
marker tooltip wrapper is always rendered and only its label is empty when no marker is held (an
empty label draws no bubble), so a focused cell is not remounted when its marker clears.
`ScrollHint` takes the scroll card's ref and shows only while it overflows, at any width. A row is
selected (`aria-selected`) while its key is open in the editor.

**Split editor.** One `KeyEditor` renders in two containers, chosen by a synchronous `matchMedia`
read (`XL_QUERY`, 80rem) on the first render, never by an effect, so an `xl` deep link never mounts
a modal. From `xl` it is `EditorPane`: a `--radius-lg` card in a grid cell beside the table,
`self-start` and sticky at 4.5rem below the 3.5rem site header, at most the viewport minus that
offset and a fixed bottom reserve (`100dvh - 9rem`: 4.5rem for the sticky offset plus a 4.5rem
allowance for what the page leaves below the split, not a measurement) tall, scrolling
inside itself, with no `aria-modal`. It is independent of the table's height: it pins at the header
offset for the whole scroll of a tall table, and on a table shorter than the pane the page grows to
fit the pane (so a key can add page height). Below `xl` it is the `DrawerShell` (side end), with
room under its last row so the toast can be scrolled clear. While the pane is open the page uses the
wide layout: the app root switches `--page-max` from `--container-6xl` to `--width-layout` through
`has-[[data-split]]`, and both the header's inner box and the page box, marked `data-page-width` and
sharing `PAGE_MAX_CLASS`, read it, so their edges line up (`Container` in ui stays generic). The
filter bar stays above the split grid at full page width, so opening a key never moves the table;
only the table and the pane share the grid. While the split is open the refresh toast moves to the
content edge (`group/page` with `group-has-[[data-split]]/page`), so it may cover table cells but
never the pane. The toast has no auto-hide; it stays until dismissed.

Editor state (the open locale, its draft, the unsaved prompt) lives in `KeyEditor`, above the
container, so crossing `xl` keeps a draft, and focus and the selection in the field are restored
after the swap. The translation form is inline in the locale block, built from
`entry-editor-parts.tsx` and the `useLocaleEdit` hook, both shared with `EditEntryDialog` (Review);
a second editor dialog or a copy of either is a defect. A failed read shows `ErrorMessage` with
Retry (and Cancel in the form), never an empty state, and after a successful Retry focus moves to
the recovered content (a `data-recovery-target` container with the standard focus ring, or the
field). That target is disarmed only by the answer to its own Retry, never by the other read
landing first or by a refresh. While a Retry runs it shows "Retrying…" with `aria-busy` and
`aria-disabled`, never `disabled`, ignores a second press, and keeps focus even when it fails
again. Roving focus stays on the row when a key opens, Escape in the pane moves focus back to the
row, and the pane never takes a global letter shortcut. While a save runs the field is `readOnly`
with `aria-busy`, never `disabled`, so focus stays in it, a rejected save puts focus back in the
field, and its status scrolls into view.

**Unsaved prompt.** Every external route change goes through `route-guard.ts`, which tracks history
by index, like a router blocker: every entry carries `{ idx }`, `navigate*` pushes `idx + 1` and
`replaceRoute` replaces with the same `idx`. While a draft is dirty, a traversal (back, forward, an
entry typed or linked) is only held, never undone by code: no `history.go` is issued on a landing,
so fast repeated Backs and Forwards cannot loop. The router keeps showing the held entry
(`visibleHash`) and the prompt opens while the address bar already shows the target.

The invariant: a held route exists only while its prompt is on screen, and every way the prompt ends
resolves the hold exactly once. Save, Discard, the form's Save or Cancel, and an in-flight save that
finishes let the held entry through (`adoptHeldRoute`, private to `route-guard.ts`), and so does
the missing-key Discard; typing the draft back to clean, Keep editing and a
new prompt that replaces the old one (another key, another locale, a filter, a chip, header
navigation) call `restoreHeldRoute()`, the one place that issues a single `history.go(position -
idx)` (or a `replaceState` when a hash push truncated the position entry). While a restore is on its
way `visibleHash` keeps the SPA on the position, so a live refresh in that window never shows the
target; a full page reload can still load the target URL after the `beforeunload` prompt. A held
push or replace is replayed as the same push or replace. Typing (filter text, chips, selects,
locale) replaces, a header search or page link pushes once, and the brand link goes through
`navigateToRoute` with the bare Translations route, so it clears the key and filters as it always
did and a dirty draft gets the prompt. A same-document landing without an index (a pasted hash or an
outside link) is stamped by `stampLanding()` and held by the guard like any other; `beforeunload` is
attached only while a draft is dirty and covers a full page unload. The guard's `popstate` and `hashchange`
listeners register when `route-guard.ts` loads, so they run before the router's; never move them
into an effect.

An inline `UnsavedPrompt` (Save, Discard, Keep editing, never `window.confirm`; it takes a `subject` and Save is optional, which Glossary omits) decides. In the pane
it sits in an opaque sticky wrapper (`data-sticky`) at the top of the scroller with a small gap
under the pane header; in the drawer it sits in the sticky header (`data-sticky`) through `Sheet`'s
`banner` slot. It scrolls itself into view and focuses Keep editing, its Save is the only primary
action while it is shown, and a rejected save keeps it, with the reason, and puts focus back in the
field. A save that finishes never closes the form of a different locale or key. A refresh that
removes the open key while the draft is dirty keeps the editor, with a notice and a Discard. After a
route change the focus is returned once the new route has rendered, the same way for the prompt's
Save and Discard, the form's Save and Cancel and the notice's Discard: on the control that was used
when it is outside the editor; otherwise, in the drawer, on the first control of the dialog while the
landing route still has a key (never on a row behind the modal, and focus the user already moved to
a control in the dialog stays), and on the nearest row in the pane or when the landing has no key. A save that finishes after the hold was
released (Forward back onto the entry) puts focus on the Edit button of the saved locale. A new
control that changes the route needs no extra code, but it must honour the boolean the navigate
helpers return before running its own side effects.

**Review queue.** `ReviewPanel.tsx` composes `ReviewFilterBar`, `ReviewTable`, `ReviewDialogs`,
`use-review-keyboard.ts` and `use-bulk-selection.ts`; the panel itself holds only the wiring. The
highlighted row is `TableRow active` (a `useActiveRow` index, not the table's roving stop), never a
class written at the call site. Review state is two `FilterChip`s with counts (`data-state-filter`),
exclusive, beside the locale and origin `Select`s; the counts come from `reviewStateCounts` and ignore
the chosen state. With every filter at its default and no needs-review entry left the list is the
All clear message; any other empty list is No matching entries with the one Clear filters button.
Both, and the unavailable view, are `tabIndex={-1}` focus targets for the end of a batch or a
closed editor. Values always wrap: a row's source and translation are `TranslationValue`s with
`whitespace-pre-wrap` and `wrap-anywhere`, no truncation, no tooltip and no per-row control, so a
row is as tall as its text and never changes height on focus, hover or press (a height that moved
between press and release lost the click at 375px). The only bubble in a row is the provenance
description, which opens above the badge in the stacked layout so it does not cover the actions, and
flips below only when the room above, measured under the sticky header, is short. The shortcut keys
`j`, `k`, arrows, `a`, `r`, `e`, `Enter`, `t`, `x` and `?` act on the highlighted row, pause in a field,
and in the filter bar (`data-shortcuts-paused`) pause except `?`, which still opens the help, while
Enter and Space still work on a chip; they keep their gates: `canWrite` and the spend check in
`use-review-keyboard.ts` and `ReviewPanel.tsx`, the spend rule itself in `retranslate-eligibility.ts`.
`ReviewRowActions` stays presentational (`data-layout`, `data-reserves-busy`). `EditEntryDialog` asks
through `UnsavedPrompt` before Escape, the backdrop, Close or a route change drops a dirty draft; a
background URL cleanup waits until the editor closes.

**Glossary and Settings.** Both read through `use-read-model.ts`: a skeleton (`PanelSkeleton`, a
`role="status"` block) only on the first load, `ErrorMessage` with Retry for a failed first read, and a
failed refresh keeps the last data under a stale notice with its own Retry. A user Retry that succeeds
moves focus to the `data-recovery-target` container only when focus was lost; a background refresh
never moves focus. Glossary takes `refreshToken` and re-reads on a bump, deferring while any editor is
open or any add form holds text (a status line says a refresh is waiting, and it runs when the last
draft ends); a read that started before a finished write is dropped. A file-backed glossary file is
watched too (`server/watcher.ts`, reason `lock`), so an external edit, a Studio write and a WebMCP write
all bump the token; an open draft defers it as for any event. `GlossarySection` owns the drafts
(`use-glossary-workspace.ts`): row editors (a `Map` keyed by source, never a plain object, since a term
can be named `constructor`), the add form and the keep form live above the rows, so search, scope and
refresh never drop one, and an open editor stays listed when search stops matching it or when its term
has gone (a notice says so, navigation stays held, Discard drops it). The list shows the first 50 terms
with Show all N (focus on the first new row), the add form sits above it, and an editor opened from the
exists note is always listed. One route guard covers all drafts through `useDialogDraftGuard`, and `UnsavedPrompt` (Discard and
Keep editing, no Save, Keep editing primary) names what is unsaved, and while any write is queued or in
flight it says it is saving, busies its buttons and lets the held change through when the writes
succeed (a failure keeps it, with the reason); Escape in a dirty editor opens it for that editor only
(not during IME composition), and a hold arriving while a removal dialog is open closes the dialog first; a scope switch with a dirty editor
or add form holds in the same prompt, with Keep editing reverting the select, Discard applying the
scope and focusing the select, and typing back to clean releasing it, and a route hold replaces a scope
hold and the reverse. Removing a term or a do-not-translate entry, and any Save that would leave a term
with no translation, no per-locale entry and no never-use rule (`editEmptiesTerm`), opens
`GlossaryRemoveDialog` first, naming translations, rules, note, part of speech and Match case. Escape and
confirm are ignored while it submits; on success it closes in the same update that moves focus to the
next visible term (else the add field), on failure it closes, the failure shows on the row with Retry,
and focus stays on the control that opened it. Writes go through `use-glossary-writer.ts`: one request
at a time in send order, busy and failure kept per key, `aria-disabled` and `readOnly` instead of
`disabled` so focus stays, Retry only for transient codes (`isRetryableWriteError`) and only for an unchanged, still wanted action:
typing into the draft, Discard, a scope change and closing the form dismiss the failure. Never-use
renderings are one per line (a comma stays inside a rendering), and values are compared after the
form's own trimming, so an untouched editor is clean. Add says when the
source term already holds a translation in the scope (exact match) and offers Edit instead of
overwriting. Values with a known locale render through `TranslationValue`; the shared translation and
the note keep `dir="auto"`. Settings shows spend, writes, the two rate limits and the glossary source.

**Mixed surface tokens are root-scoped.** `--surface-table-head` and `--surface-row-hover` are
`color-mix` tokens declared under `:root`, like `--surface-band` and `--surface-chrome`: they
resolve against the theme of the root element, so do not use them inside a subtree that sets its
own theme.

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
`KeyEditorLocale.tsx` is the precedent for both shapes: `canRetranslate(capabilities, pill)`
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
