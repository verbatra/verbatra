import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { baseConfig, makeTempDir } from "../test-support.js";
import { check } from "./check.js";

const SOURCE = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2"><file source-language="en" datatype="plaintext" original="messages"><body>
<trans-unit id="color"><source>Color</source></trans-unit>
</body></file></xliff>`;

const cfg = baseConfig({
  format: "xliff",
  targetLocales: ["en-GB"],
  files: { pattern: "locales/{locale}.xlf" },
});

async function checkWithTarget(target: string) {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeFile(join(dir, "locales", "en.xlf"), SOURCE, "utf8");
  await writeFile(join(dir, "locales", "en-GB.xlf"), target, "utf8");
  return check({ config: cfg, cwd: dir });
}

describe("check: an XLIFF target locale sharing the source language", () => {
  it("reads an en-GB copy of an en source without target-language as the source, so it looks in sync", async () => {
    const result = await checkWithTarget(SOURCE);
    expect(result.locales[0]).toMatchObject({ missing: 0, inSync: true });
  });

  it("reads an en-GB file declaring target-language as a translation, so its keys are missing", async () => {
    const target = SOURCE.replace(
      'source-language="en"',
      'source-language="en" target-language="en-GB"',
    );
    const result = await checkWithTarget(target);
    expect(result.locales[0]).toMatchObject({ missing: 1, inSync: false });
  });
});
