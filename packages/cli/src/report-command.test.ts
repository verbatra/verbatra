import { SdkError } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { JSON_ENVELOPE_VERSION } from "./json-envelope.js";
import { renderExportHuman, renderTmxExportHuman } from "./render.js";
import { run } from "./run.js";
import {
  captureStreams,
  makeExportResult,
  makeExportTmxResult,
  makeProvenanceReport,
  parseEnvelope,
  recordingDeps,
} from "./test-support.js";

describe("run report provenance", () => {
  it("delegates to the SDK with the cwd, the locale filter and the CLI version", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(
      ["report", "provenance", "--cwd", "/proj", "--locales", "de, fr"],
      deps,
      cap.streams,
    );

    expect(code).toBe(0);
    expect(calls.provenanceReport).toHaveLength(1);
    expect(calls.provenanceReport[0]).toMatchObject({ cwd: "/proj", locales: ["de", "fr"] });
    expect(calls.provenanceReport[0]?.toolVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("prints a summary table with every bucket and the evidence disclaimer", async () => {
    const { deps } = recordingDeps();
    const cap = captureStreams();

    await run(["report", "provenance"], deps, cap.streams);

    const out = cap.out();
    expect(out).toContain(
      "verbatra report provenance (source en, verbatra 1.2.3, 2026-09-29T08:00:00.000Z)",
    );
    expect(out).toContain(
      "  locale  machine, unreviewed  machine, reviewed  human  import  external  unrecorded  unknown  total",
    );
    expect(out).toContain(
      "  de      1                    1                  1      0       0         0           0        3",
    );
    expect(out).toContain("not legal advice");
  });

  it("prints the whole report in the JSON envelope", async () => {
    const { deps } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["report", "provenance", "--json"], deps, cap.streams);

    expect(code).toBe(0);
    const envelope = parseEnvelope(cap.out());
    expect(envelope).toEqual({
      ok: true,
      version: JSON_ENVELOPE_VERSION,
      command: "report",
      result: makeProvenanceReport(),
    });
  });

  it("fails closed with exit 1 when the provenance file cannot be read", async () => {
    const { deps } = recordingDeps({
      provenanceReport: async () => ({ available: false, reason: "provenance-unreadable" }),
    });
    const human = captureStreams();
    const json = captureStreams();

    expect(await run(["report", "provenance"], deps, human.streams)).toBe(1);
    expect(await run(["report", "provenance", "--json"], deps, json.streams)).toBe(1);

    expect(human.out()).toContain("no report: verbatra.provenance.json is corrupt");
    expect(parseEnvelope(json.out())).toMatchObject({
      ok: true,
      command: "report",
      result: { available: false, reason: "provenance-unreadable" },
    });
  });

  it("refuses an unknown report as a usage error", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["report", "costs", "--json"], deps, cap.streams);

    expect(code).toBe(2);
    expect(calls.provenanceReport).toHaveLength(0);
    expect(parseEnvelope(cap.out())).toMatchObject({
      ok: false,
      command: "report",
      code: "USAGE_ERROR",
    });
    expect(parseEnvelope(cap.out()).message).toContain("provenance");
  });

  it("surfaces an SDK error as an error envelope with exit 2", async () => {
    const { deps } = recordingDeps({
      provenanceReport: async () => {
        throw new SdkError("UNKNOWN_LOCALE", "The locale it is not configured.");
      },
    });
    const cap = captureStreams();

    const code = await run(
      ["report", "provenance", "--locales", "it", "--json"],
      deps,
      cap.streams,
    );

    expect(code).toBe(2);
    expect(parseEnvelope(cap.out())).toMatchObject({ ok: false, code: "UNKNOWN_LOCALE" });
  });
});

describe("export renderers name missing provenance markers", () => {
  it("says an XLIFF export wrote no marker when the record was unreadable", () => {
    expect(renderExportHuman(makeExportResult({ provenanceMarkers: "unavailable" }))).toContain(
      "no machine-translation markers written: verbatra.provenance.json could not be read",
    );
    expect(renderExportHuman(makeExportResult({ provenanceMarkers: "written" }))).not.toContain(
      "markers",
    );
  });

  it("says a TMX export wrote no marker when the record or the lock was unreadable", () => {
    expect(
      renderTmxExportHuman(makeExportTmxResult({ provenanceMarkers: "unavailable" })),
    ).toContain("verbatra.provenance.json or verbatra.lock.json could not be read");
    expect(renderTmxExportHuman(makeExportTmxResult())).not.toContain("markers");
  });
});
