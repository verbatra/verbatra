---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add `verbatra doctor --literals`, a keyless lint that flags hardcoded user-facing strings that never
made it into a translation catalog.

It scans the source roots of the `extract` block and reports every JSX text node, user-facing JSX
attribute (`alt`, `title`, `placeholder`, `label`, `aria-label` and similar), and prose-like string
literal that does not go through a recognised translation call. Each finding carries its file, line,
and column, and its text is cut to at most 80 characters. The scan prefers staying quiet to being
noisy: a literal passed to `t()` or rendered inside `<Trans>`, an object key, an import specifier, a
class name or CSS value, a test id or `data-*` attribute, a URL, a literal in a type position, a
logging or error message, a comparison operand, a literal with no letters, and test, story,
declaration and config files are never reported, and a single word outside JSX is not reported
either.

A `// verbatra-ignore-next-line` or `// verbatra-ignore-line` comment (also as `{/* ... */}` in
JSX) holds a literal back at the call site, and the new optional `extract.literals.ignore` list
holds exact texts back project-wide. Held-back literals are still listed, under `suppressed`, with
the reason.

The lint reads source and never writes it, constructs no provider, reads no API key environment
variable, and loads no `.env` file, so it passes with no key set. In this mode `doctor` runs the
config check and the literal check only. It exits `0` when nothing was found, `1` when a literal was
found or a file could not be scanned (a file the scanner cannot parse is a diagnostic, never a
silent pass), and `2` when it cannot run. `--json` prints the usual envelope with the scan under
`result.literals`. `doctor({ literals: true })` is the SDK entry point, and `DoctorResult.literals`
carries the same data.
