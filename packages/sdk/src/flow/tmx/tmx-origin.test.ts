import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { contentHash } from "@verbatra/core";
import { readTmx } from "@verbatra/exchange";
import { describe, expect, it } from "vitest";
import { computeFingerprint } from "../../cache/fingerprint.js";
import { CACHE_FILE_NAME } from "../../cache/translation-memory.js";
import type { VerbatraConfig } from "../../config/schema.js";
import type { KeyProvenance } from "../../lock/key-provenance.js";
import { LOCK_FILE_NAME } from "../../lock/lock-file.js";
import { PROVENANCE_FILE_NAME, valueHash } from "../../lock/provenance-file.js";
import { baseConfig, makeTempDir, writeJsonFile } from "../../test-support.js";
import { exportTmx } from "./export-tmx.js";
import { tmxOriginProperties } from "./tmx-origin.js";

const cfg = (): VerbatraConfig =>
  baseConfig({ sourceLocale: "en", targetLocales: ["de"], format: "i18next-json" });

function hashOf(value: string): string {
  return contentHash({ key: "tmx", namespace: "", value, placeholders: [], isPlural: false });
}

const machine = (reviewState: KeyProvenance["reviewState"]): KeyProvenance => ({
  origin: "machine",
  reviewState,
});

describe("tmxOriginProperties", () => {
  it("names no origin it cannot attribute", () => {
    expect(tmxOriginProperties([])).toEqual([{ type: "x-origin", value: "unknown" }]);
    expect(tmxOriginProperties([{ origin: "unknown", reviewState: "approved" }])).toEqual([
      { type: "x-origin", value: "unknown" },
    ]);
  });

  it("maps a person's and an import's text without a review property", () => {
    expect(tmxOriginProperties([{ origin: "human", reviewState: "unreviewed" }])).toEqual([
      { type: "x-origin", value: "human" },
    ]);
    expect(
      tmxOriginProperties([
        { origin: "human", reviewState: "unreviewed" },
        { origin: "import", reviewState: "unreviewed" },
      ]),
    ).toEqual([{ type: "x-origin", value: "import" }]);
  });

  it.each(["machine", "memory", "fuzzy", "agent"] as const)(
    "maps every machine-class origin (%s) to machine",
    (origin) => {
      expect(tmxOriginProperties([{ origin, reviewState: "unreviewed" }])).toEqual([
        { type: "x-origin", value: "machine" },
        { type: "x-review", value: "unreviewed" },
      ]);
    },
  );

  it("errs toward machine when keys sharing the text disagree", () => {
    expect(
      tmxOriginProperties([{ origin: "human", reviewState: "unreviewed" }, machine("approved")]),
    ).toEqual([
      { type: "x-origin", value: "machine" },
      { type: "x-review", value: "approved" },
    ]);
  });

  it("counts machine text approved only when every machine-class record is", () => {
    expect(tmxOriginProperties([machine("approved"), machine("unreviewed")])[1]?.value).toBe(
      "unreviewed",
    );
    expect(tmxOriginProperties([machine("approved"), machine("rejected")])[1]?.value).toBe(
      "rejected",
    );
    expect(tmxOriginProperties([machine("approved"), machine("approved")])[1]?.value).toBe(
      "approved",
    );
  });
});

interface Fixture {
  readonly memory: Readonly<Record<string, string>>;
  readonly lock: Readonly<Record<string, string>>;
  readonly records: Readonly<Record<string, Record<string, string>>>;
}

async function project(fixture: Fixture): Promise<string> {
  const dir = await makeTempDir();
  const sources = Object.fromEntries(
    ["Hello", "Save", "Bye", "Other"].map((text) => [hashOf(text), text]),
  );
  await writeJsonFile(join(dir, CACHE_FILE_NAME), {
    version: 2,
    entries: { [computeFingerprint(cfg(), "de")]: { de: fixture.memory } },
    sources,
  });
  await writeJsonFile(join(dir, LOCK_FILE_NAME), { version: 1, locales: { de: fixture.lock } });
  await writeJsonFile(join(dir, PROVENANCE_FILE_NAME), {
    version: 1,
    locales: { de: fixture.records },
  });
  return dir;
}

function propertiesByText(document: string): Record<string, string> {
  const properties: Record<string, string> = {};
  for (const match of document.matchAll(
    /<tuv xml:lang="de">((?:<prop[^>]*>[^<]*<\/prop>)*)<seg>([^<]*)<\/seg>/g,
  )) {
    properties[match[2] ?? ""] = match[1] ?? "";
  }
  return properties;
}

const FIXTURE: Fixture = {
  memory: {
    [hashOf("Hello")]: "Hallo",
    [hashOf("Save")]: "Speichern",
    [hashOf("Bye")]: "Tschüss",
    [hashOf("Other")]: "Anders",
  },
  lock: {
    greeting: hashOf("Hello"),
    save: hashOf("Save"),
    bye: hashOf("Bye"),
    other: hashOf("Other"),
  },
  records: {
    greeting: { origin: "machine", provider: "deepl", valueHash: valueHash("Hallo") },
    save: {
      origin: "machine",
      valueHash: valueHash("Speichern"),
      reviewState: "approved",
      reviewedSourceHash: hashOf("Save"),
    },
    bye: { origin: "human", valueHash: valueHash("Tschüss") },
    other: { origin: "machine", valueHash: valueHash("Etwas anderes") },
  },
};

describe("exportTmx marks each target segment's origin", () => {
  it("writes x-origin and x-review from the provenance of the keys sharing the source", async () => {
    const dir = await project(FIXTURE);

    const result = await exportTmx({ config: cfg(), cwd: dir });

    expect(result.provenanceMarkers).toBe("written");
    const text = await readFile(result.path, "utf8");
    expect(propertiesByText(text)).toEqual({
      Hallo: '<prop type="x-origin">machine</prop><prop type="x-review">unreviewed</prop>',
      Speichern: '<prop type="x-origin">machine</prop><prop type="x-review">approved</prop>',
      Tschüss: '<prop type="x-origin">human</prop>',
      Anders: '<prop type="x-origin">unknown</prop>',
    });
  });

  it("round-trips through the TMX reader with the properties ignored", async () => {
    const dir = await project(FIXTURE);
    const result = await exportTmx({ config: cfg(), cwd: dir });

    const document = readTmx(await readFile(result.path, "utf8"));

    expect(document.units.map((unit) => unit.segments[1]?.text).sort()).toEqual([
      "Anders",
      "Hallo",
      "Speichern",
      "Tschüss",
    ]);
  });

  it("writes no property when the provenance file cannot be read", async () => {
    const dir = await project(FIXTURE);
    await writeFile(join(dir, PROVENANCE_FILE_NAME), "{ not json", "utf8");

    const result = await exportTmx({ config: cfg(), cwd: dir });

    expect(result.provenanceMarkers).toBe("unavailable");
    expect(await readFile(result.path, "utf8")).not.toContain("<prop");
  });

  it("writes no property when the lock file cannot be read", async () => {
    const dir = await project(FIXTURE);
    await writeFile(join(dir, LOCK_FILE_NAME), "{ not json", "utf8");

    const result = await exportTmx({ config: cfg(), cwd: dir });

    expect(result.provenanceMarkers).toBe("unavailable");
    expect(result.units).toBe(4);
    expect(await readFile(result.path, "utf8")).not.toContain("<prop");
  });

  it("marks every segment unknown in a project with no provenance file yet", async () => {
    const dir = await makeTempDir();
    await writeJsonFile(join(dir, CACHE_FILE_NAME), {
      version: 2,
      entries: { [computeFingerprint(cfg(), "de")]: { de: { [hashOf("Hello")]: "Hallo" } } },
      sources: { [hashOf("Hello")]: "Hello" },
    });

    const result = await exportTmx({ config: cfg(), cwd: dir });

    expect(result.provenanceMarkers).toBe("written");
    expect(propertiesByText(await readFile(result.path, "utf8"))).toEqual({
      Hallo: '<prop type="x-origin">unknown</prop>',
    });
  });
});
