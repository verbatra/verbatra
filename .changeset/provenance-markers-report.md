---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Mark machine-translated text in XLIFF and TMX exports, and add `verbatra report provenance`.

An XLIFF 1.2 export now qualifies a target a provider, the translation memory, a fuzzy match or
an AI agent wrote, and that no person has approved, with `state-qualifier="mt-suggestion"`. An
XLIFF 2.0 export writes the key's `origin` and `review-state` into the unit's `verbatra`
metadata group. A TMX export writes `<prop type="x-origin">` (`machine`, `human`, `import` or
`unknown`) on each target segment, plus `<prop type="x-review">` on machine text. Importing
these files ignores the markers. When `verbatra.provenance.json` cannot be read, no marker is
written and the export result says `provenanceMarkers: "unavailable"`.

`verbatra report provenance` (SDK: `provenanceReport`) prints, per target locale, how many
values are machine-written and unreviewed, machine-written and reviewed, human, imported,
external, unrecorded or unknown, and with `--json` every key's origin, review state, provider,
model and reviewer, stamped with the time, the verbatra version and the source locale. It is
read-only and keyless. It exits 1 when the provenance file is corrupt or from a newer verbatra.
The report is supporting evidence of which text was machine-generated, not legal advice.
