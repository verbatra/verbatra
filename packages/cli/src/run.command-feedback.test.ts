import { join } from "node:path";
import type { ScanProgressEvent } from "@verbatra/sdk";
import { SdkError } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { run } from "./run.js";
import {
  captureStreams,
  makeConfig,
  makeDiffSummary,
  makeExportResult,
  makeExtractResult,
  makeImportTmxResult,
  makeLocale,
  makePseudoResult,
  makeSummary,
  makeTypesResult,
  recordingDeps,
} from "./test-support.js";
import type { CliDeps } from "./types.js";

const DONE = /done \(\d+\.\ds\)\n/;

async function stderrOf(argv: readonly string[], impl: Partial<CliDeps> = {}) {
  const cap = captureStreams();
  const code = await run([...argv], recordingDeps(impl).deps, cap.streams);
  return { code, err: cap.err(), out: cap.out() };
}

const inCwd = (...parts: string[]): string => join(process.cwd(), ...parts);

describe("translate: start, outcome and next step", () => {
  it("announces the locales and provider, keeps the progress lines, and ends with a next step", async () => {
    const { code, err } = await stderrOf(["translate"], {
      translate: async (input) => {
        input.onProgress?.({
          type: "locale-started",
          locale: "de",
          localeIndex: 0,
          totalLocales: 1,
        });
        return makeSummary({
          succeeded: ["de"],
          usage: { inputTokens: 100, outputTokens: 20 },
          locales: [makeLocale({ translated: ["a"] })],
        });
      },
    });

    expect(code).toBe(0);
    expect(err).toMatch(
      /^verbatra: translating 1 locale with anthropic\/test-model\nverbatra: translating de\n\[ok\] done in \d+\.\ds, 120 tokens\nnext: verbatra check \(confirm every locale is in sync\)\n$/,
    );
  });

  it("marks a dry run and points at the real run", async () => {
    const { err } = await stderrOf(["translate", "--dry-run"], {
      translate: async () => makeSummary({ dryRun: true }),
    });

    expect(err).toContain("verbatra: dry run over 1 locale, no provider call\n");
    expect(err).toMatch(/\[ok\] dry run done in \d+\.\ds, nothing written\n/);
    expect(err).toContain("next: verbatra translate (run it for real)\n");
  });

  it("marks an estimate", async () => {
    const { err } = await stderrOf(["translate", "--estimate", "--locales", "de"], {
      translate: async () => makeSummary({ dryRun: true }),
    });

    expect(err).toContain("verbatra: estimating 1 locale, no provider call\n");
  });

  it("names the memory-only fill when machine translation is off", async () => {
    const { err } = await stderrOf(["translate"], {
      loadConfig: async () => makeConfig({ provider: { id: "none", options: {} } }),
    });

    expect(err).toContain(
      "verbatra: filling 1 locale from the translation memory (provider none)\n",
    );
  });

  it("names a provider without a model by its id", async () => {
    const { err } = await stderrOf(["translate"], {
      loadConfig: async () =>
        makeConfig({
          provider: { id: "deepl", options: {} } as ReturnType<typeof makeConfig>["provider"],
        }),
    });

    expect(err).toContain("verbatra: translating 1 locale with deepl\n");
  });

  it("warns instead of suggesting a next step when a locale failed", async () => {
    const { code, err } = await stderrOf(["translate"], {
      translate: async () => makeSummary({ failed: ["de"] }),
    });

    expect(code).toBe(1);
    expect(err).toMatch(/\[warn\] finished in \d+\.\ds, see the summary above\n/);
    expect(err).not.toContain("next:");
  });

  it("stays silent about all of it under --quiet and --json", async () => {
    for (const flag of ["--quiet", "--json"]) {
      const { err } = await stderrOf(["translate", flag]);
      expect(err).toBe("");
    }
  });
});

describe("export and import: task lines and hand-off hints", () => {
  it("export points at the import of the file it wrote", async () => {
    const { err } = await stderrOf(["export"], {
      exportWorkbook: async () =>
        makeExportResult({ path: inCwd("handoff.xlsx"), locales: [{ locale: "de", rows: 2 }] }),
    });

    expect(err).toMatch(/^verbatra: exporting to xlsx\.\.\. done \(\d+\.\ds\)\n/);
    expect(err).toContain(
      "next: verbatra import handoff.xlsx (once your translators have filled it in)\n",
    );
  });

  it("export suggests nothing when there was nothing to hand off", async () => {
    const { err } = await stderrOf(["export", "--format", "csv"], {
      exportWorkbook: async () => makeExportResult({ locales: [{ locale: "de", rows: 0 }] }),
    });

    expect(err).toMatch(/^verbatra: exporting to csv\.\.\. done/);
    expect(err).not.toContain("next:");
  });

  it("export marks the task failed before the error line", async () => {
    const { code, err } = await stderrOf(["export"], {
      exportWorkbook: () => Promise.reject(new SdkError("SOURCE_UNREADABLE", "disk full")),
    });

    expect(code).toBe(2);
    expect(err).toMatch(
      /^verbatra: exporting to xlsx\.\.\. failed \(\d+\.\ds\)\nverbatra: error \[SOURCE_UNREADABLE\] disk full\nnext: .+\n$/,
    );
  });

  it("import suggests a check after a clean import", async () => {
    const { err } = await stderrOf(["import", "handoff.xlsx"], {
      importWorkbook: async () => makeSummary({ succeeded: ["de"] }),
    });

    expect(err).toMatch(/^verbatra: importing handoff\.xlsx\.\.\. done/);
    expect(err).toContain("next: verbatra check (confirm every locale is in sync)\n");
  });

  it("import suggests the real import after a dry run, and nothing after a partial one", async () => {
    const dry = await stderrOf(["import", "handoff.xlsx", "--dry-run"], {
      importWorkbook: async () => makeSummary({ dryRun: true }),
    });
    expect(dry.err).toContain(
      "next: verbatra import handoff.xlsx (without --dry-run to write the files)\n",
    );

    const partial = await stderrOf(["import", "handoff.xlsx"], {
      importWorkbook: async () => makeSummary({ partial: ["de"] }),
    });
    expect(partial.err).not.toContain("next:");
  });
});

describe("tmx: task lines and hints", () => {
  it("import points at translate, or at the real import after a dry run", async () => {
    const real = await stderrOf(["tmx", "import", "legacy.tmx"]);
    expect(real.err).toMatch(/verbatra: importing legacy\.tmx into the memory\.\.\. done/);
    expect(real.err).toContain(
      "next: verbatra translate (reuses the imported memory before calling a provider)\n",
    );

    const dry = await stderrOf(["tmx", "import", "legacy.tmx", "--dry-run"], {
      importTmx: async () => makeImportTmxResult({ dryRun: true }),
    });
    expect(dry.err).toContain(
      "next: verbatra tmx import legacy.tmx (without --dry-run to store it)\n",
    );
  });

  it("export shows its task line and suggests nothing", async () => {
    const { err } = await stderrOf(["tmx", "export"]);

    expect(err).toMatch(/^verbatra: exporting the memory as TMX\.\.\. done \(\d+\.\ds\)\n$/);
  });
});

describe("check, diff and doctor: task lines, scan progress and hints", () => {
  it("check shows a task line and keeps its own stdout hint", async () => {
    const { err } = await stderrOf(["check"]);

    expect(err).toMatch(/^verbatra: checking the locales\.\.\. done \(\d+\.\ds\)\n$/);
  });

  it("diff suggests translate when keys are pending, and passes a scan listener", async () => {
    const seen: ScanProgressEvent[] = [];
    const { err } = await stderrOf(["diff", "--unused"], {
      diff: async (input) => {
        const event: ScanProgressEvent = { type: "files-scanned", scanned: 1, total: 1 };
        seen.push(event);
        input.onProgress?.(event);
        return makeDiffSummary({ hasPendingChanges: true });
      },
    });

    expect(seen).toHaveLength(1);
    expect(err).toMatch(/^verbatra: diffing and scanning the source\.\.\. done/);
    expect(err).toContain("next: verbatra translate (send the pending keys to your provider)\n");
  });

  it("diff suggests nothing when nothing is pending", async () => {
    const { err } = await stderrOf(["diff"]);

    expect(err).toMatch(/^verbatra: diffing the locales\.\.\. done \(\d+\.\ds\)\n$/);
  });

  it("doctor names what it checks", async () => {
    expect((await stderrOf(["doctor"])).err).toMatch(/^verbatra: checking the setup\.\.\. done/);
    expect((await stderrOf(["doctor", "--literals"])).err).toMatch(
      /^verbatra: scanning the source for literals\.\.\. done/,
    );
  });
});

describe("pseudo, types and extract: next steps", () => {
  it("pseudo points the dev server at the generated file", async () => {
    const { err } = await stderrOf(["pseudo"], {
      pseudolocalize: async () =>
        makePseudoResult({ path: inCwd(".verbatra-local", "pseudo", "en-XA.json") }),
    });

    expect(err).toMatch(/^verbatra: pseudolocalizing the source\.\.\. done/);
    expect(err).toContain(
      `next: load ${join(".verbatra-local", "pseudo", "en-XA.json")} as the en-XA locale in your dev server\n`,
    );
  });

  it("types asks to commit a written declaration, and says nothing on a check", async () => {
    const written = await stderrOf(["types"], {
      generateTypes: async () =>
        makeTypesResult({ path: inCwd("verbatra-types.d.ts"), written: true }),
    });
    expect(written.err).toContain(
      "next: commit verbatra-types.d.ts (verbatra types --check compares against it in CI)\n",
    );

    const checked = await stderrOf(["types", "--check"], {
      generateTypes: async () => makeTypesResult({ check: true, written: false }),
    });
    expect(checked.err).toMatch(/^verbatra: checking the declarations\.\.\. done/);
    expect(checked.err).not.toContain("next:");
    expect(written.err).toMatch(/^verbatra: generating the declarations\.\.\. done/);
  });

  it("extract points at translate after writing keys, and at itself after a dry run", async () => {
    const added = [{ key: "nav.home", value: "Home", file: "src/nav.ts", line: 1 }];
    const real = await stderrOf(["extract"], {
      extract: async () => makeExtractResult({ added, written: true }),
    });
    expect(real.err).toMatch(/^verbatra: scanning the source\.\.\. done/);
    expect(real.err).toContain("next: verbatra translate (translate the new keys)\n");

    const dry = await stderrOf(["extract", "--dry-run"], {
      extract: async () => makeExtractResult({ added, dryRun: true }),
    });
    expect(dry.err).toContain("next: verbatra extract (without --dry-run to write the new keys)\n");

    const none = await stderrOf(["extract"]);
    expect(none.err).not.toContain("next:");
  });
});

describe("--quiet and --json keep every new line off stderr", () => {
  it.each([
    [["export"]],
    [["import", "handoff.xlsx"]],
    [["tmx", "import", "legacy.tmx"]],
    [["tmx", "export"]],
    [["check"]],
    [["diff"]],
    [["doctor"]],
    [["pseudo"]],
    [["types"]],
    [["extract"]],
  ])("%j", async (argv) => {
    expect((await stderrOf([...argv, "--quiet"])).err).toBe("");
    expect((await stderrOf([...argv, "--json"])).err).not.toMatch(DONE);
    expect((await stderrOf([...argv, "--json"])).err).not.toContain("next:");
  });
});
