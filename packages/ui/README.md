# @verbatra/ui

> Private package. Not published, not built. It ships raw CSS and TypeScript source that the
> consuming app bundles.

## Purpose

The shared design tokens for the verbatra surfaces. `apps/docs` consumes them; Studio does not yet. `src/tokens.css` holds the brand primitives (`--v-*`), the semantic
layer (`--surface-*`, `--border-*`, `--text-*`, `--accent*`, `--focus-ring`, `--scrim`), the type,
radius, shadow, motion and layout scales, and the heading font binding.

## Contract

- Theme palettes sit under `.dark, [data-theme="dark"]` and `.light, [data-theme="light"]`. The
  consuming app decides its own default theme, attribute or class, and storage key.
- Theme-invariant tokens sit under `:root`. Derived tokens resolve there, so the theme class or
  attribute must be set on the document root element (`<html>`), not on an inner element.
- Fonts resolve through `--font-geist-sans` and `--font-geist-mono`, which the app provides, with a
  system stack as the fallback.
- `apps/docs` imports `@verbatra/ui/tokens.css` right after its Fumadocs and Tailwind imports, then
  aliases its `--color-fd-*` variables onto the semantic tokens.
