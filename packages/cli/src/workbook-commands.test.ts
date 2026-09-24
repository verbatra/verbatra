import { EXCHANGE_FORMATS, SdkError } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { JSON_ENVELOPE_VERSION } from "./json-envelope.js";
import { run, runImport } from "./run.js";
import {
  captureStreams,
  makeExportResult,
  makeLoadedConfig,
  makeLocale,
  makeSummary,
  parseEnvelope,
  recordingDeps,
} from "./test-support.js";

describe("run export: SDK delegation and rendering", () => {
  it("delegates to exportWorkbook with resolved cwd and renders the path and counts", async () => {
    const result = makeExportResult({
      path: "/proj/verbatra-translations.xlsx",
      locales: [{ locale: "de", rows: 3 }],
    });
    const { deps, calls } = recordingDeps({ exportWorkbook: async () => result });
    const cap = captureStreams();

    const code = await run(["export", "--cwd", "/proj"], deps, cap.streams);

    expect(code).toBe(0);
    expect(calls.exportWorkbook).toHaveLength(1);
    expect(calls.exportWorkbook[0]).toMatchObject({ cwd: "/proj" });
    expect(cap.out()).toContain("verbatra export -> /proj/verbatra-translations.xlsx");
    expect(cap.out()).toContain("de: 3 rows");
  });

  it("parses --out, --locales, and --include-unchanged into the SDK call", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    await run(
      ["export", "--out", "wb.xlsx", "--locales", "de, fr ,", "--include-unchanged"],
      deps,
      cap.streams,
    );

    expect(calls.exportWorkbook[0]).toMatchObject({
      out: "wb.xlsx",
      locales: ["de", "fr"],
      includeUnchanged: true,
    });
  });

  it("passes --format csv through to the SDK", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    await run(["export", "--format", "csv", "--out", "handoff"], deps, cap.streams);

    expect(calls.exportWorkbook[0]).toMatchObject({ format: "csv", out: "handoff" });
  });

  it.each(EXCHANGE_FORMATS)(
    "accepts --format %s, every format the SDK enumerates",
    async (format) => {
      const { deps, calls } = recordingDeps();
      const cap = captureStreams();

      const code = await run(["export", "--format", format], deps, cap.streams);

      expect(code).toBe(0);
      expect(calls.exportWorkbook[0]).toMatchObject({ format });
    },
  );

  it("omits the format entirely when the flag is absent, so the SDK default applies", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    await run(["export"], deps, cap.streams);

    expect(calls.exportWorkbook[0]).not.toHaveProperty("format");
  });

  it("rejects an unknown --format as a usage error: exit 2, clean stdout, no SDK call", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["export", "--format", "ods"], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.out()).toBe("");
    expect(calls.exportWorkbook).toHaveLength(0);
    expect(cap.err()).toContain("[INVALID_FORMAT]");
    expect(cap.err()).toContain('The --format option must be one of xlsx, csv, tsv, got "ods".');
    expect(cap.err()).not.toContain("invalid_value");
    expect(cap.err()).not.toContain('"path"');
  });

  it("--json prints the export result as one success envelope", async () => {
    const result = makeExportResult({ path: "/p/wb.xlsx", locales: [{ locale: "de", rows: 1 }] });
    const { deps } = recordingDeps({ exportWorkbook: async () => result });
    const cap = captureStreams();

    await run(["export", "--json"], deps, cap.streams);

    expect(parseEnvelope(cap.out())).toEqual({
      ok: true,
      version: JSON_ENVELOPE_VERSION,
      command: "export",
      result,
    });
  });

  it("a whole-run error renders to stderr and exits 2", async () => {
    const { deps } = recordingDeps({
      loadConfigWithMeta: async () => {
        throw Object.assign(new Error("no config"), { code: "CONFIG_NOT_FOUND" });
      },
    });
    const cap = captureStreams();

    const code = await run(["export"], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.err()).toContain("[CONFIG_NOT_FOUND]");
    expect(cap.out()).toBe("");
  });

  it("rejects an empty --locales list as a usage error: exit 2, stderr, clean stdout, no SDK call", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["export", "--locales", ""], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.err()).toContain("[INVALID_LOCALES]");
    expect(cap.out()).toBe("");
    expect(calls.exportWorkbook).toHaveLength(0);
  });

  it("rejects a comma-only --locales list as a usage error", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["export", "--locales", ","], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.err()).toContain("[INVALID_LOCALES]");
    expect(cap.out()).toBe("");
    expect(calls.exportWorkbook).toHaveLength(0);
  });

  it("passes an unknown but non-empty --locales through, and the SDK UNKNOWN_LOCALE exits 2", async () => {
    const { deps, calls } = recordingDeps({
      exportWorkbook: async () => {
        throw Object.assign(new Error("Requested locale not in configured targets: fr."), {
          code: "UNKNOWN_LOCALE",
        });
      },
    });
    const cap = captureStreams();

    const code = await run(["export", "--locales", "fr"], deps, cap.streams);

    expect(code).toBe(2);
    expect(calls.exportWorkbook[0]).toMatchObject({ locales: ["fr"] });
    expect(cap.err()).toContain("[UNKNOWN_LOCALE]");
    expect(cap.out()).toBe("");
  });
});

describe("run export: the output guard", () => {
  it("hands the SDK the loaded config file, so the output guard refuses it under any name", async () => {
    const { deps, calls } = recordingDeps({
      loadConfigWithMeta: async () =>
        makeLoadedConfig({ source: { kind: "explicit", filepath: "/proj/custom/settings.ts" } }),
    });
    const cap = captureStreams();

    await run(["export", "--cwd", "/proj", "--config", "custom/settings.ts"], deps, cap.streams);

    expect(calls.loadConfigWithMeta[0]).toMatchObject({
      cwd: "/proj",
      configPath: "custom/settings.ts",
    });
    expect(calls.exportWorkbook[0]).toMatchObject({ configPath: "/proj/custom/settings.ts" });
  });

  it("hands the SDK a file-backed glossary's path, so the output guard refuses it", async () => {
    const { deps, calls } = recordingDeps({
      loadConfigWithMeta: async () =>
        makeLoadedConfig({ glossary: { source: "file", path: "/proj/glossary.json" } }),
    });
    const cap = captureStreams();

    await run(["export", "--cwd", "/proj"], deps, cap.streams);

    expect(calls.exportWorkbook[0]).toMatchObject({ glossaryPath: "/proj/glossary.json" });
  });

  it("names no config file when the config came from no file", async () => {
    const { deps, calls } = recordingDeps({
      loadConfigWithMeta: async () => makeLoadedConfig({ source: { kind: "override" } }),
    });
    const cap = captureStreams();

    await run(["export", "--cwd", "/proj"], deps, cap.streams);

    expect(calls.exportWorkbook[0]).not.toHaveProperty("configPath");
  });

  it.each([
    ["EXPORT_OUTPUT_CONFLICT", 'The output path "locales/de.json" is the locale file for "de".'],
    ["EXPORT_UNWRITABLE", "Could not write the handoff file handoff.xlsx (EACCES)."],
  ] as const)("reports %s as a structured failure envelope and exits 2", async (code, message) => {
    const { deps } = recordingDeps({
      exportWorkbook: async () => {
        throw new SdkError(code, message);
      },
    });
    const cap = captureStreams();

    const exit = await run(
      ["export", "--out", "locales/de.json", "--cwd", "/proj", "--json"],
      deps,
      cap.streams,
    );

    expect(exit).toBe(2);
    expect(parseEnvelope(cap.out())).toMatchObject({
      ok: false,
      command: "export",
      code,
      message,
    });
  });
});

describe("run import: SDK delegation and rendering", () => {
  it("delegates to importWorkbook with the workbook arg and renders the summary as import", async () => {
    const summary = makeSummary({
      locales: [makeLocale({ translated: ["a"] })],
      succeeded: ["de"],
    });
    const { deps, calls } = recordingDeps({ importWorkbook: async () => summary });
    const cap = captureStreams();

    const code = await run(["import", "translations.xlsx"], deps, cap.streams);

    expect(code).toBe(0);
    expect(calls.importWorkbook[0]).toMatchObject({ workbook: "translations.xlsx" });
    expect(cap.out()).toContain("verbatra import");
    expect(cap.out()).toContain("de: 1 translated");
  });

  it("--dry-run passes dryRun:true", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    await run(["import", "wb.xlsx", "--dry-run"], deps, cap.streams);

    expect(calls.importWorkbook[0]).toMatchObject({ workbook: "wb.xlsx", dryRun: true });
  });

  it("passes --format tsv through to the SDK with the path argument", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    await run(["import", "handoff", "--format", "tsv"], deps, cap.streams);

    expect(calls.importWorkbook[0]).toMatchObject({ workbook: "handoff", format: "tsv" });
  });

  it("omits the format entirely when the flag is absent, so the SDK default applies", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    await run(["import", "wb.xlsx"], deps, cap.streams);

    expect(calls.importWorkbook[0]).not.toHaveProperty("format");
  });

  it("rejects an unknown --format as a usage error: exit 2, clean stdout, no SDK call", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["import", "wb.csv", "--format", "ods"], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.out()).toBe("");
    expect(calls.importWorkbook).toHaveLength(0);
    expect(cap.err()).toContain("[INVALID_FORMAT]");
    expect(cap.err()).toContain('The --format option must be one of xlsx, csv, tsv, got "ods".');
    expect(cap.err()).not.toContain("invalid_value");
    expect(cap.err()).not.toContain('"path"');
  });

  it("rejects --format json, the likely typo for the --json flag, with the same usage error", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["import", "wb.csv", "--format", "json"], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.err()).toContain("[INVALID_FORMAT]");
    expect(cap.err()).not.toContain("invalid_value");
    expect(calls.importWorkbook).toHaveLength(0);
  });

  it("exits 1 when a locale failed (same rule as translate)", async () => {
    const summary = makeSummary({
      locales: [makeLocale({ status: "failed", error: { code: "CONFIG_INVALID", message: "x" } })],
      failed: ["es"],
    });
    const { deps } = recordingDeps({ importWorkbook: async () => summary });
    const cap = captureStreams();

    const code = await run(["import", "wb.xlsx"], deps, cap.streams);

    expect(code).toBe(1);
  });

  it("exits 1 when a locale is partial and none failed (same rule as translate)", async () => {
    const summary = makeSummary({
      locales: [
        makeLocale({ status: "partial", translated: ["greeting"], providerFailures: ["farewell"] }),
      ],
      succeeded: [],
      partial: ["es"],
      failed: [],
    });
    const { deps } = recordingDeps({ importWorkbook: async () => summary });
    const cap = captureStreams();

    const code = await run(["import", "wb.xlsx"], deps, cap.streams);

    expect(code).toBe(1);
  });

  it("a whole-run error renders to stderr and exits 2", async () => {
    const { deps } = recordingDeps({
      importWorkbook: async () => {
        throw Object.assign(new Error("bad workbook"), { code: "SOURCE_INVALID" });
      },
    });
    const cap = captureStreams();

    const code = await run(["import", "wb.xlsx"], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.err()).toContain("[SOURCE_INVALID]");
  });

  it("a lock-file corrupted mid-run escapes as a whole-run error and exits 2, not 1", async () => {
    const corrupt = recordingDeps({
      importWorkbook: async () => {
        throw new SdkError("LOCK_FILE_INVALID", "The lock-file is not valid JSON.");
      },
    });
    const corruptCap = captureStreams();

    const corruptCode = await run(["import", "wb.xlsx"], corrupt.deps, corruptCap.streams);

    expect(corruptCode).toBe(2);
    expect(corruptCap.err()).toContain("[LOCK_FILE_INVALID]");

    const failing = recordingDeps({
      importWorkbook: async () =>
        makeSummary({ locales: [makeLocale({ status: "failed" })], failed: ["de"] }),
    });
    const failingCap = captureStreams();

    const failingCode = await run(["import", "wb.xlsx"], failing.deps, failingCap.streams);

    expect(failingCode).toBe(1);
  });

  it("a malformed rawOpts renders a structured error and exits 2, never throws", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await runImport("wb.xlsx", { cwd: 123 }, deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.out()).toBe("");
    expect(cap.err()).not.toBe("");
    expect(calls.loadConfig).toHaveLength(0);
  });
});
