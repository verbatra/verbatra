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
      },
    });
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

  it("rejects an unrecognized parameter", async () => {
    const outcome = await projectSnapshotTool.execute({ bogus: true }, makeContext());

    expect(outcome.kind).toBe("invalid");
  });
});
