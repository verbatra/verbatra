import { describe, expect, it } from "vitest";
import { JSON_ENVELOPE_VERSION } from "./json-envelope.js";
import { run } from "./run.js";
import { captureStreams, makeExtractResult, parseEnvelope, recordingDeps } from "./test-support.js";

describe("run extract", () => {
  it("calls the SDK extract with the resolved config and working directory", async () => {
    const { deps, calls } = recordingDeps();
    const { streams } = captureStreams();

    const code = await run(["extract", "--cwd", "/proj"], deps, streams);

    expect(code).toBe(0);
    expect(calls.extract).toHaveLength(1);
    expect(calls.extract[0]?.cwd).toBe("/proj");
    expect(calls.extract[0]?.dryRun).toBeUndefined();
  });

  it("passes the dry-run flag through", async () => {
    const { deps, calls } = recordingDeps();
    const { streams } = captureStreams();

    await run(["extract", "--dry-run"], deps, streams);

    expect(calls.extract[0]?.dryRun).toBe(true);
  });

  it("passes an explicit config path to the loader", async () => {
    const { deps, calls } = recordingDeps();
    const { streams } = captureStreams();

    await run(["extract", "--config", "/proj/verbatra.config.ts"], deps, streams);

    expect(calls.loadConfig[0]?.configPath).toBe("/proj/verbatra.config.ts");
  });

  it("renders a human summary naming the file and the counts", async () => {
    const { deps } = recordingDeps({
      extract: async () =>
        makeExtractResult({
          sourcePath: "locales/en.json",
          scannedFiles: 3,
          added: [{ key: "nav.home", value: "Home", file: "src/nav.ts", line: 1 }],
          written: true,
        }),
    });
    const { streams, out } = captureStreams();

    await run(["extract"], deps, streams);

    expect(out()).toContain("verbatra extract");
    expect(out()).toContain("locales/en.json");
    expect(out()).toContain("nav.home");
    expect(out()).toContain("3 files scanned");
  });

  it("says plainly when a run added nothing", async () => {
    const { deps } = recordingDeps();
    const { streams, out } = captureStreams();

    await run(["extract"], deps, streams);

    expect(out()).toContain("no new keys");
  });

  it("reports a dry run as a preview and never as a write", async () => {
    const { deps } = recordingDeps({
      extract: async () =>
        makeExtractResult({
          added: [{ key: "nav.home", value: "Home", file: "src/nav.ts", line: 1 }],
          dryRun: true,
        }),
    });
    const { streams, out } = captureStreams();

    await run(["extract", "--dry-run"], deps, streams);

    expect(out()).toContain("would add 1 key");
    expect(out()).toContain("dry run, nothing written");
  });

  it("lists dynamic call sites and conflicts rather than hiding them", async () => {
    const { deps } = recordingDeps({
      extract: async () =>
        makeExtractResult({
          dynamic: [{ file: "src/nav.ts", line: 7 }],
          conflicts: [
            {
              key: "nav.home",
              values: ["Home", "Start"],
              locations: [
                { file: "src/a.ts", line: 1 },
                { file: "src/b.ts", line: 2 },
              ],
            },
          ],
          diagnostics: [{ file: "src/huge.ts", reason: "too-large" }],
        }),
    });
    const { streams, out } = captureStreams();

    const code = await run(["extract"], deps, streams);

    expect(code).toBe(0);
    expect(out()).toContain("src/nav.ts:7");
    expect(out()).toContain("nav.home");
    expect(out()).toContain("src/huge.ts");
  });

  it("emits the shared success envelope with --json", async () => {
    const { deps } = recordingDeps();
    const { streams, out } = captureStreams();

    await run(["extract", "--json"], deps, streams);

    const envelope = parseEnvelope(out());
    expect(envelope).toMatchObject({
      ok: true,
      version: JSON_ENVELOPE_VERSION,
      command: "extract",
    });
    expect(envelope.result).toMatchObject({ sourcePath: "locales/en.json" });
  });

  it("reports a failure as exit 2 with the error envelope", async () => {
    const { deps } = recordingDeps({
      extract: async () => {
        throw new Error("boom");
      },
    });
    const { streams, out, err } = captureStreams();

    const code = await run(["extract", "--json"], deps, streams);

    expect(code).toBe(2);
    expect(err()).toContain("boom");
    expect(parseEnvelope(out())).toMatchObject({ ok: false, command: "extract" });
  });
});

describe("run extract rendering limits", () => {
  it("truncates a long list rather than printing every entry", async () => {
    const { deps } = recordingDeps({
      extract: async () =>
        makeExtractResult({
          added: Array.from({ length: 14 }, (_, index) => ({
            key: `nav.key${index}`,
            value: "",
            file: "src/nav.ts",
            line: index + 1,
          })),
        }),
    });
    const { streams, out } = captureStreams();

    await run(["extract"], deps, streams);

    expect(out()).toContain("new keys (14):");
    expect(out()).toContain("and 4 more");
  });
});
