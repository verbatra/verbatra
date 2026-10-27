import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  readTextFile,
} from "../test-support.js";
import { check } from "./check.js";
import { translate } from "./translate-project.js";

const SOURCE = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2"><file source-language="en" datatype="plaintext" original="messages"><body>
<trans-unit id="a"><source>Alpha</source></trans-unit>
<trans-unit id="b"><source>Beta</source></trans-unit>
<trans-unit id="c"><source>Gamma</source></trans-unit>
</body></file></xliff>`;

const EMPTY_TARGETS = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2"><file source-language="en" target-language="de" datatype="plaintext" original="messages"><body>
<trans-unit id="a"><source>Alpha</source><target></target></trans-unit>
<trans-unit id="b"><source>Beta</source><target/></trans-unit>
<trans-unit id="c"><source>Gamma</source><target state="new">Gamma</target></trans-unit>
</body></file></xliff>`;

const NO_TARGETS_COPY = SOURCE;

const cfg: VerbatraConfig = baseConfig({
  format: "xliff",
  files: { pattern: "locales/{locale}.xlf" },
});

async function project(target: string): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeFile(join(dir, "locales", "en.xlf"), SOURCE, "utf8");
  await writeFile(join(dir, "locales", "de.xlf"), target, "utf8");
  return dir;
}

describe.each([
  ["empty, self-closed and state=new targets", EMPTY_TARGETS],
  ["a copy of the source with no targets at all", NO_TARGETS_COPY],
])("translate: an XLIFF target document with %s", (_label, target) => {
  it("reports every unit missing before any run", async () => {
    const dir = await project(target);

    const summary = await check({ config: cfg, cwd: dir });

    expect(summary.inSync).toBe(false);
    expect(summary.locales[0]?.missing).toBe(3);
  });

  it("sends every unit to the provider, writes each target, and reads in sync afterwards", async () => {
    const dir = await project(target);
    const stub = makeStubProvider();

    const run = await translate({ config: cfg, cwd: dir }, { createProvider: () => stub.provider });

    expect(run.locales[0]?.translated).toEqual(["a", "b", "c"]);
    expect(stub.calls.flatMap((call) => call.request.entries.map((entry) => entry.key))).toEqual([
      "a",
      "b",
      "c",
    ]);
    const written = await readTextFile(join(dir, "locales", "de.xlf"));
    expect(written).toContain("<target>[de] Alpha</target>");
    expect(written).toContain("<target>[de] Beta</target>");
    expect(written).toContain(">[de] Gamma</target>");
    expect((await check({ config: cfg, cwd: dir })).inSync).toBe(true);
  });

  it("seeds no lock baseline for a unit the provider left untranslated", async () => {
    const dir = await project(target);
    const stub = makeStubProvider({ missingValues: new Set(["c"]) });

    await translate({ config: cfg, cwd: dir }, { createProvider: () => stub.provider });

    const lock = (await readJsonFile(join(dir, "verbatra.lock.json"))) as {
      locales: Record<string, Record<string, string>>;
    };
    expect(Object.keys(lock.locales.de ?? {}).sort()).toEqual(["a", "b"]);
    expect((await check({ config: cfg, cwd: dir })).locales[0]?.missing).toBe(1);
    expect(await readTextFile(join(dir, "locales", "de.xlf"))).not.toContain("<target>Gamma");
  });
});
