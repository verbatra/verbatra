import { describe, expect, it } from "vitest";
import { run } from "./run.js";
import {
  captureStreams,
  makeExportTmxResult,
  makeImportTmxResult,
  recordingDeps,
} from "./test-support.js";

describe("verbatra tmx import", () => {
  it("passes the file, working directory and default path through to the sdk", async () => {
    const { deps, calls } = recordingDeps();
    const { streams } = captureStreams();

    const code = await run(["tmx", "import", "legacy.tmx", "--cwd", "/proj"], deps, streams);

    expect(code).toBe(0);
    expect(calls.importTmx).toEqual([
      expect.objectContaining({ file: "legacy.tmx", cwd: "/proj" }),
    ]);
  });

  it("defaults the file to the same path an export writes", async () => {
    const { deps, calls } = recordingDeps();
    const { streams } = captureStreams();

    await run(["tmx", "import", "--cwd", "/proj"], deps, streams);

    expect(calls.importTmx[0]?.file).toBe("verbatra-memory.tmx");
  });

  it("forwards the dry-run, overwrite and locale-subset switches", async () => {
    const { deps, calls } = recordingDeps();
    const { streams } = captureStreams();

    await run(
      [
        "tmx",
        "import",
        "legacy.tmx",
        "--cwd",
        "/proj",
        "--dry-run",
        "--overwrite",
        "--locales",
        "de,fr",
      ],
      deps,
      streams,
    );

    expect(calls.importTmx[0]).toEqual(
      expect.objectContaining({ dryRun: true, overwrite: true, locales: ["de", "fr"] }),
    );
  });

  it("leaves dry-run and overwrite off unless they are asked for", async () => {
    const { deps, calls } = recordingDeps();
    const { streams } = captureStreams();

    await run(["tmx", "import", "legacy.tmx", "--cwd", "/proj"], deps, streams);

    expect(calls.importTmx[0]).not.toHaveProperty("dryRun");
    expect(calls.importTmx[0]).not.toHaveProperty("overwrite");
  });

  it("never calls the export half", async () => {
    const { deps, calls } = recordingDeps();
    const { streams } = captureStreams();

    await run(["tmx", "import", "legacy.tmx", "--cwd", "/proj"], deps, streams);

    expect(calls.exportTmx).toEqual([]);
  });

  it("prints a human summary of what landed", async () => {
    const { deps } = recordingDeps({
      importTmx: async () =>
        makeImportTmxResult({
          units: 3,
          locales: [
            {
              locale: "de",
              added: 2,
              unchanged: 1,
              overwritten: 0,
              kept: 1,
              duplicates: 0,
              rejected: { placeholder: 1, icu: 0, degenerate: 0, empty: 0, sourceBlank: 0 },
            },
          ],
          unmatchedLanguages: [{ language: "ja", units: 2 }],
        }),
    });
    const { streams, out } = captureStreams();

    await run(["tmx", "import", "legacy.tmx", "--cwd", "/proj"], deps, streams);

    expect(out()).toContain("verbatra tmx import <- /proj/memory.tmx");
    expect(out()).toContain(
      "de: 2 added, 1 unchanged, 1 kept, 0 overwritten, 0 repeated in the file",
    );
    expect(out()).toContain("1 placeholders do not match the source");
    expect(out()).toContain("languages matching no configured locale: ja (2)");
  });

  it("prints a JSON envelope when asked", async () => {
    const { deps } = recordingDeps();
    const { streams, out } = captureStreams();

    await run(["tmx", "import", "legacy.tmx", "--cwd", "/proj", "--json"], deps, streams);

    expect(JSON.parse(out())).toEqual(expect.objectContaining({ ok: true, command: "tmx" }));
  });
});

describe("verbatra tmx export", () => {
  it("writes to the sdk default when no path is given and stamps the cli version", async () => {
    const { deps, calls } = recordingDeps();
    const { streams } = captureStreams();

    const code = await run(["tmx", "export", "--cwd", "/proj"], deps, streams);

    expect(code).toBe(0);
    expect(calls.exportTmx[0]).not.toHaveProperty("out");
    expect(typeof calls.exportTmx[0]?.toolVersion).toBe("string");
  });

  it("passes the chosen path and locale subset through", async () => {
    const { deps, calls } = recordingDeps();
    const { streams } = captureStreams();

    await run(
      ["tmx", "export", "out/memory.tmx", "--cwd", "/proj", "--locales", "de"],
      deps,
      streams,
    );

    expect(calls.exportTmx[0]).toEqual(
      expect.objectContaining({ out: "out/memory.tmx", locales: ["de"] }),
    );
  });

  it("never calls the import half", async () => {
    const { deps, calls } = recordingDeps();
    const { streams } = captureStreams();

    await run(["tmx", "export", "--cwd", "/proj"], deps, streams);

    expect(calls.importTmx).toEqual([]);
  });

  it("prints a human summary of what was written", async () => {
    const { deps } = recordingDeps({
      exportTmx: async () =>
        makeExportTmxResult({
          units: 9,
          locales: [
            { locale: "de", units: 9 },
            { locale: "fr", units: 4 },
          ],
          withoutSource: 3,
        }),
    });
    const { streams, out } = captureStreams();

    await run(["tmx", "export", "--cwd", "/proj"], deps, streams);

    expect(out()).toContain("verbatra tmx export -> /proj/verbatra-memory.tmx");
    expect(out()).toContain("de: 9 units");
    expect(out()).toContain("9 units across 2 locales");
    expect(out()).toContain("3 entries left out");
  });
});

describe("verbatra tmx refuses a direction it does not know", () => {
  it("exits 2 and names what it accepts", async () => {
    const { deps, calls } = recordingDeps();
    const { streams, err } = captureStreams();

    const code = await run(["tmx", "sync", "--cwd", "/proj"], deps, streams);

    expect(code).toBe(2);
    expect(err()).toContain('"import" or "export"');
    expect(calls.importTmx).toEqual([]);
    expect(calls.exportTmx).toEqual([]);
  });

  it("refuses --dry-run on an export rather than ignoring it", async () => {
    const { deps, calls } = recordingDeps();
    const { streams, err } = captureStreams();

    const code = await run(["tmx", "export", "--cwd", "/proj", "--dry-run"], deps, streams);

    expect(code).toBe(2);
    expect(err()).toContain("--dry-run");
    expect(err()).toContain('"tmx import" only');
    expect(calls.exportTmx).toEqual([]);
  });

  it("refuses --overwrite on an export, and names both flags when both are given", async () => {
    const { deps, calls } = recordingDeps();
    const { streams, err } = captureStreams();

    const code = await run(
      ["tmx", "export", "--cwd", "/proj", "--overwrite", "--dry-run"],
      deps,
      streams,
    );

    expect(code).toBe(2);
    expect(err()).toContain("--dry-run and --overwrite");
    expect(calls.exportTmx).toEqual([]);
  });

  it("still accepts both flags on an import", async () => {
    const { deps, calls } = recordingDeps();
    const { streams } = captureStreams();

    const code = await run(
      ["tmx", "import", "f.tmx", "--cwd", "/proj", "--overwrite", "--dry-run"],
      deps,
      streams,
    );

    expect(code).toBe(0);
    expect(calls.importTmx).toHaveLength(1);
  });

  it("refuses an empty locale list rather than silently using all of them", async () => {
    const { deps, calls } = recordingDeps();
    const { streams } = captureStreams();

    const code = await run(["tmx", "export", "--cwd", "/proj", "--locales", " , "], deps, streams);

    expect(code).toBe(2);
    expect(calls.exportTmx).toEqual([]);
  });
});
