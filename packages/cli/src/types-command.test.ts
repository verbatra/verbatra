import { SdkError } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { JSON_ENVELOPE_VERSION } from "./json-envelope.js";
import { run } from "./run.js";
import {
  captureStreams,
  makeLoadedConfig,
  makeTypesResult,
  parseEnvelope,
  recordingDeps,
} from "./test-support.js";

describe("run types: SDK delegation and flags", () => {
  it("delegates to generateTypes with the resolved cwd and exits 0", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["types", "--cwd", "/proj"], deps, cap.streams);

    expect(code).toBe(0);
    expect(calls.generateTypes).toHaveLength(1);
    expect(calls.generateTypes[0]).toMatchObject({ cwd: "/proj" });
  });

  it("passes --out through to the SDK", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    await run(["types", "--out", "src/messages.d.ts"], deps, cap.streams);

    expect(calls.generateTypes[0]).toMatchObject({ out: "src/messages.d.ts" });
  });

  it("passes --check through to the SDK", async () => {
    const { deps, calls } = recordingDeps({
      generateTypes: async () => makeTypesResult({ check: true, written: false }),
    });
    const cap = captureStreams();

    await run(["types", "--check"], deps, cap.streams);

    expect(calls.generateTypes[0]).toMatchObject({ check: true });
  });

  it("omits the optional inputs when the flags are absent", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    await run(["types"], deps, cap.streams);

    expect(calls.generateTypes[0]).not.toHaveProperty("out");
    expect(calls.generateTypes[0]).not.toHaveProperty("check");
  });

  it("refuses an --out that names no path, before reaching the SDK", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["types", "--out", "  "], deps, cap.streams);

    expect(code).toBe(2);
    expect(calls.generateTypes).toHaveLength(0);
    expect(cap.err()).toContain("INVALID_OUT");
  });

  it("passes --config through as the config path to load", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    await run(["types", "--config", "custom/verbatra.config.ts"], deps, cap.streams);

    expect(calls.loadConfigWithMeta[0]).toMatchObject({ configPath: "custom/verbatra.config.ts" });
  });

  it("hands the SDK the config file it actually loaded, so the output guard refuses it", async () => {
    const { deps, calls } = recordingDeps({
      loadConfigWithMeta: async () =>
        makeLoadedConfig({
          source: { kind: "explicit", filepath: "/proj/custom/settings.ts" },
        }),
    });
    const cap = captureStreams();

    const code = await run(
      ["types", "--cwd", "/proj", "--config", "custom/settings.ts"],
      deps,
      cap.streams,
    );

    expect(code).toBe(0);
    expect(calls.loadConfigWithMeta[0]).toMatchObject({
      cwd: "/proj",
      configPath: "custom/settings.ts",
    });
    expect(calls.generateTypes[0]).toMatchObject({ configPath: "/proj/custom/settings.ts" });
  });

  it("hands the SDK the config file a search found", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    await run(["types"], deps, cap.streams);

    expect(calls.generateTypes[0]).toMatchObject({ configPath: "/proj/verbatra.config.ts" });
  });

  it("names no config file when the config came from no file", async () => {
    const { deps, calls } = recordingDeps({
      loadConfigWithMeta: async () => makeLoadedConfig({ source: { kind: "override" } }),
    });
    const cap = captureStreams();

    await run(["types"], deps, cap.streams);

    expect(calls.generateTypes[0]).not.toHaveProperty("configPath");
  });

  it("reports a config that fails to load as a structured boundary error", async () => {
    const { deps, calls } = recordingDeps({
      loadConfigWithMeta: async () => {
        throw new SdkError("CONFIG_NOT_FOUND", "No verbatra configuration file.");
      },
    });
    const cap = captureStreams();

    const code = await run(["types"], deps, cap.streams);

    expect(code).toBe(2);
    expect(calls.generateTypes).toHaveLength(0);
    expect(cap.err()).toContain("CONFIG_NOT_FOUND");
  });

  it("never calls a provider-facing dependency", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    await run(["types"], deps, cap.streams);

    expect(calls.translate).toHaveLength(0);
    expect(calls.watch).toHaveLength(0);
  });
});

describe("run types: rendering", () => {
  it("prints what was declared and where it went", async () => {
    const { deps } = recordingDeps({
      generateTypes: async () =>
        makeTypesResult({ path: "/proj/verbatra-types.d.ts", keys: 12, withArguments: 5 }),
    });
    const cap = captureStreams();

    await run(["types"], deps, cap.streams);

    expect(cap.out()).toContain("verbatra types");
    expect(cap.out()).toContain("12 keys declared, 5 of them taking arguments");
    expect(cap.out()).toContain("wrote /proj/verbatra-types.d.ts");
  });

  it("reports a second, unchanged run rather than claiming a write", async () => {
    const { deps } = recordingDeps({
      generateTypes: async () => makeTypesResult({ written: false, stale: false }),
    });
    const cap = captureStreams();

    const code = await run(["types"], deps, cap.streams);

    expect(code).toBe(0);
    expect(cap.out()).toContain("unchanged");
    expect(cap.out()).not.toContain("wrote");
  });

  it("names the keys whose arguments could not be determined", async () => {
    const { deps } = recordingDeps({
      generateTypes: async () =>
        makeTypesResult({
          unresolved: [
            { key: "broken", reason: "invalid-message-syntax" },
            { key: "mixed", reason: "mixed-argument-styles" },
          ],
        }),
    });
    const cap = captureStreams();

    await run(["types"], deps, cap.streams);

    expect(cap.out()).toContain("arguments not determined (2):");
    expect(cap.out()).toContain("broken  invalid-message-syntax");
    expect(cap.out()).toContain("mixed  mixed-argument-styles");
  });

  it("names the leaves the adapter excluded from the catalog", async () => {
    const { deps } = recordingDeps({
      generateTypes: async () => makeTypesResult({ excluded: ["retries", "enabled"] }),
    });
    const cap = captureStreams();

    await run(["types"], deps, cap.streams);

    expect(cap.out()).toContain("excluded by the adapter (2): retries, enabled");
  });

  it("names the keys the adapter marked as carrying plural forms", async () => {
    const { deps } = recordingDeps({
      generateTypes: async () => makeTypesResult({ plural: ["item_one", "item_other"] }),
    });
    const cap = captureStreams();

    await run(["types"], deps, cap.streams);

    expect(cap.out()).toContain("plural keys (2): item_one, item_other");
  });

  it("says nothing about unresolved keys, excluded leaves or plural keys when there are none", async () => {
    const { deps } = recordingDeps();
    const cap = captureStreams();

    await run(["types"], deps, cap.streams);

    expect(cap.out()).not.toContain("arguments not determined");
    expect(cap.out()).not.toContain("excluded by the adapter");
    expect(cap.out()).not.toContain("plural keys");
  });
});

describe("run types --check: exit codes", () => {
  it("exits 0 when the declaration on disk is current", async () => {
    const { deps } = recordingDeps({
      generateTypes: async () => makeTypesResult({ check: true, stale: false, written: false }),
    });
    const cap = captureStreams();

    const code = await run(["types", "--check"], deps, cap.streams);

    expect(code).toBe(0);
    expect(cap.out()).toContain("is up to date");
  });

  it("exits 1 when the declaration on disk is out of date", async () => {
    const { deps } = recordingDeps({
      generateTypes: async () => makeTypesResult({ check: true, stale: true, written: false }),
    });
    const cap = captureStreams();

    const code = await run(["types", "--check"], deps, cap.streams);

    expect(code).toBe(1);
    expect(cap.out()).toContain("is out of date");
  });

  it("exits 0 for a generating run over a stale file, since it just fixed it", async () => {
    const { deps } = recordingDeps({
      generateTypes: async () => makeTypesResult({ stale: true, written: true }),
    });
    const cap = captureStreams();

    expect(await run(["types"], deps, cap.streams)).toBe(0);
  });
});

describe("run types: failures", () => {
  it("renders a refused output path as a boundary failure and exits 2", async () => {
    const { deps } = recordingDeps({
      generateTypes: async () => {
        throw new SdkError("TYPES_OUTPUT_CONFLICT", "The output path is absolute.");
      },
    });
    const cap = captureStreams();

    const code = await run(["types", "--out", "elsewhere.d.ts"], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.err()).toContain("TYPES_OUTPUT_CONFLICT");
  });

  it("--json prints the result as one envelope", async () => {
    const { deps } = recordingDeps({
      generateTypes: async () => makeTypesResult({ keys: 3, withArguments: 1 }),
    });
    const cap = captureStreams();

    await run(["types", "--json"], deps, cap.streams);

    expect(parseEnvelope(cap.out())).toMatchObject({
      ok: true,
      version: JSON_ENVELOPE_VERSION,
      command: "types",
      result: { keys: 3, withArguments: 1 },
    });
  });

  it("--json names the failing command in the error envelope", async () => {
    const { deps } = recordingDeps({
      generateTypes: async () => {
        throw new SdkError("SOURCE_UNREADABLE", "No source catalog.");
      },
    });
    const cap = captureStreams();

    await run(["types", "--json"], deps, cap.streams);

    expect(parseEnvelope(cap.out())).toMatchObject({
      ok: false,
      command: "types",
      code: "SOURCE_UNREADABLE",
    });
  });
});
