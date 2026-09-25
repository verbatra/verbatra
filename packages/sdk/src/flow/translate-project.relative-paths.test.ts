import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { baseConfig, makeStubProvider, makeTempDir, writeJsonFile } from "../test-support.js";
import { translate } from "./translate-project.js";

describe("translate: file paths in a locale's error", () => {
  it("names a corrupt target file by its project-relative path", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello" });
    await writeFile(join(dir, "locales", "de.json"), "{ not json", "utf8");
    const { provider } = makeStubProvider();

    const summary = await translate(
      { config: baseConfig(), cwd: dir },
      { createProvider: () => provider },
    );

    const de = summary.locales.find((entry) => entry.locale === "de");
    expect(summary.failed).toEqual(["de"]);
    expect(de?.error?.message).toContain(`at ${join("locales", "de.json")} could not be read`);
    expect(de?.error?.message).not.toContain(dir);
  });
});
