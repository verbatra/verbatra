import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../../config/schema.js";
import { baseConfig, makeStubProvider, makeTempDir, writeJsonFile } from "../../test-support.js";
import { translate } from "../translate-project.js";
import { importTmx } from "./import-tmx.js";

const ZWSP = "​";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({
    sourceLocale: "en",
    targetLocales: ["de"],
    format: "i18next-json",
    files: { pattern: "locales/{locale}.json" },
    fuzzyCache: { enabled: true },
    ...overrides,
  });

function tmxDocument(pairs: ReadonlyArray<readonly [string, string]>): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<tmx version="1.4">',
    '  <header srclang="en" creationtool="probe" creationtoolversion="1" segtype="block" o-tmf="probe" adminlang="en" datatype="plaintext"/>',
    "  <body>",
    ...pairs.map(
      ([source, german]) =>
        `    <tu>\n      <tuv xml:lang="en"><seg>${source}</seg></tuv>\n      <tuv xml:lang="de"><seg>${german}</seg></tuv>\n    </tu>`,
    ),
    "  </body>",
    "</tmx>",
  ].join("\n");
}

interface Served {
  readonly providerCalls: number;
  readonly fuzzyKeys: readonly string[];
  readonly reviewReasons: readonly string[];
  readonly written: Record<string, string>;
}

async function importThenTranslate(
  config: VerbatraConfig,
  units: ReadonlyArray<readonly [string, string]>,
  writeSource: (dir: string) => Promise<void>,
): Promise<Served> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeSource(dir);
  await writeFile(join(dir, "memory.tmx"), tmxDocument(units), "utf8");
  const importResult = await importTmx({ config, file: "memory.tmx", cwd: dir });
  expect(importResult.locales[0]?.added).toBe(units.length);

  const stub = makeStubProvider();
  const summary = await translate({ config, cwd: dir }, { createProvider: () => stub.provider });
  const locale = summary.locales[0];
  return {
    providerCalls: stub.calls.length,
    fuzzyKeys: (locale?.fuzzyHits ?? []).map((hit) => hit.key),
    reviewReasons: (locale?.needsReview ?? []).flatMap((entry) => entry.reasons),
    written: JSON.parse(
      await readFile(join(dir, "locales", config.format === "arb" ? "de.arb" : "de.json"), "utf8"),
    ) as Record<string, string>,
  };
}

describe("an imported unit reaches the project through fuzzy reuse exactly as documented", () => {
  it("serves a project string that differs from the imported source by one invisible character", async () => {
    const config = cfg();

    const served = await importThenTranslate(
      config,
      [[`Save the document${ZWSP}`, "Dokument speichern"]],
      async (dir) => {
        await writeJsonFile(join(dir, "locales", "en.json"), { save: "Save the document" });
        await writeJsonFile(join(dir, "locales", "de.json"), {});
      },
    );

    expect(served.providerCalls).toBe(0);
    expect(served.fuzzyKeys).toEqual(["save"]);
    expect(served.reviewReasons).toContain("FUZZY_CACHE_REUSE");
    expect(served.written.save).toBe("Dokument speichern");
  });

  it("does not serve an imported unit whose source text is identical, even when the hash differs by a description", async () => {
    const config = cfg({ format: "arb", files: { pattern: "locales/{locale}.arb" } });

    const served = await importThenTranslate(config, [["Save", "Speichern"]], async (dir) => {
      await writeFile(
        join(dir, "locales", "en.arb"),
        `${JSON.stringify({ save: "Save", "@save": { description: "toolbar button" } }, null, 2)}\n`,
        "utf8",
      );
      await writeFile(join(dir, "locales", "de.arb"), "{}\n", "utf8");
    });

    expect(served.fuzzyKeys).toEqual([]);
    expect(served.providerCalls).toBe(1);
    expect(served.written.save).toBe("[de] Save");
  });

  it("does serve a described project entry once its text merely resembles the imported source", async () => {
    const config = cfg({ format: "arb", files: { pattern: "locales/{locale}.arb" } });

    const served = await importThenTranslate(
      config,
      [["Save the document", "Dokument speichern"]],
      async (dir) => {
        await writeFile(
          join(dir, "locales", "en.arb"),
          `${JSON.stringify(
            { save: "Save the documents", "@save": { description: "toolbar button" } },
            null,
            2,
          )}\n`,
          "utf8",
        );
        await writeFile(join(dir, "locales", "de.arb"), "{}\n", "utf8");
      },
    );

    expect(served.providerCalls).toBe(0);
    expect(served.fuzzyKeys).toEqual(["save"]);
    expect(served.reviewReasons).toContain("FUZZY_CACHE_REUSE");
    expect(served.written.save).toBe("Dokument speichern");
  });

  it("does not serve an imported unit for a plural entry whose source text is identical", async () => {
    const config = cfg();

    const served = await importThenTranslate(
      config,
      [["You have one unread message", "Du hast eine ungelesene Nachricht"]],
      async (dir) => {
        await writeJsonFile(join(dir, "locales", "en.json"), {
          inbox_one: "You have one unread message",
        });
        await writeJsonFile(join(dir, "locales", "de.json"), {});
      },
    );

    expect(served.fuzzyKeys).toEqual([]);
    expect(served.providerCalls).toBe(1);
  });

  it("does serve an imported unit for a plural entry once its text merely resembles the source", async () => {
    const config = cfg();

    const served = await importThenTranslate(
      config,
      [["You have one unread message", "Du hast eine ungelesene Nachricht"]],
      async (dir) => {
        await writeJsonFile(join(dir, "locales", "en.json"), {
          inbox_one: "You have one unread message!",
        });
        await writeJsonFile(join(dir, "locales", "de.json"), {});
      },
    );

    expect(served.providerCalls).toBe(0);
    expect(served.fuzzyKeys).toEqual(["inbox_one"]);
    expect(served.reviewReasons).toContain("FUZZY_CACHE_REUSE");
    expect(served.written.inbox_one).toBe("Du hast eine ungelesene Nachricht");
  });

  it("leaves the imported unit unreachable when fuzzyCache is left out of the config", async () => {
    const config = baseConfig({
      sourceLocale: "en",
      targetLocales: ["de"],
      format: "i18next-json",
      files: { pattern: "locales/{locale}.json" },
    });

    const served = await importThenTranslate(
      config,
      [[`Save the document${ZWSP}`, "Dokument speichern"]],
      async (dir) => {
        await writeJsonFile(join(dir, "locales", "en.json"), { save: "Save the document" });
        await writeJsonFile(join(dir, "locales", "de.json"), {});
      },
    );

    expect(served.fuzzyKeys).toEqual([]);
    expect(served.providerCalls).toBe(1);
    expect(served.written.save).toBe("[de] Save the document");
  });
});
