---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add `verbatra doctor --literals`, a keyless lint that flags hardcoded user-facing strings that never
made it into a translation catalog.

It scans the source roots of the `extract` block and reports every JSX text node, user-facing JSX
attribute (`alt`, `title`, `placeholder`, `label`, `aria-label` and similar), and prose-like string
literal that does not go through a recognised translation call. Each finding carries its file, line,
and column, and its text has whitespace collapsed, JSX character references such as `&amp;` decoded,
and is cut to at most 80 characters. The scan prefers staying quiet to being noisy: a literal passed
to `t()` (also when renamed, as in `const { t: translate } = useTranslation()`, from that declaration to the
end of its block) or rendered inside
`<Trans>` or `<Translation>`, an object key, an import specifier, a class name or CSS value, a test
id or `data-*` attribute, an attribute that holds ids or a keyword (`aria-describedby`,
`aria-labelledby`, `rel`, `sandbox`, `autoComplete`, `referrerPolicy` and similar), a URL, a literal
in a type position (including one after `as` or `satisfies`), a logging message, the message
of a constructed error (`new ValidationError(...)`) or of a built-in error called without `new`
(`throw Error(...)`), a comparison operand, a literal with no
letters, and test, story, declaration and config files are never reported, and a single word outside
JSX is not reported either. The direct string arguments of `describe`, `query`, `execute`,
`prepare`, `format`, and `parse`, the string elements of the array passed directly to `z.enum`, every
string argument of `setItem`, `getItem`, and `removeItem`, and the first argument of `on`, `off`,
`once`, `emit`, `addEventListener`, and a member `get` or `set` call, are skipped too. A string nested
deeper inside one of those calls, such as in a callback, an object, or JSX, is still checked. A
function that only ends in `Error`, such as `setError`, is still checked.

A `// verbatra-ignore-next-line` or `// verbatra-ignore-line` comment (also as `{/* ... */}` in JSX)
holds a literal back at the call site. A next-line directive covers the next non-blank line and,
when a JSX element starts there, that whole element. The new optional `extract.literals.ignore` list
holds exact texts back project-wide, matched against the text as reported (whitespace collapsed,
character references decoded). Held-back literals are still listed, under `suppressed`, with
the reason.

The lint reads source and never writes it, constructs no provider, reads no API key environment
variable, and loads no `.env` file, so it passes with no key set. In this mode `doctor` runs the
config check and the literal check only. It exits `0` when nothing was found, `1` when a literal was
found or a file could not be scanned (a file the scanner cannot read to the end, such as one with an
unterminated comment or template literal, is a diagnostic, never a silent pass; a generic function
type such as `<T>(x: T) => T` in a `.tsx` file is read as code and never fails the file), and `2`
when it cannot run. `--json` prints the usual envelope with the scan under `result.literals`.
`doctor({ literals: true })` is the SDK entry point, and `DoctorResult.literals` carries the same
data.
