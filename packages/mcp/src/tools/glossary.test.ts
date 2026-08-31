import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  baseLoadedConfig,
  baseVerbatraConfig,
  makeContext,
  makeTempDir,
  nodeFs,
  writeJsonFile,
} from "../test-support.js";
import { glossaryGetTool, glossaryWriteTool } from "./glossary.js";

describe("glossary.get", () => {
  it("returns the inline glossary from the config when no file is configured", async () => {
    const context = makeContext({
      config: baseLoadedConfig({
        config: baseVerbatraConfig({ glossary: { API: "API" } }),
        glossary: { source: "inline" },
      }),
    });

    const outcome = await glossaryGetTool.execute({}, context);

    expect(outcome).toMatchObject({
      kind: "ok",
      result: { indicator: { source: "inline" }, entries: { API: "API" }, redactedTerms: [] },
    });
  });

  it("reads a file-backed glossary fresh from disk", async () => {
    const dir = await makeTempDir();
    const path = join(dir, "glossary.json");
    await writeJsonFile(path, { API: "API", Dashboard: "Tableau de bord" });

    const context = makeContext({
      config: baseLoadedConfig({ glossary: { source: "file", path } }),
      cwd: dir,
      fs: nodeFs,
    });

    const outcome = await glossaryGetTool.execute({}, context);

    expect(outcome).toMatchObject({
      kind: "ok",
      result: {
        indicator: { source: "file" },
        entries: { API: "API", Dashboard: "Tableau de bord" },
      },
    });
  });

  describe("secret redaction", () => {
    it("replaces a secret-shaped glossary value with a placeholder and names the redacted term", async () => {
      const context = makeContext({
        config: baseLoadedConfig({
          config: baseVerbatraConfig({ glossary: { LeakedKey: "sk-abcdEFGH12345678" } }),
          glossary: { source: "inline" },
        }),
      });

      const outcome = await glossaryGetTool.execute({}, context);

      expect(outcome).toMatchObject({
        kind: "ok",
        result: { entries: { LeakedKey: "[REDACTED]" }, redactedTerms: ["LeakedKey"] },
      });
    });
  });

  it("rejects an unrecognized parameter", async () => {
    const outcome = await glossaryGetTool.execute({ bogus: true }, makeContext());

    expect(outcome.kind).toBe("invalid");
  });
});

describe("glossary.write", () => {
  it("adds a term to a file-backed glossary and returns the updated glossary", async () => {
    const dir = await makeTempDir();
    const path = join(dir, "glossary.json");
    await writeJsonFile(path, {});

    const context = makeContext({
      config: baseLoadedConfig({ glossary: { source: "file", path } }),
      cwd: dir,
      fs: nodeFs,
    });

    const outcome = await glossaryWriteTool.execute({ term: "API", translation: "API" }, context);

    expect(outcome).toMatchObject({ kind: "ok", result: { entries: { API: "API" } } });
  });

  it("removes a term when translation is null", async () => {
    const dir = await makeTempDir();
    const path = join(dir, "glossary.json");
    await writeJsonFile(path, { API: "API" });

    const context = makeContext({
      config: baseLoadedConfig({ glossary: { source: "file", path } }),
      cwd: dir,
    });

    const outcome = await glossaryWriteTool.execute({ term: "API", translation: null }, context);

    expect(outcome).toMatchObject({ kind: "ok", result: { entries: {} } });
  });

  it("returns an error outcome when the glossary is not file-backed", async () => {
    const context = makeContext({
      config: baseLoadedConfig({ glossary: { source: "none" } }),
    });

    const outcome = await glossaryWriteTool.execute({ term: "API", translation: "API" }, context);

    expect(outcome).toMatchObject({
      kind: "error",
      message: expect.stringContaining("GLOSSARY_NOT_FILE_BACKED"),
    });
  });

  it("rejects a blank term", async () => {
    const outcome = await glossaryWriteTool.execute({ term: "", translation: "x" }, makeContext());

    expect(outcome.kind).toBe("invalid");
  });
});
