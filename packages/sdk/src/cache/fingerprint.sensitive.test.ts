import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { translate } from "../flow/translate-project.js";
import { LOCK_FILE_NAME } from "../lock/lock-file.js";
import { baseConfig, makeStubProvider, makeTempDir, writeJsonFile } from "../test-support.js";
import { computeFingerprint } from "./fingerprint.js";

const GLOSSARY = { "Project Falcon": "Projekt Falke", Account: "Konto" };

function cfg(sensitiveData?: VerbatraConfig["sensitiveData"]): VerbatraConfig {
  return baseConfig({
    glossary: GLOSSARY,
    ...(sensitiveData === undefined ? {} : { sensitiveData }),
  });
}

describe("the cache fingerprint under sensitiveData", () => {
  it("covers the glossary actually sent, so a dropped term changes it", () => {
    const dropped = cfg({ mode: "block", patterns: ["Falcon"] });
    const allowed = cfg({ mode: "block", patterns: ["Falcon"], allow: ["Falcon"] });

    expect(computeFingerprint(dropped, "de")).not.toBe(computeFingerprint(allowed, "de"));
    expect(computeFingerprint(allowed, "de")).toBe(computeFingerprint(cfg(), "de"));
    expect(computeFingerprint(cfg({ mode: "warn", patterns: ["Falcon"] }), "de")).toBe(
      computeFingerprint(cfg(), "de"),
    );
  });

  it("misses the cache once a dropped term is allowed again", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), { title: "Open your account" });
    const run = async (config: VerbatraConfig) => {
      await writeJsonFile(join(dir, "locales", "de.json"), {});
      await rm(join(dir, LOCK_FILE_NAME), { force: true });
      const stub = makeStubProvider();
      const summary = await translate(
        { config, cwd: dir },
        { createProvider: () => stub.provider },
      );
      return { locale: summary.locales[0], calls: stub.calls.length };
    };
    const dropped = cfg({ mode: "block", patterns: ["Falcon"] });

    await run(dropped);
    const again = await run(dropped);
    const allowed = await run(cfg({ mode: "block", patterns: ["Falcon"], allow: ["Falcon"] }));

    expect(again.locale?.cacheHits).toEqual(["title"]);
    expect(again.calls).toBe(0);
    expect(allowed.locale?.cacheHits).toEqual([]);
    expect(allowed.calls).toBe(1);
  });
});
