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
   `--gradient-headline`), `--v-pink`
   (through `--v-status-changed`), and `--v-status-new` / `--v-status-changed` /
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
  reintroduce a spread. There is no larger radius: the landing hero sits on the page, in no card.
- Shadows: `--shadow-panel` (a purple-tinted lift) and `--shadow-sm`. Two, not a ramp.
- Layout: `--gutter` (40px from 768px up) via `.vk-gutter`, `--width-wide` via `.vk-w-wide`.
  `--cta-height` (56px) is the minimum height of `.vk-prompt-trigger` on `PromptCopyButton`;
  `--width-prompt-pop` (30rem, capped by `100cqw` of its container, never by `100vw`, which counts
  the scrollbar) is the width of the `.vk-prompt-pop` preview. `--width-hero-panel` (36rem) is the
  hero command panel's maximum width. `.vk-grid-12` is the landing grid, declared but not yet
  applied by any section: one column under 64rem, then `--grid-columns` (12) columns with a
  `--grid-gap` (24px) gap, where each child spans `--grid-span` columns (the full row when unset).
- Surfaces added for the landing redesign: `--surface-band` (mixed from `--surface-card` and
  `--surface-bg`, never a raw value; declared for the raised band behind alternating landing
  sections, which no rule reads yet) and `--hero-grid-mask` (the fade that masks the static
  `fx/grid-pattern.ts` blueprint grid behind the hero only: `.vk-hero-blueprint`, an
  `aria-hidden` layer at `z-index: -1` that never animates). There is no wash token.
- Placeholder chip: `PlaceholderChip` (`components/landing/placeholder-chip.tsx`, the `.vk-placeholder`
  class) is the page's one signature motif, a locked placeholder token (`{{amount}}`, `{count}`)
  drawn the same way in every pane: `--placeholder-fg` (`--accent`) on `--placeholder-fill` inside
  an inset `--placeholder-ring` box shadow, never a border. It pads the token by
  `--placeholder-inset` and pulls the same amount back with a negative margin, so a chip moves no
  character of a monospace line, and it never wraps. `data-broken` strikes it in `--text-danger`,
  only for a token a reply broke. `PlaceholderText` in the same file cuts the tokens out of a line
  (`splitPlaceholders`: `{{name}}` and `{name}` only, so JSON braces stay text) and draws each as a
  chip; every showcase file pane and every `Terminal` line goes through it, and the showcase
  passes the tokens a refused reply added (the `+` details of its refusal) as the broken set.
- Motion: see "Landing motion" below for the system. Its tokens: `--ease-out` (entrances and
  state changes) and `--ease-in-out` (demo fills), `--duration-fast` (140ms, hover and press),
  `--duration-base` (240ms, state change), `--duration-reveal` (560ms, entrances),
  `--duration-demo` (900ms, the How step fill), `--reveal-distance` (16px, 12px under 40rem),
  `--rise-distance` (12px, the hero load rise), `--reveal-stagger` (70ms) and
  `--reveal-delay-max` (350ms, the stagger cap). Only `opacity` and `transform` / `translate`
  ever animate.
- Showcase: `--showcase-line` (1.125rem, 1.25rem from 40rem) is the line height of a file pane in
  the showcase playground, which reserves its longest scenario's row count with it (on a phone,
  where one file shows at a time, the tallest file's, `--showcase-rows-max`, so a file switch
  moves nothing), `--showcase-output-rows` (set inline from `showcaseRows().output`) reserves the
  output pane for its longest run, `--showcase-scroll-reserve` (0.75rem) is added to every pane's
  reserved height so a sideways scrollbar moves nothing, `--showcase-summary-lines` (3, 2 from
  40rem) reserves the status sentence, so a scenario never moves what sits below it,
  `--print-stagger` (90ms) paces the printed output lines, and `--showcase-bar-height` (3.125rem)
  is the height of its scenario bar from 64rem.

## Typography

Three families, loaded in `app/[lang]/layout.tsx` through `next/font/google`:

| Role | Family | Variable | Mapped to |
|---|---|---|---|
| Body | Inter | `--font-inter` | `--font-sans` |
| Code | JetBrains Mono | `--font-jetbrains-mono` | `--font-mono` |
| Display | Space Grotesk | `--font-space-grotesk` | `--font-display` |

`h1` through `h6` are globally bound to `--font-display`. You do not set a heading font
per component. Adding a fourth family needs a reason that survives review.

The type scale is a major third (1.25) held in `app/global.css`: `--text-display`, `--text-h2`
(capped at 3rem, read only by `.vk-h2`), `--text-h3`, `--text-h4`, `--text-lead`, with
`--leading-*` and `--tracking-*` companions. Above it sits `--text-hero` (fluid, 2.5rem to 6.25rem, about 97px at 1440, one step of the scale above
the former 5rem cap) with `--weight-hero` (700), `--leading-hero` (1.04) and `--tracking-hero`
(-0.03em), used only by the landing headline (`.vk-hero-title`). Landing
headings take the `.vk-display`, `.vk-h2`, `.vk-h3`, `.vk-h4` and `.vk-lead` classes (declared in
`@layer components`, so a Tailwind utility still overrides them) rather than inline `fontSize` /
`letterSpacing` styles. The docs page title, description and prose `h2` to `h4` sit on the same
scale through the `#nd-page` rules.

Headlines are solid `--text-strong` on both surfaces. `--gradient-headline` exists for the
footer's oversized watermark only; do not clip it onto a heading.

## Reuse before you build

- **Primitives:** `components/ui/` holds `badge`, `button`, `command-line`, `copy-announcement`,
  `copy-button`, `tabs`. Every copy control runs on `useCopyToClipboard` (`lib/`: `idle`, `copied`,
  `failed`, an `attempts` count, `reset`, and `holdFailure` to keep a failure until the next copy)
  and announces through `CopyAnnouncement`, a polite live region whose text node is keyed on
  `attempts`, so a repeated copy is announced again. `CopyButton` shows "Copied" or, in
  `--text-danger`, "Copy failed", and drops its `aria-label` while it does, so the visible status
  is its accessible name; `CommandLine` renders `CopyButton` rather than its own button.
  `TabList` takes an `idPrefix` to wire `id` / `aria-controls` to `tabPanelId` panels and moves
  selection and focus with the arrow keys (wrapping), Home and End; `tabPanelProps(prefix, id,
  active)` gives a panel its `id`, `role`, `aria-labelledby`, `data-active` and `inert`. Its
  `variant: "segmented"` is the `.vk-segmented` switch (tabs rounded by `--radius-segment`, 7px)
  that the hero command panel uses, never a hand-made copy.
  `Button` takes `variant: "primary" | "secondary" | "ghost"` and `size: "sm" | "md" | "lg"`.
  Extend the variant union rather than passing ad hoc `className` overrides.
- **Landing:** `components/landing/` holds the landing sections (`proof.tsx`, `formats.tsx`,
  `control.tsx`, `marquee.tsx`, `loop.tsx`, `faq.tsx`, `final-cta.tsx`, `footer.tsx`). Their order
  on the page is `LANDING_SECTIONS` in `lib/landing-sections.ts` (hero, marquee, showcase, how,
  formats, control, loop, faq, final call to action), which the home page maps over and
  `lib/landing-sections.test.ts` pins;
  add or move a section there, not by hand in `page.tsx`. Sections reveal on scroll through
  `data-reveal` (see "Landing motion"); the marquee and the FAQ do not. The
  marquee sits directly under the hero and is two rows at fixed sizes (15px items, 40px gaps,
  set on `.vk-marquee-band`): the frameworks (`MARQUEE_FRAMEWORKS` in `marquee.tsx`, which is
  `STACK_FRAMEWORKS` from `lib/stack-formats.ts`, each with a translated tip naming its format,
  `landing.marquee.frameworks.*`) scrolling left, and the
  formats, built from `SUPPORTED_FORMAT_IDS` in `lib/landing-facts.ts` (pinned to
  `SUPPORTED_FORMATS`), scrolling right. Each item links `/docs/formats` and counts as
  `click-cta` with `location: marquee` and its row as `target`. Every format's display label and
  icon is `FORMAT_DISPLAY` in the same file, which the structured data's format list reads too,
  so a new format fails to compile until it has both. `Formats` (`formats.tsx`, the section
  after How, a server `SectionHead` over `.vk-formats`) is the format switcher: a row of framework
  chips (`STACK_FRAMEWORKS`, each with the `format` its quickstart uses, pinned to `STACKS` by
  `lib/format-samples.test.ts`; `aria-pressed` buttons whose icons come from one sprite, rendered
  on the server and passed in as elements, so the icon set never enters the client bundle), then
  a segmented `TabList` over `SUPPORTED_FORMAT_IDS` labelled from `FORMAT_DISPLAY`, then one pane
  per format: a void `figure` captioned with the file path, holding the showcase's four English
  strings exactly as the sdk's real adapter writes them, with the format's own placeholder drawn
  as a `PlaceholderChip`, and a link to `/docs/formats` (`click-cta`, `location: formats`). The
  client island is `format-switch.tsx`, which takes every label and pane as props, so it adds no
  client message namespace; a chip selects its format, a tab clears the chip, and both count
  `select-tab` with `location: formats` (a chip adds `framework`). Every pane is server-rendered
  and stacked in one grid cell; a closed pane is `inert` and `visibility: hidden`, so the box is
  always the tallest pane and a switch moves nothing, and `.vk-formats-code` caps a long output at
  `--format-pane-rows` (16) lines of `--format-line` and scrolls inside it: it is a `section`
  named by the pane's file caption with `tabIndex={0}`, so the keyboard reaches and scrolls the
  open pane, with the `--focus-ring` outline inset. Chips and tabs scroll
  sideways inside `.vk-edge-fade` under 64rem and wrap from it, each at least 44px tall. The panes
  come from `lib/format-samples.generated.json`, which `scripts/sync-format-samples.mjs` writes
  before dev, build, typecheck and test (git-ignored like `lib/version.generated.json`): it builds
  `createDefaultRegistry` from `@verbatra/sdk` over the in-memory `AdapterFs` in
  `lib/format-samples-seed.mjs` (ENOENT for a missing file; the seed also holds each format's file,
  placeholder and key style, and the pre-seeded XLIFF file and `.xcstrings` catalogue those
  adapters require, written with `sourcePath` set to the file itself) and writes each format's
  output. Nothing in the page graph imports the sdk at runtime, and the docs app never depends on
  `@verbatra/format-adapters`; `lib/format-samples.test.ts` re-reads every sample through the real
  adapter and fails unless it parses back to the seed with its placeholder intact. `Loop` is four rows at every width
  (`LOOP_ROWS`: Studio with the `review` `StudioScreenshot`, the Excel handoff, the SDK, the agent;
  CI has no row, since the How section owns it), each a two-column grid from 1024px whose sides
  alternate (`data-loop-row`: the text on the left for Studio and the SDK, on the right for the
  handoff and the agent). The SDK row shows `SDK_INSTALL_COMMAND` and `SDK_IMPORT_LINE`, an
  import of `SDK_IMPORTS` from `@verbatra/sdk` that `loop.test.tsx` checks against the sdk's
  real exports, and links `/docs/sdk`; each row's call to action and each internal agent link (`llms.txt`, `llms-full.txt`,
  MCP docs, skills docs) counts as `click-cta` with `location: loop`, and the `verbatra/skills`
  GitHub link as `outbound-link`. `Control` lays its items out as a rail under 1024px: a
  `.vk-rail` (`Rail` in `rail.tsx`: a `section` named by its heading through `aria-labelledby`, the scroll container,
  carrying `.vk-edge-fade` so its end edge fades while there is more to see and its start edge
  fades once scrolled) around a `.vk-rail-track` (the snap row; a `ul` with `role="list"` in
  Control), whose `.vk-rail-item`s fall short of the full width so the next one peeks in and
  carry a `scroll-margin-inline` beside the rail's `scroll-padding-inline`. Chrome does not scroll
  a partly visible focus target, and a snap container snaps back, so `Rail` scrolls the item that
  takes focus to the start of the rail at phone width (its one client-side job). From 1024px the track is the plain grid and the fade is off. The
  shared building blocks: `section.tsx` and `section-head.tsx` for
  structure, `terminal.tsx` (with a `bare` variant; by default lines never
  wrap, they scroll sideways inside `.vk-terminal-scroll`, which fades the end edge while there is
  more to see; with `wrap` every line wraps through `.vk-wrap-line`, whose hanging indent is the
  line's own leading whitespace (`--wrap-lead`, set by `wrapLineStyle` in `wrap-text.tsx`) plus
  2ch, and whose placeholder tokens (`{count}`, `(-{count})`) never break, through `WrapTokens`.
  The How section is one terminal replaying two real commands, `verbatra
  translate` (the gate run, `lib/gate-demo.ts`: one key translated, one withheld) and then
  `verbatra check` (`lib/check-demo.ts`: the withheld key still missing, exit code
  `CHECK_EXIT_CODE`), titled `HOW_TITLE`, over the three numbered steps `HOW_STEP_KEYS` (setup,
  translate, check) that `howStepCopy` in `lib/how-steps.ts` labels for both the section and the
  HowTo structured data in `page.tsx`, the check step's body carrying the exit code as `{code}`;
  no panels: the showcase owns the written, refused and lock story),
  `showcase.tsx` (the section under the marquee: a server `SectionHead` over a `.vk-showcase`
  panel that holds the Try it playground alone, with no tabs; Studio is shown in the loop),
  `try-it.tsx` (the Try it playground, one `.vk-showcase-try` grid: from 40rem a scenario bar
  (`.vk-showcase-bar`) over a two-by-two board, `en.json` | `de.json` above `verbatra.lock.json`
  | output, cells split by 1px hairlines; on a phone the bar is `display: contents`, so the
  scenarios wrap on top, the file switch picks one file pane, the output sits under it at all
  times and the actions drop under the output. The scenario group holds four `aria-pressed`
  buttons (edit, add, remove, break a placeholder), each counted as `run-scenario`, beside the
  actions (Reset, and Try again after a failure). Under the bar, `.vk-showcase-breaks` is a
  native radio group (one `name`, so the arrow keys move through it) of the three ways a reply
  breaks the placeholder, `SHOWCASE_BREAKS` in `lib/showcase-seed.ts`: it drops `{{amount}}`,
  renames it to `{{betrag}}` (the default) or adds `{{tax}}`; each label is
  `tryIt.breaks.<id>` with the token passed as `{token}` and drawn as a chip, picking one runs
  the break scenario with it (counted as `run-scenario` with a `break` property), the refusal
  detail comes from `checkPlaceholders`, and Reset returns it to the default. The file panes (`.vk-showcase-file`: on a
  phone one at a time, picked by the `aria-pressed` file names of `.vk-showcase-file-switch`;
  each named by `data-pane`, which the stylesheet maps to its grid area); a marked
  line is `.vk-showcase-line[data-mark]`, tinted like a highlighted code line, its mark word in
  `--v-status-new` (added, missing, new) or `--v-status-changed` (edited, stale, changes); a
  refused reply shows as a struck `data-mark="refused"` line in `--text-danger` above the German
  value it leaves in place; the lock pane prints full 16-character hashes, and a rewritten hash
  shows before and after: the seed hash struck as `data-mark="replaced"` above the new one marked
  `changes`; a mark that does
  not fit drops to the next row), then the output pane (`.vk-showcase-output`, a `figure` captioned
  `verbatra translate`, named by `landing.showcase.tryIt.result.outputLabel` and marked
  `lang="en"`, its fixed height adding `--showcase-scroll-reserve` so a sideways scrollbar on a
  phone moves nothing) printing, in English on every locale, exactly the lines `renderHuman` prints for that run
  (`showcaseRunLines` in `lib/showcase-cli.ts`, server-rendered for the seed; after a click the
  lines fade in one `--print-stagger` apart, under 600ms in all, and at once under reduced
  motion), a mono savings line (`result.savings`: strings sent against what a full retranslate
  sends, `showcaseSavings`), and one polite `role="status"` sentence (`result.seed`,
  `result.summary` or `result.failed`). Reset is hidden at the seed and returns focus to the
  first scenario; Try again is shown
  with an announced failure message when the module fails to load (the cached promise is dropped,
  so a retry loads again). Only the latest request applies: a Reset or a newer click while a load
  is pending wins. The seed state is server-rendered from `showcaseSeed()`; the first hover,
  focus or click `import()`s `lib/showcase-scenarios.ts`, the only client code that uses
  `@verbatra/core` (`diffResources`, `contentHash`, `checkPlaceholders`), over the scenario data in
  `lib/showcase-seed.ts` and the small nested-JSON flattener in `lib/showcase-flatten.ts`
  (`@verbatra/format-adapters` is not browser-safe). `lib/showcase-flatten.test.ts` pins the
  flattener to the real i18next adapter and `lib/showcase-scenarios.sdk.test.ts` pins every
  scenario's (and each break variant's) sent, unchanged, orphaned and refused keys and lock
  hashes to a real sdk `translate` with a stub provider. Only the `.vk-showcase` panel carries a reveal; nothing inside the
  playground does. The copy says what verbatra would translate; it never claims the page
  translates), `evidence.tsx` (the mono evidence chip, which wraps inside a narrow column rather than growing past it; a linked chip
  takes the flat-panel glow border on hover and focus through `.vk-evidence-link`),
  `command-box.tsx` (by default an `@container`: a command wraps once the box is under 30rem, at a space
  or after a `/` or `.` inside a word, since `HighlightedCommand` keeps every other part of a word
  whole (a flag such as `--skill` never splits), and under 20rem the copy button drops below the
  command so the command keeps the full width; the Loop passes `scrolls`, which keeps every
  command on one line that scrolls sideways inside `.vk-edge-fade`, Copy always beside it, as on
  the live site. The Loop's table and SDK import line are set in `.vk-mono-sm` (`--text-mono-sm`,
  13px), and the import line scrolls inside `.vk-terminal-scroll`, whose end edge fades),
  `CommandRow` (`components/command-row.tsx`: the hero panel's npm install wraps under 30rem through
  `wrapsWhenNarrow`; elsewhere a `CommandRow` scrolls sideways inside `.vk-edge-fade`: a mask,
  not a painted background, so it stays see-through on any surface, and the end fade
  shows only while the command overflows, driven by a scroll timeline), `AiSetupPrompt`
  (`components/ai-setup-prompt.tsx`: the whole prompt, wrapped, under a `.vk-label` caption that
  shares its row with the prompt's small Copy button; its URL breaks only after a path `/`,
  through `breakUrlsAtSlashes` in `lib/word-breaks.tsx`) and `PromptCopyButton` in the same file
  (the large "Start with a prompt" button with the `.vk-prompt-pop` preview, used only by the docs
  home agent tip), `command-panel.tsx` (one of the hero's two client islands, beside the `TrackedLink` its buttons
  and count facts render; `components/landing-hero.test.tsx` pins exactly that set: a `.vk-command-panel` whose
  segmented "Install | Prompt" `TabList` switches between the `CommandRow` for
  `NPM_INSTALL_COMMAND` (counted as `copy-install-command`) and the whole `AI_SETUP_PROMPT`; both
  panes are one `.vk-command-panel-pane` shape, a muted hint row with its `CopyButton` on the right,
  then the content at full width, top-aligned, and the prompt keeps each `npx` run and each long
  flag with its value on one line (`keepPackageRunsWhole`); the closed pane is `inert` and hidden
  at every width, so the install pane carries no empty height under its command and the panel
  resizes on a switch, and a switch counts
  `hero-command-tab`), and an `fx/` folder
  (`grid-pattern.ts`). A new
  section composes `Section` plus `SectionHead`; it does not re-derive page padding or
  heading rhythm. Check `ls apps/docs/components/landing` before quoting a file name from
  this list. The CLI transcripts on the landing (`lib/gate-demo.ts`, `lib/check-demo.ts`,
  `lib/showcase-cli.ts`) are real CLI output, English on every locale, and their tests pin each
  line to `packages/cli/src/render.ts` (`lib/showcase-cli.run.test.ts` imports `renderHuman` and
  `lib/check-demo.run.test.ts` imports `renderCheckHuman` from it by relative path, and the latter
  also drives `run` from `packages/cli/src/run.ts` over the real sdk `check` for the exit code, in
  those run tests only, never from `lib/`), so a change to the CLI's output fails until the demo
  is recaptured.
- **Docs-facing:** `<StartHere />` (`components/start-here.tsx`) opens every page in
  `START_HERE_PAGES` (`lib/agent-entry.ts`, the agent guides only, not reference pages): a void
  `aside` at the prose measure with no start bar (so it never doubles the locale notice's
  callout bar), a `.vk-label` title and one lead, then the agent `CommandRow` for
  `AGENT_INIT_COMMAND` and the same `AiSetupPrompt` row, so
  `AGENT_INIT_COMMAND` and `AI_SETUP_PROMPT` (`lib/ai-setup-prompt.ts`) each have one source. `<McpInstallLink client="vscode" />`
  (`components/mcp-install-link.tsx`; VS Code only, since a Cursor link installs user-wide where
  `${workspaceFolder}` is the home folder) is a plain anchor in the
  secondary button style (`buttonClasses` from `components/ui/button.tsx`, not `Button`, whose
  `href` goes through `next/link`), built from `AGENT_CLIENT_CONFIGS` in `@verbatra/cli` by
  `lib/mcp-install-links.ts` and counted by a `data-umami-event` attribute, never a script.
  `remarkAgentEntryMarkdown` gives the page's `.md` output no runnable fence for the banner:
  one localized, conditional sentence (`docs.startHere.markdown`), and nothing at all on
  `start-with-ai`, whose own steps install the CLI first; the install button becomes a
  Markdown link with its localized label.
  `components/available-from.tsx` renders the version badge. Its rules
  live in `.claude/rules/docs.md`. `components/docs-home.tsx` holds the docs landing
  (`DocsHomeHeader`, `DocsHomeTabs`, `DocsHomeAgentTip`, `DocsHomeNote`, `DocsHomeBody`,
  `DocsHomeSection`, `DocsHomePaths`, `DocsHomeSteps`, `DocsHomeFeatures`), all registered in
  `components/mdx.tsx` and driven by `content/docs/index.mdx` and its three locale siblings, which
  write every label, including the tab names and the tip text, as MDX props or children. The docs
  home is a docs entry, not a second landing: `DocsHomeHeader` is a compact header (a `.vk-label`
  eyebrow, the headline in `.vk-docs-home-title` at `--text-h3`, weight 500, tight tracking, and
  one `.vk-docs-home-lead` sentence at `--text-base`; both rules are scoped under `#nd-page` so
  they beat the docs `#nd-page h1` and `h1 + p` rules), with no hero wash, no buttons, no install
  box and no facts row. Its children are `DocsHomeTabs`, an underline tab row of real links
  (`.vk-home-tabs`, `.vk-home-tabs-track`, `.vk-home-tab`; no tab is active on the home) that
  bleeds to the screen edge under 768px and scrolls sideways inside `.vk-edge-fade`
  (`.vk-home-tabs-scroller`, which also fades its start edge once scrolled, through
  `--vk-start-fade` on the same scroll timeline), and `DocsHomeAgentTip`, the "Using a coding agent?" callout with
  `PromptCopyButton` at the end of its row once the tip itself is 36rem wide (a container query
  on `.vk-agent-tip`, never the viewport, since the sidebar takes width; its preview then opens
  toward the start edge, capped inside the tip). Its text links the setup guide and the MCP page,
  and a link label stays whole when it has at most two words, otherwise keeps each hyphenated
  compound whole (`keepLinkLabelWhole`). `DocsHomeNote` is the same ringed callout (`.vk-home-callout`: an inset 1px
  `--border-default` ring, no fill, an `--accent` icon, the title at `--leading-snug` and the body
  at `--leading-normal`) without the button; the docs home puts one
  after the stack grid ("Don't see your stack?"). The header and the body share one frame
  (`HOME_FRAME`: one max width, one gutter). A section head stacks its `vk-h4` heading and its
  lead (`--text-sm`, muted) in one block, the lead directly under the heading. Every
  `DocsHomePaths` card is the same flat panel; there is no filled primary card, and the three cards
  share their title, body and page-name rows through `grid-rows-subgrid`, so a wrapped title never
  shifts the body or the link out of line. A backticked span
  in a header or section lead renders in code type (`withInlineCode`, `lib/inline-code-text.tsx`),
  and a path card title keeps a hyphenated compound on one line (`keepCompoundsWhole`,
  `lib/word-breaks.tsx`).
  `StackCards` (`components/stack-cards.tsx`) is the stack picker on the docs home and at the top
  of `pick-your-stack`: one borderless grid (`.vk-stack-grid`: one column, two from a 36rem
  container, three from a 54rem container, `--stack-grid-column-gap` 24px by
  `--stack-grid-row-gap` 40px, the last row left ragged). Each card (`.vk-stack-card`, a reversed
  flex row so the text comes first in the DOM and the logo shows first) has no border or
  background: only the round `--stack-chip-size` (56px) `.vk-stack-card-chip` on `--surface-card`
  with an inset `--border-default` ring, holding a single-colour logo. The name
  (`.vk-stack-card-name`, 16px, 600) is the card's one link (`.vk-stack-card-link`), stretched over
  the card by a `::before` that reaches `--stack-card-hit-outset` past it and carries the focus
  ring; a badge sits inside that link as a `.vk-pill.vk-stack-card-badge`, beside the name, so it adds no line. The
  text column is `.vk-stack-card-text`. A
  small chevron (`.vk-stack-card-chevron`) after the link fades from opacity 0 to 1 on hover and on
  `:focus-visible` of the link, and nothing else changes. Under the name come an optional
  `description` (`.vk-stack-card-description`, 14px, muted) and the `--format` ids
  (`.vk-stack-card-formats`, mono `--text-faint`), each id `whitespace-nowrap`
  (`FORMAT_ID_CLASS`): a list breaks at its comma, and only under a 23.5rem container (the
  longest rendered id plus 15 percent, pinned by its test) does an id wrap, then only after a
  hyphen. The logos come from `@icons-pack/react-simple-icons` through
  `components/stack-icons.tsx` (shared with the marquee), always `currentColor`, never a brand
  colour; a format with no brand mark gets an outline glyph there. The grid is a `nav` named by
  `labelledBy`, the id of the heading above it (the docs home section's `id`, or `page-title` on
  the docs `<h1>`), and that id also prefixes its sprite's symbol ids, so two grids on one page
  never collide. On the docs home, a stack with its own quickstart (`STACKS` in `lib/stacks.ts`)
  links its card to `/docs/quickstart/<id>` and carries a `badge` (the link reads "React,
  Quickstart"); every other card, and every card on `pick-your-stack` itself, jumps to a
  `pick-your-stack` section.
  `scripts/verify-docs-registry-parity.test.mjs` pins every card's `formats` to
  `SUPPORTED_FORMATS`, a section card's anchor to the page's sections and a quickstart card's
  format to its stack, in all four locales. Fumadocs' `Steps` and `Step` are registered there
  too, for numbered tutorial steps such as the quickstart's.
- **Stack quickstarts:** `<StackBlock name="..." />` and `<StackText field="..." />` are not
  React components. The remark plugin `remarkStackBlocks` (`lib/stack-blocks.ts`, first in
  `source.config.ts`) replaces them at compile time with fenced code (file-labelled through
  `title="..."`) and inline text from the page's `stack` frontmatter, so they render, search and
  print to `.md` like hand-written Markdown. The plugin never emits a heading: headings stay in
  the template, where the TOC and the parity tests see them. Content rules for the templates
  and stubs are in `.claude/rules/docs.md`.

## Landing motion

The landing moves in one deliberate way: content rises into place once as the visitor reaches
it, and the How steps follow the terminal that demonstrates them. There is no pinning, no
parallax, no scroll-scrubbing, no scroll listener and no animation library.

- **Reveals.** An element marked `data-reveal="<n>"` (`n` from 0 to 5) is hidden (opacity 0,
  `translate: 0 var(--reveal-distance)`) only while two things hold: `prefers-reduced-motion:
  no-preference` and `html[data-motion-ready]`. `MotionRoot`
  (`components/landing/motion-root.tsx`, mounted once at the end of the home page, rendering
  nothing) sets that attribute after hydration, so without JavaScript, before hydration and
  under reduced motion everything is visible. Before it sets the attribute it marks every
  element already on screen `data-revealed`, so nothing in the first viewport blinks out, then
  hands the rest to one shared `IntersectionObserver` (`rootMargin: 0px 0px -10% 0px`) that adds
  `data-revealed` and unobserves, so each element reveals once and never again on scroll up. Only
  the reveal transitions (`[data-reveal][data-revealed]`); hiding is instant. Focus moving into
  a block that has not revealed yet shows it at once (`:focus-within`, no transition). The
  delay is `n * --reveal-stagger`, capped at `--reveal-delay-max` through `--reveal-index`. The
  order inside a section is heading, then body, then demo: `SectionHead` with `reveal` marks its
  heading block `0` and its lead `1`; the showcase playground, the How terminal and Control's
  columns follow; each Loop row reveals as one unit, so its text never trails its picture; the
  final call to action reveals its heading, then its buttons. Sections
  stay server components: the marks are plain attributes. Elements keep their box while
  hidden, so a reveal never moves layout. `components/landing/reveal-marks.test.tsx` pins the
  marks and `motion-root.test.tsx` pins the observer and the stylesheet guards.
- **Hero.** The hero is never revealed and the `h1` never moves (it is the largest paint). On
  load, only the command panel rises `--rise-distance` once (`vk-rise`, `--duration-reveal`),
  under `no-preference` only; the ledger, the facts row and the blueprint grid are static.
- **Numbered eyebrows.** The four story sections after the marquee (`NUMBERED_SECTIONS` in
  `lib/landing-sections.ts`: showcase, how, control, loop) open with `.vk-eyebrow`: a two-digit
  mono index in `--accent` (`sectionNumber`) beside a translated sentence-case word
  (`landing.<section>.eyebrow`), passed to `SectionHead` as `step`. The numbers state the
  order of the story; do not add one to a section outside that list.
- **How steps.** `HowReplay` (`components/landing/how-replay.tsx`, the How section's client
  island) renders the terminal and the three steps, each opened by an `aria-hidden` two-digit
  `.vk-how-step-index` in mono `--accent` above its title (the `ol` carries the order for
  assistive technology). The replay starts once the terminal and the step grid are both at least half in view
  (`HOW_PLAY_RATIO`, one observer on both), which also holds on a landscape phone. The commands,
  outputs and line pace (`HOW_LINE_DELAY_MS`, longer than `--duration-demo`, so a bar finishes
  filling before the next step takes over) come from `lib/how-steps.ts`, the same objects the
  step mapping reads. The terminal reports its progress through
  `onProgress`, and `howStepStates` (`lib/how-steps.ts`) maps the printed lines to the step
  being shown (set up while the first command types, translate until the second command starts
  typing, then check): `aria-current="step"` and `data-state` (`upcoming`, `current`, `complete`) on
  each `.vk-how-step`, whose 2px `--accent` top bar fills (`scaleX`, `--duration-demo`,
  `--ease-in-out`) as the step becomes current; only the bar of an upcoming step is empty, its
  text keeps full contrast. When the run has printed, every step is
  complete and none is current. Without JavaScript and under reduced motion every bar shows
  filled, statically. The terminal's caret is a fresh element per keystroke
  (`.vk-terminal-caret`), so typing never counts as a layout shift.
- **Header call to action.** On the landing only (`landingLocale` in `components/header-cta.tsx`),
  `HomeSiteHeader` carries a small primary "Get started" (`landing.nav.headerCta.label`), first in
  the right-hand group in both the DOM and the visual order. It reserves no slot: it is
  `display: none` until `MotionRoot`'s presence observer sees the hero leave through the top of
  the viewport (`html[data-past-hero]`), and again while the final call to action is on screen
  (`html[data-final-cta]`). It then appears with a 4px fade (`vk-header-cta-in`) into the free
  space of the `justify-end` group, so nothing beside it moves. It shows under 768px and from
  1280px only, the widths where that space exists. A click counts `click-cta` with
  `location: header`.
- **Marquee.** The only infinite motion. Its two rows scroll endlessly, pause on hover and
  focus, stop and drop their edge mask while a link has keyboard focus (so the focused item
  scrolls fully into view), pause while the band is off screen (`data-offscreen`, set by the
  same presence observer), and pause from the visible `MarqueeToggle` beside the intro
  (WCAG 2.2.2): an `aria-pressed` button named by `landing.marquee.pause`, counted as
  `toggle-marquee` with `state: paused | playing` and `location: marquee`, whose box stays
  invisible until
  `MotionRoot` is ready. Under `prefers-reduced-motion: reduce` the rows wrap as a static list
  with the duplicate track hidden, and the toggle is gone.
- **Budget.** Layout shift 0 over a full scroll at 390, 1440 and a 844 by 390 landscape phone; no
  scroll listener; at most one reveal chain per section; no entrance over 16px or 600ms.

## Keep the client payload small

Mobile Lighthouse is dominated by bytes that arrive before the first paint, so:

- No animation library. Landing motion is CSS keyframes and transitions in `app/global.css`,
  each with a `prefers-reduced-motion` opt-out; the only motion script is `MotionRoot`, which
  toggles attributes from two `IntersectionObserver`s and stays under 1 KB gzipped.
- `NextIntlClientProvider` receives only `CLIENT_MESSAGE_NAMESPACES` (`lib/client-messages.ts`),
  not the whole catalog. A new `useTranslations` namespace in a `"use client"` file must be added
  there; `lib/client-messages.test.ts` fails until it is.
- A brand icon repeated on a page (the marquee's two tracks, the stack cards, the format switcher's
  chips) is drawn once as an SVG `<symbol>`
  and referenced with `<use>`, since every copy is serialized twice: in the HTML and in the RSC
  payload.
- Keep all three `next/font` families preloaded. Every one of them sets text in the first
  viewport, so it is fetched before the first paint either way; without the preload it is only
  discovered after the stylesheet, at a higher priority that delays the first contentful paint.
- Content only needed after an interaction is loaded with a dynamic `import()` on hover, focus,
  or click. The AI setup prompt is not: it is short, and its text ships in the page, in the hero
  command panel's Prompt tab and the `PromptCopyButton` preview.

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
language select for both. The primary navigation is exactly Docs, Reference and the GitHub icon
(`lib/layout.shared.test.tsx` pins it and the phone drawer): the AI setup guide, the contributor
guide, npm and the contact page are reached from the docs sidebar and the landing footer, never
from the header. The text links and the icon show from 768px (`md`), exactly where the phone
search and menu trigger hide, so every width has one of the two; the home header reserves no
empty slot, not even for its landing call to action (see "Landing motion"). At least 24px
separate the search box from the first text link and the last text link from the GitHub icon.
A text link carries `data-active` and
`aria-current` (`page` on an exact path match, `true` for a section or tab), from the root tabs on
docs and from the current path elsewhere, and the home drawer lines its items,
close button and footer icons up on one 16px start edge. The home layout swaps Fumadocs' `<main id="nd-home-layout">` container for a `<div>`
(`components/home-container.tsx`) and renders its own `<main>` around the page, with the landing
footer passed in by `app/[lang]/(home)/layout.tsx`, so the header and footer stay banner and
contentinfo landmarks; a page under that layout must not render another `<main>`.
Fumadocs' own `HomeLayout` and notebook headers are never rendered,
so do not style `#nd-nav` or `#nd-subnav`; style `.vk-header` and `.vk-header-link` instead,
and change the header in one place.

Both surfaces share one layout width: `--width-layout` (97rem, the notebook layout's own
default) feeds `--fd-layout-width` from `:root` and again on the home container, so the
header row and the docs grid sit in the same centred column on a wide monitor. The landing's
content (the hero, every section and the closing panel) shares one narrower column instead,
`.vk-gutter` plus `.vk-w-wide`, so the hero `h1` and every section heading start at one left
edge; the marquee and the footer bleed on purpose.

## The docs surface

`app/global.css` carries a docs layer keyed on Fumadocs' DOM ids (`#nd-sidebar` and its
phone-width twin `#nd-sidebar-mobile`, `#nd-toc`, `#nd-page`, `#nd-nav`) and on
`figure.shiki`. Every sidebar rule is written for both ids; a rule that names only one of them
is a bug, since the drawer is a separate `aside` outside `#nd-sidebar`. It exists so a reader coming from
the landing page recognizes the same product. The shared vocabulary, and where each piece
comes from:

- **Solid white display headlines.** `LandingHero` and the docs home header both set a solid
  `--text-strong` headline. `LandingHero` sits straight on the void page (no card, wash or
  grain), over the static blueprint grid, and is left-aligned. `.vk-hero-main` is one column,
  and from 80rem a 12-column grid: `.vk-hero-copy` spans 7 columns and the `LocaleLedger` the
  last 4 (`9 / span 4`). The copy stacks the server-rendered `h1` (`.vk-hero-title`), the sans
  `.vk-lead.vk-hero-lead` (46ch), `.vk-hero-ctas` with two buttons, the primary "Get started"
  (`/docs/quickstart`) and the secondary "Try it in the browser" (`#showcase`, counted as
  `click-cta` with `target: showcase` from `onClick`, never a `data-umami-event`), then
  `.vk-hero-panel` (`CommandPanel`) and `.vk-hero-facts`: one mono row of `HERO_FACTS` from
  `lib/landing-facts.ts`, always in digits and each a link to the page that owns it (the version
  to the GitHub releases and MIT to the licence, both `outbound-link`; the format count to
  `/docs/formats` and the provider count, "+ none", to `/docs/providers`, both `click-cta`).
  `LocaleLedger` (`components/landing/locale-ledger.tsx`, a server component) is a void code
  `figure` titled `landing.hero.headline`: one row per message file (`ledgerRows` in
  `lib/hero-ledger.ts`, read from `messages/*.json`; `en`, the source, first and full white, then
  the page's own locale, then the rest, each value with its `lang`), only the first two under
  40rem, closed by the `verbatra.lock.json` line whose hash (`HERO_HEADLINE_LOCK_HASH`) is read
  from `apps/docs/verbatra.lock.json`, never typed, and pinned by `lib/hero-ledger.test.ts` to
  the content hash of the English headline. Its `figcaption` carries `landing.hero.ledger.caption`
  and the dogfooding claim linking this site's message files. The home social image
  (`HomeOgFrame` in `lib/og-image.tsx`) repeats this look with `OG_PALETTE`, which mirrors these
  tokens, and the subset Space Grotesk and JetBrains Mono files in `assets/og-fonts/`
  (`lib/og-fonts.ts`), stripped of their kerning tables, since satori turns kerning into doubled
  word gaps; its headline wraps with `textWrap: "balance"`, and `lib/og-image.test.tsx` fails when
  a font lacks a glyph the image draws. Provenance: Space Grotesk 2.000 (`SpaceGrotesk-Medium.ttf`,
  `SpaceGrotesk-Bold.ttf` from
  `https://github.com/floriankarsten/space-grotesk/tree/master/fonts/ttf/static`) and JetBrains
  Mono 2.305 (`JetBrainsMono-Regular.ttf` from
  `https://github.com/JetBrains/JetBrainsMono/tree/master/fonts/ttf`), both OFL 1.1 with the
  licence beside them, each subset with fontTools:
  `pyftsubset <upstream>.ttf --unicodes="U+0020-007E,U+00A0-017F,U+2018-201E,U+2026"
  --layout-features="" --no-hinting --drop-tables+=GPOS,GSUB,kern,DSIG --output-file=<name>.ttf`.
  The image keeps its own composition and its own labels: the headline, two other locales
  (`heroLocaleRows`) and three counts (`OG_COUNT_FACTS` in `lib/landing-facts.ts`: formats,
  providers and the locales this site translates) labelled from `landing.hero.og`, never from
  the hero's facts row.
  A new character outside those ranges in a headline or number label needs the subset rerun. `PromptCopyButton` is `.vk-prompt` (`.vk-prompt-trigger`, `.vk-prompt-pop` holding the exact
  prompt in `.vk-prompt-text`, sans `--text-xs` with a hanging indent per numbered line, its URL
  broken only after a path `/` and each flag, and the value after it (`--skill verbatra-cli`), kept whole through `breakUrlsAtSlashes(text,
  keepFlagsWhole)`), whose preview opens on hover and on keyboard focus, CSS only, and stays shut
  once dismissed (`data-dismissed`). A copy announces "copied" (again on every copy) or, when the
  clipboard refuses, the short "Copy failed" (`landing.install.copyFailed`) in its polite live region, while the
  tooltip alone carries the full reason, so the failure is not read twice, and counts `copy-ai-prompt` only
  on success. A failure turns the trigger `--text-danger` with an alert icon and holds the preview
  open with the reason (`.vk-prompt-failed`, `data-status="failed"`) so the prompt can be selected
  by hand, on touch too, until a pointer goes down outside it or Escape is pressed. On the docs home it sits in `.vk-agent-tip`, a
  `.vk-home-callout` (`.vk-home-callout-icon`, `.vk-home-callout-body`, `.vk-home-callout-title`)
  whose `.vk-agent-tip-action` wraps under the text, with the preview spanning it, while the tip
  is under 36rem. Neither uses a
  gradient headline: the former `.vk-gradient-text` class is gone, and `--gradient-headline`
  remains only for the footer's watermark. On the docs surface only the docs home header carries
  an eyebrow (a `.vk-label`). On the landing, the four story sections carry the numbered
  `.vk-eyebrow` described under "Landing motion". No card or button on the docs home appends an
  arrow to its label: the hover border, or on a stack card the chevron, is the affordance.
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
  `DocsHomePaths`, `DocsHomeFeatures`, and the prev/next footer cards follow it; no docs home
  card is filled.
- **Void code surfaces**: `figure.shiki` sits on `var(--v-void)` inside a `--border-default`
  border, like `Terminal` and `CommandBox`. On an untitled fence the copy button sits on a void
  backing, and a one-line fence ends its scroll area before the button, so a long command never
  runs under it. A `// [!code highlight]` line gets the landing's
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
  column, and so does a `not-prose` element and everything inside it.
- **Cards**: MDX `<Cards>` / `<Card>` are Fumadocs' own, mapped in `components/mdx.tsx` to add
  `.vk-link-card` (flat panel, glow border on hover, no prose underline) and to localize `href`.
  "Next" sections end in a `<Cards>` block. A card that points at the page's own prev/next footer
  target is dropped at render time (`lib/docs-neighbours.ts`, passed to `getMDXComponents` by the
  docs page), so the footer and the cards never link the same page twice.
- **Install commands as package-manager tabs**: an install command is an `npm` fence
  (`` ```npm ``) holding the one npm command. `remarkPackageManagerTabs`
  (`lib/package-manager-tabs.ts`, after `remarkStackBlocks` in `source.config.ts`) runs Fumadocs'
  own `remarkNpm` on it, so it renders as Fumadocs' `CodeBlockTabs` (npm, pnpm, yarn, bun) with one
  remembered choice (`groupId` `package-manager`), and prints the npm command alone in the page's
  `.md` output. The preset plugin stays off (`remarkNpmOptions: false`), and
  `lib/install-commands.test.ts` fails on an `npm` fence that is not an `npm install`, so every
  other command stays one `npx` line in a `bash` fence. `StackBlock name="runtime-install"` emits
  the `npm` fence for an `npm install` (`isNpmInstall`, the predicate the test shares) and `bash`
  for any other tool, and `<InitCommand format>` accepts only a format id from the published
  `@verbatra/sdk/config-schema.json`. The plugin turns each fence into its own tabs and
  marks that node for the `.md` output, never another `CodeBlockTabs` on the page. A
  `` ```verbatra-run `` fence (`RUN_FENCE_LANG`) holds only the arguments (`<command>`) and
  becomes the same tabs with the binary each manager runs (`npx @verbatra/cli`, `pnpm verbatra`,
  `yarn verbatra`, `bun run verbatra`), sharing the remembered choice; `cli/index` uses it. The
  landing hero's command panel takes `NPM_INSTALL_COMMAND` from `lib/install-commands.ts` and shows
  no package-manager tabs; the docs home has no install box (its Quickstart tab and agent tip lead there).
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
  `data-label` per body cell from `lib/stacked-tables.ts` at build time, unless every body row
  holds at most `COMPACT_ROW_MAX_CHARACTERS` of text (the error code index), which stays a table
  at every width. Only while the article column is under 30rem (a phone) does a stacked table's
  row become a card: the first cell as its title, every other cell under its column name. A table
  of `WIDE_TABLE_MIN_COLUMNS` (six) or more columns also gets `.vk-table-stack-wide` and stacks
  below 56rem, with its column names beside the values, since it cannot fit the desktop article
  column (about 41.5rem at 1280). Under 30rem, long code and pills in a cell may wrap anywhere
  too, so a two-column table fits a phone. Short code (`.vk-code-short`) in a cell, at every
  width, breaks only at the points `breakInlineCode` offers. The header row stays
  in the DOM for assistive technology. Short inline code (up to `SHORT_INLINE_CODE_MAX`
  characters in `lib/inline-code.ts`) gets `.vk-code-short` from the MDX `code` mapping and never
  wraps elsewhere; longer inline code wraps, in cells and in prose alike, and the mapping runs it through
  `breakInlineCode` (`lib/word-breaks.tsx`): a `<wbr>` after every underscore, so
  `verbatra_project_snapshot` wraps at `_` before anywhere else, a `.vk-code-break` (a zero-width
  space drawn by CSS, never copied) after a `.`, `/` or `]` between word characters, so
  `result.config.files` wraps at a dot, and every `--flag` or other hyphenated piece kept whole
  in a `whitespace-nowrap` span, so `--agent` never wraps after its hyphen.
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
