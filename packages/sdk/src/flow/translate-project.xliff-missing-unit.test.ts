import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { baseConfig, makeStubProvider, makeTempDir, readTextFile } from "../test-support.js";
import { check } from "./check.js";
import { editEntry } from "./edit-entry.js";
import { translate } from "./translate-project.js";

const SOURCE = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2"><file source-language="en" datatype="plaintext" original="messages"><body>
<trans-unit id="a"><source>Alpha</source></trans-unit>
<trans-unit id="b"><source>Beta</source></trans-unit>
<trans-unit id="c" resname="gamma"><source>Gamma</source><note>third</note></trans-unit>
</body></file></xliff>`;

const TARGET = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2"><file source-language="en" target-language="de" datatype="plaintext" original="messages"><body>
<trans-unit id="a"><source>Alpha</source><target>Alfa</target></trans-unit>
<trans-unit id="b"><source>Beta</source><target>Beta</target></trans-unit>
</body></file></xliff>`;

const cfg: VerbatraConfig = baseConfig({
  format: "xliff",
  files: { pattern: "locales/{locale}.xlf" },
});

async function project(): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeFile(join(dir, "locales", "en.xlf"), SOURCE, "utf8");
  await writeFile(join(dir, "locales", "de.xlf"), TARGET, "utf8");
  return dir;
}

function unitCount(content: string, id: string): number {
  return content.split(`<trans-unit id="${id}"`).length - 1;
}

describe("translate: an XLIFF target document missing a source unit", () => {
  it("adds the unit with the translation, and a second run leaves the file correct", async () => {
    const dir = await project();
    const stub = makeStubProvider();

    const first = await translate(
      { config: cfg, cwd: dir },
      { createProvider: () => stub.provider },
    );
    const afterFirst = await readTextFile(join(dir, "locales", "de.xlf"));
    const second = await translate(
      { config: cfg, cwd: dir },
      { createProvider: () => stub.provider },
    );
    const afterSecond = await readTextFile(join(dir, "locales", "de.xlf"));

    expect(first.locales[0]?.translated).toEqual(["c"]);
    expect(afterFirst).toContain(
      '<trans-unit id="c" resname="gamma"><source>Gamma</source><target>[de] Gamma</target><note>third</note></trans-unit>',
    );
    expect(second.locales[0]?.translated).toEqual([]);
    expect(afterSecond).toBe(afterFirst);
    expect(unitCount(afterSecond, "c")).toBe(1);
    expect((await check({ config: cfg, cwd: dir })).inSync).toBe(true);
  });

  it("adds the unit when a person edits a key the target document lacks", async () => {
    const dir = await project();

    const result = await editEntry({
      config: cfg,
      cwd: dir,
      locale: "de",
      key: "c",
      value: "Gamma!",
    });

    expect(result.accepted).toBe(true);
    expect(await readTextFile(join(dir, "locales", "de.xlf"))).toContain(
      "<source>Gamma</source><target>Gamma!</target>",
    );
  });
});
