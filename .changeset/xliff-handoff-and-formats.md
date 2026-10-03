---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

XLIFF 1.2 and 2.0 agency handoff, spec-accurate XLIFF, and layout-keeping writes.

**XLIFF handoff**
- `verbatra export --format xliff2` (or `xliff12`) writes one `<locale>.xlf` per target locale for
  any project format. Placeholders, markup and ICU become protected inline codes, descriptions
  become notes, and segment states follow the lock and review state.
- `verbatra import <file.xlf>` reads either version through the integrity gate. A unit marked
  reviewed or final is recorded as approved under `--reviewer <name>`.
- `verbatra import <file>` takes the handoff format from the extension when `--format` is left
  out: `.csv`, `.tsv`, `.xlf`/`.xliff` and `.xlsx`, and for a directory from its export manifest
  or locale files (SDK: `importWorkbook` without `format`).

**XLIFF files**
- An empty, missing, `new` or `needs-translation` target counts as missing and is translated, and
  a key missing from the target document gets its own unit.
- Text is escaped exactly once, and each version keeps its own inline elements and attributes.

**Other formats and writes**
- Android, XLIFF and gettext writes keep line endings and indentation, and a created `.po` file
  gets a `Language` header.
- A Flutter ARB target starts with `@@locale`, and prune and reject remove ARB keys.
- No empty target file is created for a locale whose keys were all withheld, and `import` writes
  new keys in source order.
