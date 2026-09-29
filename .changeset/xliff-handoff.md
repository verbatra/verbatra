---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Hand strings to a translation agency as XLIFF: `verbatra export --format xliff2` (or `xliff12`) and
`verbatra import <file.xlf>`, for every project format.

Previously XLIFF was only a project file format, and a handoff to a CAT tool such as Trados,
memoQ, OmegaT, Matecat or Phrase had to go through Excel, CSV or TSV, which carry no segment
states, notes or protected inline codes.

Now `exportWorkbook({ format: "xliff2" | "xliff12" })` writes one `<locale>.xlf` per target locale
into the output directory, with a hidden manifest like the delimited formats. Each key becomes a
unit named by the key; placeholders, inline markup and ICU structure become `<ph>` inline codes a
CAT tool shows and protects; the key's description and meaning become notes; and the source hash
travels in the unit's metadata (XLIFF 2.0 `mda` module, XLIFF 1.2 `extradata`). The segment state
follows the lock and review state: missing and stale keys are `initial` (1.2 `new`, or
`needs-translation` with the old translation prefilled), up-to-date ones `translated`, approved
ones `reviewed` (1.2 `signed-off`).

`importWorkbook` reads either version back, detected from the file, and picks XLIFF on its own for
a path ending in `.xlf` or `.xliff`. Every inline code resolves to its exact original text before
the same integrity gate, `[[CLEAR]]` and blank semantics, and stale-source guard as a workbook
import; when a tool stripped the source hash, the unit's source text is compared instead. A target
left exactly as exported changes nothing, a unit whose id names no source key is reported as a
malformed row, and XML entity declarations are refused. A unit marked `reviewed` or `final` (1.2:
`signed-off`, `final` or `approved="yes"`) is recorded as approved in the provenance file, naming
the new `reviewer` input (`verbatra import --reviewer <name>`), and reported with the new
`HANDOFF_REVIEWS_RECORDED` notice.
