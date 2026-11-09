import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AdapterError, AdapterRegistry, createDefaultRegistry } from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import { valueHash } from "../lock/provenance-file.js";
import { baseConfig, makeTempDir, readJsonFile, writeJsonFile } from "../test-support.js";
import { applyValueReplace, previewValueReplace } from "./value-replace.js";

const config = baseConfig({ targetLocales: ["de", "fr"], format: "i18next-json" });

interface Fixture {
  readonly dir: string;
}

async function fixture(
  de: Record<string, string>,
  fr: Record<string, string> | string,
): Promise<Fixture> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), { a: "Hello", b: "Bye" });
  await writeJsonFile(join(dir, "locales", "de.json"), de);
  if (typeof fr === "string") {
    await writeFile(join(dir, "locales", "fr.json"), fr, "utf8");
  } else {
    await writeJsonFile(join(dir, "locales", "fr.json"), fr);
  }
  return { dir };
}

function registryFailingWriteFor(locale: string): AdapterRegistry {
  const resolution = createDefaultRegistry().resolve("", { format: "i18next-json" });
  if (resolution.status !== "resolved") {
    throw new Error("no adapter registered for i18next-json");
  }
  const base = resolution.adapter;
  return new AdapterRegistry().register({
    ...base,
    write: async (resource, filePath, context) => {
      if (resource.locale === locale) {
        throw new AdapterError("ADAPTER_FAILED", "the disk refused the write");
      }
      return base.write(resource, filePath, context);
    },
  });
}

async function readDe(dir: string): Promise<Record<string, string>> {
  return (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
}

describe("applyValueReplace: a locale that fails", () => {
  it("keeps the outcomes of earlier locales and reports the corrupt locale", async () => {
    const { dir } = await fixture({ a: "Hallo X" }, '{ "a": "Salut X", "b": ');
    const preview = await previewValueReplace({
      config,
      cwd: dir,
      find: "X",
      replace: "Y",
      locales: ["de"],
    });
    const refs = [
      ...preview.entries.map(({ locale, key, valueHash: hash }) => ({
        locale,
        key,
        valueHash: hash,
      })),
      { locale: "fr", key: "a", valueHash: valueHash("Salut X") },
    ];

    const result = await applyValueReplace({
      config,
      cwd: dir,
      find: "X",
      replace: "Y",
      entries: refs,
      actor: "human",
    });

    expect(result.outcomes).toEqual([
      { locale: "de", key: "a", status: "applied", staleSource: false },
      { locale: "fr", key: "a", status: "skipped", reason: "locale-failed" },
    ]);
    expect(result.counts).toEqual({ applied: 1, skipped: 1, refused: 0, changed: 0 });
    expect(result.localeFailures).toEqual([
      {
        locale: "fr",
        code: "INVALID_JSON",
        message:
          "The fr locale file at locales/fr.json could not be read: The file is not valid JSON (line 1, column 24).",
      },
    ]);
    expect(await readDe(dir)).toEqual({ a: "Hallo Y" });
  });

  it("carries on with the locales after the failed one", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), { a: "Hello" });
    await writeFile(join(dir, "locales", "de.json"), "{ not json", "utf8");
    await writeJsonFile(join(dir, "locales", "fr.json"), { a: "Salut X" });

    const result = await applyValueReplace({
      config,
      cwd: dir,
      find: "X",
      replace: "Y",
      entries: [
        { locale: "de", key: "a", valueHash: valueHash("Hallo X") },
        { locale: "fr", key: "a", valueHash: valueHash("Salut X") },
      ],
      actor: "human",
    });

    expect(result.outcomes.map((outcome) => outcome.status)).toEqual(["skipped", "applied"]);
    expect(result.localeFailures.map((failure) => failure.locale)).toEqual(["de"]);
    expect(
      ((await readJsonFile(join(dir, "locales", "fr.json"))) as Record<string, string>).a,
    ).toBe("Salut Y");
  });

  it("names the failure's own code and keeps the outcomes already settled in that locale", async () => {
    const { dir } = await fixture({ a: "Hallo X" }, { a: "Salut X", b: "Au revoir X" });

    const result = await applyValueReplace(
      {
        config,
        cwd: dir,
        find: "X",
        replace: "Y",
        entries: [
          { locale: "de", key: "a", valueHash: valueHash("Hallo X") },
          { locale: "fr", key: "a", valueHash: valueHash("never listed") },
          { locale: "fr", key: "b", valueHash: valueHash("Au revoir X") },
        ],
        actor: "human",
      },
      { adapterRegistry: registryFailingWriteFor("fr") },
    );

    expect(result.outcomes).toEqual([
      { locale: "de", key: "a", status: "applied", staleSource: false },
      { locale: "fr", key: "a", status: "changed" },
      { locale: "fr", key: "b", status: "skipped", reason: "locale-failed" },
    ]);
    expect(result.localeFailures).toEqual([
      { locale: "fr", code: "ADAPTER_FAILED", message: "the disk refused the write" },
    ]);
  });

  it("reports no failures when every locale applies", async () => {
    const { dir } = await fixture({ a: "Hallo X" }, { a: "Salut X" });

    const result = await applyValueReplace({
      config,
      cwd: dir,
      find: "X",
      replace: "Y",
      entries: [{ locale: "de", key: "a", valueHash: valueHash("Hallo X") }],
      actor: "human",
    });

    expect(result.localeFailures).toEqual([]);
  });

  it("still refuses a source file that cannot be parsed before writing any locale", async () => {
    const { dir } = await fixture({ a: "Hallo X" }, { a: "Salut X" });
    await writeFile(join(dir, "locales", "en.json"), "{ not json", "utf8");

    await expect(
      applyValueReplace({
        config,
        cwd: dir,
        find: "X",
        replace: "Y",
        entries: [{ locale: "de", key: "a", valueHash: valueHash("Hallo X") }],
        actor: "human",
      }),
    ).rejects.toMatchObject({ code: "SOURCE_INVALID" });
    expect((await readDe(dir)).a).toBe("Hallo X");
  });

  it("still refuses a corrupt lock file before writing any locale", async () => {
    const { dir } = await fixture({ a: "Hallo X" }, { a: "Salut X" });
    await writeFile(join(dir, "verbatra.lock.json"), "{ not json", "utf8");

    await expect(
      applyValueReplace({
        config,
        cwd: dir,
        find: "X",
        replace: "Y",
        entries: [{ locale: "de", key: "a", valueHash: valueHash("Hallo X") }],
        actor: "human",
      }),
    ).rejects.toMatchObject({ code: "LOCK_FILE_INVALID" });
    expect((await readDe(dir)).a).toBe("Hallo X");
  });
});
