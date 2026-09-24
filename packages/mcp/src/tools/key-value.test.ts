import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  baseLoadedConfig,
  baseVerbatraConfig,
  defaultAdapterRegistry,
  makeContext,
  makeProject,
  makeTempDir,
  nodeFs,
  writeJsonFile,
} from "../test-support.js";
import { keyValueTool } from "./key-value.js";

describe("key.value", () => {
  it("returns both source and target text when the key is translated", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: { greeting: "Hallo" } });

    const outcome = await keyValueTool.execute(
      { locale: "de", key: "greeting" },
      makeContext({ cwd: dir, fs: nodeFs, adapterRegistry: defaultAdapterRegistry }),
    );

    expect(outcome).toEqual({
      kind: "ok",
      result: {
        source: "Hello",
        target: "Hallo",
        provenance: { origin: "unrecorded", reviewState: "unreviewed" },
      },
    });
  });

  it("omits target when the key has not been translated yet", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });

    const outcome = await keyValueTool.execute(
      { locale: "de", key: "greeting" },
      makeContext({ cwd: dir }),
    );

    expect(outcome).toEqual({
      kind: "ok",
      result: { source: "Hello" },
    });
  });

  it("returns an error outcome for a key not present in the source", async () => {
    const dir = await makeProject({ greeting: "Hello" });

    const outcome = await keyValueTool.execute(
      { locale: "de", key: "missing" },
      makeContext({ cwd: dir }),
    );

    expect(outcome).toMatchObject({
      kind: "error",
      message: expect.stringContaining("UNKNOWN_KEY"),
    });
  });

  it("rejects a blank locale", async () => {
    const outcome = await keyValueTool.execute({ locale: "", key: "greeting" }, makeContext());

    expect(outcome.kind).toBe("invalid");
  });

  it("returns the description the source file gives translators for the key", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.arb"), {
      "@@locale": "en",
      greeting: "Hello",
      "@greeting": { description: "Shown on the home page" },
    });
    await writeJsonFile(join(dir, "locales", "de.arb"), { "@@locale": "de", greeting: "Hallo" });

    const outcome = await keyValueTool.execute(
      { locale: "de", key: "greeting" },
      makeContext({
        cwd: dir,
        config: baseLoadedConfig({
          config: baseVerbatraConfig({
            format: "arb",
            files: { pattern: "locales/{locale}.arb" },
          }),
        }),
      }),
    );

    expect(outcome).toMatchObject({
      kind: "ok",
      result: { source: "Hello", target: "Hallo", description: "Shown on the home page" },
    });
  });
});
