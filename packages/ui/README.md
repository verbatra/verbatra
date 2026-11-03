# @verbatra/ui

> Private package. Not published, not built. It ships raw CSS and TypeScript source that the
> consuming app bundles.

## Purpose

The shared design tokens for the verbatra surfaces. `apps/docs` and `@verbatra/studio` consume
them. `src/tokens.css` holds the brand primitives (`--v-*`), the semantic layer (`--surface-*`,
`--border-*`, `--text-*`, `--accent*`, `--focus-ring`, `--scrim`), the status and diff tones
(`--status-*`, `--diff-*`, each with a `-soft` tint), the type, radius, shadow, motion
and layout scales, and the heading font binding.

## Contract

- Theme palettes sit under `.dark, [data-theme="dark"]` and `.light, [data-theme="light"]`. The
  consuming app decides its own default theme, attribute or class, and storage key.
- Theme-invariant tokens sit under `:root`. Derived tokens resolve there, so the theme class or
  attribute must be set on the document root element (`<html>`), not on an inner element.
- Fonts resolve through `--font-geist-sans` and `--font-geist-mono`, which the app provides, with a
  system stack as the fallback.
- `apps/docs` imports `@verbatra/ui/tokens.css` right after its Fumadocs and Tailwind imports, then
  aliases its `--color-fd-*` variables onto the semantic tokens.
- Studio imports `@verbatra/ui/tokens.css` and `@verbatra/ui/fonts.css` in `styles.css` and maps
  its Tailwind colors onto the semantic tokens.

## Exports

- `@verbatra/ui/tokens.css`: the tokens. The `[data-theme-switching]` rule suppresses transitions
  for the frame in which the theme changes.
- `@verbatra/ui/fonts.css`: Geist and Geist Mono `@font-face` rules (variable woff2, latin and
  latin-ext) and the `--font-geist-sans` / `--font-geist-mono` variables. Import it where the host
  serves same-origin fonts; docs loads Geist through `next/font` instead.
- `@verbatra/ui/theme`: `createThemeStore({ storageKey, modes })` for `system | light | dark`. It
  writes the resolved theme to `data-theme` on `<html>` and never injects a style element, so it
  works under `style-src 'self'`. `csp-guard.test.ts` fails on a created style element,
  `insertRule`, `replaceSync` or an `innerHTML` write.
- `@verbatra/ui/cn`: `cn()`, clsx plus tailwind-merge.

## Fonts

The woff2 files in `src/fonts/` are the unmodified latin and latin-ext subsets from
`@fontsource-variable/geist` 5.3.0 and `@fontsource-variable/geist-mono` 5.3.0 (npm `geist`
peer-depends on `next`, so it is not used). The font software is licensed under the SIL Open Font
License 1.1; the text is `src/fonts/OFL-Geist.txt`, copied from the Fontsource package. Update the
files and this version note together.
