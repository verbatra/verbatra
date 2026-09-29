import { SdkError } from "@verbatra/sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { baseLoadedConfig, baseVerbatraConfig, makeContext } from "../test-support.js";
import { projectSnapshotTool } from "./project-snapshot.js";

describe("project.snapshot", () => {
  it("projects the resolved config's shape without exposing glossary term values", async () => {
    const context = makeContext({
      config: baseLoadedConfig({
        config: baseVerbatraConfig({ targetLocales: ["de", "fr"] }),
      }),
      cwd: "/project",
    });

    const outcome = await projectSnapshotTool.execute({}, context);

    expect(outcome).toMatchObject({
      kind: "ok",
      result: {
        sourceLocale: "en",
        targetLocales: ["de", "fr"],
        format: "i18next-json",
        files: { pattern: "locales/{locale}.json" },
        provider: { id: "anthropic" },
        configSource: "override",
        glossary: { source: "none" },
        humanEdits: "protect",
        prune: false,
      },
    });
  });

  it("reports the configured humanEdits policy and prune setting", async () => {
    const context = makeContext({
      config: baseLoadedConfig({
        config: baseVerbatraConfig({ humanEdits: "overwrite", prune: true }),
      }),
    });

    const outcome = await projectSnapshotTool.execute({}, context);

    expect(outcome).toMatchObject({ kind: "ok", result: { humanEdits: "overwrite", prune: true } });
  });

  it("reports a relative, redacted config file path when the config was loaded from disk", async () => {
    const context = makeContext({
      config: baseLoadedConfig({
        source: { kind: "search", filepath: "/project/verbatra.config.ts" },
      }),
      cwd: "/project",
    });

    const outcome = await projectSnapshotTool.execute({}, context);

    expect(outcome).toMatchObject({
      kind: "ok",
      result: { configSource: "verbatra.config.ts" },
    });
  });

  describe("secret redaction", () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;

    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = "leaked-secret-value";
    });

    afterEach(() => {
      if (originalKey === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = originalKey;
      }
    });

    it("redacts a configured provider key value if it leaks into the glossary file path", async () => {
      const context = makeContext({
        config: baseLoadedConfig({
          glossary: {
            source: "file",
            path: "/project/leaked-secret-value/glossary.json",
          },
        }),
        cwd: "/project",
      });

      const outcome = await projectSnapshotTool.execute({}, context);

      expect(outcome).toMatchObject({ kind: "ok" });
      const text = JSON.stringify(outcome);
      expect(text).not.toContain("leaked-secret-value");
    });
  });

  it("reports configured: true alongside the config", async () => {
    const outcome = await projectSnapshotTool.execute({}, makeContext());

    expect(outcome).toMatchObject({ kind: "ok", result: { configured: true } });
  });

  it("reports configured: false with the load error and a pointer to project.doctor", async () => {
    const outcome = await projectSnapshotTool.executeUnconfigured?.(
      {},
      {
        cwd: "/project",
        configError: new SdkError(
          "CONFIG_INVALID",
          "The verbatra configuration is invalid: /project/verbatra.config.ts has a syntax error",
        ),
      },
    );

    expect(outcome).toEqual({
      kind: "ok",
      result: {
        configured: false,
        configProblem: {
          code: "CONFIG_INVALID",
          message:
            "CONFIG_INVALID: The verbatra configuration is invalid: verbatra.config.ts has a syntax error",
        },
        nextStep: expect.stringContaining("project.doctor"),
      },
    });
  });

  it("reports an unexpected load failure as CONFIG_INVALID", async () => {
    const outcome = await projectSnapshotTool.executeUnconfigured?.(
      {},
      { cwd: "/project", configError: new Error("EACCES: permission denied") },
    );

    expect(outcome).toMatchObject({
      kind: "ok",
      result: {
        configured: false,
        configProblem: { code: "CONFIG_INVALID", message: "EACCES: permission denied" },
      },
    });
  });

  it("rejects an unrecognized parameter", async () => {
    const outcome = await projectSnapshotTool.execute({ bogus: true }, makeContext());

    expect(outcome.kind).toBe("invalid");
  });
});
